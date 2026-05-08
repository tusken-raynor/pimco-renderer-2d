/**
 * Foil Effect Pipeline (GPU)
 *
 * Hot-foil-stamp appearance: a tiled foil texture × color tint inside an
 * alpha-eroded text shape, sitting over a backdrop of soft bevel hints
 * (emboss INVERTED darken + emboss STANDARD brighten, both blurred 1px) and
 * a halo drop shadow (raw mask blurred 2px, multiply at 0.2).
 *
 * Pipeline (single shader chain, one CPU readback at the end):
 *   1. (GPU) erode(mask, AlphaErosionRadius) — shrinks the mask so the foil
 *      sits ~1px inside the glyph, leaving a thin bevel ring around it.
 *   2. (GPU, conditional) For text taller than EMBOSS_HEIGHT_THRESHOLD:
 *        - emboss(INVERTED) + top-1 clear, blur σ=1 → highlight (darken)
 *        - emboss(STANDARD) + bottom-2 clear, blur σ=1 → shadowEdge (brighten)
 *        - blur(mask, σ=2) → shadowMask (halo)
 *   3. (GPU) foil-compose: layers texture × tint × shrunkMask on top of the
 *      bevel + halo backdrop in straight-alpha space. For small text, the
 *      bevel + halo passes are skipped and compose returns just the foil
 *      text body.
 *
 * Note: the legacy renders into a `(width + 2) × height` canvas with the
 * foil text + shadow mask offset 1px right to produce a subtle directional
 * drop shadow. We currently render at `width × height` with no offset — see
 * the foil-compose shader header for how to add it back if needed.
 */

import WebGLPostProcessor, { Uniforms, type GPUTextureHandle } from 'webgl-postprocessor';

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { parseHexColor } from '../utils/color';
import {
  BUILTIN_SHADER_SOURCES,
  EMBOSS_MATRIX_INVERTED,
  EMBOSS_MATRIX_STANDARD,
  FBO_VERTEX_SRC,
  PROGRAMS,
  ensureProgram,
  gaussianWeights,
  type ChainInput,
  type EffectOutput,
  type Mat3Tuple,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';

import foilComposeFragSrc from '@/shaders/foil-compose.frag.glsl?raw';

/** Text-height threshold below which bevel + halo are skipped. */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/** Default mask erosion radius. The legacy default — see extractFoilParams. */
const DEFAULT_EROSION_RADIUS = 1;

/** Sigma for the bevel-edge softening blur (matches legacy `blur(1px)`). */
const EDGE_BLUR_SIGMA = 1;

/** Sigma for the halo drop-shadow blur (matches legacy `blur(2px)`). */
const SHADOW_BLUR_SIGMA = 2;

/** Legacy weights for each compose layer. */
const HIGHLIGHT_OVERLAY_ALPHA = 0.1;
const SHADOW_EDGE_OVERLAY_ALPHA = 0.1;
const SHADOW_MASK_OVERLAY_ALPHA = 0.2;

/** Stable program name for the foil compose shader. */
const FOIL_COMPOSE_PROGRAM = 'pimco_foil_compose';

export interface FoilEffectParams {
  width: number;
  height: number;
  /** Foil tint color (CSS color string). */
  color: string;
  /** Layer alpha (0-1) — modulates tint strength, never final transparency. */
  alpha: number;
  /** Pixel radius of mask erosion (default 1; 0 = skip). */
  alphaErosionRadius: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
  /** Optional foil texture, tiled across the canvas. */
  texture?: ImageBitmap;
  /** Text height in pixels — controls bevel + halo gate. */
  textHeight: number;
}

export interface FoilEffectResult {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
}

/**
 * Run a single emboss pass and return the FBO. Output is grayscale luma in
 * (R, G, B) with alpha = 1; the convolution offset is 0 for our standard
 * sum-zero kernels.
 */
function renderEmboss(
  buddy: WebGLPostProcessor,
  source: ChainInput,
  width: number,
  height: number,
  matrix: Mat3Tuple,
  margins: [number, number, number, number]
): GPUTextureHandle {
  buddy.useProgram(PROGRAMS.emboss);
  buddy.setUniforms({
    uTexelSizeX: { type: Uniforms.FLOAT1, value: 1 / width },
    uTexelSizeY: { type: Uniforms.FLOAT1, value: 1 / height },
    uMatrix: { type: Uniforms.FLOAT1V, value: matrix },
    uOffset: { type: Uniforms.FLOAT1, value: 0 },
    uMargins: { type: Uniforms.FLOAT4, value: margins },
    uSize: { type: Uniforms.FLOAT2, value: [width, height] },
    uInput: { type: Uniforms.TEXTURE2D, value: source },
  });
  return buddy.toFramebuffer(width, height);
}

/** Run a 2-pass separable Gaussian blur and return the final FBO. */
function renderBlur2D(
  buddy: WebGLPostProcessor,
  source: ChainInput,
  width: number,
  height: number,
  sigma: number
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
    uBrightness: { type: Uniforms.FLOAT1, value: 1 },
    uContrast: { type: Uniforms.FLOAT1, value: 1 },
  });
  return buddy.toFramebuffer(width, height);
}

