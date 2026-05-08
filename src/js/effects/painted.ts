/**
 * Painted Effect Pipeline (GPU)
 *
 * Paint-stamp appearance: a tiled paint texture × color tint inside an
 * alpha-eroded text shape, sitting over a backdrop of soft bevel hints
 * (emboss INVERTED darken + emboss STANDARD brighten, both crisp).
 *
 * Pipeline (single shader chain, one CPU readback at the end):
 *   1. (GPU) erode(mask, PaintedInsetShrink) — shrinks the mask so the paint
 *      sits ~1px inside the glyph, leaving a thin bevel ring around it.
 *   2. (GPU, conditional) For text taller than EMBOSS_HEIGHT_THRESHOLD:
 *        - emboss(INVERTED) + bottom-2 clear → highlight (darken)
 *        - emboss(STANDARD) + top-2 clear → shadowEdge (brighten)
 *      No blur on the emboss output — legacy painted explicitly commented
 *      out the `filter: blur(1px)` for these layers.
 *   3. (GPU) painted-compose: layers texture × tint × shrunkMask on top of
 *      the bevel backdrop in straight-alpha space.
 *
 * Note: legacy painted built its bevel emboss on a heavily-thresholded
 * "expanded" mask (Canvas2D `blur(1px) brightness(50%) contrast(500%)
 * brightness(200%) contrast(200%)`) so the bevel rim sat slightly outside
 * the original glyph. That filter chain doesn't translate cleanly to a
 * single blur+bc shader pass on our white-on-black mask format (the bc
 * threshold direction reverses), so this implementation embosses the raw
 * mask. Visually the bevel rim hugs the glyph edge tightly — verify
 * against legacy and add a dilate prep pass if needed.
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
  type ChainInput,
  type EffectOutput,
  type Mat3Tuple,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';

import paintedComposeFragSrc from '@/shaders/painted-compose.frag.glsl?raw';

/** Text-height threshold below which the bevel step is skipped. */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/** Default mask erosion radius — matches legacy's PaintedInsetShrink default. */
const DEFAULT_INSET_SHRINK = 1.0;

/** Legacy weights for each bevel overlay. */
const HIGHLIGHT_OVERLAY_ALPHA = 0.1;
const SHADOW_EDGE_OVERLAY_ALPHA = 0.05;

/** Stable program name for the painted compose shader. */
const PAINTED_COMPOSE_PROGRAM = 'pimco_painted_compose';

export interface PaintedEffectParams {
  width: number;
  height: number;
  /** Paint tint color (CSS color string). */
  color: string;
  /** Layer alpha (0-1) — modulates tint strength, never final transparency. */
  alpha: number;
  /** Pixel radius of mask erosion (default 1.0; 0 = skip). */
  paintedInsetShrink: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
  /** Optional paint texture, tiled across the canvas. */
  texture?: ImageBitmap;
  /** Text height in pixels — controls bevel gate. */
  textHeight: number;
}

export interface PaintedEffectResult {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
}

/** Run a single emboss pass and return the FBO. Crisp output, sum-zero kernel offset = 0. */
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

