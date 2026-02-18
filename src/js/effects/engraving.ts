/**
 * Engraving Effect Pipeline
 *
 * Creates an engraved appearance for text layers, simulating carved/etched text.
 * Pipeline:
 * 1. Create emboss shadow (inverted emboss matrix)
 * 2. Calculate color-distance-based opacity (bezier curve formula)
 * 3. Apply color with multiply blend mode
 * 4. Apply emboss highlight (if text is large enough)
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
import { emboss2D, invert, whiteToAlpha } from './index';
import { extractDefaultColorCode } from './no-effect';

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

/**
 * Create the emboss canvas for engraving effect.
 * Uses inverted emboss matrix for an engraved/pressed-in look.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Emboss canvas ready for overlay
 */
export function createEngravingEmboss(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number
): { canvas: AnyCanvas; ctx: Canvas2DContext } {
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Fill with white and draw mask
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(mask, 0, 0);

  // Apply inverted emboss (for engraved look)
  emboss2D(ctx, width, height, true);

  // Clean up top edge artifact
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, 1);

  // Invert and convert to alpha mask
  invert(ctx, width, height);
  whiteToAlpha(ctx, width, height);

  return { canvas, ctx };
}

/**
 * Apply the engraving effect pipeline.
 *
 * Pipeline:
 * 1. Calculate opacity from color distance (or use provided eindex)
 * 2. Fill with calculated engraving color
 * 3. Apply emboss highlight (if text is large enough)
 * 4. Apply mask using destination-in
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyEngravingEffect(params: EngravingEffectParams): EngravingEffectResult {
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

  // Calculate the engraving color based on distance from white
  // Darker colors get more red/brown tint, lighter colors get less
  const distFactor = Math.max(1 - dist, 0);
  const r = String(68 * distFactor);
  const g = String(34 * distFactor);
  const fillColor = `rgba(${r}, ${g}, 0, ${String(colorOpacity)})`;

  // Fill with engraving color
  ctx.fillStyle = fillColor;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, width, height);

  // Apply emboss highlight if text is large enough
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    const embossResult = createEngravingEmboss(mask, width, height);

    // Apply subtle emboss highlight with blur
    ctx.filter = 'blur(1px)';
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(embossResult.canvas, 0, 0);
    ctx.filter = 'none';
  }

  // Apply mask
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  // Reset context state
  ctx.globalCompositeOperation = 'source-over';

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
export function processEngravingEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number
): AnyCanvas | null {
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

  const result = applyEngravingEffect(params);

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
