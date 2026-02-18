/**
 * Standard Render Slave Worker Entry Point.
 *
 * This worker handles standard layer rendering (layers with URL-based masks).
 * It receives assets from the Asset Manager via a MessagePort and renders
 * batches of layers using the intra-layer pipeline.
 *
 * Message Protocol:
 * - init: Initialize the worker and report capabilities
 * - batch: Render a batch of layers
 * - abort: Cancel current rendering operation
 *
 * The worker also receives asset-data messages from the Asset Manager via
 * a separate MessagePort registered by the master.
 *
 * Synchronization:
 * The slave waits until both conditions are met before rendering:
 * 1. A batch message has been received from the master
 * 2. All assets referenced in the batch (non-negative IDs) have been received
 * Either the batch arrival or an asset arrival can trigger rendering.
 */

import { RenderSlave } from '../js/render-slave';
import { batchSegmentResults } from '../js/render-slave/batch-segmenter';
import { probeCapabilities } from '../js/renderer/capability-probe';
import { wrapError } from '../js/errors';
import { isInitMessage, isBatchMessage, isAbortMessage, isAssetDataMessage } from '../js/types';
import type {
  MasterToSlaveMessage,
  AssetManagerToSlaveMessage,
  CapabilitiesMessage,
  ResultMessage,
  ErrorMessage,
  ReadyMessage,
  RenderSegment,
  LayerDescriptor,
} from '../js/types';

// Create the render slave instance
const renderSlave = new RenderSlave();

// Track the asset manager port for receiving assets
let assetPort: MessagePort | null = null;

// Pending batch state - stores batch info until assets are ready
let pendingBatch: {
  layers: LayerDescriptor[];
  width: number;
  height: number;
  requiredAssetIds: Set<number>;
} | null = null;

/**
 * Send capabilities message to master.
 */
function sendCapabilities(): void {
  const capabilities = probeCapabilities();
  const msg: CapabilitiesMessage = {
    type: 'capabilities',
    offscreenCanvas: capabilities.offscreenCanvas,
    webgl2: capabilities.webgl2,
  };
  self.postMessage(msg);
}

/**
 * Send ready message to master.
 */
function sendReady(): void {
  const msg: ReadyMessage = {
    type: 'ready',
  };
  self.postMessage(msg);
}

/**
 * Send result message to master.
 * @param segments - Rendered segments to transfer
 */
function sendResult(segments: RenderSegment[]): void {
  const msg: ResultMessage = {
    type: 'result',
    segments,
  };

  // Transfer ownership of all bitmaps to avoid copying
  const transferables = segments.map((s) => s.bitmap);
  self.postMessage(msg, transferables);
}

/**
 * Send error message to master.
 * @param error - Error to send
 */
function sendError(error: unknown): void {
  const wrapped = wrapError(error);
  const msg: ErrorMessage = {
    type: 'error',
    message: wrapped.message,
    code: wrapped.code,
    context: wrapped.context,
  };
  self.postMessage(msg);
}

/**
 * Extract all required asset IDs from layer descriptors.
 * @param layers - Layer descriptors
 * @returns Set of required asset IDs (excluding negative values which mean no asset)
 */
function extractRequiredAssetIds(layers: LayerDescriptor[]): Set<number> {
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
 * Check if all required assets for the pending batch are available.
 * @returns true if all required assets are registered
 */
function hasAllRequiredAssets(): boolean {
  if (!pendingBatch) return false;

  for (const assetId of pendingBatch.requiredAssetIds) {
    if (!renderSlave.hasAsset(assetId)) {
      return false;
    }
  }
  return true;
}

/**
 * Try to render if we have both a pending batch and all required assets.
 * Called after receiving a batch message or an asset-data message.
 */
async function tryRender(): Promise<void> {
  if (!pendingBatch || !hasAllRequiredAssets()) {
    return;
  }

  // Capture batch info and clear pending state
  const { layers, width, height } = pendingBatch;
  pendingBatch = null;

  try {
    // Render all layers in the batch
    const results = await renderSlave.renderBatch(layers, width, height);

    // Check if we were aborted during rendering
    if (renderSlave.isAborted()) {
      return;
    }

    // Convert to optimized segments with batching
    const segments = await batchSegmentResults(results, width, height);

    // Check abort again after segmentation
    if (renderSlave.isAborted()) {
      return;
    }

    // Send result to master
    sendResult(segments);
  } catch (error) {
    if (!renderSlave.isAborted()) {
      sendError(error);
    }
  }
}

/**
 * Handle asset data message from Asset Manager.
 * @param message - Asset data message
 */
function handleAssetData(message: AssetManagerToSlaveMessage): void {
  if (!isAssetDataMessage(message)) {
    return;
  }

  // Only handle image assets (standard slave doesn't need fonts or meshes)
  if (message.assetType === 'image' && message.data instanceof ImageBitmap) {
    renderSlave.registerAsset(message.id, message.data);

    // Check if this completes our pending batch requirements
    void tryRender();
  }
}

/**
 * Handle init message - probe capabilities and report ready.
 */
function handleInit(): void {
  sendCapabilities();
  sendReady();
}

/**
 * Handle batch message - store batch and try to render if assets are ready.
 * @param layers - Layer descriptors to render
 * @param width - Canvas width
 * @param height - Canvas height
 */
function handleBatch(layers: LayerDescriptor[], width: number, height: number): void {
  // Reset abort flag for new batch
  renderSlave.resetAbort();

  // Extract required asset IDs from the batch
  const requiredAssetIds = extractRequiredAssetIds(layers);

  // Store pending batch
  pendingBatch = { layers, width, height, requiredAssetIds };

  // Try to render immediately if all assets are already available
  void tryRender();
}

/**
 * Handle abort message - cancel current rendering.
 */
function handleAbort(): void {
  renderSlave.abort();
  pendingBatch = null;
}

/**
 * Handle incoming messages from the Master.
 */
self.onmessage = (event: MessageEvent<MasterToSlaveMessage>) => {
  const message = event.data;

  // Check if this is a port transfer for asset manager communication
  // The master sends the asset port via a special init message with transferred port
  const ports = event.ports as readonly (MessagePort | undefined)[];
  if (ports.length > 0 && ports[0]) {
    assetPort = ports[0];
    assetPort.onmessage = (assetEvent: MessageEvent<AssetManagerToSlaveMessage>) => {
      handleAssetData(assetEvent.data);
    };
  }

  try {
    if (isInitMessage(message)) {
      handleInit();
    } else if (isBatchMessage(message)) {
      handleBatch(message.layers, message.width, message.height);
    } else if (isAbortMessage(message)) {
      handleAbort();
    }
  } catch (error) {
    sendError(error);
  }
};

/**
 * Handle worker errors.
 */
self.onerror = (event: string | Event) => {
  if (typeof event === 'string') {
    sendError(new Error(event));
  } else if (event instanceof ErrorEvent) {
    sendError(new Error(event.message || 'Unknown worker error'));
  }
};

/**
 * Handle unhandled promise rejections.
 */
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  sendError(event.reason);
};

/**
 * Cleanup function for worker termination.
 */
function cleanup(): void {
  renderSlave.destroy();
  pendingBatch = null;
  if (assetPort) {
    assetPort.onmessage = null;
    assetPort.close();
    assetPort = null;
  }
}

// Handle beforeunload for cleanup (if supported in worker context)
if (typeof self.onbeforeunload !== 'undefined') {
  self.onbeforeunload = cleanup;
}
