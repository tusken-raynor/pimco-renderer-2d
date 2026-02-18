/**
 * Text Layer Batch Coordinator Module
 *
 * Provides text-layer-specific asset extraction for batch coordination.
 * Uses the shared BatchCoordinator from render-slave for the core logic.
 */

import type { TextLayerDescriptor } from '../types/messages';
import { BatchCoordinator, type AssetChecker, type PendingBatch } from '../render-slave/batch-coordinator';

/**
 * Extended asset checker for text layers.
 * Text layers can have both image assets and font assets.
 */
export interface TextAssetChecker extends AssetChecker {
  /**
   * Check if a font with the given ID is available.
   * @param id - Font ID
   * @returns true if the font is registered
   */
  hasFont(id: number): boolean;
}

/**
 * Wrapper that checks both assets and fonts for text layers.
 */
class TextAssetCheckerWrapper implements AssetChecker {
  private checker: TextAssetChecker;

  constructor(checker: TextAssetChecker) {
    this.checker = checker;
  }

  hasAsset(id: number): boolean {
    // For text layers, an "asset" can be either an image asset or a font
    return this.checker.hasAsset(id) || this.checker.hasFont(id);
  }
}

/**
 * Extract all required asset IDs from text layer descriptors.
 *
 * Text layers can reference:
 * - texture: Optional texture asset
 * - font: Optional font asset
 * - postmask: Optional post-mask asset
 *
 * @param layers - Text layer descriptors
 * @returns Set of required asset IDs (excluding undefined and negative values)
 */
export function extractTextLayerAssetIds(layers: TextLayerDescriptor[]): Set<number> {
  const assetIds = new Set<number>();

  for (const layer of layers) {
    const ids = layer.assetIds;

    // Add all non-negative asset IDs (id >= 0 means valid asset)
    if (ids.texture !== undefined && ids.texture >= 0) assetIds.add(ids.texture);
    if (ids.font !== undefined && ids.font >= 0) assetIds.add(ids.font);
    if (ids.postmask !== undefined && ids.postmask >= 0) assetIds.add(ids.postmask);
  }

  return assetIds;
}

/**
 * Create a BatchCoordinator for text layers.
 *
 * @param assetChecker - Interface for checking asset and font availability (typically TextRenderSlave)
 * @param onReadyToRender - Callback invoked when batch can be rendered
 * @returns Configured BatchCoordinator for text layers
 */
export function createTextBatchCoordinator(
  assetChecker: TextAssetChecker,
  onReadyToRender: (batch: PendingBatch<TextLayerDescriptor>) => void
): BatchCoordinator<TextLayerDescriptor> {
  // Wrap the checker to handle both assets and fonts
  const wrappedChecker = new TextAssetCheckerWrapper(assetChecker);

  return new BatchCoordinator(
    extractTextLayerAssetIds,
    wrappedChecker,
    onReadyToRender
  );
}

// Re-export types for convenience
export type { PendingBatch } from '../render-slave/batch-coordinator';
