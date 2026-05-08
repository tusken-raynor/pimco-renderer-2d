/**
 * Engraving Effect Pipeline (GPU)
 *
 * Creates an engraved appearance for text layers, simulating carved/etched text.
 * Pipeline (one shader chain, single CPU readback at the end):
 *   1. (CPU) Compute the bezier opacity and the engraving fill color from the
 *      layer's color (or pre-supplied eindex) — pure scalar math.
 *   2. (GPU, conditional) For text taller than EMBOSS_HEIGHT_THRESHOLD: emboss
 *      the mask with the STANDARD matrix in highlight variant + top-row edge
 *      clear, then run a separable Gaussian blur (sigma=1) for soft edges.
 *      Output: a vec4(0, 0, 0, edgeStrength) handle.
 *   3. (GPU) engraving-compose shader takes the mask, optional highlight,
 *      uniforms (color, opacity, highlight weight), and renders the final
 *      engraved layer directly onto the result canvas.
 *
 * Uses EMBOSS_MATRIX_INVERTED (the deboss/engraved direction). The matrix
 * constants in effect-utils are defined for the new white-on-black-opaque mask
 * format — they are negations of the legacy black-on-white kernels, since
 * `conv(1 - I', M) = -conv(I', M)` for matrices that sum to 0. Same visual
 * intent as the legacy: highlight catches at the engraved edges.
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
import { createCanvas, createCanvasWithContext, getContext2D } from '../utils/canvas';
import { parseHexColor, type RGBColor } from '../utils/color';
import {
  BUILTIN_SHADER_SOURCES,
  EMBOSS_MATRIX_INVERTED,
  FBO_VERTEX_SRC,
  PROGRAMS,
  ensureProgram,
  gaussianWeights,
  type EffectOutput,
} from './effect-utils';
import { myWebGLBuddy } from './index';
import { extractDefaultColorCode, applyNoEffect } from './no-effect';

import engravingComposeFragSrc from '@/shaders/engraving-compose.frag.glsl?raw';

/**
 * Minimum text height threshold for applying embossing effects.
 * Text smaller than this is rendered without emboss highlights.
 */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Maximum value for normalized color distance calculation.
 * sqrt(255^2 + 255^2 + 255^2) ≈ 441.67
 */
const MAX_COLOR_DISTANCE = 441.6729559300637;

/**
 * Lifecycle hooks injected by the slave so engraving can emit pipeline
 * intermediates (e.g. the post-blur highlight handle as a canvas) without
 * knowing anything about the master/subscriber wiring.
 *
 * The wantsPart predicate is consulted before any extra GPU/CPU work — when
 * nobody's subscribed to a given `pimcoRenderPart:{id}:{part}` topic, the
 * effect skips the materialize-as-canvas step entirely.
 */
export interface EngravingDebugHooks {
  /** Returns true if at least one subscriber matches `pimcoRenderPart:{id}:{part}`. */
  wantsPart(part: string): boolean;
  /** Posts a part snapshot. Slave handles createImageBitmap + transfer. */
  emitPart(part: string, canvas: AnyCanvas, meta?: Record<string, unknown>): Promise<void>;
}

/**
 * Parameters for the engraving effect pipeline.
 */
export interface EngravingEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Text color (CSS color string) */
  color: string;
  /** Layer alpha (0-1) */
  alpha: number;
  /** Optional pre-computed opacity index */
  eindex?: number;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
  /** Text height in pixels (for emboss threshold) */
  textHeight: number;
  /**
   * Optional lifecycle-event hooks for emitting pipeline intermediates. When
   * undefined, engraving runs the lean pipeline with no extra work. When
   * defined, hook.wantsPart is checked at each emission point and only
   * subscribed parts are materialized as canvases.
   */
  debugHooks?: EngravingDebugHooks;
}

/**
 * Result of the engraving effect pipeline.
 */
export interface EngravingEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Calculate the normalized distance between two colors.
 * Returns a value from 0 (identical) to 1 (maximum distance).
 *
 * @param color1 - First color as RGB array
 * @param color2 - Second color as RGB array
 * @returns Normalized distance (0-1)
 */
export function colorDistance(color1: RGBColor, color2: RGBColor): number {
  const dr = color2[0] - color1[0];
  const dg = color2[1] - color1[1];
  const db = color2[2] - color1[2];
  return Math.sqrt(dr * dr + dg * dg + db * db) / MAX_COLOR_DISTANCE;
}

/**
 * Calculate the engraving opacity (eindex) based on color distance from white.
 * Uses a bezier curve formula to create a visually pleasing opacity response.
 *
 * @param colorDistFromWhite - Normalized distance from white (0-1)
 * @returns Opacity value for the engraving effect
 */
