/**
 * Batch Coordinator Module
 *
 * Provides event-driven batch/asset synchronization for render slaves.
 * This module is shared between workers and virtual slaves to ensure
 * consistent behavior.
 *
 * The coordinator handles the race condition between batch messages
 * and asset delivery by waiting until both conditions are met:
 * 1. A batch message has been received from the master
 * 2. All assets referenced in the batch (non-negative IDs) have been received
 *
 * Either the batch arrival or an asset arrival can trigger rendering.
 */

import type { LayerDescriptor } from '../types/messages';

/**
 * Interface for checking asset availability.
 * This allows the coordinator to work with both RenderSlave and TextRenderSlave.
 */
export interface AssetChecker {
  /**
   * Check if an asset with the given ID is available.
   * @param id - Asset ID
   * @returns true if the asset is registered and ready
   */
  hasAsset(id: number): boolean;
}

/**
 * Pending batch state.
 */
export interface PendingBatch<TLayer> {
  /** Layer descriptors to render */
  layers: TLayer[];
  /** Canvas width */
  width: number;
  /** Canvas height */
  height: number;
  /** Set of required asset IDs extracted from layers */
  requiredAssetIds: Set<number>;
}

/**
 * Extract all required asset IDs from standard layer descriptors.
 *
 * Standard layers can reference:
 * - image: The main image asset (required)
 * - mask: The mask asset (required for standard layers)
 * - texture: Optional texture
 * - hlimage1: Optional highlight image 1
 * - hlimage2: Optional highlight image 2
 *
 * @param layers - Standard layer descriptors
 * @returns Set of required asset IDs (excluding negative values which mean no asset)
 */
export function extractStandardLayerAssetIds(layers: LayerDescriptor[]): Set<number> {
  const assetIds = new Set<number>();

  for (const layer of layers) {
    const ids = layer.assetIds;

    // Add all non-negative asset IDs (id >= 0 means valid asset)
    if (ids.image >= 0) assetIds.add(ids.image);
    if (ids.mask !== undefined && ids.mask >= 0) assetIds.add(ids.mask);
    if (ids.texture !== undefined && ids.texture >= 0) assetIds.add(ids.texture);
    if (ids.hlimage1 !== undefined && ids.hlimage1 >= 0) assetIds.add(ids.hlimage1);
    if (ids.hlimage2 !== undefined && ids.hlimage2 >= 0) assetIds.add(ids.hlimage2);
  }

  return assetIds;
}

/**
 * Check if all required assets are available.
 *
 * @param requiredAssetIds - Set of required asset IDs
 * @param assetChecker - Interface for checking asset availability
 * @returns true if all required assets are registered
 */
export function hasAllRequiredAssets(
  requiredAssetIds: Set<number>,
  assetChecker: AssetChecker
): boolean {
  for (const assetId of requiredAssetIds) {
    if (!assetChecker.hasAsset(assetId)) {
      return false;
    }
  }
  return true;
}

/**
 * Batch Coordinator for managing batch/asset synchronization.
 *
 * This class provides a reusable implementation of the event-driven
 * synchronization pattern. It stores pending batch info and triggers
 * rendering when both the batch and all required assets are available.
 *
 * @template TLayer - Type of layer descriptor (LayerDescriptor or TextLayerDescriptor)
 */
export class BatchCoordinator<TLayer> {
  /** Pending batch waiting for assets */
  private pendingBatch: PendingBatch<TLayer> | null = null;

  /** Function to extract asset IDs from layers */
  private extractAssetIds: (layers: TLayer[]) => Set<number>;

  /** Asset checker for verifying asset availability */
  private assetChecker: AssetChecker;

  /** Callback to execute when batch is ready to render */
  private onReadyToRender: (batch: PendingBatch<TLayer>) => void;

  /**
   * Create a new BatchCoordinator.
   *
   * @param extractAssetIds - Function to extract asset IDs from layer descriptors
   * @param assetChecker - Interface for checking asset availability
   * @param onReadyToRender - Callback invoked when batch can be rendered
   */
  constructor(
    extractAssetIds: (layers: TLayer[]) => Set<number>,
    assetChecker: AssetChecker,
    onReadyToRender: (batch: PendingBatch<TLayer>) => void
  ) {
    this.extractAssetIds = extractAssetIds;
    this.assetChecker = assetChecker;
    this.onReadyToRender = onReadyToRender;
  }

  /**
   * Handle a new batch message.
   *
   * Stores the batch and immediately checks if all assets are available.
   * If so, triggers rendering. Otherwise, waits for assets.
   *
   * @param layers - Layer descriptors to render
   * @param width - Canvas width
   * @param height - Canvas height
   */
  handleBatch(layers: TLayer[], width: number, height: number): void {
    const requiredAssetIds = this.extractAssetIds(layers);
    this.pendingBatch = { layers, width, height, requiredAssetIds };
    this.tryRender();
  }

  /**
   * Notify the coordinator that an asset has been received.
   *
   * This should be called after registering the asset with the slave.
   * Checks if this completes the pending batch requirements and triggers
   * rendering if so.
   */
  handleAssetReceived(): void {
    this.tryRender();
  }

  /**
   * Clear the pending batch (e.g., on abort).
   */
  clear(): void {
    this.pendingBatch = null;
  }

  /**
   * Check if there is a pending batch.
   */
  hasPendingBatch(): boolean {
    return this.pendingBatch !== null;
  }

  /**
   * Try to render if we have both a pending batch and all required assets.
   */
  private tryRender(): void {
    if (!this.pendingBatch) {
      return;
    }

    if (!hasAllRequiredAssets(this.pendingBatch.requiredAssetIds, this.assetChecker)) {
      return;
    }

    // Capture batch and clear pending state before invoking callback
    const batch = this.pendingBatch;
    this.pendingBatch = null;

    this.onReadyToRender(batch);
  }
}

/**
 * Create a BatchCoordinator for standard layers.
 *
 * @param assetChecker - Interface for checking asset availability (typically RenderSlave)
 * @param onReadyToRender - Callback invoked when batch can be rendered
 * @returns Configured BatchCoordinator
 */
export function createStandardBatchCoordinator(
  assetChecker: AssetChecker,
  onReadyToRender: (batch: PendingBatch<LayerDescriptor>) => void
): BatchCoordinator<LayerDescriptor> {
  return new BatchCoordinator(
    extractStandardLayerAssetIds,
    assetChecker,
    onReadyToRender
  );
}
