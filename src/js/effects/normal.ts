/**
 * Normal Effect Pipeline (GPU)
 *
 * Generates a normal map (RGB-encoded surface normals) from a text mask,
 * suitable for downstream PBR rendering. Not used in the standard 2D
 * compositing path — normal-effect layers feed into 3D texture maps.
 *
 * Pipeline (single shader chain, one CPU readback at the end):
 *   1. (GPU) place(mask) into an expanded canvas of size
 *      `(maskW + 4·scaledRoundness, maskH + 4·scaledRoundness)`. The
 *      padding is internal — Sobel needs clean sampling at the rounded
 *      mask's edges.
 *   2. (GPU, conditional) blur(σ = scaledRoundness) with bc on V pass —
 *      legacy `blur(rPx) contrast((10r + 100)%)` rounds the height-map
 *      transitions. bc is a no-op when rPx = 0.
 *   3. (GPU) normal-height: tile the texture, multiply by color tint,
 *      gate by rounded mask, and apply the colorScale `(rgb − 0.5)·I + 0.5`.
 *      Output is the grayscale height map at expanded dims.
 *   4. (GPU) normal-compose: Sobel gradient + light-direction rotation +
 *      gate by rounded mask alpha. Output canvas runs at the **mask's
 *      original dimensions** so downstream `applyTransformAndDraw` can
 *      position it like any other text-fitted effect canvas.
 *
 * Effect parameters (from mask.effectparams):
 *   NormalRoundness  - Roundness blur radius (scaled by 6·canvasW/2048).
 *   NormalIntensity  - Strength of the colorScale finalize (default 1).
 *   NormalLightDir   - Cardinal/intercardinal light direction (default 'N').
 */

import WebGLPostProcessor, { Uniforms, type GPUTextureHandle } from 'webgl-postprocessor';

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { parseHexColor } from '../utils/color';
import {
  BUILTIN_SHADER_SOURCES,
  FBO_VERTEX_SRC,
  NORMAL_DIR_INDEX,
  PROGRAMS,
  ensureProgram,
  gaussianWeights,
  type ChainInput,
  type EffectOutput,
  type NormalDir,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';

import placeFragSrc from '@/shaders/place.frag.glsl?raw';
import normalHeightFragSrc from '@/shaders/normal-height.frag.glsl?raw';
import normalComposeFragSrc from '@/shaders/normal-compose.frag.glsl?raw';

/** Base resolution for scaling roundness — matches legacy. */
const BASE_RESOLUTION = 2048;

/**
 * Roundness scale factor applied to the user's NormalRoundness param.
 * Legacy: `roundnessScale = 6 * canvasWidth / BASE_RESOLUTION`. The user
 * value is multiplied by this to get the actual blur σ in pixels.
 */
const ROUNDNESS_BASE_SCALE = 6;

/** Stable program names. */
const PLACE_PROGRAM = 'pimco_place';
const NORMAL_HEIGHT_PROGRAM = 'pimco_normal_height';
const NORMAL_COMPOSE_PROGRAM = 'pimco_normal_compose';

/** Re-export the `NormalDir` type so callers don't need to reach into effect-utils. */
export type NormalLightDirection = NormalDir;

export interface NormalEffectParams {
  width: number;
  height: number;
  /** Color tint for the height map (CSS color string). */
  color: string;
  /** Layer alpha — modulates tint strength, never final transparency. */
  alpha: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
  /** Optional texture, tiled across the expanded canvas. */
  texture?: ImageBitmap;
  /** User NormalRoundness param (scaled internally). */
  roundness: number;
  /** Sobel intensity (height-map contrast multiplier). */
  intensity: number;
  /** Cardinal/intercardinal light direction. */
  lightDirection: NormalLightDirection;
}

export interface NormalEffectResult {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
}

/** Extract normal-specific parameters from compiled mask data. */
export function extractNormalParams(maskData: PimcoMaskSubstitutionCompiled): {
  roundness: number;
  intensity: number;
  lightDirection: NormalLightDirection;
} {
  const params = maskData.effectparams;

  let roundness = 0;
  let intensity = 1.0;
  let lightDirection: NormalLightDirection = 'N';

  if (params) {
    if ('NormalRoundness' in params && typeof params.NormalRoundness === 'number') {
      roundness = params.NormalRoundness;
    }
    if ('NormalIntensity' in params && typeof params.NormalIntensity === 'number') {
      intensity = params.NormalIntensity;
    }
    if ('NormalLightDir' in params && typeof params.NormalLightDir === 'string') {
      const dir = params.NormalLightDir.toUpperCase();
      const validDirs: NormalLightDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      if (validDirs.includes(dir as NormalLightDirection)) {
        lightDirection = dir as NormalLightDirection;
      }
    }
  }

  return { roundness, intensity, lightDirection };
}

/** Scale a base-resolution param to the actual canvas width. */
export function scaleToResolution(value: number, targetWidth: number): number {
  return (value * targetWidth) / BASE_RESOLUTION;
}

/**
 * Run a 2-pass separable Gaussian blur. Optional bc applies on the V pass
 * only (matches the convention used by other effects).
 */
function renderBlur2D(
  buddy: WebGLPostProcessor,
  source: ChainInput,
  width: number,
  height: number,
  sigma: number,
  brightness = 1,
  contrast = 1
): GPUTextureHandle {
  const { weights, halfWidth } = gaussianWeights(sigma);
  const texel: [number, number] = [1 / width, 1 / height];

  buddy.useProgram(PROGRAMS.blur);
  buddy.setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: source },
    uTexel: { type: Uniforms.FLOAT2, value: texel },
    uAxis: { type: Uniforms.FLOAT2, value: [1, 0] },
    uHalfWidth: { type: Uniforms.INT1, value: halfWidth },
    uWeights: { type: Uniforms.FLOAT1V, value: weights },
    uBrightness: { type: Uniforms.FLOAT1, value: 1 },
    uContrast: { type: Uniforms.FLOAT1, value: 1 },
  });
  const blurH = buddy.toFramebuffer(width, height);

  buddy.useProgram(PROGRAMS.blur);
  buddy.setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: blurH },
    uTexel: { type: Uniforms.FLOAT2, value: texel },
    uAxis: { type: Uniforms.FLOAT2, value: [0, 1] },
    uHalfWidth: { type: Uniforms.INT1, value: halfWidth },
    uWeights: { type: Uniforms.FLOAT1V, value: weights },
    uBrightness: { type: Uniforms.FLOAT1, value: brightness },
    uContrast: { type: Uniforms.FLOAT1, value: contrast },
  });
  return buddy.toFramebuffer(width, height);
}

