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
 */

import { RenderSlave } from '../js/render-slave';
import { batchSegmentResults } from '../js/render-slave/batch-segmenter';
import { probeCapabilities } from '../js/renderer/capability-probe';
import { wrapError } from '../js/errors';
import {
  isInitMessage,
  isBatchMessage,
  isAbortMessage,
  isAssetDataMessage,
} from '../js/types';
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
 * Handle batch message - render all layers and return segments.
 * @param layers - Layer descriptors to render
 * @param width - Canvas width
 * @param height - Canvas height
 */
async function handleBatch(
  layers: LayerDescriptor[],
  width: number,
  height: number
): Promise<void> {
  try {
    // Render all layers in the batch
    const results = await renderSlave.renderBatch(layers, width, height);

    // Check if we were aborted during rendering
    if (renderSlave.isAborted()) {
      // Don't send result if aborted
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
 * Handle abort message - cancel current rendering.
 */
function handleAbort(): void {
  renderSlave.abort();
}

/**
 * Handle incoming messages from the Master.
 */
self.onmessage = async (event: MessageEvent<MasterToSlaveMessage>) => {
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
      await handleBatch(message.layers, message.width, message.height);
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
