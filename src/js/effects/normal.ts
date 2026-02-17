/**
 * Normal Effect Pipeline
 *
 * Creates a normal-mapped 3D lighting effect for text layers.
 * Uses Sobel operator to generate normals from a height map for directional lighting.
 *
 * Pipeline:
 * 1. Apply roundness blur (optional, creates smoother height map)
 * 2. Tile texture (if provided)
 * 3. Apply color multiply
 * 4. Apply mask to create colored shape
 * 5. Apply color scale for intensity
 * 6. Generate normal map
 * 7. Apply final mask
 *
 * Effect parameters (from mask.effectparams):
 * - NormalRoundness: Blur radius for smoother height map (default: 0)
 * - NormalIntensity: Strength of the normal mapping effect (default: 1.0)
 * - NormalLightDir: Light direction ('N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW') (default: 'N')
 */

import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { BlendMode } from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext } from '../utils/canvas';
import { colorScale, normalMap, tile } from './index';
import { extractDefaultColorCode, blendModeToCompositeOp } from './no-effect';

/**
 * Default base resolution for scaling effect parameters.
 * Effect parameters in the data are designed for a 2048px canvas.
 */
const BASE_RESOLUTION = 2048;

/**
 * Valid light directions for normal map generation.
 */
export type NormalLightDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/**
 * Parameters for the normal effect pipeline.
 */
export interface NormalEffectParams {
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
  /** Roundness blur radius (in base resolution pixels) - creates smoother height map */
  roundness: number;
  /** Normal intensity - strength of the normal mapping effect */
  intensity: number;
  /** Light direction for normal map */
  lightDirection: NormalLightDirection;
}

/**
 * Result of the normal effect pipeline.
 */
export interface NormalEffectResult {
  /** Result canvas */
  canvas: AnyCanvas;
  /** Result context */
  ctx: Canvas2DContext;
}

/**
 * Extract normal effect parameters from mask data.
 *
 * @param maskData - Compiled mask substitution data
 * @returns Normal effect parameters
 */
