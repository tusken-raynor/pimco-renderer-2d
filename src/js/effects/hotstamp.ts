/**
 * Hotstamp Effect Pipeline (GPU)
 *
 * Hot foil-press appearance: a tinted fill plus dual-direction emboss edge
 * highlights. Visually distinct from engraving in that hotstamp uses BOTH
 * convolution directions (no blur) at fixed 0.2 weights — INVERTED darkens
 * engraved-direction edges, STANDARD brightens raised-direction edges. The
 * two together produce the chiseled foil-stamp look.
 *
 * Pipeline (one shader chain, single CPU readback at the end):
 *   1. (CPU) Compute the bezier opacity and the warm hotstamp tint from the
 *      layer's color (or pre-supplied eindex). Tint base is 35,22,0 — warmer
 *      than engraving's 68,34,0.
 *   2. (GPU, conditional) For text taller than EMBOSS_HEIGHT_THRESHOLD: emboss
 *      the mask twice — once with INVERTED + top-row edge clear, once with
 *      STANDARD + bottom 2-row edge clear. No blur (matches legacy hotstamp
 *      which kept edges crisp).
 *   3. (GPU) hotstamp-compose shader takes the mask, optional darken/brighten
 *      handles, uniforms, and renders the final layer to the result canvas.
 *
 * Effect parameters:
 *   eindex - Optional pre-computed bezier opacity (overrides color-based calc)
 *   color  - Text color (used when eindex isn't supplied)
 *   alpha  - Layer alpha multiplier (0-1)
 */

import WebGLPostProcessor, { Uniforms, type GPUTextureHandle } from 'webgl-postprocessor';

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { parseHexColor, type RGBColor } from '../utils/color';
import {
  BUILTIN_SHADER_SOURCES,
  EMBOSS_MATRIX_INVERTED,
  EMBOSS_MATRIX_STANDARD,
  FBO_VERTEX_SRC,
  PROGRAMS,
  ensureProgram,
  type EffectOutput,
  type Mat3Tuple,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';
import { colorDistance, calculateEindex, distanceFromEindex } from './engraving';

import hotstampComposeFragSrc from '@/shaders/hotstamp-compose.frag.glsl?raw';

// Re-export shared scalar helpers so callers can compute opacity / distance
// without pulling engraving in directly.
export { colorDistance, calculateEindex, distanceFromEindex };

/** Text-height threshold below which the dual-emboss step is skipped. */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/** Composite weight applied to both emboss overlays (matches legacy 0.2). */
const EDGE_OVERLAY_ALPHA = 0.2;

/** Stable program name for the hotstamp compose shader. */
const HOTSTAMP_COMPOSE_PROGRAM = 'pimco_hotstamp_compose';

export interface HotstampEffectParams {
  /** Output canvas width (final render target). */
  width: number;
  /** Output canvas height. */
  height: number;
  /** Text color (CSS color string). */
  color: string;
  /** Layer alpha (0-1). */
  alpha: number;
  /** Optional pre-computed bezier opacity index. */
  eindex?: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
  /** Text height in pixels — controls whether emboss runs. */
  textHeight: number;
}

export interface HotstampEffectResult {
  /** Result canvas at the mask's dimensions; downstream transform places it. */
  canvas: AnyCanvas;
  /** Result context. */
  ctx: Canvas2DContext;
}

/**
 * Compute the hotstamp fill color and combined opacity. Pure scalar math.
 *
 * Tint base (35, 22, 0) is the legacy hotstamp constant — warmer/lighter than
 * engraving's (68, 34, 0). Distance-from-white attenuates the tint so dark
 * input colors get full warmth and lighter ones desaturate toward neutral.
 */
export function computeHotstampFill(
  color: string,
  eindex: number | undefined
): {
  rgb: [number, number, number];
  colorOpacity: number;
  dist: number;
} {
  const white: RGBColor = [255, 255, 255];
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];

  let colorOpacity: number;
  let dist: number;
  if (eindex !== undefined && eindex > 0) {
    colorOpacity = eindex;
    dist = distanceFromEindex(eindex);
  } else {
    dist = colorDistance(white, layerRgb);
    colorOpacity = calculateEindex(dist);
  }

  const distFactor = Math.max(1 - dist, 0);
  const rgb: [number, number, number] = [
    (35 / 255) * distFactor,
    (22 / 255) * distFactor,
    0,
  ];

  return { rgb, colorOpacity, dist };
}

/**
 * Run a single emboss pass and return the FBO handle. No blur — hotstamp
 * keeps edges crisp. `margins` is `(top, right, bottom, left)` in original-
 * image pixels; the legacy clears 1px on top for the darkening pass and 2px
 * on bottom for the brightening pass.
 */
function renderHotstampEdge(
  buddy: WebGLPostProcessor,
  mask: ImageBitmap | AnyCanvas,
  matrix: Mat3Tuple,
  margins: [number, number, number, number]
): GPUTextureHandle {
  const w = mask.width;
  const h = mask.height;
  buddy.useProgram(PROGRAMS.emboss);
  buddy.setUniforms({
    uTexelSizeX: { type: Uniforms.FLOAT1, value: 1 / w },
    uTexelSizeY: { type: Uniforms.FLOAT1, value: 1 / h },
    uMatrix: { type: Uniforms.FLOAT1V, value: matrix },
    uOffset: { type: Uniforms.FLOAT1, value: 0 },
    uMargins: { type: Uniforms.FLOAT4, value: margins },
    uSize: { type: Uniforms.FLOAT2, value: [w, h] },
    uInput: { type: Uniforms.TEXTURE2D, value: mask },
  });
  return buddy.toFramebuffer(w, h);
}