/** Apply the painted effect (GPU). Falls back to flat no-effect when WebGL2 is missing. */
export function applyPaintedEffect(params: PaintedEffectParams): PaintedEffectResult;
export function applyPaintedEffect(
  params: PaintedEffectParams,
  output: { kind: 'canvas' }
): PaintedEffectResult;
export function applyPaintedEffect(
  params: PaintedEffectParams,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function applyPaintedEffect(
  params: PaintedEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): PaintedEffectResult | GPUTextureHandle | null {
  const { width, height, color, alpha, paintedInsetShrink, mask, texture, textHeight } = params;

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

  const w = mask.width;
  const h = mask.height;

  buddy.wake();
  buddy.setResolution(w, h);

  ensureProgram(buddy, PROGRAMS.erode, BUILTIN_SHADER_SOURCES[PROGRAMS.erode], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.emboss, BUILTIN_SHADER_SOURCES[PROGRAMS.emboss], FBO_VERTEX_SRC);
  ensureProgram(buddy, PAINTED_COMPOSE_PROGRAM, paintedComposeFragSrc);

  // 1. Shrunken mask (paint sits inside this).
  let shrunkMask: ChainInput = mask;
  if (paintedInsetShrink > 0) {
    buddy.useProgram(PROGRAMS.erode);
    const start = Math.ceil(-paintedInsetShrink);
    const end = Math.ceil(paintedInsetShrink);
    buddy.setUniforms({
      uStart: { type: Uniforms.INT1, value: start },
      uEnd: { type: Uniforms.INT1, value: end },
      uTexelSizeX: { type: Uniforms.FLOAT1, value: 1 / w },
      uTexelSizeY: { type: Uniforms.FLOAT1, value: 1 / h },
      uInput: { type: Uniforms.TEXTURE2D, value: mask },
    });
    shrunkMask = buddy.toFramebuffer(w, h);
  }

  // 2. Crisp bevel handles for tall enough text.
  let highlight: GPUTextureHandle | null = null;
  let shadowEdge: GPUTextureHandle | null = null;
  const hasEdges = textHeight > EMBOSS_HEIGHT_THRESHOLD;
  if (hasEdges) {
    // Highlight (darken): INVERTED kernel + bottom-2 clear.
    highlight = renderEmboss(buddy, mask, w, h, EMBOSS_MATRIX_INVERTED, [0, 0, 2, 0]);
    // Shadow edge (brighten): STANDARD kernel + top-2 clear.
    shadowEdge = renderEmboss(buddy, mask, w, h, EMBOSS_MATRIX_STANDARD, [2, 0, 0, 0]);
  }

  // CPU-side: tint color → vec3 in 0..1.
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];
  const colorVec: [number, number, number] = [
    layerRgb[0] / 255,
    layerRgb[1] / 255,
    layerRgb[2] / 255,
  ];

  const tileScale: [number, number] = texture
    ? [w / texture.width, h / texture.height]
    : [1, 1];

  buddy.useProgram(PAINTED_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uShrunkMask: { type: Uniforms.TEXTURE2D, value: shrunkMask },
    uTexture: { type: Uniforms.TEXTURE2D, value: texture ?? 0xffffffff },
    uHighlight: { type: Uniforms.TEXTURE2D, value: highlight ?? shrunkMask },
    uShadowEdge: { type: Uniforms.TEXTURE2D, value: shadowEdge ?? shrunkMask },
    uTileScale: { type: Uniforms.FLOAT2, value: tileScale },
    uColor: { type: Uniforms.FLOAT3, value: colorVec },
    uOpacity: { type: Uniforms.FLOAT1, value: alpha },
    uHighlightAlpha: { type: Uniforms.FLOAT1, value: HIGHLIGHT_OVERLAY_ALPHA },
    uShadowEdgeAlpha: { type: Uniforms.FLOAT1, value: SHADOW_EDGE_OVERLAY_ALPHA },
    uHasEdges: { type: Uniforms.INT1, value: hasEdges ? 1 : 0 },
  });

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(w, h);
    buddy.unsetTextureUniforms('uShrunkMask', 'uTexture', 'uHighlight', 'uShadowEdge');
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(w, h);
  buddy.to(ctx);
  buddy.unsetTextureUniforms('uShrunkMask', 'uTexture', 'uHighlight', 'uShadowEdge');
  return { canvas, ctx };
}

/** Extract painted-specific parameters from compiled mask data. */
export function extractPaintedParams(maskData: PimcoMaskSubstitutionCompiled): {
  paintedInsetShrink: number;
} {
  const params = maskData.effectparams;

  let paintedInsetShrink = DEFAULT_INSET_SHRINK;

  if (params && 'PaintedInsetShrink' in params && typeof params.PaintedInsetShrink === 'number') {
    paintedInsetShrink = params.PaintedInsetShrink;
  }

  return { paintedInsetShrink };
}

/** Convenience wrapper: applies painted from a `TextLayerDescriptor`. */
export function processPaintedEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap
): AnyCanvas | null;
export function processPaintedEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  output: { kind: 'canvas' }
): AnyCanvas | null;
export function processPaintedEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function processPaintedEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap,
  output: EffectOutput = { kind: 'canvas' }
): AnyCanvas | GPUTextureHandle | null {
  const color = extractDefaultColorCode(layer.color);
  const { paintedInsetShrink } = extractPaintedParams(layer.maskData);

  const params: PaintedEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    paintedInsetShrink,
    mask,
    textHeight,
  };
  if (texture !== undefined) {
    params.texture = texture;
  }

  if (output.kind === 'handle') {
    return applyPaintedEffect(params, output);
  }
  return applyPaintedEffect(params, output).canvas;
}

/** Get the painted effect parameters for debugging/preview. */
export function getPaintedEffectInfo(paintedInsetShrink: number): {
  insetShrink: number;
  embossThreshold: number;
  defaultInsetShrink: number;
} {
  return {
    insetShrink: paintedInsetShrink,
    embossThreshold: EMBOSS_HEIGHT_THRESHOLD,
    defaultInsetShrink: DEFAULT_INSET_SHRINK,
  };
}
