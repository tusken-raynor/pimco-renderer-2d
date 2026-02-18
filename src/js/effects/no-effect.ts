/**
 * No-Effect Pipeline
 *
 * The simplest effect pipeline for text layers with no special effects.
 * Pipeline:
 * 1. Tile texture (if provided)
 * 2. Color multiply
 * 3. Apply mask (destination-in composite)
 *
 * This effect is used when mask.effect is undefined/null or not recognized.
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
 * Apply the no-effect pipeline to create a styled text layer.
 *
 * Pipeline:
 * 1. Create a canvas at specified dimensions
 * 2. Tile the texture (if provided), or fill with white
 * 3. Apply color with blend mode and alpha
 * 4. Apply mask using destination-in composite
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyNoEffect(params: NoEffectParams): NoEffectResult {
  const { width, height, color, alpha, blend, texture, mask } = params;

  // Create the draw canvas
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Step 1: Tile texture (if provided)
  if (texture) {
    const tiled = tile(texture, width, height);
    if (tiled) {
      ctx.drawImage(tiled, 0, 0);
    }
  }

  // Step 2: Apply color with blend mode and alpha
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blend === 'normal' ? 'multiply' : blendModeToCompositeOp(blend);
  ctx.fillRect(0, 0, width, height);

  // Step 3: Apply mask (destination-in composite)
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  // Reset context state
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
 * Apply color fill to an existing canvas with mask.
 * This is a simpler version when no texture is needed.
 *
 * @param ctx - Canvas context with existing content
 * @param color - Fill color
 * @param alpha - Fill alpha (0-1)
 * @param blend - Blend mode
 * @param mask - Mask to apply
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

  // Apply color with blend
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = blend === 'normal' ? 'multiply' : blendModeToCompositeOp(blend);
  ctx.fillRect(0, 0, width, height);

  // Apply mask
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);

  // Reset
  ctx.globalCompositeOperation = 'source-over';
}
