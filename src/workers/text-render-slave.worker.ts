/**
 * Text Render Slave Worker Entry Point.
 *
 * This worker handles text/effect layer rendering (layers with PimcoMaskSubstitutionCompiled masks).
 * It receives assets (images, fonts) from the Asset Manager via a MessagePort and renders
 * batches of text layers using the text rasterization and effects pipeline.
 *
 * Message Protocol:
 * - init: Initialize the worker and report capabilities
 * - batch: Render a batch of text layers
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
 *
 * Capability Requirements:
 * - WebGL2 is required for full effect support (embroidery, engraving, etc.)
 * - Without WebGL2, only basic effects (no-effect, simple color) will work
 */

import { TextRenderSlave } from '../js/text-render-slave';
import { createTextBatchCoordinator, type PendingBatch } from '../js/text-render-slave/batch-coordinator';
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
  TextLayerDescriptor,
} from '../js/types';

// Import effects for routing
import { processNoEffectLayer } from '../js/effects/no-effect';
import { processShadowEffectLayer } from '../js/effects/shadow';
import { processEmbroideryEffectLayer } from '../js/effects/embroidery';
import { processEngravingEffectLayer } from '../js/effects/engraving';
import { processHotstampEffectLayer } from '../js/effects/hotstamp';
import { processMetalEffectLayer } from '../js/effects/metal';
import { processFoilEffectLayer } from '../js/effects/foil';
import { processPaintedEffectLayer } from '../js/effects/painted';
import { processNormalEffectLayer } from '../js/effects/normal';

import { canvasToImageBitmap, createCanvas, getContext2D } from '../js/utils/canvas';
import type { AnyCanvas } from '../js/utils/canvas';
import {
  applyTransformAndDraw,
  hasActiveTransform,
  type TextAlignment,
} from '../js/text-render-slave/transforms';

// Create the text render slave instance
const textRenderSlave = new TextRenderSlave();

// Track the asset manager port for receiving assets
let assetPort: MessagePort | null = null;

// Track capabilities for effect routing
let hasWebGL2 = false;

// Create batch coordinator with render callback
const batchCoordinator = createTextBatchCoordinator(
  textRenderSlave,
  (batch) => void executeRender(batch)
);

/**
 * Send capabilities message to master.
 */
function sendCapabilities(): void {
  const capabilities = probeCapabilities();
  hasWebGL2 = capabilities.webgl2;

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

  // Handle different asset types
  if (message.assetType === 'image' && message.data instanceof ImageBitmap) {
    textRenderSlave.registerAsset(message.id, message.data);
  } else if (message.assetType === 'font' && message.data instanceof ArrayBuffer) {
    textRenderSlave.registerFont(message.id, `font-${String(message.id)}`, message.data);
  }

  // Notify coordinator that an asset was received
  batchCoordinator.handleAssetReceived();
}

/**
 * Handle init message - probe capabilities and report ready.
 */
function handleInit(): void {
  sendCapabilities();
  sendReady();
}

/**
 * Apply effect to a rasterized text mask based on the effect type.
 */
