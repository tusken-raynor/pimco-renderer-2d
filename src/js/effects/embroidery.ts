/**
 * Embroidery Effect Pipeline
 *
 * Creates an embroidered/stitched appearance for text layers.
 * Pipeline:
 * 1. Alpha erode (optional, based on AlphaErosionRadius param)
 * 2. Tile texture pattern
 * 3. Color multiply
 * 4. Apply dual emboss (if text is large enough)
 * 5. Apply fuzz effect (for stitch appearance)
 * 6. Apply mask (destination-in composite)
 * 7. Add drop shadow (if text is large enough)
 *
 * Effect parameters (from mask.effectparams):
 * - AlphaErosionRadius: Erosion radius for alpha channel (default: 0)
 * - EmbroideryFuzziness: Fuzz intensity for stitch effect (default: 1.0)
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { brightness, parseHexColor } from '../utils/color';
import { alphaErode, emboss2D, invert, whiteToAlpha, blackToAlpha, tile, fuzz } from './index';
import { extractDefaultColorCode } from './no-effect';

/**
 * Minimum text height threshold for applying embossing and shadow effects.
 * Text smaller than this is rendered without emboss highlights and shadows.
 */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Default blur amount for emboss highlight in pixels.
 */
const EMBOSS_BLUR_AMOUNT = 4;

/**
 * Shadow blur amount in pixels.
 */
const SHADOW_BLUR_AMOUNT = 1;

/**
 * Shadow opacity multiplier based on brightness.
 */
const SHADOW_BRIGHTNESS_FACTOR = 0.7;

/**
 * Parameters for the embroidery effect pipeline.
 */
export interface EmbroideryEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Thread color (CSS color string) */
  color: string;
  /** Layer alpha (0-1) */
  alpha: number;
  /** Alpha erosion radius (default: 0) */
  alphaErosionRadius: number;
  /** Fuzz intensity (default: 1.0) */
  fuzziness: number;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
  /** Texture image for embroidery pattern */
  texture?: ImageBitmap;
  /** Text height in pixels (for emboss/shadow threshold) */
  textHeight: number;
  /** Whether to enable fuzz effect (defaults to true) */
  enableFuzz?: boolean;
}

/**
 * Result of the embroidery effect pipeline.
 */
export interface EmbroideryEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Dual emboss result containing both highlight and shadow canvases.
 */
export interface DualEmbossResult {
  /** Highlight emboss (standard matrix, creates raised highlight) */
  highlight: { canvas: AnyCanvas; ctx: Canvas2DContext };
  /** Shadow emboss (inverted matrix, creates shadow) */
  shadow: { canvas: AnyCanvas; ctx: Canvas2DContext };
}

/**
 * Create dual emboss canvases for embroidery effect.
 * Uses both standard and inverted emboss matrices for a raised/textured appearance.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Dual emboss result with highlight and shadow canvases
 */
