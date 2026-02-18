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
 * Capability Requirements:
 * - WebGL2 is required for full effect support (embroidery, engraving, etc.)
 * - Without WebGL2, only basic effects (no-effect, simple color) will work
 */

import { TextRenderSlave } from '../js/text-render-slave';
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
    // For fonts, we need the family name which should be passed in the message
    // For now, use a placeholder - in production, extend the message protocol
    // to include font family information
    textRenderSlave.registerFont(message.id, `font-${String(message.id)}`, message.data);
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
 * Apply effect to a rasterized text mask based on the effect type.
 *
 * @param layer - Text layer descriptor
 * @param rasterizedMask - Rasterized text canvas
 * @param textHeight - Height of the rasterized text (for emboss threshold)
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Canvas with effect applied, or null on failure
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
        // Fall back to no-effect without WebGL2
        console.warn('WebGL2 not available, falling back to no-effect for embroidery');
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processEmbroideryEffectLayer(
        layer,
        width,
        height,
        rasterizedMask,
        textHeight,
        texture
      );

    case 'engraving':
      return processEngravingEffectLayer(layer, width, height, rasterizedMask, textHeight);

    case 'hotstamp':
      return processHotstampEffectLayer(layer, width, height, rasterizedMask, textHeight);

    case 'metal':
      return processMetalEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'foil':
      if (!hasWebGL2) {
        // Fall back to no-effect without WebGL2 (foil uses alpha erode)
        console.warn('WebGL2 not available, falling back to no-effect for foil');
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processFoilEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'painted':
      return processPaintedEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

    case 'normal':
      if (!hasWebGL2) {
        // Fall back to no-effect without WebGL2 (normal uses colorScale and normalMap)
        console.warn('WebGL2 not available, falling back to no-effect for normal');
        return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
      }
      return processNormalEffectLayer(layer, width, height, rasterizedMask, texture);

    default:
      // No effect or unrecognized effect - use no-effect pipeline
      return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
  }
}

/**
 * Render a single text layer with full pipeline.
 *
 * Pipeline:
 * 1. Load fonts if needed
 * 2. Rasterize text content
 * 3. Apply effect (based on mask.effect)
 * 4. Apply 2D transforms (translation, rotation, scale)
 * 5. Apply post-mask (destination-in composite)
 *
 * @param layer - Text layer descriptor
 * @param width - Canvas width
 * @param height - Canvas height
 * @param index - Layer index
 * @returns Rendered bitmap result or null if aborted/failed
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
  // Check for abort
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

  // Check abort again after potentially slow operation
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

  // Check abort again
  if (textRenderSlave.isAborted()) {
    return null;
  }

  // Step 4: Create output canvas and apply transforms
  const outputCanvas = createCanvas(width, height);
  const outputCtx = getContext2D(outputCanvas);

  if (!outputCtx) {
    throw new Error('Failed to create output context');
  }

  // Get text alignment for transform origin calculation
  const alignment: TextAlignment = maskData.type?.alignment ?? 'center';

  // Apply transforms and draw
  if (hasActiveTransform(maskData.transform)) {
    // Use transform-based drawing
    applyTransformAndDraw(outputCtx, effectCanvas, maskData.transform, width, height, alignment);
  } else {
    // No transforms: draw at origin (effect canvas is already full-size)
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

    const results: RenderSegment[] = [];

    for (let i = 0; i < layers.length; i++) {
      // Check for abort between layers
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

    // Check if we were aborted during rendering
    if (textRenderSlave.isAborted()) {
      // Don't send result if aborted
      return;
    }

    // Send result to master
    sendResult(results);
  } catch (error) {
    if (!textRenderSlave.isAborted()) {
      sendError(error);
    }
  }
}

/**
 * Handle abort message - cancel current rendering.
 */
function handleAbort(): void {
  textRenderSlave.abort();
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
 * Note: This is called when the worker is about to be terminated via Worker.terminate().
 * In practice, the browser handles memory cleanup, but we do explicit cleanup for
 * orderly shutdown and to support testing scenarios.
 */
function cleanup(): void {
  textRenderSlave.destroy();
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
