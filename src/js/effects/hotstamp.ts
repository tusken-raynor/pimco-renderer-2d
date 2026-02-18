/**
 * Hotstamp Effect Pipeline
 *
 * Creates a hot-stamped/foil-pressed appearance for text layers.
 * Similar to engraving but with dual emboss (both raised and pressed effects).
 * Pipeline:
 * 1. Create dual emboss canvases (standard and inverted)
 * 2. Calculate color-distance-based opacity (bezier curve formula)
 * 3. Apply color with multiply blend mode
 * 4. Apply dual emboss highlights (if text is large enough)
 * 5. Apply mask (destination-in composite)
 *
 * Effect parameters:
 * - eindex: Optional pre-computed opacity value (overrides color-based calculation)
 * - color: Text color (used to calculate opacity when eindex not provided)
 * - alpha: Layer alpha (0-1)
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { parseHexColor, type RGBColor } from '../utils/color';
import { emboss2D, invert, whiteToAlpha, blackToAlpha } from './index';
import { extractDefaultColorCode } from './no-effect';
import { colorDistance, calculateEindex, distanceFromEindex } from './engraving';

// Re-export shared functions from engraving for convenience
export { colorDistance, calculateEindex, distanceFromEindex };

/**
 * Minimum text height threshold for applying embossing effects.
 * Text smaller than this is rendered without emboss highlights.
 */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Parameters for the hotstamp effect pipeline.
 */
export interface HotstampEffectParams {
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
}

/**
 * Result of the hotstamp effect pipeline.
 */
export interface HotstampEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Dual emboss result containing both highlight and shadow canvases.
 */
export interface DualEmbossResult {
  /** Highlight emboss (inverted matrix, creates raised highlight) */
  highlight: { canvas: AnyCanvas; ctx: Canvas2DContext };
  /** Shadow emboss (standard matrix, creates shadow) */
  shadow: { canvas: AnyCanvas; ctx: Canvas2DContext };
}

/**
 * Create dual emboss canvases for hotstamp effect.
 * Uses both inverted and standard emboss matrices for a raised/pressed appearance.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Dual emboss result with highlight and shadow canvases
 */
export function createHotstampEmboss(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number
): DualEmbossResult {
  // Create highlight emboss canvas (inverted for raised effect)
  const { canvas: highlightCanvas, ctx: highlightCtx } = createCanvasWithContext(width, height);
  highlightCtx.fillStyle = '#fff';
  highlightCtx.fillRect(0, 0, width, height);
  highlightCtx.drawImage(mask, 0, 0);

  // Create shadow emboss canvas (copy from highlight before processing)
  const { canvas: shadowCanvas, ctx: shadowCtx } = createCanvasWithContext(width, height);
  shadowCtx.drawImage(highlightCanvas, 0, 0);

  // Process highlight: inverted emboss matrix
  emboss2D(highlightCtx, width, height, true);
  // Process shadow: standard emboss matrix
  emboss2D(shadowCtx, width, height, false);

  // Clean up edge artifacts
  highlightCtx.fillStyle = '#000';
  shadowCtx.fillStyle = '#000';
  highlightCtx.fillRect(0, 0, width, 1); // Top edge
  shadowCtx.fillRect(0, height - 2, width, 2); // Bottom edge

  // Convert to alpha masks
  invert(highlightCtx, width, height);
  whiteToAlpha(highlightCtx, width, height);
  blackToAlpha(shadowCtx, width, height);

  return {
    highlight: { canvas: highlightCanvas, ctx: highlightCtx },
    shadow: { canvas: shadowCanvas, ctx: shadowCtx },
  };
}

/**
 * Apply the hotstamp effect pipeline.
 *
 * Pipeline:
 * 1. Calculate opacity from color distance (or use provided eindex)
 * 2. Fill with calculated hotstamp color
 * 3. Apply dual emboss highlights (if text is large enough)
 * 4. Apply mask using destination-in
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyHotstampEffect(params: HotstampEffectParams): HotstampEffectResult {
  const { width, height, color, alpha, eindex, mask, textHeight } = params;

  // Create the draw canvas
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Calculate color-distance-based opacity
  const white: RGBColor = [255, 255, 255];
  const rgb = parseHexColor(color) ?? [0, 0, 0];

  let colorOpacity: number;
  let dist: number;

  if (eindex !== undefined && eindex > 0) {
    // Use provided eindex and derive distance
    colorOpacity = eindex;
    dist = distanceFromEindex(eindex);
  } else {
    // Calculate from color distance
    dist = colorDistance(white, rgb);
    colorOpacity = calculateEindex(dist);
  }

  // Calculate the hotstamp color based on distance from white
  // Hotstamp uses different RGB multipliers than engraving for a warmer tone
  const distFactor = Math.max(1 - dist, 0);
  const r = String(35 * distFactor);
  const g = String(22 * distFactor);
  const fillColor = `rgba(${r}, ${g}, 0, ${String(colorOpacity)})`;

  // Fill with hotstamp color
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, width, height);

  // Apply dual emboss highlights if text is large enough
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    const { highlight, shadow } = createHotstampEmboss(mask, width, height);

    // Apply highlight emboss (raised effect)
    ctx.globalAlpha = 0.2;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(highlight.canvas, 0, 0);

    // Apply shadow emboss (pressed effect) with lighter blend
    ctx.globalAlpha = 0.2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(shadow.canvas, 0, 0);
  }

  // Apply mask
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  // Reset context state
  ctx.globalCompositeOperation = 'source-over';

  return { canvas, ctx };
}

/**
 * Extract hotstamp-specific parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Hotstamp parameters (currently just eindex if available)
 */
export function extractHotstampParams(maskData: PimcoMaskSubstitutionCompiled): {
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
 * Process a text layer with hotstamp effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the hotstamp effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param textHeight - Height of the text (for emboss threshold)
 * @returns Result canvas or null on failure
 */
export function processHotstampEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);
  const { eindex } = extractHotstampParams(layer.maskData);

  // Build params, only including eindex if defined (exactOptionalPropertyTypes compliance)
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

  const result = applyHotstampEffect(params);

  return result.canvas;
}

/**
 * Get the hotstamp fill color for given parameters.
 * Useful for debugging or preview purposes.
 *
 * @param color - Input color (hex string)
 * @param eindex - Optional pre-computed eindex
 * @returns Object with fillColor and computed values
 */
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

  // Hotstamp uses different RGB multipliers than engraving
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
