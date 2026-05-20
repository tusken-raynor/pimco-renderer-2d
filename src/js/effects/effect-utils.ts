/**
 * Effect utilities — small helpers shared by every text effect.
 *
 * Effects use the WebGLPostProcessor buddy directly: useProgram, setUniforms,
 * toFramebuffer, to. This module just provides the things worth NOT inlining
 * everywhere — Gaussian weight math, idempotent program registration, the
 * built-in shader source map, and a few constants effects look up when
 * setting uniforms.
 *
 * Per-effect compose shaders are NOT here. Each effect file imports its own
 * compose shader source and registers it via ensureProgram() at the start of
 * its apply<X>Effect() function.
 */

import WebGLPostProcessor, { Uniforms } from 'webgl-postprocessor';

import erodeFragSrc from '@/shaders/erode.frag.glsl?raw';
import embossFragSrc from '@/shaders/emboss.frag.glsl?raw';
import blurFragSrc from '@/shaders/blur.frag.glsl?raw';
import fuzzFragSrc from '@/shaders/fuzz.frag.glsl?raw';
import normalMapFragSrc from '@/shaders/normal-map.frag.glsl?raw';
import colorScaleFragSrc from '@/shaders/color-scale.frag.glsl?raw';
import passthroughFragSrc from '@/shaders/passthrough.frag.glsl?raw';

import type { GPUTextureHandle } from 'webgl-postprocessor';
import type { AnyCanvas } from '../utils/canvas';

// =============================================================================
// Types
// =============================================================================

/** 3x3 convolution matrix tuple, row-major. */
export type Mat3Tuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Anything bindable as a TEXTURE2D uniform value. */
export type ChainInput = ImageBitmap | AnyCanvas | GPUTextureHandle;

/** Cardinal/intercardinal light direction for the normal-map shader's uDirection uniform. */
export type NormalDir = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * Where the effect's terminal compose pass should write its result.
 *
 * - `canvas`: writes to a fresh 2D canvas via `buddy.to(ctx)`. The result is
 *   an `AnyCanvas` the worker draws onto its full-size output canvas (with
 *   transforms / post-mask applied as a Canvas2D operation).
 * - `handle`: writes to a non-persistent FBO via `buddy.toFramebuffer(w, h)`.
 *   The result is a `GPUTextureHandle` whose underlying `WebGLTexture` lives
 *   on the shared `gl` and can be sampled by the projection program via
 *   `setUniforms({ tex: handle })` — no GPU→CPU readback between effect
 *   and projection. The handle's lifetime is one downstream `setUniforms`
 *   binding; cleanup happens automatically when the projection program
 *   switches programs and the next `bindDataForNewProgram` unbinds the
 *   sampler. Single-consumer only — non-persistent.
 */
export type EffectOutput = { kind: 'canvas' } | { kind: 'handle' };

// =============================================================================
// Matrix constants
// =============================================================================

/**
 * Standard emboss matrix: raised highlight, light from top-left.
 *
 * Defined for white-on-black-opaque masks (intensity in .r). This is the
 * negation of the legacy black-on-white STANDARD kernel: because
 * `conv(1 - I', M) = -conv(I', M)` when sum(M) = 0, intensity-inverting the
 * input requires negating the matrix to preserve the convolution result.
 */
export const EMBOSS_MATRIX_STANDARD: Mat3Tuple = [0, 1, 1, 0, 1, -1, -1, -1, 0];

/**
 * Inverted emboss matrix: deboss / engraved shadow.
 *
 * Negation of the legacy black-on-white INVERTED kernel — see STANDARD above
 * for the format-flip math.
 */
export const EMBOSS_MATRIX_INVERTED: Mat3Tuple = [0, -1, -1, -1, 1, 0, 1, 1, 0];

// =============================================================================
// Program registry
// =============================================================================

/** Stable program names for the built-in primitive shaders. */
export const PROGRAMS = {
  erode: 'pimco_erode',
  emboss: 'pimco_emboss',
  blur: 'pimco_blur',
  fuzz: 'pimco_fuzz',
  normalMap: 'pimco_normal_map',
  colorScale: 'pimco_color_scale',
  passthrough: 'pimco_passthrough',
} as const;

/** Built-in fragment shader sources, keyed by program name. */
export const BUILTIN_SHADER_SOURCES: Record<string, string> = {
  [PROGRAMS.erode]: erodeFragSrc,
  [PROGRAMS.emboss]: embossFragSrc,
  [PROGRAMS.blur]: blurFragSrc,
  [PROGRAMS.fuzz]: fuzzFragSrc,
  [PROGRAMS.normalMap]: normalMapFragSrc,
  [PROGRAMS.colorScale]: colorScaleFragSrc,
  [PROGRAMS.passthrough]: passthroughFragSrc,
};

/**
 * Non-flipping vertex shader for FBO-producing chain passes.
 *
 * The lib's default vertex shader negates `inPosition.y` to convert WebGL Y-up
 * clip space into Canvas2D Y-down. That's correct for a *single* shader pass
 * that reads an ImageBitmap (Y-down upload) and writes directly to a canvas —
 * the flip cancels the upload convention so the result lands upright. But in
 * a multi-pass chain, every flip alternates the FBO's storage orientation.
 * After N passes, an intermediate handle is Y-mirrored relative to the source
 * if N is odd, and the final compose pass mismatches it against ImageBitmap
 * inputs (which are zero passes from source) — visible as highlight/shadow
 * effects landing on the wrong edges of the glyph.
 *
 * Convention used by this codebase: every FBO-producing program is registered
 * with this non-flipping vert, keeping all intermediate handles in a single
 * orientation (storage row 0 = original-top, matching the ImageBitmap source
 * after default `texImage2D` upload). Only the final canvas-output pass uses
 * the lib default vert so `to(canvas)` lands upright.
 *
 * Shaders that key off `gl_FragCoord` (e.g. emboss edge-clear) must account
 * for the fact that under this vert, fb-bottom (small `gl_FragCoord.y`)
 * corresponds to original-top, opposite of the lib default.
 */
