/**
 * Painted Effect Pipeline
 *
 * Creates a painted/printed appearance for text layers with a slight inset.
 * Pipeline:
 * 1. Create expanded edge mask (for emboss effect around edges)
 * 2. Apply dual emboss on expanded mask (if text is large enough)
 * 3. Create inset/shrunk mask using blur + brightness/contrast
 * 4. Convert mask to alpha
 * 5. Tile texture pattern
 * 6. Apply color blend
 * 7. Apply inset mask (destination-in composite)
 * 8. Composite emboss highlights with main content
 *
 * Effect parameters (from mask.effectparams):
 * - PaintedInsetShrink: Amount to shrink the inset mask (default: 1.0)
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled, BlendMode } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { emboss2D, invert, whiteToAlpha, blackToAlpha, tile } from './index';
import { extractDefaultColorCode, blendModeToCompositeOp } from './no-effect';

/**
 * Minimum text height threshold for applying embossing effects.
 * Text smaller than this is rendered without emboss highlights.
 */
const EMBOSS_HEIGHT_THRESHOLD = 43.5;

/**
 * Default painted inset shrink amount in pixels.
 */
const DEFAULT_INSET_SHRINK = 1.0;

/**
 * Parameters for the painted effect pipeline.
 */
export interface PaintedEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Paint color (CSS color string) */
  color: string;
  /** Layer alpha (0-1) */
  alpha: number;
  /** Blend mode for color application */
  blend: BlendMode;
  /** Inset shrink amount in pixels (default: 1.0) */
  paintedInsetShrink: number;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
  /** Texture image for paint pattern */
  texture?: ImageBitmap;
  /** Text height in pixels (for emboss threshold) */
  textHeight: number;
}

/**
 * Result of the painted effect pipeline.
 */
export interface PaintedEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Dual emboss result containing both highlight and shadow canvases.
 */
export interface DualEmbossResult {
  /** Highlight emboss (inverted matrix, creates shadow on edges) */
  highlight: { canvas: AnyCanvas; ctx: Canvas2DContext };
  /** Shadow emboss (standard matrix, creates raised edge) */
  shadow: { canvas: AnyCanvas; ctx: Canvas2DContext };
}

/**
 * Extract painted effect parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Painted parameters (inset shrink amount)
 */
export function extractPaintedParams(maskData: PimcoMaskSubstitutionCompiled): {
  paintedInsetShrink: number;
} {
  const params = maskData.effectparams;

  let paintedInsetShrink = DEFAULT_INSET_SHRINK;

  if (params && 'PaintedInsetShrink' in params && typeof params.PaintedInsetShrink === 'number') {
    paintedInsetShrink = params.PaintedInsetShrink;
  }

  return { paintedInsetShrink };
}

/**
 * Create an expanded edge mask for the painted emboss effect.
 * Uses blur + brightness/contrast to expand the mask edges.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Expanded mask canvas
 */
export function createExpandedEdgeMask(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number
): { canvas: AnyCanvas; ctx: Canvas2DContext } {
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Fill with white background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(mask, 0, 0);

  // Expand using blur + brightness/contrast filter
  // This creates a slight expansion of the edges
  ctx.filter = 'blur(1px) brightness(50%) contrast(500%) brightness(200%) contrast(200%)';
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';

  return { canvas, ctx };
}

/**
 * Create dual emboss canvases for painted effect.
 * Uses inverted and standard emboss matrices for edge beveling.
 *
 * @param expandedMask - Expanded edge mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Dual emboss result with highlight and shadow canvases
 */
