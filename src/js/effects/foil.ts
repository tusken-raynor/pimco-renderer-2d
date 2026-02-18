/**
 * Foil Effect Pipeline
 *
 * Creates a shiny metallic foil appearance for text layers.
 * Pipeline:
 * 1. Alpha erode (shrink mask edges)
 * 2. Tile texture pattern (metallic foil texture)
 * 3. Color blend (apply color with specified blend mode)
 * 4. Apply shrunken mask (destination-in composite)
 * 5. Create dual emboss (if text is large enough)
 * 6. Add shadow and emboss highlights
 * 7. Draw final composition with shadow behind main content
 *
 * Effect parameters (from mask.effectparams):
 * - AlphaErosionRadius: Erosion radius for alpha channel (default: 1)
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled, BlendMode } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { alphaErode, emboss2D, invert, whiteToAlpha, blackToAlpha, tile } from './index';
import { extractDefaultColorCode, blendModeToCompositeOp } from './no-effect';

/**
 * Minimum text height threshold for applying embossing and shadow effects.
 * Text smaller than this is rendered without emboss highlights and shadows.
 */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Default alpha erosion radius for foil effect.
 */
const DEFAULT_EROSION_RADIUS = 1;

/**
 * Shadow blur amount in pixels.
 */
const SHADOW_BLUR_AMOUNT = 2;

/**
 * Emboss blur amount in pixels.
 */
const EMBOSS_BLUR_AMOUNT = 1;

/**
 * Parameters for the foil effect pipeline.
 */
export interface FoilEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Foil color (CSS color string) */
  color: string;
  /** Layer alpha (0-1) */
  alpha: number;
  /** Blend mode for color application */
  blend: BlendMode;
  /** Alpha erosion radius (default: 1) */
  alphaErosionRadius: number;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
  /** Texture image for foil pattern */
  texture?: ImageBitmap;
  /** Text height in pixels (for emboss/shadow threshold) */
  textHeight: number;
}

/**
 * Result of the foil effect pipeline.
 */
