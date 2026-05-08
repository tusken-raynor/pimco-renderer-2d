/**
 * No-Effect Pipeline (Canvas2D)
 *
 * The fallback path for text layers with no specific effect, plus the
 * universal fallback when WebGL2 isn't available. Stays within vanilla
 * Canvas2D capabilities — no shaders, no pixel manipulation.
 *
 * Pipeline:
 *   1. Tile texture across the mask-fitted canvas (or fill white if no
 *      texture is provided — gives the multiply blend a uniform white base
 *      to tint).
 *   2. Multiply-blend the layer color over the texture/white at globalAlpha.
 *   3. destination-in against the rasterized text shape so only the text
 *      region survives. The rasterizer produces alpha-encoded masks (text
 *      coverage stored in the alpha channel via Canvas2D's natural
 *      `fillText` behavior on a transparent canvas), so destination-in
 *      gates the canvas correctly without any conversion step.
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { BlendMode } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { tile } from './index';

/**
 * Parameters for the no-effect pipeline.
 */
export interface NoEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Color value (CSS color string) */
  color: string;
  /** Color/blend alpha (0-1) */
  alpha: number;
  /** Blend mode for color application */
  blend: BlendMode;
  /** Optional texture image to tile */
  texture?: ImageBitmap;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
}

/**
 * Result of the no-effect pipeline.
 */
export interface NoEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Extract a default color code from various color formats.
 * Handles string, array, and object color definitions.
 *
 * @param color - Color value in various formats
 * @param backup - Fallback color (default: '#000000')
 * @returns CSS color string
 */
export function extractDefaultColorCode(
  color: string | string[] | Record<string, string> | undefined,
  backup = '#000000'
): string {
  if (!color) {
    return backup;
  }

  if (typeof color === 'string') {
    return color;
  }

  if (Array.isArray(color)) {
    return color[0] ?? backup;
  }

  // Object - return first value
  const keys = Object.keys(color);
  if (keys.length > 0) {
    return color[keys[0]];
  }

  return backup;
}

/**
 * Convert a BlendMode to a valid globalCompositeOperation value.
 * Handles the special case of 'normal' which maps to 'source-over'.
 *
 * @param blend - Blend mode
 * @returns Valid canvas composite operation
 */
export function blendModeToCompositeOp(blend: BlendMode | undefined): GlobalCompositeOperation {
  if (!blend || blend === 'normal') {
    return 'source-over';
  }
  // All other BlendMode values are valid GlobalCompositeOperation values
  return blend as GlobalCompositeOperation;
}

/**
 * Apply the no-effect pipeline to produce a tinted, mask-gated text canvas.
 *
 * Runs at the **mask's own dimensions** (text-fitted), matching every
 * migrated GPU effect. `applyTransformAndDraw` downstream positions this
 * small canvas onto the master canvas via the layer transform.
 *
 * Pipeline:
 *   1. Tile the texture (if provided), or fill with white.
 *   2. Multiply-blend the color over the base at `alpha` opacity.
 *   3. destination-in against the alpha-encoded mask.
 */
export function applyNoEffect(params: NoEffectParams): NoEffectResult {
  const { color, alpha, blend, texture, mask } = params;

  const w = mask.width;
  const h = mask.height;
  const { canvas, ctx } = createCanvasWithContext(w, h);

  // Step 1: Tile texture, or fill white if no texture is provided. The
  // multiply blend in step 2 needs a non-transparent base or it collapses
  // to source-over; a uniform white base keeps the tint reading correctly.
  if (texture) {
    const tiled = tile(texture, w, h);
    if (tiled) {
      ctx.drawImage(tiled, 0, 0);
    }
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  // Step 2: Multiply-blend the layer color over the base.
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blend === 'normal' ? 'multiply' : blendModeToCompositeOp(blend);
  ctx.fillRect(0, 0, w, h);

  // Step 3: destination-in keys off the source's alpha channel. This path
  // REQUIRES the worker to have rasterized with the rasterizer's
  // `transparentBackground: true` option — that variant fills no
  // background and produces alpha-encoded text (anti-aliasing in `.a`)
  // exactly because Canvas2D's `fillText` on a fresh canvas leaves
  // everything outside the glyph fully transparent. If a caller hands us
  // the default white-on-black-OPAQUE mask used by GPU effects (alpha = 1
  // throughout), this drawImage becomes a no-op and the entire tinted
  // base will leak through with no text shape cut out — see the
  // `routesToNoEffect` predicate in the worker that keeps the formats
  // matched to their consumers.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  ctx.globalCompositeOperation = 'source-over';

  return { canvas, ctx };
}

/**
 * Process a text layer with no-effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the no-effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param texture - Optional texture bitmap
 * @returns Result canvas or null on failure
 */
export function processNoEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  texture?: ImageBitmap
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);

  // Build params, only including texture if defined (exactOptionalPropertyTypes compliance)
  const params: NoEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    blend: layer.blend,
    mask,
  };

  if (texture !== undefined) {
    params.texture = texture;
  }

  const result = applyNoEffect(params);

  return result.canvas;
}

/**
 * Apply color fill to an existing canvas with mask. Same shape as the tail
 * of `applyNoEffect` (multiply-blend color, destination-in alpha-encoded
 * mask) — a convenience for callers that already have a base canvas and
 * just want to tint + gate by a text shape.
 *
 * The mask MUST be alpha-encoded (rasterizer's `transparentBackground:
 * true` variant). A white-on-black-OPAQUE mask would make the
 * destination-in step a no-op — see `applyNoEffect` for the same caveat.
 */
export function applyColorAndMask(
  ctx: Canvas2DContext,
  color: string,
  alpha: number,
  blend: BlendMode,
  mask: ImageBitmap | AnyCanvas
): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blend === 'normal' ? 'multiply' : blendModeToCompositeOp(blend);
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  ctx.globalCompositeOperation = 'source-over';
}
