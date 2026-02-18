/**
 * Virtual Text Slave.
 *
 * A main-thread implementation of the text render slave that uses
 * HTMLCanvasElement instead of OffscreenCanvas. This is used as a fallback
 * when OffscreenCanvas or WebGL2 is not available (scenarios B, C, E, F).
 *
 * The virtual slave provides the same MessagePort interface as a real worker,
 * allowing it to be used interchangeably by the RenderMaster.
 *
 * Note: Without WebGL2, some effects (embroidery, foil, normal) will fall back
 * to simpler implementations (typically no-effect).
 */

import { TextRenderSlave } from '../text-render-slave';
import { probeCapabilities } from '../renderer/capability-probe';
import { wrapError } from '../errors';
import { isInitMessage, isBatchMessage, isAbortMessage, isAssetDataMessage } from '../types';

// Import effects for routing
import { processNoEffectLayer } from '../effects/no-effect';
import { processShadowEffectLayer } from '../effects/shadow';
import { processEmbroideryEffectLayer } from '../effects/embroidery';
import { processEngravingEffectLayer } from '../effects/engraving';
import { processHotstampEffectLayer } from '../effects/hotstamp';
import { processMetalEffectLayer } from '../effects/metal';
import { processFoilEffectLayer } from '../effects/foil';
import { processPaintedEffectLayer } from '../effects/painted';
import { processNormalEffectLayer } from '../effects/normal';

import { canvasToImageBitmap, createCanvas, getContext2D } from '../utils/canvas';
import type { AnyCanvas } from '../utils/canvas';
import {
  applyTransformAndDraw,
  hasActiveTransform,
  type TextAlignment,
} from '../text-render-slave/transforms';

import type {
  MasterToSlaveMessage,
  AssetManagerToSlaveMessage,
  CapabilitiesMessage,
  ResultMessage,
  ErrorMessage,
  ReadyMessage,
  SlaveToMasterMessage,
  RenderSegment,
  TextLayerDescriptor,
} from '../types';
import type { VirtualSlavePort, VirtualSlaveOptions } from './types';
import { createVirtualMessageEvent } from './types';

/**
 * Virtual Text Slave class.
 *
 * Implements the same interface as a Worker, but runs in the main thread
 * using HTMLCanvasElement for rendering.
 */
export class VirtualTextSlave implements VirtualSlavePort {
  /** Internal text render slave instance */
  private textRenderSlave: TextRenderSlave;

  /** Message handler */
  onmessage: ((event: MessageEvent<SlaveToMasterMessage>) => void) | null = null;

  /** Error handler */
  onerror: ((event: ErrorEvent | Event) => void) | null = null;

  /** Event listeners */
  private messageListeners = new Set<(event: MessageEvent<SlaveToMasterMessage>) => void>();

  /** Whether to defer message handling */
  private deferMessages: boolean;

  /** Whether the slave has been terminated */
  private terminated = false;

  /** WebGL2 availability (cached for effect routing) */
  private hasWebGL2 = false;

  constructor(options: VirtualSlaveOptions = {}) {
    this.deferMessages = options.deferMessages ?? true;
    this.textRenderSlave = new TextRenderSlave();
  }

  /**
   * Post a message to the virtual slave.
   * Emulates Worker.postMessage() behavior.
   *
   * @param message - Message to handle
   * @param transfer - Transferable objects (ports are extracted, others ignored)
   */
  postMessage(message: MasterToSlaveMessage, transfer?: Transferable[]): void {
    if (this.terminated) {
      return;
    }

    // Extract ports from transfer array (if present)
    const ports: MessagePort[] = [];
    if (transfer) {
      for (const item of transfer) {
        if (item instanceof MessagePort) {
          ports.push(item);
        }
      }
    }

    // Handle the message (optionally deferred)
    if (this.deferMessages) {
      queueMicrotask(() => {
        this.handleMessage(message, ports);
      });
    } else {
      this.handleMessage(message, ports);
    }
  }