export function calculateEindex(colorDistFromWhite: number): number {
  // Bezier curve formula:
  // ((pow(dist * 2.4422495703 - 1, 3) + 1) / 4) * 0.382 + 0.051
  const scaled = colorDistFromWhite * 2.4422495703 - 1;
  const cubed = Math.pow(scaled, 3);
  return ((cubed + 1) / 4) * 0.382 + 0.051;
}

/**
 * Calculate color distance from eindex (inverse of calculateEindex).
 * Used when eindex is provided directly.
 *
 * @param eindex - Pre-computed opacity index
 * @returns Estimated color distance from white
 */
export function distanceFromEindex(eindex: number): number {
  // Inverse of the bezier curve:
  // (pow(max(((alpha - 0.051) / 0.382) * 4 - 1, 0), 0.333333) + 1) / 2.4422495703
  const normalized = Math.max(((eindex - 0.051) / 0.382) * 4 - 1, 0);
  const cubeRoot = Math.pow(normalized, 1 / 3);
  return (cubeRoot + 1) / 2.4422495703;
}

/** Composite weight for the emboss highlight overlay (matches legacy 0.07). */
const HIGHLIGHT_OVERLAY_ALPHA = 0.07;

/** Sigma for the emboss highlight's softening blur (matches legacy `blur(1px)`). */
const HIGHLIGHT_BLUR_SIGMA = 1;

/** Stable program name for the engraving compose shader. */
const ENGRAVING_COMPOSE_PROGRAM = 'pimco_engraving_compose';

/**
 * Compute the engraving fill color and combined opacity for a given layer color
 * (or pre-supplied eindex). Pure scalar math, no GPU work.
 */
export function computeEngravingFill(
  color: string,
  eindex: number | undefined
): {
  /** Engraving tint RGB in 0..1 range, ready for vec3 uniform upload. */
  rgb: [number, number, number];
  /** Bezier opacity (eindex). */
  colorOpacity: number;
  /** Distance from white in 0..1 range. */
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

  // Engraving tint: warm dark brown (68, 34, 0) faded by distance from white.
  // Darker layer colors get more tint, lighter layer colors get less.
  const distFactor = Math.max(1 - dist, 0);
  const rgb: [number, number, number] = [
    (68 / 255) * distFactor,
    (34 / 255) * distFactor,
    0,
  ];

  return { rgb, colorOpacity, dist };
}

/**
 * Render the emboss highlight handle for engraving — INVERTED matrix in
 * highlight variant with top-edge clear, then a separable Gaussian blur. The
 * matrix constants are defined against the new white-on-black mask format, so
 * INVERTED here produces the same engraved/debossed-edge highlight that the
 * legacy code got from its INVERTED matrix on a black-on-white preprocessed
 * mask.
 *
 * Runs at the mask's own dimensions (e.g. 303×58 for a text-fitted raster) so
 * UV sampling between mask, emboss, blur, and the compose shader is 1:1 — no
 * accidental stretching.
 */
