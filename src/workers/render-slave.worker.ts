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
import { createStandardBatchCoordinator, type PendingBatch } from '../js/render-slave/batch-coordinator';
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

// Create batch coordinator with render callback
const batchCoordinator = createStandardBatchCoordinator(
  renderSlave,
  (batch) => void executeRender(batch)
);

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
 * Execute rendering when batch and assets are ready.
 * @param batch - Pending batch with all required assets available
 */
async function executeRender(batch: PendingBatch<LayerDescriptor>): Promise<void> {
  const { layers, width, height } = batch;

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

    // Notify coordinator that an asset was received
    batchCoordinator.handleAssetReceived();
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
 * Handle batch message - delegate to coordinator.
 * @param layers - Layer descriptors to render
 * @param width - Canvas width
 * @param height - Canvas height
 */
function handleBatch(layers: LayerDescriptor[], width: number, height: number): void {
  // Reset abort flag for new batch
  renderSlave.resetAbort();

  // Delegate to coordinator
  batchCoordinator.handleBatch(layers, width, height);
}

/**
 * Handle abort message - cancel current rendering.
 */
function handleAbort(): void {
  renderSlave.abort();
  batchCoordinator.clear();
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
  batchCoordinator.clear();
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
