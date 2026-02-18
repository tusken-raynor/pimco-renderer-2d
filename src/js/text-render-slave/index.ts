/**
 * Text Render Slave Module
 *
 * The TextRenderSlave is responsible for:
 * - Managing assets received from the Asset Manager (images, fonts)
 * - Processing batches of text layers (where mask is PimcoMaskSubstitutionCompiled)
 * - Text rasterization with typography settings
 * - 2D transform application (translation, rotation, scale)
 * - Post-mask application (destination-in composite after transforms)
 * - Effect application (delegated to effects module in future steps)
 * - Returning segmented results for composition
 *
 * This module is designed to run in a Web Worker context using OffscreenCanvas.
 */

import type { RenderSegment, TextLayerDescriptor } from '../types/messages';
import type { CanvasCompositeOperation, PimcoMaskSubstitutionCompiled } from '../types/pimco';
import { canvasToImageBitmap, createCanvas, getContext2D } from '../utils/canvas';
import { TextRasterizer, createTextRasterizer, type RasterizedText } from './text-rasterizer';
import { applyTransformAndDraw, hasActiveTransform, type TextAlignment } from './transforms';

/**
 * Asset types that can be stored by the text render slave.
 */
export type TextSlaveAsset = ImageBitmap | ArrayBuffer;

/**
 * Asset store for managing received assets.
 */
export type TextAssetStore = Map<number, TextSlaveAsset>;

/**
 * Font cache entry.
 */
export interface FontCacheEntry {
  /** Font family name */
  family: string;
  /** Font data as ArrayBuffer */
  data: ArrayBuffer;
  /** Whether the font has been loaded via FontFace API */
  loaded: boolean;
}

/**
 * Font cache for managing loaded fonts.
 */
export type FontCache = Map<number, FontCacheEntry>;

/**
 * Render result for a single text layer.
 */
export interface TextLayerResult {
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
 * Text Render Slave for processing text/effect layers.
 */
export class TextRenderSlave {
  /** Stored image assets received from Asset Manager */
  private assets: TextAssetStore = new Map();

  /** Cached fonts */
  private fonts: FontCache = new Map();

  /** Text rasterizer instance */
  private rasterizer: TextRasterizer;

  /** Abort flag for cancellation */
  private aborted = false;

  constructor() {
    this.rasterizer = createTextRasterizer();
  }

  /**
   * Register an image asset received from the Asset Manager.
   *
   * @param id - Asset ID
   * @param bitmap - Asset ImageBitmap
   */
  registerAsset(id: number, asset: ImageBitmap): void {
    this.assets.set(id, asset);
  }

  /**
   * Register a font asset received from the Asset Manager.
   *
   * @param id - Asset ID
   * @param family - Font family name
   * @param data - Font data as ArrayBuffer
   */
  registerFont(id: number, family: string, data: ArrayBuffer): void {
    this.fonts.set(id, { family, data, loaded: false });
  }