async function renderEngravingHighlight(
  buddy: WebGLPostProcessor,
  mask: ImageBitmap | AnyCanvas,
  debugHooks?: EngravingDebugHooks
): Promise<GPUTextureHandle> {
  // Both emboss and blur produce intermediate FBOs in this chain, so they're
  // registered with the non-flipping FBO_VERTEX_SRC. The lib's default vert
  // would Y-flip on every pass and alternate FBO orientation; this convention
  // keeps every intermediate handle in storage-row-0 = original-top form,
  // matching the ImageBitmap mask source. The final canvas-output passes
  // (engraving-compose and the debug passthrough) keep the lib default.
  ensureProgram(buddy, PROGRAMS.emboss, BUILTIN_SHADER_SOURCES[PROGRAMS.emboss], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.blur, BUILTIN_SHADER_SOURCES[PROGRAMS.blur], FBO_VERTEX_SRC);

  const w = mask.width;
  const h = mask.height;
  const texelX = 1.0 / w;
  const texelY = 1.0 / h;
  
  // Pass 1: emboss with top-row edge clear. Output is grayscale luma in
  // (R, G, B) with alpha=1 — compose reads the highlight handle's .r channel
  // (post-blur) for the engraved-edge contribution.
  buddy.useProgram(PROGRAMS.emboss);
  buddy.setUniforms({
    uTexelSizeX: { type: Uniforms.FLOAT1, value: texelX },
    uTexelSizeY: { type: Uniforms.FLOAT1, value: texelY },
    // FLOAT1V (gl.uniform1fv) — the shader declares `uniform float uMatrix[9]`,
    // a flat float array, NOT a mat3. Using Uniforms.MAT3 here would call
    // gl.uniformMatrix3fv against the array's location and silently leave the
    // shader-side values uninitialized (zeros), zeroing out the convolution.
    uMatrix: { type: Uniforms.FLOAT1V, value: EMBOSS_MATRIX_INVERTED },
    uOffset: { type: Uniforms.FLOAT1, value: 0 },
    uMargins: { type: Uniforms.FLOAT4, value: [1, 0, 0, 0] },
    uSize: { type: Uniforms.FLOAT2, value: [w, h] },
    uInput: { type: Uniforms.TEXTURE2D, value: mask },
  });
  const embossed = buddy.toFramebuffer(w, h);

  // Pass 2: separable Gaussian blur — horizontal then vertical.
  const { weights, halfWidth } = gaussianWeights(HIGHLIGHT_BLUR_SIGMA);
  const texel: [number, number] = [texelX, texelY];

  buddy.useProgram(PROGRAMS.blur);
  buddy.setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: embossed },
    uTexel: { type: Uniforms.FLOAT2, value: texel },
    uAxis: { type: Uniforms.FLOAT2, value: [1, 0] },
    uHalfWidth: { type: Uniforms.INT1, value: halfWidth },
    uWeights: { type: Uniforms.FLOAT1V, value: weights },
    uBrightness: { type: Uniforms.FLOAT1, value: 1 },
    uContrast: { type: Uniforms.FLOAT1, value: 1 },
  });
  const blurH = buddy.toFramebuffer(w, h);

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
  const highlight = buddy.toFramebuffer(w, h);

  // Optional lifecycle emit: materialize the post-blur highlight as a canvas
  // for inspection. Only runs when a subscriber matches the topic — no extra
  // GPU/CPU work otherwise. The handle stays valid because we don't unset
  // uInput; compose's subsequent setUniforms({uHighlight: highlight}) will
  // bump the ref count again, and the engraving cleanup (which now also
  // unsets uInput) drops both refs.
  if (debugHooks?.wantsPart('engraving-highlight')) {
    // Passthrough is a final-pass program (writes directly to a 2D canvas via
    // `to()`), so it uses the lib's default Y-flipping vert — that flip
    // cancels the source FBO's Y-up convention so the result lands upright in
    // the destination canvas. Source handles are produced by FBO_VERTEX_SRC
    // chain passes, so storage row 0 = original-top, and the default flipping
    // vert here samples t=0 at fb-top → fb-top displays original-top.
    ensureProgram(
      buddy,
      PROGRAMS.passthrough,
      BUILTIN_SHADER_SOURCES[PROGRAMS.passthrough]
    );
    const debugCanvas = createCanvas(w, h);
    const debugCtx = getContext2D(debugCanvas);
    if (debugCtx) {
      buddy.useProgram(PROGRAMS.passthrough);
      buddy.setResolution(w, h);
      buddy.setUniforms({
        uInput: { type: Uniforms.TEXTURE2D, value: highlight },
      });
      buddy.to(debugCtx);
      await debugHooks.emitPart('engraving-highlight', debugCanvas, {
        width: w,
        height: h,
        sigma: HIGHLIGHT_BLUR_SIGMA,
        matrix: 'EMBOSS_MATRIX_INVERTED',
      });
    }
  }

  return highlight;
}

/**
 * Apply the engraving effect pipeline (GPU).
 *
 * Pipeline:
 *   1. Compute opacity + tint color from layer color (or eindex) — CPU scalar math.
 *   2. If text height > THRESHOLD, render the soft emboss highlight handle.
 *   3. Compose: bind mask + highlight + uniforms, render the engraving compose
 *      shader directly to the result canvas.
 *   4. Unbind compose's textures so the highlight handle's ref count drops to 0
 *      and its GPU texture is released.
 *
 * If WebGL2 isn't available, falls back to a flat no-effect render — the worker
 * dispatch should already have routed in that case, but defensive in case the
 * function is called directly.
 */