export interface FoilEffectResult {
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
 * Extract foil effect parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Foil parameters (erosion radius)
 */
export function extractFoilParams(maskData: PimcoMaskSubstitutionCompiled): {
  alphaErosionRadius: number;
} {
  const params = maskData.effectparams;

  let alphaErosionRadius = DEFAULT_EROSION_RADIUS;

  if (params && 'AlphaErosionRadius' in params && typeof params.AlphaErosionRadius === 'number') {
    alphaErosionRadius = params.AlphaErosionRadius;
  }

  return { alphaErosionRadius };
}

/**
 * Create dual emboss canvases for foil effect.
 * Uses both inverted and standard emboss matrices for a raised/pressed appearance.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Dual emboss result with highlight and shadow canvases
 */
export function createFoilEmboss(
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
 * Apply the foil effect pipeline.
 *
 * Pipeline:
 * 1. Create shrunk mask using alpha erosion
 * 2. Tile texture pattern (foil texture)
 * 3. Apply color with blend mode
 * 4. Apply shrunk mask using destination-in
 * 5. Create dual emboss for highlights (if text is large enough)
 * 6. Apply emboss and shadow effects
 * 7. Return final composition with shadow behind content
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyFoilEffect(params: FoilEffectParams): FoilEffectResult {
  const { width, height, color, alpha, blend, alphaErosionRadius, mask, texture, textHeight } =
    params;

  // Create working mask canvas (will be used for erosion)
  const { canvas: maskCanvas, ctx: maskCtx } = createCanvasWithContext(width, height);
  maskCtx.drawImage(mask, 0, 0);

  // Step 1: Create shrunk mask using alpha erosion
  const { canvas: shrunkMask, ctx: shrunkMaskCtx } = createCanvasWithContext(width, height);
  if (alphaErosionRadius > 0) {
    alphaErode(alphaErosionRadius, maskCanvas, shrunkMask);
  } else {
    shrunkMaskCtx.drawImage(maskCanvas, 0, 0);
  }

  // Create the draw canvas for the foil content
  const { canvas: drawCanvas, ctx: drawCtx } = createCanvasWithContext(width, height);

  // Step 2: Tile texture (if provided)
  if (texture) {
    const tiled = tile(texture, width, height);
    if (tiled) {
      drawCtx.drawImage(tiled, 0, 0);
    }
  }

  // Step 3: Apply color with blend mode
  drawCtx.fillStyle = color;
  drawCtx.globalAlpha = alpha;
  drawCtx.globalCompositeOperation = blendModeToCompositeOp(blend);
  drawCtx.fillRect(0, 0, width, height);

  // Step 4: Apply shrunk mask
  drawCtx.globalAlpha = 1.0;
  drawCtx.globalCompositeOperation = 'destination-in';
  drawCtx.drawImage(shrunkMask, 0, 0);

  // If text is too small, skip embossing and shadow effects
  if (textHeight <= EMBOSS_HEIGHT_THRESHOLD) {
    drawCtx.globalCompositeOperation = 'source-over';
    return { canvas: drawCanvas, ctx: drawCtx };
  }

  // Step 5: Create dual emboss for highlights
  const { highlight, shadow } = createFoilEmboss(maskCanvas, width, height);

  // Step 6: Create final canvas with shadow and emboss
  // Add extra width for shadow offset
  const finalWidth = width + 2;
  const { canvas: finalCanvas, ctx: finalCtx } = createCanvasWithContext(finalWidth, height);

  // Apply emboss highlights with blur (multiply blend for shadows)
  finalCtx.globalCompositeOperation = 'multiply';
  finalCtx.filter = `blur(${String(EMBOSS_BLUR_AMOUNT)}px)`;
  finalCtx.globalAlpha = 0.1;
  finalCtx.drawImage(highlight.canvas, 0, 0);

  // Apply emboss shadow with lighter blend
  finalCtx.globalAlpha = 0.1;
  finalCtx.globalCompositeOperation = 'lighter';
  finalCtx.drawImage(shadow.canvas, 0, 0);
  finalCtx.filter = 'none';

  // Apply mask shadow (blurred mask for drop shadow effect)
  finalCtx.globalCompositeOperation = 'multiply';
  finalCtx.globalAlpha = 0.2;
  finalCtx.filter = `blur(${String(SHADOW_BLUR_AMOUNT)}px)`;
  finalCtx.drawImage(maskCanvas, 1, 0, width, height);
  finalCtx.filter = 'none';

  // Step 7: Draw the foil text on top
  finalCtx.globalAlpha = 1;
  finalCtx.globalCompositeOperation = 'source-over';
  finalCtx.drawImage(drawCanvas, 1, 0);

  // Reset context state
  finalCtx.globalCompositeOperation = 'source-over';

  return { canvas: finalCanvas, ctx: finalCtx };
}

/**
 * Process a text layer with foil effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the foil effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param textHeight - Height of the text (for emboss/shadow threshold)
 * @param texture - Optional texture bitmap for foil pattern
 * @returns Result canvas or null on failure
 */
export function processFoilEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);
  const { alphaErosionRadius } = extractFoilParams(layer.maskData);

  // Build params, only including optional fields if defined
  const params: FoilEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    blend: layer.blend,
    alphaErosionRadius,
    mask,
    textHeight,
  };

  if (texture !== undefined) {
    params.texture = texture;
  }

  const result = applyFoilEffect(params);

  return result.canvas;
}

/**
 * Get the foil effect parameters for debugging/preview.
 *
 * @param alphaErosionRadius - Erosion radius
 * @returns Object with effect parameters
 */
export function getFoilEffectInfo(alphaErosionRadius: number): {
  erosionRadius: number;
  embossThreshold: number;
  shadowBlur: number;
  embossBlur: number;
} {
  return {
    erosionRadius: alphaErosionRadius,
    embossThreshold: EMBOSS_HEIGHT_THRESHOLD,
    shadowBlur: SHADOW_BLUR_AMOUNT,
    embossBlur: EMBOSS_BLUR_AMOUNT,
  };
}