/** Apply the foil effect (GPU). Falls back to flat no-effect when WebGL2 is missing. */
export function applyFoilEffect(params: FoilEffectParams): FoilEffectResult;
export function applyFoilEffect(
  params: FoilEffectParams,
  output: { kind: 'canvas' }
): FoilEffectResult;
export function applyFoilEffect(
  params: FoilEffectParams,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function applyFoilEffect(
  params: FoilEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): FoilEffectResult | GPUTextureHandle | null {
  const { width, height, color, alpha, alphaErosionRadius, mask, texture, textHeight } = params;

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

  // Run the entire pipeline at the mask's own dimensions (text-fitted raster).
  const w = mask.width;
  const h = mask.height;

  buddy.wake();
  buddy.setResolution(w, h);

  ensureProgram(buddy, PROGRAMS.erode, BUILTIN_SHADER_SOURCES[PROGRAMS.erode], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.emboss, BUILTIN_SHADER_SOURCES[PROGRAMS.emboss], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.blur, BUILTIN_SHADER_SOURCES[PROGRAMS.blur], FBO_VERTEX_SRC);
  ensureProgram(buddy, FOIL_COMPOSE_PROGRAM, foilComposeFragSrc);

  // 1. Shrunken mask (foil sits inside this). Default radius is 1 — the foil
  //    almost always erodes by ≥1px in legacy.
  let shrunkMask: ChainInput = mask;
  let shrunkMaskHandle: GPUTextureHandle | null = null;
  if (alphaErosionRadius > 0) {
    buddy.useProgram(PROGRAMS.erode);
    const start = Math.ceil(-alphaErosionRadius);
    const end = Math.ceil(alphaErosionRadius);
    buddy.setUniforms({
      uStart: { type: Uniforms.INT1, value: start },
      uEnd: { type: Uniforms.INT1, value: end },
      uTexelSizeX: { type: Uniforms.FLOAT1, value: 1 / w },
      uTexelSizeY: { type: Uniforms.FLOAT1, value: 1 / h },
      uInput: { type: Uniforms.TEXTURE2D, value: mask },
    });
    shrunkMaskHandle = buddy.toFramebuffer(w, h, /* persistent */ false);
    shrunkMask = shrunkMaskHandle;
  }

  // 2. Bevel + halo handles for tall enough text.
  let highlight: GPUTextureHandle | null = null;
  let shadowEdge: GPUTextureHandle | null = null;
  let shadowMask: GPUTextureHandle | null = null;
  const hasEdges = textHeight > EMBOSS_HEIGHT_THRESHOLD;
  if (hasEdges) {
    // Highlight (darken): INVERTED kernel + top-1 clear, blurred σ=1.
    const embossedHighlight = renderEmboss(
      buddy,
      mask,
      w,
      h,
      EMBOSS_MATRIX_INVERTED,
      [1, 0, 0, 0]
    );
    highlight = renderBlur2D(buddy, embossedHighlight, w, h, EDGE_BLUR_SIGMA);

    // Shadow edge (brighten): STANDARD kernel + bottom-2 clear, blurred σ=1.
    const embossedShadowEdge = renderEmboss(
      buddy,
      mask,
      w,
      h,
      EMBOSS_MATRIX_STANDARD,
      [0, 0, 2, 0]
    );
    shadowEdge = renderBlur2D(buddy, embossedShadowEdge, w, h, EDGE_BLUR_SIGMA);

    // Halo: raw mask blurred σ=2.
    shadowMask = renderBlur2D(buddy, mask, w, h, SHADOW_BLUR_SIGMA);
  }

  // CPU-side: tint color → vec3 in 0..1.
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];
  const colorVec: [number, number, number] = [
    layerRgb[0] / 255,
    layerRgb[1] / 255,
    layerRgb[2] / 255,
  ];

  // Tile scale: see metal.ts for the same identity-texture convention.
  const tileScale: [number, number] = texture
    ? [w / texture.width, h / texture.height]
    : [1, 1];

  buddy.useProgram(FOIL_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uShrunkMask: { type: Uniforms.TEXTURE2D, value: shrunkMask },
    uTexture: { type: Uniforms.TEXTURE2D, value: texture ?? 0xffffffff },
    // Bind shrunkMask as a placeholder for unused samplers — keeps the
    // binding valid; the shader guards reads with uHasEdges.
    uHighlight: { type: Uniforms.TEXTURE2D, value: highlight ?? shrunkMask },
    uShadowEdge: { type: Uniforms.TEXTURE2D, value: shadowEdge ?? shrunkMask },
    uShadowMask: { type: Uniforms.TEXTURE2D, value: shadowMask ?? shrunkMask },
    uTileScale: { type: Uniforms.FLOAT2, value: tileScale },
    uColor: { type: Uniforms.FLOAT3, value: colorVec },
    uOpacity: { type: Uniforms.FLOAT1, value: alpha },
    uHighlightAlpha: { type: Uniforms.FLOAT1, value: HIGHLIGHT_OVERLAY_ALPHA },
    uShadowEdgeAlpha: { type: Uniforms.FLOAT1, value: SHADOW_EDGE_OVERLAY_ALPHA },
    uShadowMaskAlpha: { type: Uniforms.FLOAT1, value: SHADOW_MASK_OVERLAY_ALPHA },
    uHasEdges: { type: Uniforms.INT1, value: hasEdges ? 1 : 0 },
  });

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(w, h);
    buddy.unsetTextureUniforms(
      'uShrunkMask',
      'uTexture',
      'uHighlight',
      'uShadowEdge',
      'uShadowMask'
    );
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(w, h);
  buddy.to(ctx);
  buddy.unsetTextureUniforms(
    'uShrunkMask',
    'uTexture',
    'uHighlight',
    'uShadowEdge',
    'uShadowMask'
  );
  return { canvas, ctx };
}

