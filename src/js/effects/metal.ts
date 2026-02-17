/**
 * Metal Effect Pipeline
 *
 * Creates a metallic/brushed metal appearance for text layers.
 * Pipeline:
 * 1. Tile texture pattern (brushed metal texture)
 * 2. Color multiply (tints the metal)
 * 3. Apply dual emboss (if text is large enough)
 * 4. Apply mask (destination-in composite)
 *
 * The metal effect uses a custom emboss matrix for a more pronounced
 * metallic bevel appearance, different from embroidery.
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { emboss2D, invert, whiteToAlpha, blackToAlpha, tile } from './index';
import { extractDefaultColorCode } from './no-effect';

/**
 * Minimum text height threshold for applying embossing effects.
 * Text smaller than this is rendered without emboss highlights.
 */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Custom emboss matrix for metal effect.
 * Creates a more pronounced 3D bevel look.
 */
const METAL_EMBOSS_MATRIX: number[][] = [
  [-1, -1, -1],
  [-1, -1, 1],
  [1, 1, 1],
];

/**
 * Parameters for the metal effect pipeline.
 */
export interface MetalEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Metal tint color (CSS color string) */
  color: string;
  /** Layer alpha (0-1) */
  alpha: number;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
  /** Texture image for brushed metal pattern */
  texture?: ImageBitmap;
  /** Text height in pixels (for emboss threshold) */
  textHeight: number;
}

/**
 * Result of the metal effect pipeline.
 */
export interface MetalEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Dual emboss result containing both highlight and shadow canvases.
 */
export interface DualEmbossResult {
  /** Highlight emboss (custom metal matrix, creates sharp highlight) */
  highlight: { canvas: AnyCanvas; ctx: Canvas2DContext };
  /** Shadow emboss (inverted matrix, creates shadow) */
  shadow: { canvas: AnyCanvas; ctx: Canvas2DContext };
}

/**
 * Create dual emboss canvases for metal effect.
 * Uses a custom metal matrix and inverted matrix for a sharp metallic bevel.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Dual emboss result with highlight and shadow canvases
 */
export function createMetalEmboss(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number
): DualEmbossResult {
  // Create highlight emboss canvas (custom metal matrix)
  const { canvas: highlightCanvas, ctx: highlightCtx } = createCanvasWithContext(width, height);
  highlightCtx.fillStyle = '#fff';
  highlightCtx.fillRect(0, 0, width, height);
  highlightCtx.drawImage(mask, 0, 0);

  // Create shadow emboss canvas (copy from highlight before processing)
  const { canvas: shadowCanvas, ctx: shadowCtx } = createCanvasWithContext(width, height);
  shadowCtx.drawImage(highlightCanvas, 0, 0);

  // Process highlight: custom metal emboss matrix
  emboss2D(highlightCtx, width, height, METAL_EMBOSS_MATRIX);
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
 * Apply the metal effect pipeline.
 *
 * Pipeline:
 * 1. Tile texture pattern (brushed metal)
 * 2. Apply color with multiply blend
 * 3. Apply dual emboss highlights (if text is large enough)
 * 4. Apply mask using destination-in
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyMetalEffect(params: MetalEffectParams): MetalEffectResult {
  const { width, height, color, alpha, mask, texture, textHeight } = params;

  // Create the draw canvas
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Step 1: Tile texture (if provided)
  if (texture) {
    const tiled = tile(texture, width, height);
    if (tiled) {
      ctx.drawImage(tiled, 0, 0);
    }
  }

  // Step 2: Apply color with multiply blend
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillRect(0, 0, width, height);

  // Step 3: Apply emboss if text is large enough
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    const { highlight, shadow } = createMetalEmboss(mask, width, height);

    // Apply highlight emboss (pronounced for metallic look)
    ctx.globalAlpha = 0.7;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(highlight.canvas, 0, 0);

    // Apply shadow emboss with lighter blend
    ctx.globalAlpha = 0.3;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(shadow.canvas, 0, 0);
  }

  // Step 4: Apply mask
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  // Reset context state
  ctx.globalCompositeOperation = 'source-over';

  return { canvas, ctx };
}

/**
 * Process a text layer with metal effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the metal effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param textHeight - Height of the text (for emboss threshold)
 * @param texture - Optional texture bitmap for brushed metal pattern
 * @returns Result canvas or null on failure
 */
export function processMetalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);

  // Build params, only including optional fields if defined
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

  const result = applyMetalEffect(params);

  return result.canvas;
}

/**
 * Get the metal emboss matrix used for the effect.
 * Useful for debugging or preview purposes.
 *
 * @returns The 3x3 metal emboss matrix
 */
export function getMetalEmbossMatrix(): number[][] {
  return METAL_EMBOSS_MATRIX.map((row) => [...row]);
}
