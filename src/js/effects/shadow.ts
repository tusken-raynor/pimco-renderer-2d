/**
 * Shadow Effect Pipeline (GPU)
 *
 * Drop-shadow effect for text layers: takes the rasterized text mask,
 * expands it (the legacy `ShadowSpread` parameter), softens it (the legacy
 * `ShadowBlur` parameter), tints it with the layer color, and stacks the
 * result via a multi-pass alpha buildup that mirrors legacy's iterated
 * `drawImage` source-over loop.
 *
 * Pipeline (single shader chain, one CPU readback at the end):
 *   1. (GPU) place(mask) into an expanded canvas of size
 *      `(maskW + 2·(spread + blur), maskH + 2·(spread + blur))`. Pixels
 *      outside the mask region get vec4(0) — a hard border so the
 *      downstream blurs don't clip the halo at the canvas edge.
 *   2. (GPU, conditional) blur(σ = scaledSpread) with brightness/contrast on
 *      the V pass to soft-threshold the halo into a hard expansion. The bc
 *      params are tuned for our white-on-black mask format and produce an
 *      expansion of approximately `spread` pixels.
 *   3. (GPU, conditional) blur(σ = scaledBlur) for the soft falloff.
 *   4. (GPU) shadow-compose: tint by uColor and apply multi-pass alpha
 *      buildup analytically (single draw, matches legacy's iteration).
 *
 * Effect parameters (from mask.effectparams):
 *   ShadowSpread - Spread radius in pixels at the 2048px base resolution.
 *   ShadowBlur   - Blur radius in pixels at the 2048px base resolution.
 *
 * Note: legacy used Canvas2D's `blur(σ) brightness(58%) contrast(700σ%)`
 * filter chain on a black-on-white mask to produce a soft-then-hard
 * expansion. That bc threshold direction reverses on our white-on-black
 * format, so we use a different fixed bc pair (b=10, c=1.2) that gives a
 * comparable expansion threshold (intensity ≈ 0.083, matching halo at
 * distance ≈ σ from the edge of a Gaussian-blurred unit step).
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
  PROGRAMS,
  ensureProgram,
  gaussianWeights,
  type ChainInput,
  type EffectOutput,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';

import placeFragSrc from '@/shaders/place.frag.glsl?raw';
import shadowComposeFragSrc from '@/shaders/shadow-compose.frag.glsl?raw';

/**
 * Base resolution for scaling effect parameters. Effect params in the data
 * are designed for a 2048px-wide canvas; scale by `canvasWidth / 2048`.
 */
const BASE_RESOLUTION = 2048;

/**
 * Brightness/contrast for the spread bc pass on white-on-black masks.
 * Produces y = 12x − 1, threshold (y = 0.5) at x ≈ 0.125 — close to the
 * halo intensity at distance σ from a Gaussian-blurred unit step (≈ 0.16),
 * so the expansion radius matches σ_spread to within fractional pixels.
 */
const SPREAD_BC_BRIGHTNESS = 10;
const SPREAD_BC_CONTRAST = 1.2;

/** Stable program names. */
const PLACE_PROGRAM = 'pimco_place';
const SHADOW_COMPOSE_PROGRAM = 'pimco_shadow_compose';

export interface ShadowEffectParams {
  /** Output canvas width — the master canvas, used for parameter scaling. */
  width: number;
  /** Output canvas height (currently unused, kept for parity with siblings). */
  height: number;
  /** Shadow color (CSS color string). */
  color: string;
  /** Shadow opacity / intensity. May exceed 1 for multi-pass density. */
  alpha: number;
  /** Spread radius at the 2048px base resolution. */
  spread: number;
  /** Blur radius at the 2048px base resolution. */
  blur: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
}

export interface ShadowEffectResult {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
}

/**
 * Scale a parameter value from the 2048px base resolution to the actual
 * canvas width. Mirrors legacy's `value * targetWidth / 2048`.
 */
export function scaleToResolution(value: number, targetWidth: number): number {
  return (value * targetWidth) / BASE_RESOLUTION;
}

/** Extract shadow-specific parameters from compiled mask data. */
export function extractShadowParams(maskData: PimcoMaskSubstitutionCompiled): {
  spread: number;
  blur: number;
} {
  const params = maskData.effectparams;

  let spread = 0;
  let blur = 0;

  if (params) {
    if ('ShadowSpread' in params && typeof params.ShadowSpread === 'number') {
      spread = Math.round(params.ShadowSpread);
    }
    if ('ShadowBlur' in params && typeof params.ShadowBlur === 'number') {
      blur = params.ShadowBlur;
    }
  }

  return { spread, blur };
}

