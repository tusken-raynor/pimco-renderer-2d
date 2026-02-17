/**
 * Shadow Effect Pipeline
 *
 * Creates a shadow/drop-shadow effect for text layers.
 * Pipeline:
 * 1. Spread - Expand the mask using blur + brightness/contrast
 * 2. White-to-alpha - Convert white background to transparency
 * 3. Color fill - Fill with shadow color (source-in composite)
 * 4. Blur - Apply Gaussian blur for soft shadow edges
 * 5. Multi-pass alpha - Stack shadow with alpha for intensity control
 *
 * Effect parameters (from mask.effectparams):
 * - ShadowSpread: Spread radius in pixels (scaled to canvas size)
 * - ShadowBlur: Blur radius in pixels (scaled to canvas size)
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext, getContext2D } from '../utils/canvas';
import { whiteToAlpha } from './index';
import { extractDefaultColorCode } from './no-effect';

/**
 * Default base resolution for scaling effect parameters.
 * Effect parameters in the data are designed for a 2048px canvas.
 */
const BASE_RESOLUTION = 2048;

/**
 * Parameters for the shadow effect pipeline.
 */
export interface ShadowEffectParams {
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Shadow color (CSS color string) */
  color: string;
  /** Shadow opacity/intensity (can be > 1 for multiple passes) */
  alpha: number;
  /** Spread radius (in base resolution pixels) */
  spread: number;
  /** Blur radius (in base resolution pixels) */
  blur: number;
  /** Mask image (defines text shape) */
  mask: ImageBitmap | AnyCanvas;
}

/**
 * Result of the shadow effect pipeline.
 */
export interface ShadowEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Extract shadow effect parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Shadow parameters (spread and blur)
 */
export function extractShadowParams(
  maskData: PimcoMaskSubstitutionCompiled
): { spread: number; blur: number } {
  const params = maskData.effectparams;

  let spread = 0;
  let blur = 0;

  if (params) {
    if ('ShadowSpread' in params && typeof params.ShadowSpread === 'number') {
      spread = Math.round(params.ShadowSpread);
    }
    if ('ShadowBlur' in params && typeof params.ShadowBlur === 'number') {
      blur = params.ShadowBlur;
    }
  }

  return { spread, blur };
}

/**
 * Scale a parameter value based on canvas width.
 * Effect parameters are designed for BASE_RESOLUTION and need to be scaled.
 *
 * @param value - Parameter value at base resolution
 * @param targetWidth - Target canvas width
 * @returns Scaled value
 */
export function scaleToResolution(value: number, targetWidth: number): number {
  return (value * targetWidth) / BASE_RESOLUTION;
}

/**
 * Apply spread effect to a mask.
 * Uses blur + brightness/contrast to expand the shape.
 *
 * @param ctx - Source context with mask content
 * @param spread - Spread radius in pixels
 * @returns New canvas with spread applied, or original if no spread
 */
export function applySpread(
  ctx: Canvas2DContext,
  spread: number
): { canvas: AnyCanvas; ctx: Canvas2DContext; offsetX: number; offsetY: number } {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  if (spread <= 0) {
    return { canvas: ctx.canvas, ctx, offsetX: 0, offsetY: 0 };
  }

  // Create a larger canvas to accommodate spread expansion
  const expandedWidth = width + 2 * spread;
  const expandedHeight = height + 2 * spread;

  const { canvas: spreadCanvas, ctx: spreadCtx } = createCanvasWithContext(
    expandedWidth,
    expandedHeight
  );

  // Apply spread using blur + brightness/contrast filter
  // This expands the shape outward
  spreadCtx.filter = `blur(${String(spread)}px) brightness(58%) contrast(${String(700 * spread)}%)`;
  spreadCtx.drawImage(ctx.canvas, spread, spread);

  // Reset filter
  spreadCtx.filter = 'none';

  return { canvas: spreadCanvas, ctx: spreadCtx, offsetX: spread, offsetY: spread };
}

/**
 * Apply color fill using source-in composite.
 * This fills only the opaque pixels with the specified color.
 *
 * @param ctx - Canvas context with alpha mask
 * @param color - Fill color
 */
