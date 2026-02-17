/**
 * Intra-Layer Pipeline for Standard Render Slaves.
 *
 * This module implements the 5-step rendering pipeline for standard layers:
 * 1. Draw base image with placement transforms
 * 2. Apply color/texture with blend mode and alpha
 * 3. Apply highlight 1 (if defined)
 * 4. Apply highlight 2 (if defined)
 * 5. Apply mask (destination-in composite)
 *
 * The pipeline operates on a single layer and produces a fully composited
 * layer result that is ready for inter-layer composition.
 */

import type {
  BlendMode,
  ImagePlacementDefinition,
  ImagePlacementTransform,
  FixedSizeArray,
} from '../types/pimco';
import type { Canvas2DContext, AnyCanvas } from '../utils/canvas';
import { createCanvasWithContext, clearCanvas } from '../utils/canvas';

/**
 * Resolved placement for drawing operations.
 * All values are in pixels.
 */
export interface ResolvedPlacement {
  /** Left position in pixels */
  left: number;
  /** Top position in pixels */
  top: number;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Transform sequence to apply (or null) */
  transform: ImagePlacementTransform<number>[] | FixedSizeArray<number, 6> | null;
}

/**
 * Assets required for rendering a standard layer.
 * All images are provided as ImageBitmap for efficient worker use.
 */
export interface LayerAssets {
  /** Base image for the layer */
  image: ImageBitmap;
  /** Mask image for the layer */
  mask: ImageBitmap;
  /** Optional texture image */
  texture?: ImageBitmap;
  /** Optional highlight 1 image */
  hlimage1?: ImageBitmap;
  /** Optional highlight 2 image */
  hlimage2?: ImageBitmap;
}

/**
 * Configuration for rendering a standard layer.
 */
export interface LayerConfig {
  /** Layer identifier */
  id: string;
  /** Color mode: 'color' uses solid color, 'image' uses texture */
  mode: 'color' | 'image';
  /** Color value (hex string) for color mode */
  color?: string;
  /** Intra-layer opacity (0-1) */
  alpha: number;
  /** Intra-layer blend mode */
  blend: BlendMode;
  /** Highlight 1 opacity */
  hlalpha1?: number;
  /** Highlight 1 blend mode */
  hlblend1?: BlendMode;
  /** Highlight 2 opacity */
  hlalpha2?: number;
  /** Highlight 2 blend mode */
  hlblend2?: BlendMode;
  /** Placement definition for the layer */
  placement?: ImagePlacementDefinition;
}

/**
 * Pipeline execution context.
 * Holds the canvases and contexts used during pipeline execution.
 */
export interface PipelineContext {
  /** Main work canvas/context where the layer is rendered */
  work: { canvas: AnyCanvas; ctx: Canvas2DContext };
  /** Color/fill canvas/context for color mode */
  color: { canvas: AnyCanvas; ctx: Canvas2DContext };
  /** Output canvas width */
  width: number;
  /** Output canvas height */
  height: number;
}

/**
 * Create a pipeline context with the given dimensions.
 *
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @returns Pipeline context with work and color canvases
 */
export function createPipelineContext(width: number, height: number): PipelineContext {
  return {
    work: createCanvasWithContext(width, height),
    color: createCanvasWithContext(width, height),
    width,
    height,
  };
}

/**
 * Derive the resolved placement from the layer configuration.
 * Converts percentage-based placement values to pixel values.
 *
 * Based on the legacy derivePlacement function.
 *
 * @param config - Layer configuration with optional placement
 * @param targetWidth - Target canvas width in pixels
 * @param targetHeight - Target canvas height in pixels
 * @param srcWidth - Source image width in pixels
 * @param srcHeight - Source image height in pixels
 * @returns Resolved placement with pixel values
 */