/**
 * Run a 2-pass separable Gaussian blur. Optional bc applies on the V pass
 * only (matches the convention used by other effects that reuse the blur
 * shader's brightness/contrast finalize).
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

/** Apply the shadow effect (GPU). Falls back to flat no-effect when WebGL2 is missing. */
export function applyShadowEffect(params: ShadowEffectParams): ShadowEffectResult;
export function applyShadowEffect(
  params: ShadowEffectParams,
  output: { kind: 'canvas' }
): ShadowEffectResult;
export function applyShadowEffect(
  params: ShadowEffectParams,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function applyShadowEffect(
  params: ShadowEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): ShadowEffectResult | GPUTextureHandle | null {
  const { width, height, color, alpha, spread, blur, mask } = params;

  const buddy = myWebGLBuddy();
  if (!buddy) {
    if (output.kind === 'handle') {
      // Projection requires GPU output. The dispatcher should have routed
      // away from this code path when WebGL2 is unavailable, but defend.
      return null;
    }
    return applyNoEffect({
      width,
      height,
      color,
      alpha,
      blend: 'normal',
      mask,
    });
  }

  // Scale params from base resolution to actual canvas width.
  const scaledSpread = scaleToResolution(spread, width);
  const scaledBlur = scaleToResolution(blur, width);

  // Final canvas dimensions: pad the mask by spread+blur on each side so the
  // expanded shape and its soft halo fit without being clipped.
  const padding = Math.ceil(scaledSpread + scaledBlur);
  const maskW = mask.width;
  const maskH = mask.height;
  const outW = maskW + 2 * padding;
  const outH = maskH + 2 * padding;

  buddy.wake();
  buddy.setResolution(outW, outH);

  ensureProgram(buddy, PROGRAMS.blur, BUILTIN_SHADER_SOURCES[PROGRAMS.blur], FBO_VERTEX_SRC);
  ensureProgram(buddy, PLACE_PROGRAM, placeFragSrc, FBO_VERTEX_SRC);
  ensureProgram(buddy, SHADOW_COMPOSE_PROGRAM, shadowComposeFragSrc);

  // 1. Place the mask centered in the expanded canvas with hard borders.
  buddy.useProgram(PLACE_PROGRAM);
  buddy.setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: mask },
    uInputSize: { type: Uniforms.FLOAT2, value: [maskW, maskH] },
    uOutputSize: { type: Uniforms.FLOAT2, value: [outW, outH] },
    uOffset: { type: Uniforms.FLOAT2, value: [padding, padding] },
  });
  let current: ChainInput = buddy.toFramebuffer(outW, outH);

  // 2. Spread step: blur(σ=spread) + bc on V pass to soft-threshold halo
  //    into a hard expansion.
  if (scaledSpread > 0) {
    current = renderBlur2D(
      buddy,
      current,
      outW,
      outH,
      scaledSpread,
      SPREAD_BC_BRIGHTNESS,
      SPREAD_BC_CONTRAST
    );
  }

  // 3. Soft-falloff blur for the shadow's edge.
  if (scaledBlur > 0) {
    current = renderBlur2D(buddy, current, outW, outH, scaledBlur);
  }

  // 4. Compose: tint + multi-pass alpha buildup.
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];
  const colorVec: [number, number, number] = [
    layerRgb[0] / 255,
    layerRgb[1] / 255,
    layerRgb[2] / 255,
  ];

  buddy.useProgram(SHADOW_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uShadowMask: { type: Uniforms.TEXTURE2D, value: current },
    uColor: { type: Uniforms.FLOAT3, value: colorVec },
    uAlpha: { type: Uniforms.FLOAT1, value: alpha },
  });

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(outW, outH);
    buddy.unsetTextureUniforms('uShadowMask');
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(outW, outH);
  buddy.to(ctx);
  buddy.unsetTextureUniforms('uShadowMask');
  return { canvas, ctx };
}

/** Convenience wrapper: applies shadow from a `TextLayerDescriptor`. */
export function processShadowEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas
): AnyCanvas | null;
export function processShadowEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  output: { kind: 'canvas' }
): AnyCanvas | null;
export function processShadowEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function processShadowEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  output: EffectOutput = { kind: 'canvas' }
): AnyCanvas | GPUTextureHandle | null {
  const color = extractDefaultColorCode(layer.color);
  const { spread, blur } = extractShadowParams(layer.maskData);

  const params: ShadowEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    spread,
    blur,
    mask,
  };

  if (output.kind === 'handle') {
    return applyShadowEffect(params, output);
  }
  return applyShadowEffect(params, output).canvas;
}
