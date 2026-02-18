/**
 * Standard Render Slave module for processing conventional image layers.
 *
 * The RenderSlave is responsible for:
 * - Managing assets received from the Asset Manager
 * - Processing batches of standard layers (where mask is a URL string)
 * - Executing the intra-layer pipeline for each layer
 * - Returning segmented results for composition
 *
 * This module is designed to run in a Web Worker context using OffscreenCanvas.
 */

import type { LayerDescriptor, RenderSegment } from '../types/messages';
import type { CanvasCompositeOperation } from '../types/pimco';
import { canvasToImageBitmap } from '../utils/canvas';
import {
  createPipelineContext,
  executeIntraLayerPipeline,
  type PipelineContext,
  type LayerAssets,
  type LayerConfig,
} from './intra-layer-pipeline';

/**
 * Asset store for managing received assets.
 */
export type AssetStore = Map<number, ImageBitmap>;

/**
 * Render result for a single layer.
 */
export interface LayerResult {
  /** Rendered bitmap for the layer */
  bitmap: ImageBitmap;
  /** Layer index in original array */
  index: number;
  /** Composite operation for this layer */
  compositemode: CanvasCompositeOperation;
  /** Composite opacity for this layer */
  compositealpha: number;
}

/**
 * Standard Render Slave for processing conventional image layers.
 */
export class RenderSlave {
  /** Stored assets received from Asset Manager */
  private assets: AssetStore = new Map();

  /** Pipeline context for rendering (reused across batches) */
  private pipelineCtx: PipelineContext | null = null;

  /** Current canvas dimensions */
  private width = 0;
  private height = 0;

  /** Abort flag for cancellation */
  private aborted = false;

  /**
   * Register an asset received from the Asset Manager.
   *
   * @param id - Asset ID
   * @param bitmap - Asset ImageBitmap
   */
  registerAsset(id: number, bitmap: ImageBitmap): void {
    this.assets.set(id, bitmap);
  }

  /**
   * Check if an asset is registered.
   *
   * @param id - Asset ID
   * @returns true if asset is registered
   */
  hasAsset(id: number): boolean {
    return this.assets.has(id);
  }

  /**
   * Get a registered asset.
   *
   * @param id - Asset ID
   * @returns Asset ImageBitmap or undefined
   */
  getAsset(id: number): ImageBitmap | undefined {
    return this.assets.get(id);
  }

  /**
   * Clear all registered assets and close ImageBitmaps to free memory.
   */
  clearAssets(): void {
    // Close all ImageBitmaps to release GPU memory
    // Note: ImageBitmap.close() may not exist in some test environments
    for (const bitmap of this.assets.values()) {
      try {
        if (typeof bitmap.close === 'function') {
          bitmap.close();
        }
      } catch {
        // Ignore errors from already-closed bitmaps
      }
    }
    this.assets.clear();
  }

  /**
   * Set the abort flag to cancel rendering.
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Reset the abort flag.
   */
  resetAbort(): void {
    this.aborted = false;
  }

  /**
   * Check if rendering was aborted.
   */
  isAborted(): boolean {
    return this.aborted;
  }

  /**
   * Ensure the pipeline context exists with the correct dimensions.
   *
   * @param width - Required width
   * @param height - Required height
   */
  private ensurePipelineContext(width: number, height: number): void {
    if (!this.pipelineCtx || this.width !== width || this.height !== height) {
      this.pipelineCtx = createPipelineContext(width, height);
      this.width = width;
      this.height = height;
    }
  }

  /**
   * Build LayerAssets from a LayerDescriptor using registered assets.
   *
   * @param layer - Layer descriptor with asset IDs
   * @returns Layer assets or null if required assets are missing
   */
  private buildLayerAssets(layer: LayerDescriptor): LayerAssets | null {
    const image = this.assets.get(layer.assetIds.image);
    const mask =
      layer.assetIds.mask !== undefined ? this.assets.get(layer.assetIds.mask) : undefined;

    // For standard layers, both image and mask are required
    if (!image || !mask) {
      return null;
    }

    const assets: LayerAssets = {
      image,
      mask,
    };

    // Optional assets
    if (layer.assetIds.texture !== undefined) {
      const texture = this.assets.get(layer.assetIds.texture);
      if (texture) {
        assets.texture = texture;
      }
    }

    if (layer.assetIds.hlimage1 !== undefined) {
      const hlimage1 = this.assets.get(layer.assetIds.hlimage1);
      if (hlimage1) {
        assets.hlimage1 = hlimage1;
      }
    }

    if (layer.assetIds.hlimage2 !== undefined) {
      const hlimage2 = this.assets.get(layer.assetIds.hlimage2);
      if (hlimage2) {
        assets.hlimage2 = hlimage2;
      }
    }

    return assets;
  }