export function derivePlacement(
  config: LayerConfig,
  targetWidth: number,
  targetHeight: number,
  srcWidth: number,
  srcHeight: number
): ResolvedPlacement {
  const placement: ResolvedPlacement = {
    left: 0,
    top: 0,
    width: targetWidth,
    height: targetHeight,
    transform: null,
  };

  if (!config.placement) {
    return placement;
  }

  const p = config.placement;

  // Calculate position and dimensions from percentages
  placement.left = Math.round((p.left ?? 0) * targetWidth);
  placement.top = Math.round((p.top ?? 0) * targetHeight);
  placement.width = Math.round((p.width ?? 1) * targetWidth);
  placement.height = Math.round((p.height ?? 1) * targetHeight);

  // Handle fit modes
  if (p.fit === 'contain') {
    const targetAspect = placement.width / placement.height;
    const srcAspect = srcWidth / srcHeight;

    if (srcAspect > targetAspect) {
      // Source is wider than target, so fit to width
      const height = Math.round(placement.width / srcAspect);
      const posY = p.position ? p.position[1] : 0.5;

      placement.top = Math.round(placement.top + (placement.height - height) * posY);
      placement.height = height;
    } else {
      // Source is taller than target, so fit to height
      const width = Math.round(placement.height * srcAspect);
      const posX = p.position ? p.position[0] : 0.5;

      placement.left = Math.round(placement.left + (placement.width - width) * posX);
      placement.width = width;
    }
  } else if (p.fit === 'cover') {
    const targetAspect = placement.width / placement.height;
    const srcAspect = srcWidth / srcHeight;

    if (srcAspect < targetAspect) {
      // Source is taller than target, so fit to width
      const height = Math.round(placement.width / srcAspect);
      const posY = p.position ? p.position[1] : 0.5;

      placement.top = Math.round(placement.top + (placement.height - height) * posY);
      placement.height = height;
    } else {
      // Source is wider than target, so fit to height
      const width = Math.round(placement.height * srcAspect);
      const posX = p.position ? p.position[0] : 0.5;

      placement.left = Math.round(placement.left + (placement.width - width) * posX);
      placement.width = width;
    }
  }
  // 'fill' mode: use calculated dimensions as-is (stretching)

  // Handle transforms
  if (p.transform) {
    const isTransformArray = Array.isArray(p.transform) && p.transform.length > 0;

    if (isTransformArray && typeof p.transform[0] === 'object') {
      // Transform sequence - convert units and add center transforms
      const transforms = placementTransformUnits(
        p.transform as ImagePlacementTransform[],
        placement.width,
        placement.height,
        targetWidth,
        targetHeight
      );

      // Add translation to/from center for rotations and skews
      const centerX = placement.width / 2 + placement.left;
      const centerY = placement.height / 2 + placement.top;

      transforms.unshift({ type: 'translate', x: centerX, y: centerY });
      transforms.push({ type: 'translate', x: -centerX, y: -centerY });

      placement.transform = transforms;
    } else if (isTransformArray && typeof p.transform[0] === 'number') {
      // Matrix array [a, b, c, d, e, f]
      placement.transform = p.transform as FixedSizeArray<number, 6>;
    }
  }

  return placement;
}

/**
 * Convert transform units from percentages/strings to pixel values.
 *
 * @param transforms - Array of transforms with potentially string/percentage values
 * @param placementWidth - Placement width in pixels
 * @param placementHeight - Placement height in pixels
 * @param targetWidth - Target canvas width in pixels
 * @param targetHeight - Target canvas height in pixels
 * @returns Transforms with numeric pixel values
 */
export function placementTransformUnits(
  transforms: ImagePlacementTransform[],
  _placementWidth: number,
  _placementHeight: number,
  targetWidth: number,
  targetHeight: number
): ImagePlacementTransform<number>[] {
  return transforms.map((t) => {
    if (t.type === 'rotate') {
      const angle = parseTransformValue(t.angle, 1);
      return { type: 'rotate', angle };
    } else if (t.type === 'scale') {
      return {
        type: 'scale',
        x: parseTransformValue(t.x, 1),
        y: parseTransformValue(t.y, 1),
      };
    } else if (t.type === 'translate') {
      return {
        type: 'translate',
        x: parseTransformValue(t.x, targetWidth),
        y: parseTransformValue(t.y, targetHeight),
      };
    } else {
      // skew
      return {
        type: 'skew',
        x: parseTransformValue(t.x, 1),
        y: parseTransformValue(t.y, 1),
      };
    }
  }) as ImagePlacementTransform<number>[];
}

