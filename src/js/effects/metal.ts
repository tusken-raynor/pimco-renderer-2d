/**
 * Metal Effect Pipeline (GPU)
 *
 * Brushed-metal appearance: tiled metal texture × uniform color tint plus a
 * sharp directional bevel from a custom emboss kernel. Shape mirrors hotstamp
 * but with (a) a tiled texture in the fill, (b) a custom non-zero-sum metal
 * kernel for the darkening pass, and (c) heavier overlay weights (0.7 / 0.3).
 *
 * Pipeline (single shader chain, one CPU readback at the end):
 *   1. (GPU, conditional) For text taller than EMBOSS_HEIGHT_THRESHOLD: emboss
 *      twice — METAL kernel + top-row clear, INVERTED kernel + bottom-2px
 *      clear. The METAL kernel has sum = -1 in legacy form, so the shader's
 *      uOffset argument carries that bias (see emboss.frag.glsl header).
 *   2. (GPU) metal-compose shader takes the mask, tiled texture, dual emboss
 *      handles, and uniform tint, and writes the final layer to the result
 *      canvas in one pass.
 */

import WebGLPostProcessor, { Uniforms, type GPUTextureHandle } from 'webgl-postprocessor';

import type { TextLayerDescriptor } from '../types/messages';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { parseHexColor } from '../utils/color';
import {
  BUILTIN_SHADER_SOURCES,
  EMBOSS_MATRIX_INVERTED,
  FBO_VERTEX_SRC,
  PROGRAMS,
  ensureProgram,
  type EffectOutput,
  type Mat3Tuple,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';

import metalComposeFragSrc from '@/shaders/metal-compose.frag.glsl?raw';

/** Text-height threshold below which the dual-emboss step is skipped. */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/** Legacy weights for the dark/bright overlays (source-over / plus-lighter). */
const DARK_OVERLAY_ALPHA = 0.7;
const BRIGHT_OVERLAY_ALPHA = 0.3;

/** Stable program name for the metal compose shader. */
const METAL_COMPOSE_PROGRAM = 'pimco_metal_compose';

/**
 * Custom metal emboss kernel.
 *
 * Negation of the legacy black-on-white kernel
 *   [-1, -1, -1; -1, -1, 1; 1, 1, 1]
 * for use on white-on-black-opaque masks. Unlike STANDARD/INVERTED, this
 * kernel has non-zero sum (legacy sum = -1, ours therefore = +1), so the
 * "negate the matrix" trick alone doesn't recover the legacy unclamped value
 * — see EMBOSS_OFFSET_METAL.
 */
const EMBOSS_MATRIX_METAL: Mat3Tuple = [1, 1, 1, 1, 1, -1, -1, -1, -1];

/**
 * Constant offset added to the convolution sum before clamp, to compensate
 * for the legacy kernel's non-zero sum. Equals `sum(M_legacy) = -1`.
 */
const EMBOSS_OFFSET_METAL = -1;

export interface MetalEffectParams {
  width: number;
  height: number;
  /** Metal tint color (CSS color string). */
  color: string;
  /** Layer alpha (0-1). */
  alpha: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
  /** Optional brushed-metal texture, tiled across the canvas. */
  texture?: ImageBitmap;
  /** Text height in pixels — controls whether the emboss step runs. */
  textHeight: number;
}

export interface MetalEffectResult {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
}

/**
 * Run a single emboss pass and return the FBO handle. No blur — metal keeps
 * the bevel crisp. `margins` is `(top, right, bottom, left)` in original-image
 * pixels.
 */
function renderMetalEdge(
  buddy: WebGLPostProcessor,
  mask: ImageBitmap | AnyCanvas,
  matrix: Mat3Tuple,
  offset: number,
  margins: [number, number, number, number]
): GPUTextureHandle {
  const w = mask.width;
  const h = mask.height;
  buddy.useProgram(PROGRAMS.emboss);
  buddy.setUniforms({
    uTexelSizeX: { type: Uniforms.FLOAT1, value: 1 / w },
    uTexelSizeY: { type: Uniforms.FLOAT1, value: 1 / h },
    uMatrix: { type: Uniforms.FLOAT1V, value: matrix },
    uOffset: { type: Uniforms.FLOAT1, value: offset },
    uMargins: { type: Uniforms.FLOAT4, value: margins },
    uSize: { type: Uniforms.FLOAT2, value: [w, h] },
    uInput: { type: Uniforms.TEXTURE2D, value: mask },
  });
  return buddy.toFramebuffer(w, h);
}

/** Apply the metal effect (GPU). Falls back to flat no-effect when WebGL2 is missing. */
export function applyMetalEffect(params: MetalEffectParams): MetalEffectResult;
export function applyMetalEffect(
  params: MetalEffectParams,
  output: { kind: 'canvas' }
): MetalEffectResult;
export function applyMetalEffect(
  params: MetalEffectParams,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function applyMetalEffect(
  params: MetalEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): MetalEffectResult | GPUTextureHandle | null {
  const { width, height, color, alpha, mask, texture, textHeight } = params;

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

  ensureProgram(buddy, PROGRAMS.emboss, BUILTIN_SHADER_SOURCES[PROGRAMS.emboss], FBO_VERTEX_SRC);
  ensureProgram(buddy, METAL_COMPOSE_PROGRAM, metalComposeFragSrc);

  let darken: GPUTextureHandle | null = null;
  let brighten: GPUTextureHandle | null = null;
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    darken = renderMetalEdge(
      buddy,
      mask,
      EMBOSS_MATRIX_METAL,
      EMBOSS_OFFSET_METAL,
      [1, 0, 0, 0]
    );
    brighten = renderMetalEdge(
      buddy,
      mask,
      EMBOSS_MATRIX_INVERTED,
      0,
      [0, 0, 2, 0]
    );
  }

  // Convert tint color to a 0..1 vec3 for the shader uniform.
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];
  const colorVec: [number, number, number] = [
    layerRgb[0] / 255,
    layerRgb[1] / 255,
    layerRgb[2] / 255,
  ];

  // Tile scale: how many copies of the texture span the canvas. Matches
  // Canvas2D `createPattern('repeat')` which aligns the pattern to (0, 0) of
  // the destination — same as fract(uv * scale) anchored at outFragCoord 0.
  // When there's no texture asset, we upload a 1×1 opaque-white pixel via
  // the lib's color-to-texture path (passing the 0xRRGGBBAA-packed number
  // makes WebGLPostProcessor decode it into ImageData of size 1). Tile scale
  // becomes irrelevant in that case — fract() of any value samples the same
  // single white texel, and the multiply collapses the formula to the
  // "no-texture" Canvas2D result.
  const tileScale: [number, number] = texture
    ? [w / texture.width, h / texture.height]
    : [1, 1];

  buddy.useProgram(METAL_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uMask: { type: Uniforms.TEXTURE2D, value: mask },
    // 0xFFFFFFFF = opaque white as a 1×1 pixel; multiplying by it is a no-op
    // so it serves as the identity texture when no asset is provided.
    uTexture: { type: Uniforms.TEXTURE2D, value: texture ?? 0xffffffff },
    // Bind the mask as a placeholder for unused edge samplers — the binding
    // must stay valid; the shader guards reads with uHasEdges.
    uDarken: { type: Uniforms.TEXTURE2D, value: darken ?? mask },
    uBrighten: { type: Uniforms.TEXTURE2D, value: brighten ?? mask },
    uTileScale: { type: Uniforms.FLOAT2, value: tileScale },
    uColor: { type: Uniforms.FLOAT3, value: colorVec },
    uOpacity: { type: Uniforms.FLOAT1, value: alpha },
    uDarkAlpha: { type: Uniforms.FLOAT1, value: DARK_OVERLAY_ALPHA },
    uBrightAlpha: { type: Uniforms.FLOAT1, value: BRIGHT_OVERLAY_ALPHA },
    uHasEdges: { type: Uniforms.INT1, value: darken !== null ? 1 : 0 },
  });

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(w, h);
    buddy.unsetTextureUniforms('uMask', 'uTexture', 'uDarken', 'uBrighten');
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(w, h);
  buddy.to(ctx);
  buddy.unsetTextureUniforms('uMask', 'uTexture', 'uDarken', 'uBrighten');
  return { canvas, ctx };
}

/** Convenience wrapper: applies metal from a `TextLayerDescriptor`. */
export function processMetalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap
): AnyCanvas | null;
export function processMetalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  output: { kind: 'canvas' }
): AnyCanvas | null;
export function processMetalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  output: { kind: 'handle' }
): GPUTextureHandle | null;
export function processMetalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap,
  output: EffectOutput = { kind: 'canvas' }
): AnyCanvas | GPUTextureHandle | null {
  const color = extractDefaultColorCode(layer.color);

  const params: MetalEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    mask,
    textHeight,
  };
  if (texture !== undefined) {
    params.texture = texture;
  }

  if (output.kind === 'handle') {
    return applyMetalEffect(params, output);
  }
  return applyMetalEffect(params, output).canvas;
}

/** The custom metal emboss kernel (white-on-black-opaque mask form). */
export function getMetalEmbossMatrix(): Mat3Tuple {
  return [...EMBOSS_MATRIX_METAL] as Mat3Tuple;
}