  /**
   * Build LayerConfig from a LayerDescriptor.
   *
   * @param layer - Layer descriptor
   * @returns Layer configuration
   */
  private buildLayerConfig(layer: LayerDescriptor): LayerConfig {
    const config: LayerConfig = {
      id: layer.id,
      mode: layer.mode,
      alpha: layer.alpha,
      blend: layer.blend,
    };

    if (layer.color !== undefined) {
      config.color = layer.color;
    }

    if (layer.hlalpha1 !== undefined) {
      config.hlalpha1 = layer.hlalpha1;
    }

    if (layer.hlblend1 !== undefined) {
      config.hlblend1 = layer.hlblend1;
    }

    if (layer.hlalpha2 !== undefined) {
      config.hlalpha2 = layer.hlalpha2;
    }

    if (layer.hlblend2 !== undefined) {
      config.hlblend2 = layer.hlblend2;
    }

    if (layer.placement !== undefined) {
      config.placement = layer.placement;
    }

    return config;
  }

  /**
   * Render a single layer using the intra-layer pipeline.
   *
   * @param layer - Layer descriptor
   * @param width - Canvas width
   * @param height - Canvas height
   * @returns Layer result or null if assets are missing
   */
  async renderLayer(
    layer: LayerDescriptor,
    width: number,
    height: number,
    index: number
  ): Promise<LayerResult | null> {
    // Check for abort
    if (this.aborted) {
      return null;
    }

    // Ensure pipeline context
    this.ensurePipelineContext(width, height);

    // Build assets
    const assets = this.buildLayerAssets(layer);
    if (!assets) {
      console.warn(`Missing assets for layer ${layer.id}`);
      return null;
    }

    // Build config
    const config = this.buildLayerConfig(layer);

    // Execute pipeline (pipelineCtx is guaranteed to exist after ensurePipelineContext)
    if (!this.pipelineCtx) {
      throw new Error('Pipeline context not initialized');
    }
    const canvas = executeIntraLayerPipeline(this.pipelineCtx, assets, config);

    // Convert to ImageBitmap
    const bitmap = await canvasToImageBitmap(canvas);

    return {
      bitmap,
      index,
      compositemode: layer.compositemode,
      compositealpha: layer.compositealpha,
    };
  }

  /**
   * Render a batch of layers.
   *
   * @param layers - Array of layer descriptors
   * @param width - Canvas width
   * @param height - Canvas height
   * @param indices - Optional original layer indices for composition ordering
   * @returns Array of layer results (in original order)
   */
  async renderBatch(
    layers: LayerDescriptor[],
    width: number,
    height: number,
    indices?: number[]
  ): Promise<LayerResult[]> {
    this.resetAbort();
    const results: LayerResult[] = [];

    for (let i = 0; i < layers.length; i++) {
      // Check for abort between layers
      if (this.aborted) {
        break;
      }

      // Use original index from indices array if provided, otherwise use local index
      const originalIndex = indices?.[i] ?? i;
      const result = await this.renderLayer(layers[i], width, height, originalIndex);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Destroy the render slave and release resources.
   * Ensures all ImageBitmaps are closed and canvas references are released.
   */
  destroy(): void {
    // Clear and close all registered assets
    this.clearAssets();

    // Release pipeline context resources
    // Note: Canvas elements don't have explicit cleanup, but nullifying
    // allows garbage collection when no longer referenced
    this.pipelineCtx = null;
    this.width = 0;
    this.height = 0;

    // Reset abort state
    this.aborted = false;
  }
}

/**
 * Convert layer results to render segments for transfer to master.
 *
 * @param results - Array of layer results
 * @returns Array of render segments
 */
export function resultsToSegments(results: LayerResult[]): RenderSegment[] {
  return results.map((r) => ({
    bitmap: r.bitmap,
    compositemode: r.compositemode,
    compositealpha: r.compositealpha,
    orderIndex: r.index,
  }));
}
