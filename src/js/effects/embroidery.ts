/**
 * Embroidery Effect Pipeline (GPU)
 *
 * Stitched-thread look: a tiled thread texture × color tint, with a softly
 * blurred raised highlight, a crisp engraved-edge brightening, a fuzzed
 * mask gate (per-row jitter), and an optional drop shadow whose strength
 * tracks the thread color's brightness.
 *
 * Pipeline (single shader chain, one CPU readback at the end):
 *   1. (GPU, conditional) erode(mask, AlphaErosionRadius) — shrinks the text
 *      shape by a few pixels if the layer requests it.
 *   2. (GPU, conditional) For text taller than EMBOSS_HEIGHT_THRESHOLD: emboss
 *      with the STANDARD kernel + top-row clear, then blur(σ=4) — the soft
 *      "highlight" handle composed as a *darken* overlay. Also emboss with
 *      INVERTED + bottom-2-row clear, no blur — the crisp "shadow" handle
 *      composed as a *brighten* overlay.
 *   3. (GPU, conditional) fuzz(erodedMask, EmbroideryFuzziness) — per-row
 *      horizontal jitter that breaks up the mask edges into thread strands.
 *   4. (GPU, conditional) For tall enough text: blur(σ=1) the fuzzed mask
 *      to produce the drop-shadow shape sampled by the compose shader.
 *   5. (GPU) embroidery-compose: tiles the texture, applies dark/bright
 *      overlays, mask-gates against the fuzzed mask, and (if applicable)
 *      composites the result on top of a soft black shadow.
 *
 * Effect parameters (from mask.effectparams):
 *   AlphaErosionRadius - Pixel radius of mask erosion (default: 0)
 *   EmbroideryFuzziness - Fuzz intensity (default: 1.0)
 */

import WebGLPostProcessor, { Uniforms, type GPUTextureHandle } from 'webgl-postprocessor';

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvas, createCanvasWithContext, getContext2D } from '../utils/canvas';
import { brightness as colorBrightness, parseHexColor } from '../utils/color';
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

import embroideryComposeFragSrc from '@/shaders/embroidery-compose.frag.glsl?raw';

/** Text-height threshold below which emboss + drop shadow are skipped. */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Sigma for the bevel-edge softening blur, applied to **both** the darken
 * (emboss STANDARD) and brighten (emboss INVERTED) handles. Legacy set
 * `ctx.filter = "blur(4px)"` once and drew both emb canvases under it, so
 * both edges blurred together. Most browsers implement `filter: blur` as a
 * 3-pass box blur — visually fluffier than a true σ=N Gaussian — so this
 * value may need bumping above 4 to match legacy fluff.
 */
const EDGE_BLUR_SIGMA = 4;

/** Sigma for the drop-shadow blur (matches legacy `blur(1px)`). */
const SHADOW_BLUR_SIGMA = 1;

/** Legacy fixed weight for the darkening highlight overlay. */
const DARK_OVERLAY_ALPHA = 0.7;

/** Legacy multiplier on `colorBrightness` for the drop-shadow strength. */
const SHADOW_BRIGHTNESS_FACTOR = 0.7;

/** Stable program name for the embroidery compose shader. */
const EMBROIDERY_COMPOSE_PROGRAM = 'pimco_embroidery_compose';

/**
 * Lifecycle hooks for emitting pipeline intermediates as snapshots. Same shape
 * as the engraving hook — wantsPart is consulted before any extra GPU/CPU
 * work, so when nobody's subscribed to a topic, the materialize-as-canvas
 * step is skipped entirely.
 */
export interface EmbroideryDebugHooks {
  wantsPart(part: string): boolean;
  emitPart(part: string, canvas: AnyCanvas, meta?: Record<string, unknown>): Promise<void>;
}

export interface EmbroideryEffectParams {
  width: number;
  height: number;
  /** Thread color (CSS color string). */
  color: string;
  /** Layer alpha (0-1) — modulates tint strength, never final transparency. */
  alpha: number;
  /** Pixel radius of mask erosion (0 = skip). */
  alphaErosionRadius: number;
  /** Fuzz intensity (0 = skip). */
  fuzziness: number;
  /** Mask image — white-on-black-opaque, .r = inside text. */
  mask: ImageBitmap | AnyCanvas;
  /** Optional thread texture, tiled across the canvas. */
  texture?: ImageBitmap;
  /** Text height in pixels — controls emboss + drop-shadow gate. */
  textHeight: number;
  /**
   * Optional lifecycle-event hooks for emitting pipeline intermediates. When
   * undefined, embroidery runs the lean pipeline with no extra work. When
   * defined, hook.wantsPart is checked at each emission point and only
   * subscribed parts are materialized as canvases.
   */
  debugHooks?: EmbroideryDebugHooks;
}