function applyEffect(
  layer: TextLayerDescriptor,
  rasterizedMask: AnyCanvas,
  textHeight: number,
  width: number,
  height: number
): AnyCanvas | null {
  const effect = layer.maskData.effect;

  // Get texture if available
  const textureId = layer.assetIds.texture;
  let texture: ImageBitmap | undefined;
  if (textureId !== undefined) {
    const asset = textRenderSlave.getAsset(textureId);
    if (asset instanceof ImageBitmap) {
      texture = asset;
    }
  }

  // Route to appropriate effect handler
  switch (effect) {
    case 'shadow':
      return processShadowEffectLayer(layer, width, height, rasterizedMask);

    case 'embroidery':
      if (!hasWebGL2) {
        console.warn('WebGL2 not available, falling back to no-effect for embroidery');
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processEmbroideryEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'engraving':
      return processEngravingEffectLayer(layer, width, height, rasterizedMask, textHeight);

    case 'hotstamp':
      return processHotstampEffectLayer(layer, width, height, rasterizedMask, textHeight);

    case 'metal':
      return processMetalEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'foil':
      if (!hasWebGL2) {
        console.warn('WebGL2 not available, falling back to no-effect for foil');
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processFoilEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'painted':
      return processPaintedEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'normal':
      if (!hasWebGL2) {
        console.warn('WebGL2 not available, falling back to no-effect for normal');
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processNormalEffectLayer(layer, width, height, rasterizedMask, texture);

    default:
      return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
  }
}

/**
 * Render a single text layer with full pipeline.
 */
async function renderTextLayer(
  layer: TextLayerDescriptor,
  width: number,
  height: number,
  index: number
): Promise<{
  bitmap: ImageBitmap;
  index: number;
  compositemode: string;
  compositealpha: number;
} | null> {
  if (textRenderSlave.isAborted()) {
    return null;
  }

  const maskData = layer.maskData;

  // Step 1: Load font if specified and not yet loaded
  const fontId = layer.assetIds.font;
  if (fontId !== undefined && textRenderSlave.hasFont(fontId)) {
    await textRenderSlave.loadFont(fontId);
  }

  // Step 2: Rasterize text
  const rasterized = textRenderSlave.rasterizeText(maskData, width, height);

  if (textRenderSlave.isAborted()) {
    return null;
  }

  // Step 3: Apply effect
  const effectCanvas = applyEffect(
    layer,
    rasterized.canvas,
    rasterized.measurement.height,
    width,
    height
  );

  if (!effectCanvas) {
    console.warn(`Effect application failed for layer ${layer.id}`);
    return null;
  }

  if (textRenderSlave.isAborted()) {
    return null;
  }

  // Step 4: Create output canvas and apply transforms
  const outputCanvas = createCanvas(width, height);
  const outputCtx = getContext2D(outputCanvas);

  if (!outputCtx) {
    throw new Error('Failed to create output context');
  }

  const alignment: TextAlignment = maskData.type?.alignment ?? 'center';

  if (hasActiveTransform(maskData.transform)) {
    applyTransformAndDraw(outputCtx, effectCanvas, maskData.transform, width, height, alignment);
  } else {
    outputCtx.drawImage(effectCanvas, 0, 0);
  }

  // Step 5: Apply post-mask if present
  const postmaskId = layer.assetIds.postmask;
  if (postmaskId !== undefined) {
    const postMask = textRenderSlave.getAsset(postmaskId);
    if (postMask instanceof ImageBitmap) {
      outputCtx.globalCompositeOperation = 'destination-in';
      outputCtx.globalAlpha = 1.0;
      outputCtx.drawImage(postMask, 0, 0, width, height);
      outputCtx.globalCompositeOperation = 'source-over';
    }
  }

  const bitmap = await canvasToImageBitmap(outputCanvas);

  return {
    bitmap,
    index,
    compositemode: layer.compositemode,
    compositealpha: layer.compositealpha,
  };
}

/**
 * Handle batch message - render all text layers and return segments.
 * @param layers - Text layer descriptors to render
 * @param indices - Original layer indices for ordering
 * @param width - Canvas width
 * @param height - Canvas height
 */
async function handleBatch(
  layers: TextLayerDescriptor[],
  indices: number[],
  width: number,
  height: number
): Promise<void> {
  try {
    // Reset abort flag for new batch
    textRenderSlave.resetAbort();

  try {
    const results: RenderSegment[] = [];

    for (let i = 0; i < layers.length; i++) {
      if (textRenderSlave.isAborted()) {
        break;
      }

      // Use original index from indices array for correct composition ordering
      const originalIndex = indices[i] ?? i;
      const result = await renderTextLayer(layers[i], width, height, originalIndex);
      if (result) {
        // Text slaves don't batch layers, so each layer is its own segment
        // with orderIndex set to the original layer index
        results.push({
          bitmap: result.bitmap,
          compositemode: result.compositemode as RenderSegment['compositemode'],
          compositealpha: result.compositealpha,
          orderIndex: originalIndex,
        });
      }
    }

    if (textRenderSlave.isAborted()) {
      return;
    }

    sendResult(results);
  } catch (error) {
    if (!textRenderSlave.isAborted()) {
      sendError(error);
    }
  }
}

/**
 * Handle batch message - delegate to coordinator.
 */
function handleBatch(layers: TextLayerDescriptor[], width: number, height: number): void {
  textRenderSlave.resetAbort();
  batchCoordinator.handleBatch(layers, width, height);
}

/**
 * Handle abort message - cancel current rendering.
 */
function handleAbort(): void {
  textRenderSlave.abort();
  batchCoordinator.clear();
}

/**
 * Handle incoming messages from the Master.
 */
self.onmessage = (event: MessageEvent<MasterToSlaveMessage>) => {
  const message = event.data;

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
      // The batch message contains layers, but for text slaves these should be TextLayerDescriptors
      // The master is responsible for routing the correct layer type to the correct slave
      await handleBatch(
        message.layers as unknown as TextLayerDescriptor[],
        message.indices,
        message.width,
        message.height
      );
    } else if (isAbortMessage(message)) {
      handleAbort();
    }
  } catch (error) {
    sendError(error);
  }
};

self.onerror = (event: string | Event) => {
  if (typeof event === 'string') {
    sendError(new Error(event));
  } else if (event instanceof ErrorEvent) {
    sendError(new Error(event.message || 'Unknown worker error'));
  }
};

self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  sendError(event.reason);
};

function cleanup(): void {
  textRenderSlave.destroy();
  batchCoordinator.clear();
  if (assetPort) {
    assetPort.onmessage = null;
    assetPort.close();
    assetPort = null;
  }
}

if (typeof self.onbeforeunload !== 'undefined') {
  self.onbeforeunload = cleanup;
}