  /**
   * Load a font into the document/worker via FontFace API.
   *
   * @param id - Font asset ID
   * @returns Promise that resolves when font is loaded
   */
  async loadFont(id: number): Promise<void> {
    const entry = this.fonts.get(id);
    if (!entry || entry.loaded) {
      return;
    }

    try {
      const fontFace = new FontFace(entry.family, entry.data);
      await fontFace.load();

      // Add to document fonts (works in both main thread and workers with FontFace support)
      if (typeof self !== 'undefined' && 'fonts' in self) {
        self.fonts.add(fontFace);
      }

      entry.loaded = true;
    } catch (error) {
      console.warn(`Failed to load font ${entry.family}:`, error);
    }
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
   * @returns Asset or undefined
   */
  getAsset(id: number): TextSlaveAsset | undefined {
    return this.assets.get(id);
  }

  /**
   * Check if a font is registered.
   *
   * @param id - Font ID
   * @returns true if font is registered
   */
  hasFont(id: number): boolean {
    return this.fonts.has(id);
  }

  /**
   * Get a registered font.
   *
   * @param id - Font ID
   * @returns Font entry or undefined
   */
  getFont(id: number): FontCacheEntry | undefined {
    return this.fonts.get(id);
  }

  /**
   * Clear all registered assets and fonts, closing ImageBitmaps to free memory.
   */
  clearAssets(): void {
    // Close all ImageBitmaps to release GPU memory
    // Check if ImageBitmap is defined (may not be in test environments like jsdom)
    const hasImageBitmap = typeof ImageBitmap !== 'undefined';
    for (const asset of this.assets.values()) {
      if (hasImageBitmap && asset instanceof ImageBitmap) {
        try {
          asset.close();
        } catch {
          // Ignore errors from already-closed bitmaps
        }
      }
    }
    this.assets.clear();
    this.fonts.clear();
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
   * Rasterize text from mask data.
   *
   * @param maskData - Text mask data
   * @param width - Canvas width
   * @param height - Canvas height
   * @returns Rasterized text result
   */
  rasterizeText(
    maskData: PimcoMaskSubstitutionCompiled,
    workWidth: number,
    workHeight: number
  ): RasterizedText {
    // Build options, only including type if defined (exactOptionalPropertyTypes compliance)
    const options = {
      workWidth,
      workHeight,
      content: maskData.content ?? '',
    };

    if (maskData.type !== undefined) {
      return this.rasterizer.rasterize({ ...options, type: maskData.type });
    }

    return this.rasterizer.rasterize(options);
  }

  /**
   * Apply post-mask to rendered content.
   *
   * @param canvas - Canvas with rendered content
   * @param postMask - Post-mask ImageBitmap
   * @param width - Output width
   * @param height - Output height
   */
  applyPostMask(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    postMask: ImageBitmap,
    width: number,
    height: number
  ): void {
    const ctx = getContext2D(canvas);
    if (!ctx) {
      return;
    }

    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1.0;
    ctx.drawImage(postMask, 0, 0, width, height);

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Render a single text layer.
   *
   * The rendering pipeline:
   * 1. Rasterizes the text content using typography settings
   * 2. Creates output canvas at full dimensions
   * 3. Applies 2D transforms (translation, rotation, scale) if present
   * 4. Falls back to centered positioning if no transforms
   * 5. Applies post-mask (destination-in composite) if present
   *
   * Note: Effect application is implemented in later steps.
   *
   * @param layer - Text layer descriptor
   * @param width - Canvas width
   * @param height - Canvas height
   * @param index - Layer index
   * @returns Layer result or null if aborted/failed
   */
  async renderLayer(
    layer: TextLayerDescriptor,
    width: number,
    height: number,
    index: number
  ): Promise<TextLayerResult | null> {
    // Check for abort
    if (this.aborted) {
      return null;
    }

    // Get mask data (required for text layers, but defensive check for runtime safety)
    const maskData = layer.maskData;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!maskData) {
      console.warn(`Missing mask data for text layer ${layer.id}`);
      return null;
    }

    // Rasterize text
    const rasterized = this.rasterizeText(maskData, width, height);

    // Create output canvas at full size
    const outputCanvas = createCanvas(width, height);
    const outputCtx = getContext2D(outputCanvas);

    if (!outputCtx) {
      throw new Error('Failed to create output context');
    }

    // Get text alignment for transform origin calculation
    const alignment: TextAlignment = maskData.type?.alignment ?? 'center';

    // Apply transforms and draw
    if (hasActiveTransform(maskData.transform)) {
      // Use transform-based drawing (handles translation, rotation, scale)
      applyTransformAndDraw(
        outputCtx,
        rasterized.canvas,
        maskData.transform,
        width,
        height,
        alignment
      );
    } else {
      // No transforms: simple centered positioning
      const x = (width - rasterized.width) / 2;
      const y = (height - rasterized.height) / 2;
      outputCtx.drawImage(rasterized.canvas, x, y);
    }

    // Apply post-mask if present (destination-in composite after transforms)
    if (layer.assetIds.postmask !== undefined) {
      const postMask = this.assets.get(layer.assetIds.postmask);
      if (postMask instanceof ImageBitmap) {
        this.applyPostMask(outputCanvas, postMask, width, height);
      }
    }

    // Convert to ImageBitmap
    const bitmap = await canvasToImageBitmap(outputCanvas);

    return {
      bitmap,
      index,
      compositemode: layer.compositemode,
      compositealpha: layer.compositealpha,
    };
  }

  /**
   * Render a batch of text layers.
   *
   * @param layers - Array of text layer descriptors
   * @param width - Canvas width
   * @param height - Canvas height
   * @returns Array of layer results (in original order)
   */
  async renderBatch(
    layers: TextLayerDescriptor[],
    width: number,
    height: number
  ): Promise<TextLayerResult[]> {
    this.resetAbort();

    const results: TextLayerResult[] = [];

    for (let i = 0; i < layers.length; i++) {
      // Check for abort between layers
      if (this.aborted) {
        break;
      }

      const result = await this.renderLayer(layers[i], width, height, i);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Destroy the render slave and release resources.
   * Ensures all ImageBitmaps are closed and font data is released.
   */
  destroy(): void {
    // Clear and close all registered assets
    this.clearAssets();

    // Destroy the text rasterizer
    this.rasterizer.destroy();

    // Reset abort state
    this.aborted = false;
  }
}

/**
 * Convert text layer results to render segments for transfer to master.
 *
 * @param results - Array of text layer results
 * @returns Array of render segments
 */
export function textResultsToSegments(results: TextLayerResult[]): RenderSegment[] {
  return results.map((r) => ({
    bitmap: r.bitmap,
    compositemode: r.compositemode,
    compositealpha: r.compositealpha,
    orderIndex: r.index,
  }));
}

/**
 * Create a new TextRenderSlave instance.
 *
 * @returns TextRenderSlave instance
 */
export function createTextRenderSlave(): TextRenderSlave {
  return new TextRenderSlave();
}
