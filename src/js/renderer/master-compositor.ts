/**
 * Master Compositor Module.
 *
 * Responsible for final composition of render segments received from slaves.
 * Applies composite operations and alpha values per segment to produce the final ImageBitmap.
 */

import type { RenderSegment } from '../types/messages';
import type { AnyCanvas, Canvas2DContext } from '../utils/canvas';
import { createCanvasWithContext, clearCanvas, canvasToImageBitmap } from '../utils/canvas';

/**
 * Compositor context for reusing canvas resources across renders.
 */
export interface CompositorContext {
  /** Composition canvas */
  canvas: AnyCanvas;
  /** Canvas 2D context */
  ctx: Canvas2DContext;
  /** Current width */
  width: number;
  /** Current height */
  height: number;
}

/**
 * Create a compositor context with the given dimensions.
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Compositor context
 */
export function createCompositorContext(width: number, height: number): CompositorContext {
  const { canvas, ctx } = createCanvasWithContext(width, height);
  return { canvas, ctx, width, height };
}

/**
 * Ensure compositor context has the correct dimensions, recreating if needed.
 *
 * @param ctx - Existing context or null
 * @param width - Required width
 * @param height - Required height
 * @returns Updated compositor context
 */
export function ensureCompositorContext(
  ctx: CompositorContext | null,
  width: number,
  height: number
): CompositorContext {
  if (ctx?.width !== width || ctx.height !== height) {
    return createCompositorContext(width, height);
  }
  return ctx;
}

/**
 * Composed layer info for ordering and composition.
 */
export interface ComposedLayer {
  /** Rendered bitmap or segment */
  segment: RenderSegment;
  /** Original layer index for ordering */
  originalIndex: number;
}

/**
 * Compose multiple render segments into a final ImageBitmap.
 *
 * Segments are applied in order, using each segment's composite operation
 * and alpha value.
 *
 * @param segments - Array of render segments to compose
 * @param width - Output canvas width
 * @param height - Output canvas height
 * @returns Promise resolving to the composed ImageBitmap
 */
export async function composeSegments(
  segments: RenderSegment[],
  width: number,
  height: number
): Promise<ImageBitmap> {
  const { canvas, ctx } = createCanvasWithContext(width, height);
  clearCanvas(ctx);

  for (const segment of segments) {
    ctx.globalCompositeOperation = segment.compositemode as GlobalCompositeOperation;
    ctx.globalAlpha = segment.compositealpha;
    ctx.drawImage(segment.bitmap, 0, 0);
  }

  // Reset state
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;

  return canvasToImageBitmap(canvas);
}

/**
 * Compose segments using an existing compositor context.
 * More efficient for repeated compositions as it reuses the canvas.
 *
 * @param compositorCtx - Compositor context
 * @param segments - Array of render segments to compose
 * @returns Promise resolving to the composed ImageBitmap
 */
export async function composeSegmentsWithContext(
  compositorCtx: CompositorContext,
  segments: RenderSegment[]
): Promise<ImageBitmap> {
  clearCanvas(compositorCtx.ctx);

  for (const segment of segments) {
    compositorCtx.ctx.globalCompositeOperation = segment.compositemode as GlobalCompositeOperation;
    compositorCtx.ctx.globalAlpha = segment.compositealpha;
    compositorCtx.ctx.drawImage(segment.bitmap, 0, 0);
  }

  // Reset state
  compositorCtx.ctx.globalCompositeOperation = 'source-over';
  compositorCtx.ctx.globalAlpha = 1.0;

  return canvasToImageBitmap(compositorCtx.canvas);
}

/**
 * Compose layers maintaining original order.
 *
 * Takes composed layers with original indices and sorts them before composition.
 * This is useful when layers are processed out of order by different slaves.
 *
 * @param layers - Array of composed layers with original indices
 * @param width - Output canvas width
 * @param height - Output canvas height
 * @returns Promise resolving to the composed ImageBitmap
 */
export async function composeOrderedLayers(
  layers: ComposedLayer[],
  width: number,
  height: number
): Promise<ImageBitmap> {
  // Sort by original index to maintain correct layer order
  const sorted = [...layers].sort((a, b) => a.originalIndex - b.originalIndex);

  // Extract segments in order
  const segments = sorted.map((l) => l.segment);

  return composeSegments(segments, width, height);
}

/**
 * Compose segments from multiple slaves into a final result.
 *
 * Segments are interleaved based on their original layer indices to produce
 * the correct visual output.
 *
 * @param slaveResults - Map of slave ID to their render segments with indices
 * @param width - Output canvas width
 * @param height - Output canvas height
 * @returns Promise resolving to the composed ImageBitmap
 */
export async function composeSlaveResults(
  slaveResults: Map<number, ComposedLayer[]>,
  width: number,
  height: number
): Promise<ImageBitmap> {
  // Collect all layers from all slaves
  const allLayers: ComposedLayer[] = [];

  for (const [, layers] of slaveResults) {
    allLayers.push(...layers);
  }

  return composeOrderedLayers(allLayers, width, height);
}

/**
 * Close all ImageBitmaps in an array of segments.
 * Call this to free resources after composition is complete.
 *
 * @param segments - Array of render segments to close
 */
export function closeSegments(segments: RenderSegment[]): void {
  for (const segment of segments) {
    try {
      segment.bitmap.close();
    } catch {
      // Ignore errors from already-closed bitmaps
    }
  }
}

/**
 * MasterCompositor class for managing composition state.
 * Reuses canvas resources across multiple composition operations.
 */
export class MasterCompositor {
  private compositorCtx: CompositorContext | null = null;

  /**
   * Compose render segments into a final ImageBitmap.
   *
   * @param segments - Array of render segments in composition order
   * @param width - Output width
   * @param height - Output height
   * @returns Promise resolving to the composed ImageBitmap
   */
  async compose(segments: RenderSegment[], width: number, height: number): Promise<ImageBitmap> {
    this.compositorCtx = ensureCompositorContext(this.compositorCtx, width, height);
    return composeSegmentsWithContext(this.compositorCtx, segments);
  }

  /**
   * Compose layers from multiple sources maintaining order.
   *
   * @param layers - Array of composed layers with indices
   * @param width - Output width
   * @param height - Output height
   * @returns Promise resolving to the composed ImageBitmap
   */
  async composeOrdered(
    layers: ComposedLayer[],
    width: number,
    height: number
  ): Promise<ImageBitmap> {
    // Sort by original index
    const sorted = [...layers].sort((a, b) => a.originalIndex - b.originalIndex);
    const segments = sorted.map((l) => l.segment);
    return this.compose(segments, width, height);
  }

  /**
   * Destroy the compositor and release resources.
   */
  destroy(): void {
    this.compositorCtx = null;
  }
}