/**
 * Parse a transform value that may be a number or percentage string.
 *
 * @param value - Value to parse
 * @param multiplier - Multiplier for percentage values
 * @returns Numeric value
 */
function parseTransformValue(value: number | string, multiplier: number): number {
  if (typeof value === 'number') {
    return value;
  }

  // Check for percentage
  if (value.endsWith('%')) {
    const percent = parseFloat(value.slice(0, -1)) / 100;
    return percent * multiplier;
  }

  return parseFloat(value) || 0;
}

/**
 * Apply a transform sequence to a canvas context.
 *
 * @param ctx - Canvas 2D context
 * @param transform - Transform sequence or matrix array
 */
export function applyTransformSequence(
  ctx: Canvas2DContext,
  transform: ImagePlacementTransform<number>[] | FixedSizeArray<number, 6>
): void {
  // Check if it's a matrix array (all numbers)
  if (transform.every((t) => typeof t === 'number')) {
    const matrix = transform as unknown as [number, number, number, number, number, number];
    ctx.setTransform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
    return;
  }

  for (const t of transform) {
    switch (t.type) {
      case 'rotate':
        ctx.rotate(t.angle || 0);
        break;
      case 'scale':
        ctx.scale(t.x, t.y);
        break;
      case 'translate':
        ctx.translate(t.x, t.y);
        break;
      case 'skew': {
        // Implement skew transform using transform matrix
        const kx = Math.tan(t.x);
        const ky = Math.tan(t.y);
        ctx.transform(1, ky, kx, 1 + kx * ky, 0, 0);
        break;
      }
    }
  }
}

/**
 * Step 1: Draw base image with placement transforms.
 *
 * Clears the work canvas and draws the base image with any placement
 * transforms applied.
 *
 * @param ctx - Pipeline context
 * @param assets - Layer assets
 * @param placement - Resolved placement
 */
export function step1DrawBaseImage(
  ctx: PipelineContext,
  assets: LayerAssets,
  placement: ResolvedPlacement
): void {
  const { work } = ctx;

  // Reset context state
  work.ctx.globalCompositeOperation = 'source-over';
  work.ctx.globalAlpha = 1.0;
  clearCanvas(work.ctx);

  // Apply transform if specified
  if (placement.transform) {
    applyTransformSequence(work.ctx, placement.transform);
  }

  // Draw the base image
  work.ctx.drawImage(
    assets.image,
    placement.left,
    placement.top,
    placement.width,
    placement.height
  );
}

/**
 * Step 2: Apply color or texture with blend mode and alpha.
 *
 * For color mode: fills with solid color
 * For image mode: draws the texture image
 *
 * @param ctx - Pipeline context
 * @param assets - Layer assets
 * @param config - Layer configuration
 * @param placement - Resolved placement
 */
export function step2ApplyColorOrTexture(
  ctx: PipelineContext,
  assets: LayerAssets,
  config: LayerConfig,
  placement: ResolvedPlacement
): void {
  const { work, color } = ctx;

  // Set blend mode and alpha for color/texture application
  work.ctx.globalCompositeOperation = config.blend as GlobalCompositeOperation;
  work.ctx.globalAlpha = config.alpha;

  if (config.mode === 'color') {
    // Clear the color canvas
    clearCanvas(color.ctx);

    // Fill with the specified color
    color.ctx.fillStyle = config.color ?? '#000000';
    color.ctx.fillRect(0, 0, ctx.width, ctx.height);

    // Draw the color fill onto the work canvas
    work.ctx.drawImage(
      color.canvas,
      placement.left,
      placement.top,
      placement.width,
      placement.height
    );
  } else {
    // Image mode - draw the texture
    if (assets.texture) {
      work.ctx.drawImage(
        assets.texture,
        placement.left,
        placement.top,
        placement.width,
        placement.height
      );
    }
  }
}

/**
 * Step 3: Apply highlight 1.
 *
 * Draws the first highlight image with its blend mode and alpha.
 *
 * @param ctx - Pipeline context
 * @param assets - Layer assets
 * @param config - Layer configuration
 * @param placement - Resolved placement
 */