  /**
   * Handle an incoming message.
   *
   * @param message - The message to handle
   * @param ports - Any MessagePorts transferred with the message
   */
  private handleMessage(message: MasterToSlaveMessage, ports: MessagePort[]): void {
    if (this.terminated) {
      return;
    }

    // Set up asset port handler if port was transferred
    if (ports.length > 0) {
      const assetPort = ports[0];
      assetPort.onmessage = (event: MessageEvent<AssetManagerToSlaveMessage>) => {
        this.handleAssetData(event.data);
      };
    }

    try {
      if (isInitMessage(message)) {
        this.handleInit();
      } else if (isBatchMessage(message)) {
        // Handle async batch rendering - layers are TextLayerDescriptor for text slave
        void this.handleBatch(
          message.layers as unknown as TextLayerDescriptor[],
          message.indices,
          message.width,
          message.height
        );
      } else if (isAbortMessage(message)) {
        this.handleAbort();
      }
    } catch (error) {
      this.sendError(error);
    }
  }

  /**
   * Handle asset data from Asset Manager.
   */
  private handleAssetData(message: AssetManagerToSlaveMessage): void {
    if (this.terminated) {
      return;
    }

    if (!isAssetDataMessage(message)) {
      return;
    }

    // Handle different asset types
    if (message.assetType === 'image') {
      // Asset data for images is always ImageBitmap after decoding
      this.textRenderSlave.registerAsset(message.id, message.data as ImageBitmap);
    } else if (message.assetType === 'font') {
      // Asset data for fonts is always ArrayBuffer
      // Register font with generated family name
      this.textRenderSlave.registerFont(
        message.id,
        `font-${String(message.id)}`,
        message.data as ArrayBuffer
      );
    }
  }