export function createPaintedEmboss(
  expandedMask: AnyCanvas,
  width: number,
  height: number
): DualEmbossResult {
  // Create highlight emboss canvas (inverted for shadow on edges)
  const { canvas: highlightCanvas, ctx: highlightCtx } = createCanvasWithContext(width, height);
  highlightCtx.drawImage(expandedMask, 0, 0);

  // Create shadow emboss canvas (standard for raised edge)
  const { canvas: shadowCanvas, ctx: shadowCtx } = createCanvasWithContext(width, height);
  shadowCtx.drawImage(expandedMask, 0, 0);

  // Process highlight: inverted emboss matrix
  emboss2D(highlightCtx, width, height, true);
  // Process shadow: standard emboss matrix
  emboss2D(shadowCtx, width, height, false);

  // Clean up edge artifacts
  highlightCtx.fillStyle = '#000';
  shadowCtx.fillStyle = '#000';
  highlightCtx.fillRect(0, height - 2, width, 2); // Bottom edge
  shadowCtx.fillRect(0, 0, width, 2); // Top edge

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
 * Create an inset/shrunk mask for the painted effect.
 * Uses blur + brightness/contrast to shrink the mask inward.
 *
 * @param mask - Source mask canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @param shrinkAmount - Amount to shrink in pixels
 * @returns Inset mask canvas with alpha channel
 */
export function createInsetMask(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number,
  shrinkAmount: number
): { canvas: AnyCanvas; ctx: Canvas2DContext } {
  // Create a canvas with white background + mask
  const { canvas: shrinkSource, ctx: shrinkSourceCtx } = createCanvasWithContext(width, height);
  shrinkSourceCtx.fillStyle = '#fff';
  shrinkSourceCtx.fillRect(0, 0, width, height);
  shrinkSourceCtx.drawImage(mask, 0, 0);

  // Create the inset mask canvas
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Apply shrink using blur + brightness/contrast
  ctx.filter = `blur(${String(shrinkAmount)}px) brightness(200%) contrast(200%)`;
  ctx.drawImage(shrinkSource, 0, 0);
  ctx.filter = 'none';

  // Convert white to alpha
  whiteToAlpha(ctx, width, height);

  return { canvas, ctx };
}

/**
 * Apply the painted effect pipeline.
 *
 * Pipeline:
 * 1. Create expanded edge mask (for emboss effect)
 * 2. Apply dual emboss on expanded mask (if text is large enough)
 * 3. Create inset/shrunk mask
 * 4. Tile texture pattern
 * 5. Apply color with blend mode
 * 6. Apply inset mask using destination-in
 * 7. Composite emboss highlights (if text is large enough)
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyPaintedEffect(params: PaintedEffectParams): PaintedEffectResult {
  const { width, height, color, alpha, blend, paintedInsetShrink, mask, texture, textHeight } =
    params;

  // Create working mask canvas
  const { canvas: maskCanvas, ctx: maskCtx } = createCanvasWithContext(width, height);
  maskCtx.drawImage(mask, 0, 0);

  // Create the draw canvas for the main output
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Step 1-2: Create expanded edge mask and emboss (if text is large enough)
  if (textHeight > EMBOSS_HEIGHT_THRESHOLD) {
    const expandedMask = createExpandedEdgeMask(maskCanvas, width, height);
    const { highlight, shadow } = createPaintedEmboss(expandedMask.canvas, width, height);

    // Apply emboss highlights to draw canvas
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.1;
    ctx.drawImage(highlight.canvas, 0, 0);

    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(shadow.canvas, 0, 0);
  }

  // Step 3: Create inset mask
  const insetMask = createInsetMask(maskCanvas, width, height, paintedInsetShrink);

  // Create a separate canvas for the paint content
  const { canvas: paintCanvas, ctx: paintCtx } = createCanvasWithContext(width, height);

  // Step 4: Tile texture (if provided)
  if (texture) {
    const tiled = tile(texture, width, height);
    if (tiled) {
      paintCtx.drawImage(tiled, 0, 0);
    }
  }

  // Step 5: Apply color with blend mode
  paintCtx.globalCompositeOperation = blendModeToCompositeOp(blend);
  paintCtx.globalAlpha = alpha;
  paintCtx.fillStyle = color;
  paintCtx.fillRect(0, 0, width, height);

  // Step 6: Apply inset mask
  paintCtx.globalCompositeOperation = 'destination-in';
  paintCtx.globalAlpha = 1;
  paintCtx.drawImage(insetMask.canvas, 0, 0);

  // Step 7: Composite paint content onto main canvas
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(paintCanvas, 0, 0);

  // Reset context state
  ctx.globalCompositeOperation = 'source-over';

  return { canvas, ctx };
}

/**
 * Process a text layer with painted effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the painted effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param textHeight - Height of the text (for emboss threshold)
 * @param texture - Optional texture bitmap for paint pattern
 * @returns Result canvas or null on failure
 */
export function processPaintedEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  textHeight: number,
  texture?: ImageBitmap
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);
  const { paintedInsetShrink } = extractPaintedParams(layer.maskData);

  // Build params, only including optional fields if defined
  const params: PaintedEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    blend: layer.blend,
    paintedInsetShrink,
    mask,
    textHeight,
  };

  if (texture !== undefined) {
    params.texture = texture;
  }

  const result = applyPaintedEffect(params);

  return result.canvas;
}

/**
 * Get the painted effect parameters for debugging/preview.
 *
 * @param paintedInsetShrink - Inset shrink amount
 * @returns Object with effect parameters
 */
export function getPaintedEffectInfo(paintedInsetShrink: number): {
  insetShrink: number;
  embossThreshold: number;
  defaultInsetShrink: number;
} {
  return {
    insetShrink: paintedInsetShrink,
    embossThreshold: EMBOSS_HEIGHT_THRESHOLD,
    defaultInsetShrink: DEFAULT_INSET_SHRINK,
  };
}