export function createEmbroideryEmboss(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number
): DualEmbossResult {
  // Create highlight emboss canvas (standard for raised effect)
  const { canvas: highlightCanvas, ctx: highlightCtx } = createCanvasWithContext(width, height);
  highlightCtx.fillStyle = '#fff';
  highlightCtx.fillRect(0, 0, width, height);
  highlightCtx.drawImage(mask, 0, 0);

  // Create shadow emboss canvas (copy from highlight before processing)
  const { canvas: shadowCanvas, ctx: shadowCtx } = createCanvasWithContext(width, height);
  shadowCtx.drawImage(highlightCanvas, 0, 0);

  // Process highlight: standard emboss matrix
  emboss2D(highlightCtx, width, height, false);
  // Process shadow: inverted emboss matrix
  emboss2D(shadowCtx, width, height, true);

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
 * Extract embroidery effect parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Embroidery parameters (erosion radius and fuzziness)
 */
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

/**
 * Apply the embroidery effect pipeline.
 *
 * Pipeline:
 * 1. Create mask canvas with optional alpha erosion
 * 2. Tile texture pattern
 * 3. Apply color multiply
 * 4. Apply dual emboss highlights (if text is large enough)
 * 5. Apply fuzz effect to mask (for stitch appearance)
 * 6. Apply mask using destination-in
 * 7. Add drop shadow (if text is large enough)
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyEmbroideryEffect(params: EmbroideryEffectParams): EmbroideryEffectResult {
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
    enableFuzz = true,
  } = params;

  // Create working mask canvas (may be modified by erosion and fuzz)
  const { canvas: maskCanvas, ctx: maskCtx } = createCanvasWithContext(width, height);
  maskCtx.drawImage(mask, 0, 0);

  // Step 1: Apply alpha erosion if specified
  if (alphaErosionRadius > 0) {
    alphaErode(alphaErosionRadius, maskCanvas, maskCanvas);
  }

  // Create the draw canvas
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Step 2: Tile texture (if provided)
  if (texture) {
    const tiled = tile(texture, width, height);
    if (tiled) {
      ctx.drawImage(tiled, 0, 0);
    }
  }

  // Step 3: Apply color with multiply blend
  const rgb = parseHexColor(color) ?? [0, 0, 0];
  const colorBrightness = brightness(rgb[0], rgb[1], rgb[2]) / 255;

  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, width, height);

  // Step 4: Apply emboss if text is large enough
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    const { highlight, shadow } = createEmbroideryEmboss(maskCanvas, width, height);

    // Apply highlight emboss with blur
    ctx.filter = `blur(${String(EMBOSS_BLUR_AMOUNT)}px)`;
    ctx.globalAlpha = 0.7;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(highlight.canvas, 0, 0);

    // Apply shadow emboss with lighter blend
    // Darker colors get more shadow, lighter colors get less
    ctx.globalAlpha = 1.0 - colorBrightness;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(shadow.canvas, 0, 0);
    ctx.filter = 'none';
  }

  // Step 5: Apply fuzz effect to mask (for stitch appearance)
  if (enableFuzz && fuzziness > 0) {
    fuzz(maskCtx, fuzziness);
  }

  // Step 6: Apply mask
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);

  // Step 7: Add drop shadow if text is large enough
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    // Create shadow canvas
    const { canvas: shadowCanvas, ctx: shadowCtx } = createCanvasWithContext(width, height);

    // Draw shadow as the mask with blur
    shadowCtx.globalAlpha = colorBrightness * SHADOW_BRIGHTNESS_FACTOR;
    shadowCtx.filter = `blur(${String(SHADOW_BLUR_AMOUNT)}px)`;
    shadowCtx.globalCompositeOperation = 'source-over';
    shadowCtx.drawImage(maskCanvas, 0, 0);

    // Overlay the main content on top
    shadowCtx.globalAlpha = 1;
    shadowCtx.filter = 'none';
    shadowCtx.globalCompositeOperation = 'source-over';
    shadowCtx.drawImage(canvas, 0, 0);

    // Return the shadow canvas as the final result
    return { canvas: shadowCanvas, ctx: shadowCtx };
  }

  // Reset context state
  ctx.globalCompositeOperation = 'source-over';

  return { canvas, ctx };
}

/**
 * Process a text layer with embroidery effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the embroidery effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param textHeight - Height of the text (for emboss/shadow threshold)
 * @param texture - Optional texture bitmap for embroidery pattern
 * @param enableFuzz - Whether to enable fuzz effect (defaults to true)
 * @returns Result canvas or null on failure
 */
export function processEmbroideryEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap,
  enableFuzz = true
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);
  const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(layer.maskData);

  // Build params, only including optional fields if defined
  const params: EmbroideryEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    alphaErosionRadius,
    fuzziness,
    mask,
    textHeight,
    enableFuzz,
  };

  if (texture !== undefined) {
    params.texture = texture;
  }

  const result = applyEmbroideryEffect(params);

  return result.canvas;
}

/**
 * Get the embroidery color brightness for given color.
 * Useful for debugging or preview purposes.
 *
 * @param color - Input color (hex string)
 * @returns Object with brightness value (0-1)
 */
export function getEmbroideryColorBrightness(color: string): {
  brightness: number;
  rgb: [number, number, number];
} {
  const rgb = parseHexColor(color) ?? [0, 0, 0];
  const b = brightness(rgb[0], rgb[1], rgb[2]) / 255;

  return {
    brightness: b,
    rgb: rgb as [number, number, number],
  };
}