export function extractNormalParams(maskData: PimcoMaskSubstitutionCompiled): {
  roundness: number;
  intensity: number;
  lightDirection: NormalLightDirection;
} {
  const params = maskData.effectparams;

  let roundness = 0;
  let intensity = 1.0;
  let lightDirection: NormalLightDirection = 'N';

  if (params) {
    if ('NormalRoundness' in params && typeof params.NormalRoundness === 'number') {
      roundness = params.NormalRoundness;
    }
    if ('NormalIntensity' in params && typeof params.NormalIntensity === 'number') {
      intensity = params.NormalIntensity;
    }
    if ('NormalLightDir' in params && typeof params.NormalLightDir === 'string') {
      const dir = params.NormalLightDir.toUpperCase();
      const validDirs: NormalLightDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      if (validDirs.includes(dir as NormalLightDirection)) {
        lightDirection = dir as NormalLightDirection;
      }
    }
  }

  return { roundness, intensity, lightDirection };
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
 * Apply roundness blur to a mask to create smoother height transitions.
 * Uses blur + contrast to create rounded edges on the shape.
 *
 * @param source - Source mask canvas/bitmap
 * @param roundness - Scaled roundness blur radius
 * @returns New canvas with roundness applied, including offset information
 */
export function applyRoundnessBlur(
  source: ImageBitmap | AnyCanvas,
  roundness: number
): { canvas: AnyCanvas; ctx: Canvas2DContext; offsetX: number; offsetY: number } {
  const sourceWidth = source.width;
  const sourceHeight = source.height;

  if (roundness <= 0) {
    // No roundness, just copy the source
    const { canvas, ctx } = createCanvasWithContext(sourceWidth, sourceHeight);
    ctx.drawImage(source, 0, 0);
    return { canvas, ctx, offsetX: 0, offsetY: 0 };
  }

  // Create a larger canvas to accommodate blur expansion
  // Use 4x roundness margin to prevent edge cutoff
  const margin = roundness * 2;
  const expandedWidth = sourceWidth + margin * 2;
  const expandedHeight = sourceHeight + margin * 2;

  const { canvas: roundnessCanvas, ctx: roundnessCtx } = createCanvasWithContext(
    expandedWidth,
    expandedHeight
  );

  // Apply blur + contrast filter for rounded edges
  // Higher roundness needs proportionally higher contrast
  const contrastPercent = (10 * roundness + 100) / 100;
  roundnessCtx.filter = `blur(${String(roundness)}px) contrast(${String(contrastPercent)})`;
  roundnessCtx.drawImage(source, margin, margin);

  // Reset filter
  roundnessCtx.filter = 'none';

  return {
    canvas: roundnessCanvas,
    ctx: roundnessCtx,
    offsetX: margin,
    offsetY: margin,
  };
}

/**
 * Create the text content canvas with texture and color.
 * This creates the height map that will be converted to a normal map.
 *
 * @param mask - Source mask
 * @param width - Canvas width
 * @param height - Canvas height
 * @param color - Fill color
 * @param alpha - Color alpha
 * @param blend - Blend mode
 * @param texture - Optional texture
 * @returns Canvas with colored text content
 */
export function createColoredTextContent(
  mask: ImageBitmap | AnyCanvas,
  width: number,
  height: number,
  color: string,
  alpha: number,
  blend: BlendMode,
  texture?: ImageBitmap
): { canvas: AnyCanvas; ctx: Canvas2DContext } {
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Step 1: Tile texture (if provided)
  if (texture) {
    const tiled = tile(texture, width, height);
    if (tiled) {
      ctx.drawImage(tiled, 0, 0);
      ctx.globalCompositeOperation = blend === 'normal' ? 'multiply' : blendModeToCompositeOp(blend);
    }
  } else {
    // If no texture, just use source-over
    ctx.globalCompositeOperation = 'source-over';
  }

  // Step 2: Apply color
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
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
 * Create the normal map content on a black background.
 * The black background is important for proper normal map generation.
 *
 * @param textContent - Colored text content canvas
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Canvas ready for normal map generation
 */
export function createNormalMapInput(
  textContent: AnyCanvas,
  width: number,
  height: number
): { canvas: AnyCanvas; ctx: Canvas2DContext } {
  const { canvas, ctx } = createCanvasWithContext(width, height);

  // Fill with black background (important for normal map edge handling)
  ctx.fillStyle = '#000';
  ctx.globalAlpha = 1.0;
  ctx.fillRect(0, 0, width, height);

  // Draw the colored text content
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(textContent, 0, 0);

  return { canvas, ctx };
}

/**
 * Apply the normal effect pipeline.
 *
 * Pipeline:
 * 1. Apply roundness blur to mask (creates smoother height map edges)
 * 2. Create colored text content with texture and color
 * 3. Create normal map input on black background
 * 4. Apply color scale for intensity adjustment
 * 5. Generate normal map
 * 6. Apply final mask
 *
 * @param params - Effect parameters
 * @returns Result with canvas and context
 */
export function applyNormalEffect(params: NormalEffectParams): NormalEffectResult {
  const { width, height, color, alpha, blend, texture, mask, roundness, intensity, lightDirection } =
    params;

  // Scale roundness to canvas resolution
  // The legacy code uses: 6 * targetWidth / 2048 as the scale factor for roundness
  const roundnessScale = (6 * width) / BASE_RESOLUTION;
  const scaledRoundness = roundness * roundnessScale;

  // Step 1: Apply roundness blur to mask
  const roundnessResult = applyRoundnessBlur(mask, scaledRoundness);

  // Step 2: Create colored text content (this will be the height map)
  const textContent = createColoredTextContent(
    roundnessResult.canvas,
    roundnessResult.canvas.width,
    roundnessResult.canvas.height,
    color,
    alpha,
    blend,
    texture
  );

  // Step 3: Create normal map input on black background
  const normalInput = createNormalMapInput(
    textContent.canvas,
    roundnessResult.canvas.width,
    roundnessResult.canvas.height
  );

  // Step 4: Apply color scale for intensity
  // Create a canvas to receive the color-scaled output
  const { canvas: scaledCanvas, ctx: scaledCtx } = createCanvasWithContext(
    normalInput.canvas.width,
    normalInput.canvas.height
  );
  colorScale(normalInput.canvas, scaledCtx, intensity);

  // Step 5: Generate normal map
  const { canvas: normalCanvas, ctx: normalCtx } = createCanvasWithContext(
    scaledCanvas.width,
    scaledCanvas.height
  );
  normalMap(scaledCanvas, normalCtx, lightDirection, 1.0);

  // Step 6: Create output canvas at original dimensions
  const { canvas: outputCanvas, ctx: outputCtx } = createCanvasWithContext(width, height);

  // Draw the normal map, accounting for roundness offset
  outputCtx.globalCompositeOperation = 'source-over';
  outputCtx.drawImage(
    normalCanvas,
    -roundnessResult.offsetX,
    -roundnessResult.offsetY
  );

  // Apply original mask to clean up edges
  outputCtx.globalCompositeOperation = 'destination-in';
  outputCtx.drawImage(
    roundnessResult.canvas,
    -roundnessResult.offsetX,
    -roundnessResult.offsetY
  );

  // Reset context state
  outputCtx.globalCompositeOperation = 'source-over';

  return { canvas: outputCanvas, ctx: outputCtx };
}

/**
 * Process a text layer with normal effect pipeline.
 *
 * This is a convenience function that extracts parameters from a
 * TextLayerDescriptor and applies the normal effect pipeline.
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param mask - Rasterized text mask
 * @param texture - Optional texture bitmap
 * @returns Result canvas or null on failure
 */
export function processNormalEffectLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  mask: ImageBitmap | AnyCanvas,
  texture?: ImageBitmap
): AnyCanvas | null {
  const color = extractDefaultColorCode(layer.color);
  const { roundness, intensity, lightDirection } = extractNormalParams(layer.maskData);

  // Build params, only including texture if defined
  const params: NormalEffectParams = {
    width,
    height,
    color,
    alpha: layer.alpha,
    blend: layer.blend,
    mask,
    roundness,
    intensity,
    lightDirection,
  };

  if (texture !== undefined) {
    params.texture = texture;
  }

  const result = applyNormalEffect(params);

  return result.canvas;
}

/**
 * Get normal effect info for debugging/preview purposes.
 *
 * @param roundness - Roundness parameter
 * @param intensity - Intensity parameter
 * @param lightDirection - Light direction
 * @returns Object with effect parameters
 */
export function getNormalEffectInfo(
  roundness: number,
  intensity: number,
  lightDirection: NormalLightDirection
): {
  roundness: number;
  intensity: number;
  lightDirection: NormalLightDirection;
  defaultRoundness: number;
  defaultIntensity: number;
  defaultLightDirection: NormalLightDirection;
} {
  return {
    roundness,
    intensity,
    lightDirection,
    defaultRoundness: 0,
    defaultIntensity: 1.0,
    defaultLightDirection: 'N',
  };
}

/**
 * Get valid light directions for the normal effect.
 *
 * @returns Array of valid light direction strings
 */
export function getValidLightDirections(): readonly NormalLightDirection[] {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
}
