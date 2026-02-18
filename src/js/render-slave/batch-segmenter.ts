/**
 * Batch Segmentation Module for Render Slaves.
 *
 * This module groups consecutive layers with combinable composite modes
 * into single render segments, reducing the number of composition operations
 * needed by the master during final composition.
 *
 * Combinable modes (can be batched together):
 * - source-over: Standard alpha compositing
 * - screen: Lightening blend
 * - lighten: Take lighter of each channel
 * - lighter: Add RGB values (also known as 'add')
 *
 * All other modes require standalone segments to preserve correct visual output.
 */

import type { CanvasCompositeOperation } from '../types/pimco';
import type { RenderSegment } from '../types/messages';
import type { LayerResult } from './index';
import type { AnyCanvas, Canvas2DContext } from '../utils/canvas';
import { createCanvasWithContext, clearCanvas, canvasToImageBitmap } from '../utils/canvas';

/**
 * Set of composite modes that can be combined into a single segment.
 * These modes are associative and can be applied in sequence without
 * affecting the final visual result.
 */
export const COMBINABLE_MODES = new Set<CanvasCompositeOperation>([
  'source-over',
  'screen',
  'lighten',
  'lighter',
]);

/**
 * Check if a composite mode can be combined with other layers.
 *
 * @param mode - The composite mode to check
 * @returns true if the mode is combinable
 */
export function isCombinableMode(mode: CanvasCompositeOperation): boolean {
  return COMBINABLE_MODES.has(mode);
}

/**
 * Pending segment being built during segmentation.
 */
interface PendingSegment {
  /** Layer results in this segment */
  layers: LayerResult[];
  /** Original layer indices included in this segment */
  originalIndices: number[];
  /** Composite mode for this segment (from first layer) */
  compositemode: CanvasCompositeOperation;
  /** Composite alpha for this segment (from first layer) */
  compositealpha: number;
}

/**
 * Segment layer results into groups based on combinable composite modes.
 *
 * Consecutive layers with combinable modes (source-over, screen, lighten, lighter)
 * are grouped into single segments. Layers with non-combinable modes become
 * standalone segments.
 *
 * @param results - Array of layer results to segment
 * @returns Array of pending segments
 */
export function segmentLayerResults(results: LayerResult[]): PendingSegment[] {
  if (results.length === 0) {
    return [];
  }

  const segments: PendingSegment[] = [];
  let current: PendingSegment | null = null;

  for (const result of results) {
    const isCombinable = isCombinableMode(result.compositemode);

    // Check for index gap - if there's a gap in indices, we must break the segment
    // because another slave (e.g., text slave) has layers that need to be
    // sandwiched between these layers during final composition
    const hasIndexGap =
      current !== null &&
      current.originalIndices.length > 0 &&
      result.index !== current.originalIndices[current.originalIndices.length - 1] + 1;

    if (isCombinable && !hasIndexGap) {
      // Combinable mode with no index gap: try to add to current segment
      if (current && isCombinableMode(current.compositemode)) {
        // Extend current combinable segment
        current.layers.push(result);
        current.originalIndices.push(result.index);
      } else {
        // Start new combinable segment
        if (current) {
          segments.push(current);
        }
        current = {
          layers: [result],
          originalIndices: [result.index],
          compositemode: result.compositemode,
          compositealpha: result.compositealpha,
        };
      }
    } else {
      // Non-combinable mode OR index gap: must start new segment
      if (current) {
        segments.push(current);
      }

      if (isCombinable) {
        // Combinable mode but had index gap - start new combinable segment
        current = {
          layers: [result],
          originalIndices: [result.index],
          compositemode: result.compositemode,
          compositealpha: result.compositealpha,
        };
      } else {
        // Non-combinable mode: standalone segment
        current = {
          layers: [result],
          originalIndices: [result.index],
          compositemode: result.compositemode,
          compositealpha: result.compositealpha,
        };
        segments.push(current);
        current = null;
      }
    }
  }

  // Push final segment if exists
  if (current) {
    segments.push(current);
  }

  return segments;
}