export const FBO_VERTEX_SRC =
  '#version 300 es\nin vec2 inPosition;out vec2 outFragCoord;void main(void){outFragCoord=inPosition*0.5+0.5;gl_Position=vec4(inPosition.x,inPosition.y,0.,1.);}';

// =============================================================================
// Uniform-value lookup tables
// =============================================================================

/** Index values for the normal-map shader's uDirection int uniform. */
export const NORMAL_DIR_INDEX: Record<NormalDir, number> = {
  N: 0,
  NE: 1,
  E: 2,
  SE: 3,
  S: 4,
  SW: 5,
  W: 6,
  NW: 7,
};

/**
 * Hard cap matching MAX_HALFWIDTH in blur.frag.glsl. The CPU-side weight buffer
 * passed via uWeights must always be exactly this length + 1 to satisfy the
 * shader's fixed-size float[MAX_HALFWIDTH + 1] uniform array.
 */
export const BLUR_MAX_HALFWIDTH = 32;

const BLUR_WEIGHTS_LENGTH = BLUR_MAX_HALFWIDTH + 1;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Idempotent program registration. Compiles + caches the program on the buddy
 * if not already there. Effect modules call this once for each shader they use
 * before invoking it.
 *
 * Pass `vertexSrc` to override the lib's default vertex shader — needed for
 * passthrough on FBO sources (see PASSTHROUGH_VERTEX_SRC) where the default
 * Y-flip would double-invert orientation.
 */
export function ensureProgram(
  buddy: WebGLPostProcessor,
  name: string,
  fragmentSrc: string,
  vertexSrc?: string
): void {
  if (!buddy.hasProgram(name)) {
    const config: { fragmentSrc: string; vertexSrc?: string } = { fragmentSrc };
    if (vertexSrc !== undefined) config.vertexSrc = vertexSrc;
    buddy.newProgram(name, config);
  }
}

/**
 * Register all built-in primitive programs at once. Useful at slave init so the
 * first effect render doesn't pay shader-compile cost on the critical path.
 */
export function ensureBuiltinPrograms(buddy: WebGLPostProcessor): void {
  for (const name of Object.keys(BUILTIN_SHADER_SOURCES)) {
    ensureProgram(buddy, name, BUILTIN_SHADER_SOURCES[name]);
  }
}

/**
 * Upload a 2D image source (Canvas or ImageBitmap) to a GPU handle whose
 * orientation matches the handles GPU effects produce — so downstream
 * projection (which compensates for the lib-default Y-flip) renders the
 * source upright.
 *
 * Used by the no-effect projection path: no-effect runs as Canvas2D (the
 * codebase's no-WebGL2 fallback), but if `mask.projection` is set AND WebGL2
 * is available, the resulting flat canvas needs to live on the GPU as a
 * sampleable texture for the projection draw.
 *
 * Vert choice: uses `PROGRAMS.passthrough`'s default registration (lib's
 * default Y-flipping vert), NOT FBO_VERTEX_SRC. GPU effects' terminal compose
 * passes also use the lib default vert when emitting their handle, so the
 * handle's FBO storage ends up Y-mirrored relative to the source canvas's
 * row order. Projection's vert (`projection.vert.glsl`) bakes in
 * `fragUV.y = 1.0 - fragUV.y` to undo that mirror. Matching that convention
 * here means projection renders our promoted canvas upright. Using
 * FBO_VERTEX_SRC instead leaves the handle un-mirrored and projection's
 * flip inverts it — text comes out upside-down.
 */
export function uploadCanvasToHandle(
  buddy: WebGLPostProcessor,
  source: AnyCanvas | ImageBitmap,
  width: number,
  height: number
): GPUTextureHandle {
  ensureProgram(
    buddy,
    PROGRAMS.passthrough,
    BUILTIN_SHADER_SOURCES[PROGRAMS.passthrough]
  );
  buddy.useProgram(PROGRAMS.passthrough);
  buddy.setResolution(width, height);
  buddy.setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: source },
  });
  return buddy.toFramebuffer(width, height);
}

/**
 * Compute normalized 1D Gaussian half-kernel weights for a given sigma.
 *
 * Returns a fixed-length array (BLUR_MAX_HALFWIDTH + 1) where index 0 is the
 * center weight and 1..halfWidth are the flanking taps. The shader applies the
 * symmetric counterpart at -i with the same weight, so the full kernel sums to
 * 1 across both sides.
 *
 * The array is always padded to the full length so the shader's fixed-size
 * uniform array is fully populated regardless of halfWidth.
 *
 * sigma <= 0 collapses to identity (halfWidth=0, weights[0]=1).
 */
export function gaussianWeights(sigma: number): { weights: number[]; halfWidth: number } {
  const weights = new Array<number>(BLUR_WEIGHTS_LENGTH).fill(0);
  if (sigma <= 0) {
    weights[0] = 1;
    return { weights, halfWidth: 0 };
  }
  const halfWidth = Math.min(Math.ceil(3 * sigma), BLUR_MAX_HALFWIDTH);
  const twoSigmaSq = 2 * sigma * sigma;
  let total = 0;
  for (let i = 0; i <= halfWidth; i++) {
    const w = Math.exp(-(i * i) / twoSigmaSq);
    weights[i] = w;
    total += i === 0 ? w : 2 * w;
  }
  for (let i = 0; i <= halfWidth; i++) {
    weights[i] /= total;
  }
  return { weights, halfWidth };
}