export function step3ApplyHighlight1(
  ctx: PipelineContext,
  assets: LayerAssets,
  config: LayerConfig,
  placement: ResolvedPlacement
): void {
  if (!assets.hlimage1 || config.hlalpha1 === undefined || !config.hlblend1) {
    return;
  }

  const { work } = ctx;

  work.ctx.globalCompositeOperation = config.hlblend1 as GlobalCompositeOperation;
  work.ctx.globalAlpha = config.hlalpha1;
  work.ctx.drawImage(
    assets.hlimage1,
    placement.left,
    placement.top,
    placement.width,
    placement.height
  );
}

/**
 * Step 4: Apply highlight 2.
 *
 * Draws the second highlight image with its blend mode and alpha.
 * Falls back to highlight 1's image and blend mode if not specified.
 *
 * @param ctx - Pipeline context
 * @param assets - Layer assets
 * @param config - Layer configuration
 * @param placement - Resolved placement
 */
export function step4ApplyHighlight2(
  ctx: PipelineContext,
  assets: LayerAssets,
  config: LayerConfig,
  placement: ResolvedPlacement
): void {
  if (config.hlalpha2 === undefined) {
    return;
  }

  // Fall back to highlight 1's image if highlight 2 image is not specified
  const hlImage = assets.hlimage2 ?? assets.hlimage1;
  if (!hlImage) {
    return;
  }

  // Fall back to highlight 1's blend mode if not specified
  const hlBlend = config.hlblend2 ?? config.hlblend1;
  if (!hlBlend) {
    return;
  }

  const { work } = ctx;

  work.ctx.globalCompositeOperation = hlBlend as GlobalCompositeOperation;
  work.ctx.globalAlpha = config.hlalpha2;
  work.ctx.drawImage(hlImage, placement.left, placement.top, placement.width, placement.height);
}

/**
 * Step 5: Apply mask using destination-in composite.
 *
 * Masks the layer content using the mask image. Only the areas where
 * the mask is opaque will remain visible.
 *
 * @param ctx - Pipeline context
 * @param assets - Layer assets
 * @param placement - Resolved placement
 */
export function step5ApplyMask(
  ctx: PipelineContext,
  assets: LayerAssets,
  placement: ResolvedPlacement
): void {
  const { work } = ctx;

  work.ctx.globalCompositeOperation = 'destination-in';
  work.ctx.globalAlpha = 1.0;
  work.ctx.drawImage(assets.mask, placement.left, placement.top, placement.width, placement.height);
}

/**
 * Reset the context transform if transforms were applied.
 *
 * @param ctx - Pipeline context
 * @param placement - Resolved placement
 */
export function resetTransform(ctx: PipelineContext, placement: ResolvedPlacement): void {
  if (placement.transform) {
    ctx.work.ctx.resetTransform();
  }
}

/**
 * Execute the complete intra-layer pipeline for a standard layer.
 *
 * This runs all 5 steps in sequence:
 * 1. Draw base image with placement transforms
 * 2. Apply color/texture with blend mode and alpha
 * 3. Apply highlight 1 (if defined)
 * 4. Apply highlight 2 (if defined)
 * 5. Apply mask (destination-in composite)
 *
 * After execution, the result is available in ctx.work.canvas.
 *
 * @param ctx - Pipeline context (must be pre-created with correct dimensions)
 * @param assets - Layer assets
 * @param config - Layer configuration
 * @returns The resulting canvas with the rendered layer
 */
export function executeIntraLayerPipeline(
  ctx: PipelineContext,
  assets: LayerAssets,
  config: LayerConfig
): AnyCanvas {
  // Derive placement from configuration
  const placement = derivePlacement(
    config,
    ctx.width,
    ctx.height,
    assets.image.width,
    assets.image.height
  );

  // Execute the 5-step pipeline
  step1DrawBaseImage(ctx, assets, placement);
  step2ApplyColorOrTexture(ctx, assets, config, placement);
  step3ApplyHighlight1(ctx, assets, config, placement);
  step4ApplyHighlight2(ctx, assets, config, placement);
  step5ApplyMask(ctx, assets, placement);

  // Reset transform if applied
  resetTransform(ctx, placement);

  return ctx.work.canvas;
}