/**
 * Compose multiple layer bitmaps into a single bitmap.
 *
 * @param layers - Layer results to compose
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Composed ImageBitmap
 */
export async function composeLayers(
  layers: LayerResult[],
  width: number,
  height: number
): Promise<ImageBitmap> {
  const { canvas, ctx } = createCanvasWithContext(width, height);
  clearCanvas(ctx);

  for (const layer of layers) {
    ctx.globalCompositeOperation = layer.compositemode as GlobalCompositeOperation;
    ctx.globalAlpha = layer.compositealpha;
    ctx.drawImage(layer.bitmap, 0, 0);
  }

  // Reset context state
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;

  return canvasToImageBitmap(canvas);
}

/**
 * Context for batch segmentation operations.
 * Reused across multiple segmentation calls for efficiency.
 */
export interface SegmentationContext {
  /** Composition canvas */
  canvas: AnyCanvas;
  /** Canvas 2D context */
  ctx: Canvas2DContext;
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
}

/**
 * Create a segmentation context for the given dimensions.
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Segmentation context
 */
export function createSegmentationContext(width: number, height: number): SegmentationContext {
  const { canvas, ctx } = createCanvasWithContext(width, height);
  return { canvas, ctx, width, height };
}

/**
 * Compose layers using an existing segmentation context.
 *
 * @param ctx - Segmentation context
 * @param layers - Layer results to compose
 * @returns Composed ImageBitmap
 */
export async function composeLayersWithContext(
  ctx: SegmentationContext,
  layers: LayerResult[]
): Promise<ImageBitmap> {
  clearCanvas(ctx.ctx);

  for (const layer of layers) {
    ctx.ctx.globalCompositeOperation = layer.compositemode as GlobalCompositeOperation;
    ctx.ctx.globalAlpha = layer.compositealpha;
    ctx.ctx.drawImage(layer.bitmap, 0, 0);
  }

  // Reset context state
  ctx.ctx.globalCompositeOperation = 'source-over';
  ctx.ctx.globalAlpha = 1.0;

  return canvasToImageBitmap(ctx.canvas);
}

/**
 * Convert layer results to render segments with batching optimization.
 *
 * This is the main entry point for batch segmentation. It:
 * 1. Groups consecutive combinable layers into segments
 * 2. Composes each segment into a single ImageBitmap
 * 3. Returns segments ready for transfer to master
 *
 * @param results - Array of layer results
 * @param width - Canvas width for composition
 * @param height - Canvas height for composition
 * @returns Array of render segments
 */
export async function batchSegmentResults(
  results: LayerResult[],
  width: number,
  height: number
): Promise<RenderSegment[]> {
  if (results.length === 0) {
    return [];
  }

  const pendingSegments = segmentLayerResults(results);
  const segments: RenderSegment[] = [];
  const ctx = createSegmentationContext(width, height);

  for (const pending of pendingSegments) {
    // Use the highest original index as the orderIndex (topmost layer in segment)
    const orderIndex = Math.max(...pending.originalIndices);

    if (pending.layers.length === 1) {
      // Single layer segment - no composition needed
      segments.push({
        bitmap: pending.layers[0].bitmap,
        compositemode: pending.compositemode,
        compositealpha: pending.compositealpha,
        orderIndex,
      });
    } else {
      // Multi-layer segment - compose into single bitmap
      const composedBitmap = await composeLayersWithContext(ctx, pending.layers);
      segments.push({
        bitmap: composedBitmap,
        compositemode: pending.compositemode,
        compositealpha: pending.compositealpha,
        orderIndex,
      });
    }
  }

  return segments;
}

/**
 * Alternative to resultsToSegments that applies batch optimization.
 *
 * Use this instead of resultsToSegments when you want to reduce
 * the number of segments sent to the master.
 *
 * @param results - Array of layer results
 * @param width - Canvas width for composition
 * @param height - Canvas height for composition
 * @returns Array of render segments (potentially fewer than results)
 */
export async function optimizedResultsToSegments(
  results: LayerResult[],
  width: number,
  height: number
): Promise<RenderSegment[]> {
  return batchSegmentResults(results, width, height);
}