/** Apply the normal effect (GPU). Falls back to flat no-effect when WebGL2 is missing. */
export function applyNormalEffect(params: NormalEffectParams): NormalEffectResult;
export function applyNormalEffect(
  params: NormalEffectParams,
  output: { kind: 'canvas' }
): NormalEffectResult;
export function applyNormalEffect(
  params: NormalEffectParams,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function applyNormalEffect(
  params: NormalEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): NormalEffectResult | GPUTextureHandle | null {
  const {
    width,
    height,
    color,
    alpha,
    mask,
    texture,
    roundness,
    intensity,
    lightDirection,
  } = params;

  const buddy = myWebGLBuddy();
  if (!buddy) {
    if (output.kind === 'handle') return null;
    return applyNoEffect({
      width,
      height,
      color,
      alpha,
      blend: 'normal',
      mask,
      ...(texture ? { texture } : {}),
    });
  }

  // Roundness scaled by canvas resolution; the data param is in 2048-base
  // pixels and the effective blur σ is `param × 6 × canvasW / 2048`.
  const scaledRoundness = roundness * scaleToResolution(ROUNDNESS_BASE_SCALE, width);

  // Mask dims (final output) and expanded dims (internal padding for clean
  // Sobel sampling at the rounded edges). Padding = 2·σ on each side, total
  // expansion = 4·σ across the dim. Matches legacy.
  const padding = Math.ceil(scaledRoundness * 2);
  const maskW = mask.width;
  const maskH = mask.height;
  const expW = maskW + 2 * padding;
  const expH = maskH + 2 * padding;

  buddy.wake();
  buddy.setResolution(expW, expH);

  ensureProgram(buddy, PROGRAMS.blur, BUILTIN_SHADER_SOURCES[PROGRAMS.blur], FBO_VERTEX_SRC);
  ensureProgram(buddy, PLACE_PROGRAM, placeFragSrc, FBO_VERTEX_SRC);
  ensureProgram(buddy, NORMAL_HEIGHT_PROGRAM, normalHeightFragSrc, FBO_VERTEX_SRC);
  ensureProgram(buddy, NORMAL_COMPOSE_PROGRAM, normalComposeFragSrc);

  // 1. Place mask centered in expanded canvas with hard transparent borders.
  buddy.useProgram(PLACE_PROGRAM);
  buddy.setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: mask },
    uInputSize: { type: Uniforms.FLOAT2, value: [maskW, maskH] },
    uOutputSize: { type: Uniforms.FLOAT2, value: [expW, expH] },
    uOffset: { type: Uniforms.FLOAT2, value: [padding, padding] },
  });
  // No persistence needed: roundedMask is bound to uMask in step 3 and
  // re-bound (same handle, uniformValueCompare skip) in step 4, so its
  // useCount stays at 1 across passes and auto-frees on unset at the end.
  // Within the optional blur step, the placed-mask handle is consumed by
  // the H pass and auto-freed when the V pass replaces uInput.
  let roundedMask: ChainInput = buddy.toFramebuffer(expW, expH);

  // 2. Roundness blur with bc on V pass — legacy `blur(r) contrast((10r+100)%)`
  //    where contrast is in fractional form (1.0 = no change, > 1 = boost).
  //    Skipped when roundness is 0; the mask passes through unchanged.
  if (scaledRoundness > 0) {
    const contrast = (10 * scaledRoundness + 100) / 100;
    roundedMask = renderBlur2D(buddy, roundedMask, expW, expH, scaledRoundness, 1, contrast);
  }

  // 3. Build the height map at expanded dims: texture × tint × maskA + colorScale.
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];
  const colorVec: [number, number, number] = [
    layerRgb[0] / 255,
    layerRgb[1] / 255,
    layerRgb[2] / 255,
  ];
  const tileScale: [number, number] = texture
    ? [expW / texture.width, expH / texture.height]
    : [1, 1];

  buddy.useProgram(NORMAL_HEIGHT_PROGRAM);
  buddy.setUniforms({
    uMask: { type: Uniforms.TEXTURE2D, value: roundedMask },
    uTexture: { type: Uniforms.TEXTURE2D, value: texture ?? 0xffffffff },
    uTileScale: { type: Uniforms.FLOAT2, value: tileScale },
    uColor: { type: Uniforms.FLOAT3, value: colorVec },
    uOpacity: { type: Uniforms.FLOAT1, value: alpha },
    uIntensity: { type: Uniforms.FLOAT1, value: intensity },
  });
  const heightMap = buddy.toFramebuffer(expW, expH);

  // 4. Compose at MASK dims, sampling expanded heightMap and roundedMask
  //    with offset. Sobel + light-direction rotation + mask gate.
  buddy.setResolution(maskW, maskH);

  buddy.useProgram(NORMAL_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uHeightMap: { type: Uniforms.TEXTURE2D, value: heightMap },
    uMask: { type: Uniforms.TEXTURE2D, value: roundedMask },
    uTexelSize: { type: Uniforms.FLOAT2, value: [1 / expW, 1 / expH] },
    uMaskSize: { type: Uniforms.FLOAT2, value: [maskW, maskH] },
    uExpandedSize: { type: Uniforms.FLOAT2, value: [expW, expH] },
    uOffset: { type: Uniforms.FLOAT2, value: [padding, padding] },
    uIntensity: { type: Uniforms.FLOAT1, value: 1 },
    uDirection: { type: Uniforms.INT1, value: NORMAL_DIR_INDEX[lightDirection] },
  });

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(maskW, maskH);
    buddy.unsetTextureUniforms('uHeightMap', 'uMask', 'uTexture', 'uInput');
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(maskW, maskH);
  buddy.to(ctx);
  buddy.unsetTextureUniforms('uHeightMap', 'uMask', 'uTexture', 'uInput');
  return { canvas, ctx };
}

/** Convenience wrapper: applies normal from a `TextLayerDescriptor`. */
export function processNormalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  texture?: ImageBitmap
): AnyCanvas | null;
export function processNormalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  texture: ImageBitmap | undefined,
  output: { kind: 'canvas' }
): AnyCanvas | null;
export function processNormalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  texture: ImageBitmap | undefined,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function processNormalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  texture?: ImageBitmap,
  output: EffectOutput = { kind: 'canvas' }
): AnyCanvas | GPUTextureHandle | null {
  const color = extractDefaultColorCode(layer.color);
  const { roundness, intensity, lightDirection } = extractNormalParams(layer.maskData);

  const params: NormalEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    mask,
    roundness,
    intensity,
    lightDirection,
  };
  if (texture !== undefined) {
    params.texture = texture;
  }

  if (output.kind === 'handle') {
    return applyNormalEffect(params, output);
  }
  return applyNormalEffect(params, output).canvas;
}

/** Get the valid light directions. */
export function getValidLightDirections(): readonly NormalLightDirection[] {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
}