/**
 * Apply the hotstamp effect (GPU). Falls back to flat no-effect if WebGL2
 * isn't available — the worker dispatch should already have routed in that
 * case, but we keep a defensive branch in case the function is called
 * directly.
 */
export function applyHotstampEffect(params: HotstampEffectParams): HotstampEffectResult;
export function applyHotstampEffect(
  params: HotstampEffectParams,
  output: { kind: 'canvas' }
): HotstampEffectResult;
export function applyHotstampEffect(
  params: HotstampEffectParams,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function applyHotstampEffect(
  params: HotstampEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): HotstampEffectResult | GPUTextureHandle | null {
  const { width, height, color, alpha, eindex, mask, textHeight } = params;

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
    });
  }

  // Run the entire compose pipeline at the mask's own dimensions — same
  // rationale as engraving: matches legacy text-fitted output, avoids UV
  // stretching, and downstream applyTransformAndDraw places the small canvas
  // onto the full-size output.
  const w = mask.width;
  const h = mask.height;

  buddy.wake();
  buddy.setResolution(w, h);

  // Both emboss output and compose are FBO/canvas-output; emboss uses the
  // chain (FBO_VERTEX_SRC) convention, compose uses lib default for `to()`.
  ensureProgram(buddy, PROGRAMS.emboss, BUILTIN_SHADER_SOURCES[PROGRAMS.emboss], FBO_VERTEX_SRC);
  ensureProgram(buddy, HOTSTAMP_COMPOSE_PROGRAM, hotstampComposeFragSrc);

  const { rgb, colorOpacity } = computeHotstampFill(color, eindex);

  let darken: GPUTextureHandle | null = null;
  let brighten: GPUTextureHandle | null = null;
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    // INVERTED matrix → highlights engraved-direction edges → composed as
    // a darkening overlay. Top-row clear suppresses convolution bleed at
    // the top boundary.
    darken = renderHotstampEdge(buddy, mask, EMBOSS_MATRIX_INVERTED, [1, 0, 0, 0]);
    // STANDARD matrix → highlights raised-direction edges → composed as a
    // brightening overlay. Bottom 2-row clear matches the legacy fillRect
    // cleanup on the standard pass.
    brighten = renderHotstampEdge(buddy, mask, EMBOSS_MATRIX_STANDARD, [0, 0, 2, 0]);
  }

  buddy.useProgram(HOTSTAMP_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uMask: { type: Uniforms.TEXTURE2D, value: mask },
    // Bind the mask as a placeholder for unused edge samplers — keeps the
    // sampler valid; the shader guards reads with uHasEdges.
    uDarken: { type: Uniforms.TEXTURE2D, value: darken ?? mask },
    uBrighten: { type: Uniforms.TEXTURE2D, value: brighten ?? mask },
    uHasEdges: { type: Uniforms.INT1, value: darken !== null ? 1 : 0 },
    uColor: { type: Uniforms.FLOAT3, value: rgb },
    uOpacity: { type: Uniforms.FLOAT1, value: colorOpacity * alpha },
    uEdgeAlpha: { type: Uniforms.FLOAT1, value: EDGE_OVERLAY_ALPHA },
  });

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(w, h);
    buddy.unsetTextureUniforms('uMask', 'uDarken', 'uBrighten');
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(w, h);
  buddy.to(ctx);
  buddy.unsetTextureUniforms('uMask', 'uDarken', 'uBrighten');
  return { canvas, ctx };
}

/** Extract eindex from compiled mask data, if present. */
export function extractHotstampParams(maskData: PimcoMaskSubstitutionCompiled): {
  eindex?: number;
} {
  const params = maskData.effectparams;
  let eindex: number | undefined;
  if (params && 'eindex' in params && typeof params.eindex === 'number') {
    eindex = params.eindex;
  }
  if (eindex !== undefined) {
    return { eindex };
  }
  return {};
}

/** Convenience wrapper: applies hotstamp from a `TextLayerDescriptor`. */
export function processHotstampEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number
): AnyCanvas | null;
export function processHotstampEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  output: { kind: 'canvas' }
): AnyCanvas | null;
export function processHotstampEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function processHotstampEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  output: EffectOutput = { kind: 'canvas' }
): AnyCanvas | GPUTextureHandle | null {
  const color = extractDefaultColorCode(layer.color);
  const { eindex } = extractHotstampParams(layer.maskData);

  const params: HotstampEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    mask,
    textHeight,
  };
  if (eindex !== undefined) {
    params.eindex = eindex;
  }

  if (output.kind === 'handle') {
    return applyHotstampEffect(params, output);
  }
  return applyHotstampEffect(params, output).canvas;
}

/** Get the hotstamp fill color string for debugging / preview. */
export function getHotstampFillColor(
  color: string,
  eindex?: number
): {
  fillColor: string;
  colorOpacity: number;
  distFromWhite: number;
} {
  const white: RGBColor = [255, 255, 255];
  const rgb = parseHexColor(color) ?? [0, 0, 0];

  let colorOpacity: number;
  let dist: number;
  if (eindex !== undefined && eindex > 0) {
    colorOpacity = eindex;
    dist = distanceFromEindex(eindex);
  } else {
    dist = colorDistance(white, rgb);
    colorOpacity = calculateEindex(dist);
  }

  const distFactor = Math.max(1 - dist, 0);
  const r = String(35 * distFactor);
  const g = String(22 * distFactor);
  const fillColor = `rgba(${r}, ${g}, 0, ${String(colorOpacity)})`;

  return {
    fillColor,
    colorOpacity,
    distFromWhite: dist,
  };
}