export async function applyEngravingEffect(
  params: EngravingEffectParams
): Promise<EngravingEffectResult>;
export async function applyEngravingEffect(
  params: EngravingEffectParams,
  output: { kind: 'canvas' }
): Promise<EngravingEffectResult>;
export async function applyEngravingEffect(
  params: EngravingEffectParams,
  output: { kind: 'handle' }
): Promise<GPUTextureHandle | null>;
export async function applyEngravingEffect(
  params: EngravingEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): Promise<EngravingEffectResult | GPUTextureHandle | null> {
  const { width, height, color, alpha, eindex, mask, textHeight, debugHooks } = params;

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

  // Run the entire compose pipeline at the mask's own dimensions. This matches
  // the legacy effect, which produced a text-fitted result canvas; downstream
  // applyTransformAndDraw places that small canvas onto the full-size output.
  // Running at full canvas dims would stretch the mask (sampled via normalized
  // UVs) across the output and ruin the proportions.
  const maskW = mask.width;
  const maskH = mask.height;

  buddy.wake();
  buddy.setResolution(maskW, maskH);

  ensureProgram(buddy, ENGRAVING_COMPOSE_PROGRAM, engravingComposeFragSrc);

  const { rgb, colorOpacity } = computeEngravingFill(color, eindex);

  // Optional emboss highlight handle — only when text is large enough.
  let highlight: GPUTextureHandle | null = null;
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    highlight = await renderEngravingHighlight(buddy, mask, debugHooks);
  }

  // Compose. uHighlight needs a valid sampler binding even when uHasHighlight
  // is 0; we use the mask as a benign placeholder.
  buddy.useProgram(ENGRAVING_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uMask: { type: Uniforms.TEXTURE2D, value: mask },
    uHighlight: { type: Uniforms.TEXTURE2D, value: highlight ?? mask },
    uHasHighlight: { type: Uniforms.INT1, value: highlight !== null ? 1 : 0 },
    uColor: { type: Uniforms.FLOAT3, value: rgb },
    uOpacity: { type: Uniforms.FLOAT1, value: colorOpacity * alpha },
    uHighlightAlpha: { type: Uniforms.FLOAT1, value: HIGHLIGHT_OVERLAY_ALPHA },
  });

  // Release the compose's texture bindings. uInput is included in case the
  // optional debug-emit pass in renderEngravingHighlight bound the highlight
  // handle there (passthrough); without this, the handle's useCount stays at
  // 1 across renders. For the non-debug path uInput might still hold blurH
  // from the V pass — same cleanup releases it. unsetTextureUniforms is a
  // no-op for uniform names not currently bound.
  const cleanupComposeBindings = (): void => {
    buddy.unsetTextureUniforms('uMask', 'uHighlight', 'uInput');
  };

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(maskW, maskH);
    cleanupComposeBindings();
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(maskW, maskH);
  // Pass the 2D context instead of the canvas: lib's `to()` does an instanceof
  // chain that references CanvasRenderingContext2D, which is undefined in the
  // worker context. Passing the context makes the first instanceof check
  // (OffscreenCanvasRenderingContext2D) short-circuit before the broken one.
  buddy.to(ctx);
  cleanupComposeBindings();
  return { canvas, ctx };
}

/**
 * Extract engraving-specific parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Engraving parameters (currently just eindex if available)
 */
export function extractEngravingParams(maskData: PimcoMaskSubstitutionCompiled): {
  eindex?: number;
} {
  // eindex might be stored in effectparams or as a top-level property
  const params = maskData.effectparams;

  let eindex: number | undefined;

  if (params && 'eindex' in params && typeof params.eindex === 'number') {
    eindex = params.eindex;
  }

  // Only return eindex if it's defined (exactOptionalPropertyTypes compliance)
  if (eindex !== undefined) {
    return { eindex };
  }
  return {};
}

/**
 * Process a text layer with engraving effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the engraving effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param textHeight - Height of the text (for emboss threshold)
 * @returns Result canvas or null on failure
 */
export async function processEngravingEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  debugHooks?: EngravingDebugHooks
): Promise<AnyCanvas | null>;
export async function processEngravingEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  debugHooks: EngravingDebugHooks | undefined,
  output: { kind: 'canvas' }
): Promise<AnyCanvas | null>;
export async function processEngravingEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  debugHooks: EngravingDebugHooks | undefined,
  output: { kind: 'handle' }
): Promise<GPUTextureHandle | null>;
export async function processEngravingEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  debugHooks?: EngravingDebugHooks,
  output: EffectOutput = { kind: 'canvas' }
): Promise<AnyCanvas | GPUTextureHandle | null> {
  const color = extractDefaultColorCode(layer.color);
  const { eindex } = extractEngravingParams(layer.maskData);

  // Build params, only including eindex if defined (exactOptionalPropertyTypes compliance)
  const params: EngravingEffectParams = {
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
  if (debugHooks !== undefined) {
    params.debugHooks = debugHooks;
  }

  if (output.kind === 'handle') {
    return applyEngravingEffect(params, output);
  }
  const result = await applyEngravingEffect(params, output);
  return result.canvas;
}

/**
 * Get the engraving fill color for given parameters.
 * Useful for debugging or preview purposes.
 *
 * @param color - Input color (hex string)
 * @param eindex - Optional pre-computed eindex
 * @returns Object with fillColor and computed values
 */
export function getEngravingFillColor(
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
  const r = String(68 * distFactor);
  const g = String(34 * distFactor);
  const fillColor = `rgba(${r}, ${g}, 0, ${String(colorOpacity)})`;

  return {
    fillColor,
    colorOpacity,
    distFromWhite: dist,
  };
}
