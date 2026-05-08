/**
 * Text Layer Batch Coordinator Module
 *
 * Provides text-layer-specific asset extraction for batch coordination.
 * Uses the shared BatchCoordinator from render-slave for the core logic.
 */

import type { TextLayerDescriptor } from '../types/messages';
import { BatchCoordinator, type AssetChecker, type PendingBatch } from '../render-slave/batch-coordinator';

/**
 * Extended asset checker for text layers. Distinguishes between fonts that
 * are merely registered and fonts that are fully loaded — the gate must
 * wait on `isFontLoaded` so layout uses real font metrics rather than the
 * fallback face's metrics. Meshes have their own check because they live
 * outside the image asset map (parsed OBJ buffers, not ImageBitmaps).
 */
export interface TextAssetChecker extends AssetChecker {
  /**
   * Check if a font with the given ID is fully loaded (FontFace.load
   * resolved AND added to `self.fonts`).
   */
  isFontLoaded(id: number): boolean;
  /**
   * Check if a mesh with the given ID has been registered and successfully
   * parsed into the slave's mesh cache.
   */
  hasMesh(id: number): boolean;
}

/**
 * Wrapper that treats either an image asset, a fully-loaded font, or a parsed
 * mesh as "available" so the existing single-set gate works for all three.
 */
class TextAssetCheckerWrapper implements AssetChecker {
  private checker: TextAssetChecker;

  constructor(checker: TextAssetChecker) {
    this.checker = checker;
  }

  hasAsset(id: number): boolean {
    return (
      this.checker.hasAsset(id) ||
      this.checker.isFontLoaded(id) ||
      this.checker.hasMesh(id)
    );
  }
}

/**
 * Extract image asset IDs from text layer descriptors. Font asset IDs are
 * routed via `BatchMessage.requiredFontIds` and unioned in by the caller —
 * fonts are not 1:1 with layers.
 */
export function extractTextLayerAssetIds(layers: TextLayerDescriptor[]): Set<number> {
  const assetIds = new Set<number>();

  for (const layer of layers) {
    const ids = layer.assetIds;
    if (ids.texture !== undefined && ids.texture >= 0) {assetIds.add(ids.texture);}
    if (ids.postmask !== undefined && ids.postmask >= 0) {assetIds.add(ids.postmask);}
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