/** Extract foil-specific parameters from compiled mask data. */
export function extractFoilParams(maskData: PimcoMaskSubstitutionCompiled): {
  alphaErosionRadius: number;
} {
  const params = maskData.effectparams;

  let alphaErosionRadius = DEFAULT_EROSION_RADIUS;

  if (params && 'AlphaErosionRadius' in params && typeof params.AlphaErosionRadius === 'number') {
    alphaErosionRadius = params.AlphaErosionRadius;
  }

  return { alphaErosionRadius };
}

/** Convenience wrapper: applies foil from a `TextLayerDescriptor`. */
export function processFoilEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap
): AnyCanvas | null;
export function processFoilEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  output: { kind: 'canvas' }
): AnyCanvas | null;
export function processFoilEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function processFoilEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap,
  output: EffectOutput = { kind: 'canvas' }
): AnyCanvas | GPUTextureHandle | null {
  const color = extractDefaultColorCode(layer.color);
  const { alphaErosionRadius } = extractFoilParams(layer.maskData);

  const params: FoilEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    alphaErosionRadius,
    mask,
    textHeight,
  };
  if (texture !== undefined) {
    params.texture = texture;
  }

  if (output.kind === 'handle') {
    return applyFoilEffect(params, output);
  }
  return applyFoilEffect(params, output).canvas;
}

/** Get the foil effect parameters for debugging/preview. */
export function getFoilEffectInfo(alphaErosionRadius: number): {
  erosionRadius: number;
  embossThreshold: number;
  shadowBlur: number;
  embossBlur: number;
} {
  return {
    erosionRadius: alphaErosionRadius,
    embossThreshold: EMBOSS_HEIGHT_THRESHOLD,
    shadowBlur: SHADOW_BLUR_SIGMA,
    embossBlur: EDGE_BLUR_SIGMA,
  };
}