export interface EmbroideryEffectResult {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
}

/**
 * Run a single emboss pass. Crisp output — no blur. `margins` is
 * `(top, right, bottom, left)` in original-image pixels.
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

/**
 * Run a 2-pass separable Gaussian blur and return the final FBO.
 */
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

/** Apply the embroidery effect (GPU). Falls back to flat no-effect when WebGL2 is missing. */
export async function applyEmbroideryEffect(
  params: EmbroideryEffectParams
): Promise<EmbroideryEffectResult>;
export async function applyEmbroideryEffect(
  params: EmbroideryEffectParams,
  output: { kind: 'canvas' }
): Promise<EmbroideryEffectResult>;
export async function applyEmbroideryEffect(
  params: EmbroideryEffectParams,
  output: { kind: 'handle' }
): Promise<GPUTextureHandle | null>;
export async function applyEmbroideryEffect(
  params: EmbroideryEffectParams,
  output: EffectOutput = { kind: 'canvas' }
): Promise<EmbroideryEffectResult | GPUTextureHandle | null> {
  const {
    width,
    height,
    color,
    alpha,
    alphaErosionRadius,
    fuzziness,
    mask,
    texture,
    textHeight,
    debugHooks,
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

  // Run the entire pipeline at the mask's own dimensions (text-fitted raster).
  const w = mask.width;
  const h = mask.height;

  buddy.wake();
  buddy.setResolution(w, h);

  // Register all primitive programs and the compose shader. Primitives use
  // the non-flipping FBO_VERTEX_SRC since they all write to FBOs; compose
  // writes to a 2D canvas via to(), so it uses the lib default vert.
  ensureProgram(buddy, PROGRAMS.erode, BUILTIN_SHADER_SOURCES[PROGRAMS.erode], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.emboss, BUILTIN_SHADER_SOURCES[PROGRAMS.emboss], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.blur, BUILTIN_SHADER_SOURCES[PROGRAMS.blur], FBO_VERTEX_SRC);
  ensureProgram(buddy, PROGRAMS.fuzz, BUILTIN_SHADER_SOURCES[PROGRAMS.fuzz], FBO_VERTEX_SRC);
  ensureProgram(buddy, EMBROIDERY_COMPOSE_PROGRAM, embroideryComposeFragSrc);

  // 1. Optional erode → eroded mask handle (or raw mask if no erosion).
  // Persistent because the eroded mask feeds *both* emboss passes AND the
  // fuzz pass — three consumers. Non-persistent FBO handles would free
  // (useCount → 0) when their next binding is replaced, breaking later
  // consumers. Manually consumed at the end of the function.
  let erodedMask: ChainInput = mask;
  let erodedMaskHandle: GPUTextureHandle | null = null;
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
    erodedMaskHandle = buddy.toFramebuffer(w, h, /* persistent */ true);
    erodedMask = erodedMaskHandle;
  }

  // 2. Dual emboss for the bevel overlays — only for tall enough text.
  let highlight: GPUTextureHandle | null = null;
  let shadow: GPUTextureHandle | null = null;
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    const embossedHighlight = renderEmboss(
      buddy,
      erodedMask,
      w,
      h,
      EMBOSS_MATRIX_STANDARD,
      [1, 0, 0, 0]
    );
    highlight = renderBlur2D(buddy, embossedHighlight, w, h, EDGE_BLUR_SIGMA);

    // Both bevel handles get the same softening blur — matching legacy's
    // single `ctx.filter = "blur(4px)"` that applied to both emb canvases.
    const embossedShadow = renderEmboss(
      buddy,
      erodedMask,
      w,
      h,
      EMBOSS_MATRIX_INVERTED,
      [0, 0, 2, 0]
    );
    shadow = renderBlur2D(buddy, embossedShadow, w, h, EDGE_BLUR_SIGMA);
  }

  // 3. Optional fuzz → fuzzed mask handle (or eroded mask if no fuzz).
  // Persistent for the same reason as erodedMask: the fuzzed mask feeds the
  // drop-shadow blur AND compose's uMask.
  let fuzzedMask: ChainInput = erodedMask;
  let fuzzedMaskHandle: GPUTextureHandle | null = null;
  if (fuzziness > 0) {
    buddy.useProgram(PROGRAMS.fuzz);
    buddy.setUniforms({
      uTexelSizeX: { type: Uniforms.FLOAT1, value: 1 / w },
      uSeedOffset: { type: Uniforms.INT1, value: Math.floor(Math.random() * 1000) },
      uFuzzScale: { type: Uniforms.FLOAT1, value: fuzziness },
      uInput: { type: Uniforms.TEXTURE2D, value: erodedMask },
    });
    fuzzedMaskHandle = buddy.toFramebuffer(w, h, /* persistent */ true);
    fuzzedMask = fuzzedMaskHandle;
  }

  // 4. Drop-shadow blur (1px sigma on the fuzzed mask) — for tall text only.
  let shadowBlurredMask: ChainInput = fuzzedMask;
  const hasDropShadow = textHeight > EMBOSS_HEIGHT_THRESHOLD;
  if (hasDropShadow) {
    shadowBlurredMask = renderBlur2D(buddy, fuzzedMask, w, h, SHADOW_BLUR_SIGMA);
  }

  // CPU-side: tint color → vec3 in 0..1, brightness for dynamic overlay alphas.
  const layerRgb = parseHexColor(color) ?? [0, 0, 0];
  const colorVec: [number, number, number] = [
    layerRgb[0] / 255,
    layerRgb[1] / 255,
    layerRgb[2] / 255,
  ];
  const brightness01 = colorBrightness(layerRgb[0], layerRgb[1], layerRgb[2]) / 255;

  // Tile scale: how many copies of the texture span the canvas. With no
  // texture asset we upload a 1×1 white pixel (0xFFFFFFFF) — see metal.ts
  // for the same identity-texture trick.
  const tileScale: [number, number] = texture
    ? [w / texture.width, h / texture.height]
    : [1, 1];

  // Optional lifecycle emit: materialize the post-blur highlight handle as a
  // canvas so callers can inspect the soft thread-shadow shape that compose
  // applies as the darkening overlay. Only runs when a subscriber matches
  // the topic — no extra GPU/CPU work otherwise. Compose's uniforms don't
  // include `uInput`, so the binding here stays alive until the cleanup at
  // the bottom of the function (which now includes 'uInput').
  if (debugHooks?.wantsPart('embroidery-highlight') && highlight !== null) {
    ensureProgram(buddy, PROGRAMS.passthrough, BUILTIN_SHADER_SOURCES[PROGRAMS.passthrough]);
    const debugCanvas = createCanvas(w, h);
    const debugCtx = getContext2D(debugCanvas);
    if (debugCtx) {
      buddy.useProgram(PROGRAMS.passthrough);
      buddy.setResolution(w, h);
      buddy.setUniforms({
        uInput: { type: Uniforms.TEXTURE2D, value: highlight },
      });
      buddy.to(debugCtx);
      await debugHooks.emitPart('embroidery-highlight', debugCanvas, {
        width: w,
        height: h,
        sigma: EDGE_BLUR_SIGMA,
      });
    }
  }

  buddy.useProgram(EMBROIDERY_COMPOSE_PROGRAM);
  buddy.setUniforms({
    uMask: { type: Uniforms.TEXTURE2D, value: fuzzedMask },
    uShadowBlurredMask: { type: Uniforms.TEXTURE2D, value: shadowBlurredMask },
    uTexture: { type: Uniforms.TEXTURE2D, value: texture ?? 0xffffffff },
    // Bind the fuzzed mask as a placeholder for unused edge samplers — keeps
    // the binding valid; the shader guards reads with uHasEdges.
    uHighlight: { type: Uniforms.TEXTURE2D, value: highlight ?? fuzzedMask },
    uShadow: { type: Uniforms.TEXTURE2D, value: shadow ?? fuzzedMask },
    uTileScale: { type: Uniforms.FLOAT2, value: tileScale },
    uColor: { type: Uniforms.FLOAT3, value: colorVec },
    uOpacity: { type: Uniforms.FLOAT1, value: alpha },
    uDarkAlpha: { type: Uniforms.FLOAT1, value: DARK_OVERLAY_ALPHA },
    uBrightAlpha: { type: Uniforms.FLOAT1, value: 1 - brightness01 },
    uShadowAlpha: { type: Uniforms.FLOAT1, value: brightness01 * SHADOW_BRIGHTNESS_FACTOR },
    uHasEdges: { type: Uniforms.INT1, value: highlight !== null ? 1 : 0 },
    uHasDropShadow: { type: Uniforms.INT1, value: hasDropShadow ? 1 : 0 },
  });

  // Cleanup shared between both output modes.
  const cleanupComposeBindings = (): void => {
    buddy.unsetTextureUniforms(
      'uMask',
      'uShadowBlurredMask',
      'uTexture',
      'uHighlight',
      'uShadow',
      // 'uInput' may still hold the highlight handle from the optional debug
      // emit above. Releasing here drops that ref count along with compose's
      // uHighlight binding so the texture is freed.
      'uInput'
    );

    // Manually free the persistent multi-use handles. Their useCount is
    // initialized at PERSISTENT_HANDLE_REF_BASE so normal unbind cycles never
    // reach 0 — without consumeTextureHandle the FBO textures would leak GPU
    // memory across renders.
    if (erodedMaskHandle !== null) {
      buddy.consumeTextureHandle(erodedMaskHandle);
    }
    if (fuzzedMaskHandle !== null) {
      buddy.consumeTextureHandle(fuzzedMaskHandle);
    }
  };

  if (output.kind === 'handle') {
    const handle = buddy.toFramebuffer(w, h);
    cleanupComposeBindings();
    return handle;
  }

  const { canvas, ctx } = createCanvasWithContext(w, h);
  buddy.to(ctx);
  cleanupComposeBindings();
  return { canvas, ctx };
}