export function applyColorFill(ctx: Canvas2DContext, color: string): void {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  // Draw the current content
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  // Reset
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Apply blur effect to a canvas.
 *
 * @param source - Source canvas
 * @param blur - Blur radius in pixels
 * @returns New canvas with blur applied
 */
export function applyBlur(
  source: AnyCanvas,
  blur: number
): { canvas: AnyCanvas; ctx: Canvas2DContext; offsetX: number; offsetY: number } {
  if (blur <= 0) {
    const ctx = getContext2D(source);
    if (!ctx) {
      throw new Error('Failed to get context from source canvas');
    }
    return { canvas: source, ctx, offsetX: 0, offsetY: 0 };
  }

  // Create a larger canvas to accommodate blur expansion
  const expandedWidth = source.width + 2 * blur;
  const expandedHeight = source.height + 2 * blur;

  const { canvas: blurCanvas, ctx: blurCtx } = createCanvasWithContext(
    expandedWidth,
    expandedHeight
  );

  // Apply blur filter
  blurCtx.filter = `blur(${String(blur)}px)`;
  blurCtx.drawImage(source, blur, blur);

  // Reset filter
  blurCtx.filter = 'none';

  return { canvas: blurCanvas, ctx: blurCtx, offsetX: blur, offsetY: blur };
}

/**
 * Apply multi-pass alpha drawing for shadow intensity.
 * When alpha > 1, the shadow is drawn multiple times to increase intensity.
 *
 * @param targetCtx - Target context to draw on
 * @param source - Source shadow canvas
 * @param alpha - Total alpha (can be > 1 for multiple passes)
 * @param offsetX - X offset for positioning
 * @param offsetY - Y offset for positioning
 */
export function applyMultiPassAlpha(
  targetCtx: Canvas2DContext,
  source: AnyCanvas,
  alpha: number,
  offsetX = 0,
  offsetY = 0
): void {
  targetCtx.globalCompositeOperation = 'source-over';

  let remainingAlpha = alpha;
  while (remainingAlpha > 0) {
    targetCtx.globalAlpha = Math.min(remainingAlpha, 1.0);
    targetCtx.drawImage(source, -offsetX, -offsetY);
    remainingAlpha -= 1.0;
  }

  // Reset
  targetCtx.globalAlpha = 1.0;
}

/**
 * Apply the shadow effect pipeline.
 *
 * Pipeline:
 * 1. Create mask canvas with white background
 * 2. Draw mask content
 * 3. Apply spread (if > 0)
 * 4. Convert white to alpha
 * 5. Apply color fill
 * 6. Apply blur (if > 0)
 * 7. Draw with multi-pass alpha
 *
 * @param params - Shadow effect parameters
 * @returns Result with canvas and context
 */
export function applyShadowEffect(params: ShadowEffectParams): ShadowEffectResult {
  const { width, height, color, alpha, spread, blur, mask } = params;

  // Scale parameters to canvas resolution
  const scaledSpread = scaleToResolution(spread, width);
  const scaledBlur = scaleToResolution(blur, width);

  // Step 1: Create initial mask canvas with white background
  const { ctx: maskCtx } = createCanvasWithContext(width, height);
  maskCtx.fillStyle = '#fff';
  maskCtx.fillRect(0, 0, width, height);
  maskCtx.drawImage(mask, 0, 0);

  // Step 2: Apply spread (expands the shape)
  const spreadResult = applySpread(maskCtx, scaledSpread);
  let totalOffsetX = spreadResult.offsetX;
  let totalOffsetY = spreadResult.offsetY;

  // Step 3: Convert white to alpha
  whiteToAlpha(spreadResult.ctx, spreadResult.canvas.width, spreadResult.canvas.height);

  // Step 4: Create colored version with source-in
  const { canvas: coloredCanvas, ctx: coloredCtx } = createCanvasWithContext(
    spreadResult.canvas.width,
    spreadResult.canvas.height
  );
  coloredCtx.drawImage(spreadResult.canvas, 0, 0);
  applyColorFill(coloredCtx, color);

  // Step 5: Apply blur
  const blurResult = applyBlur(coloredCanvas, scaledBlur);
  // Note: totalOffsetX and totalOffsetY track cumulative offsets for future use
  // when positioning the shadow relative to the original content
  void (totalOffsetX += blurResult.offsetX);
  void (totalOffsetY += blurResult.offsetY);

  // Step 6: Create final output canvas and draw with multi-pass alpha
  const { canvas: outputCanvas, ctx: outputCtx } = createCanvasWithContext(
    blurResult.canvas.width,
    blurResult.canvas.height
  );

  applyMultiPassAlpha(outputCtx, blurResult.canvas, alpha);

  return {
    canvas: outputCanvas,
    ctx: outputCtx,
  };
}

/**
 * Process a text layer with shadow effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the shadow effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @returns Result canvas or null on failure
 */
export function processShadowEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);
  const maskData = layer.maskData;

  // Extract shadow-specific parameters
  const { spread, blur } = extractShadowParams(maskData);

  const result = applyShadowEffect({
    width,
    height,
    color,
    alpha: layer.alpha,
    spread,
    blur,
    mask,
  });

  return result.canvas;
}

/**
 * Create a standalone shadow for a given mask.
 * This can be used to add shadows to other effects.
 *
 * @param mask - Source mask
 * @param color - Shadow color
 * @param spread - Spread radius
 * @param blur - Blur radius
 * @param alpha - Shadow alpha
 * @returns Shadow canvas
 */
export function createShadow(
  mask: ImageBitmap | AnyCanvas,
  color: string,
  spread: number,
  blur: number,
  alpha: number
): AnyCanvas {
  // For standalone shadow creation, we use the mask dimensions
  const width = 'width' in mask ? mask.width : 0;
  const height = 'height' in mask ? mask.height : 0;

  const result = applyShadowEffect({
    width,
    height,
    color,
    alpha,
    spread,
    blur,
    mask,
  });

  return result.canvas;
}