  /**
   * Handle init message - probe capabilities and report ready.
   */
  private handleInit(): void {
    // Probe capabilities and cache WebGL2 availability
    const capabilities = probeCapabilities();
    this.hasWebGL2 = capabilities.webgl2;

    this.sendCapabilities();
    this.sendReady();
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
  private applyEffect(
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
      const asset = this.textRenderSlave.getAsset(textureId);
      if (asset instanceof ImageBitmap) {
        texture = asset;
      }
    }

    // Route to appropriate effect handler
    switch (effect) {
      case 'shadow':
        return processShadowEffectLayer(layer, width, height, rasterizedMask);

      case 'embroidery':
        if (!this.hasWebGL2) {
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
        if (!this.hasWebGL2) {
          // Fall back to no-effect without WebGL2 (foil uses alpha erode)
          console.warn('WebGL2 not available, falling back to no-effect for foil');
          return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
        }
        return processFoilEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

      case 'painted':
        return processPaintedEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

      case 'normal':
        if (!this.hasWebGL2) {
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
   * @param layer - Text layer descriptor
   * @param width - Canvas width
   * @param height - Canvas height
   * @param index - Layer index
   * @returns Rendered bitmap result or null if aborted/failed
   */
  private async renderTextLayer(
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
    if (this.textRenderSlave.isAborted() || this.terminated) {
      return null;
    }

    const maskData = layer.maskData;

    // Step 1: Load font if specified and not yet loaded
    const fontId = layer.assetIds.font;
    if (fontId !== undefined && this.textRenderSlave.hasFont(fontId)) {
      await this.textRenderSlave.loadFont(fontId);
    }

    // Step 2: Rasterize text
    const rasterized = this.textRenderSlave.rasterizeText(maskData, width, height);

    // Check abort again after potentially slow operation
    // (state may change during async operations - disable lint)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.textRenderSlave.isAborted() || this.terminated) {
      return null;
    }

    // Step 3: Apply effect
    const effectCanvas = this.applyEffect(
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.textRenderSlave.isAborted() || this.terminated) {
      return null;
    }

    // Step 4: Create output canvas and apply transforms
    const outputCanvas = createCanvas(width, height, false); // Prefer HTMLCanvas
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
      const postMaskAsset = this.textRenderSlave.getAsset(postmaskId);
      // Post-mask must be an ImageBitmap (not ArrayBuffer font data)
      if (postMaskAsset && 'width' in postMaskAsset) {
        outputCtx.globalCompositeOperation = 'destination-in';
        outputCtx.globalAlpha = 1.0;
        outputCtx.drawImage(postMaskAsset, 0, 0, width, height);
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
   */
  private async handleBatch(
    layers: TextLayerDescriptor[],
    indices: number[],
    width: number,
    height: number
  ): Promise<void> {
    if (this.terminated) {
      return;
    }

    try {
      // Reset abort flag for new batch
      this.textRenderSlave.resetAbort();

      const results: RenderSegment[] = [];

      for (let i = 0; i < layers.length; i++) {
        // Check for abort between layers (state may change during async - disable lint)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this.textRenderSlave.isAborted() || this.terminated) {
          break;
        }

        // Use original index from indices array for correct composition ordering
        const originalIndex = indices[i] ?? i;
        const result = await this.renderTextLayer(layers[i], width, height, originalIndex);
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.textRenderSlave.isAborted() || this.terminated) {
        return;
      }

      // Send result
      this.sendResult(results);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!this.textRenderSlave.isAborted() && !this.terminated) {
        this.sendError(error);
      }
    }
  }

  /**
   * Handle abort message - cancel current rendering.
   */
  private handleAbort(): void {
    this.textRenderSlave.abort();
  }

  /**
   * Send capabilities message.
   */
  private sendCapabilities(): void {
    const capabilities = probeCapabilities();
    const msg: CapabilitiesMessage = {
      type: 'capabilities',
      offscreenCanvas: capabilities.offscreenCanvas,
      webgl2: capabilities.webgl2,
    };
    this.dispatchMessage(msg);
  }

  /**
   * Send ready message.
   */
  private sendReady(): void {
    const msg: ReadyMessage = {
      type: 'ready',
    };
    this.dispatchMessage(msg);
  }

  /**
   * Send result message.
   */
  private sendResult(segments: RenderSegment[]): void {
    const msg: ResultMessage = {
      type: 'result',
      segments,
    };
    this.dispatchMessage(msg);
  }

  /**
   * Send error message.
   */
  private sendError(error: unknown): void {
    const wrapped = wrapError(error);
    const msg: ErrorMessage = {
      type: 'error',
      message: wrapped.message,
      code: wrapped.code,
      context: wrapped.context,
    };
    this.dispatchMessage(msg);
  }

  /**
   * Dispatch a message to listeners.
   */
  private dispatchMessage(message: SlaveToMasterMessage): void {
    if (this.terminated) {
      return;
    }

    const event = createVirtualMessageEvent(message);

    // Call onmessage handler
    if (this.onmessage) {
      if (this.deferMessages) {
        queueMicrotask(() => {
          this.onmessage?.(event);
        });
      } else {
        this.onmessage(event);
      }
    }

    // Call registered listeners
    for (const listener of this.messageListeners) {
      if (this.deferMessages) {
        queueMicrotask(() => {
          listener(event);
        });
      } else {
        listener(event);
      }
    }
  }

  /**
   * Add an event listener.
   */
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SlaveToMasterMessage>) => void
  ): void {
    // Only 'message' event type is supported
    void type;
    this.messageListeners.add(listener);
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<SlaveToMasterMessage>) => void
  ): void {
    // Only 'message' event type is supported
    void type;
    this.messageListeners.delete(listener);
  }

  /**
   * Terminate the virtual slave and release resources.
   */
  terminate(): void {
    if (this.terminated) {
      return;
    }

    this.terminated = true;
    this.textRenderSlave.abort();
    this.textRenderSlave.destroy();
    this.onmessage = null;
    this.onerror = null;
    this.messageListeners.clear();
  }

  /**
   * Check if the virtual slave has been terminated.
   */
  isTerminated(): boolean {
    return this.terminated;
  }

  /**
   * Directly register an image asset (bypasses MessagePort).
   * Useful for testing or when not using Asset Manager.
   *
   * @param id - Asset ID
   * @param bitmap - Asset ImageBitmap
   */
  registerAssetDirect(id: number, bitmap: ImageBitmap): void {
    if (!this.terminated) {
      this.textRenderSlave.registerAsset(id, bitmap);
    }
  }

  /**
   * Directly register a font asset (bypasses MessagePort).
   * Useful for testing or when not using Asset Manager.
   *
   * @param id - Asset ID
   * @param family - Font family name
   * @param data - Font data as ArrayBuffer
   */
  registerFontDirect(id: number, family: string, data: ArrayBuffer): void {
    if (!this.terminated) {
      this.textRenderSlave.registerFont(id, family, data);
    }
  }
}