/** Extract embroidery-specific parameters from compiled mask data. */
export function extractEmbroideryParams(maskData: PimcoMaskSubstitutionCompiled): {
  alphaErosionRadius: number;
  fuzziness: number;
} {
  const params = maskData.effectparams;

  let alphaErosionRadius = 0;
  let fuzziness = 1.0;

  if (params) {
    if ('AlphaErosionRadius' in params && typeof params.AlphaErosionRadius === 'number') {
      alphaErosionRadius = params.AlphaErosionRadius;
    }
    if ('EmbroideryFuzziness' in params && typeof params.EmbroideryFuzziness === 'number') {
      fuzziness = params.EmbroideryFuzziness;
    }
  }

  return { alphaErosionRadius, fuzziness };
}

/** Convenience wrapper: applies embroidery from a `TextLayerDescriptor`. */
export async function processEmbroideryEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap,
  debugHooks?: EmbroideryDebugHooks
): Promise<AnyCanvas | null>;
export async function processEmbroideryEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  debugHooks: EmbroideryDebugHooks | undefined,
  output: { kind: 'canvas' }
): Promise<AnyCanvas | null>;
export async function processEmbroideryEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture: ImageBitmap | undefined,
  debugHooks: EmbroideryDebugHooks | undefined,
  output: { kind: 'handle' }
): Promise<GPUTextureHandle | null>;
export async function processEmbroideryEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap,
  debugHooks?: EmbroideryDebugHooks,
  output: EffectOutput = { kind: 'canvas' }
): Promise<AnyCanvas | GPUTextureHandle | null> {
  const color = extractDefaultColorCode(layer.color);
  const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(layer.maskData);

  const params: EmbroideryEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    alphaErosionRadius,
    fuzziness,
    mask,
    textHeight,
  };
  if (texture !== undefined) {
    params.texture = texture;
  }
  if (debugHooks !== undefined) {
    params.debugHooks = debugHooks;
  }

  if (output.kind === 'handle') {
    return applyEmbroideryEffect(params, output);
  }
  const result = await applyEmbroideryEffect(params, output);
  return result.canvas;
}

/** Get the embroidery thread brightness for a color — handy for previews. */
export function getEmbroideryColorBrightness(color: string): {
  brightness: number;
  rgb: [number, number, number];
} {
  const rgb = parseHexColor(color) ?? [0, 0, 0];
  const b = colorBrightness(rgb[0], rgb[1], rgb[2]) / 255;
  return {
    brightness: b,
    rgb: rgb as [number, number, number],
  };
}
