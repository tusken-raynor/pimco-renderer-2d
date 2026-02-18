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
 * Synchronization:
 * The slave waits until both conditions are met before rendering:
 * 1. A batch message has been received from the master
 * 2. All assets referenced in the batch (non-negative IDs) have been received
 * Either the batch arrival or an asset arrival can trigger rendering.
 *
 * Note: Without WebGL2, some effects (embroidery, foil, normal) will fall back
 * to simpler implementations (typically no-effect).
 */

import { TextRenderSlave } from '../text-render-slave';
import { createTextBatchCoordinator, type PendingBatch } from '../text-render-slave/batch-coordinator';
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

  /** Batch coordinator for synchronizing batch and asset arrival */
  private batchCoordinator;

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

    // Create batch coordinator with render callback
    this.batchCoordinator = createTextBatchCoordinator(
      this.textRenderSlave,
      (batch) => void this.executeRender(batch)
    );
  }

  /**
   * Post a message to the virtual slave.
   * Emulates Worker.postMessage() behavior.
   */
  postMessage(message: MasterToSlaveMessage, transfer?: Transferable[]): void {
    if (this.terminated) {
      return;
    }

    const ports: MessagePort[] = [];
    if (transfer) {
      for (const item of transfer) {
        if (item instanceof MessagePort) {
          ports.push(item);
        }
      }
    }

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
   */
  private handleMessage(message: MasterToSlaveMessage, ports: MessagePort[]): void {
    if (this.terminated) {
      return;
    }

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
        this.handleBatch(
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

    if (message.assetType === 'image') {
      this.textRenderSlave.registerAsset(message.id, message.data as ImageBitmap);
    } else if (message.assetType === 'font') {
      this.textRenderSlave.registerFont(
        message.id,
        `font-${String(message.id)}`,
        message.data as ArrayBuffer
      );
    }

    // Notify coordinator that an asset was received
    this.batchCoordinator.handleAssetReceived();
  }

  /**
   * Handle init message - probe capabilities and report ready.
   */
  private handleInit(): void {
    const capabilities = probeCapabilities();
    this.hasWebGL2 = capabilities.webgl2;

    this.sendCapabilities();
    this.sendReady();
  }

  /**
   * Handle batch message - delegate to coordinator.
   */
  private handleBatch(
    layers: TextLayerDescriptor[],
    width: number,
    height: number
  ): void {
    this.textRenderSlave.resetAbort();
    this.batchCoordinator.handleBatch(layers, width, height);
  }

  /**
   * Apply effect to a rasterized text mask based on the effect type.
   */
  private applyEffect(
    layer: TextLayerDescriptor,
    rasterizedMask: AnyCanvas,
    textHeight: number,
    width: number,
    height: number
  ): AnyCanvas | null {
    const effect = layer.maskData.effect;

    const textureId = layer.assetIds.texture;
    let texture: ImageBitmap | undefined;
    if (textureId !== undefined) {
      const asset = this.textRenderSlave.getAsset(textureId);
      if (asset instanceof ImageBitmap) {
        texture = asset;
      }
    }

    switch (effect) {
      case 'shadow':
        return processShadowEffectLayer(layer, width, height, rasterizedMask);

      case 'embroidery':
        if (!this.hasWebGL2) {
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
          console.warn('WebGL2 not available, falling back to no-effect for foil');
          return processNoEffectLayer(layer, width, height, rasterizedMask, texture);
        }
        return processFoilEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

      case 'painted':
        return processPaintedEffectLayer(layer, width, height, rasterizedMask, textHeight, texture);

      case 'normal':
        if (!this.hasWebGL2) {
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.textRenderSlave.isAborted() || this.terminated) {
      return null;
    }

    const maskData = layer.maskData;

    const fontId = layer.assetIds.font;
    if (fontId !== undefined && this.textRenderSlave.hasFont(fontId)) {
      await this.textRenderSlave.loadFont(fontId);
    }

    const rasterized = this.textRenderSlave.rasterizeText(maskData, width, height);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.textRenderSlave.isAborted() || this.terminated) {
      return null;
    }

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

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.textRenderSlave.isAborted() || this.terminated) {
      return null;
    }

    const outputCanvas = createCanvas(width, height, false);
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

    const postmaskId = layer.assetIds.postmask;
    if (postmaskId !== undefined) {
      const postMask = this.textRenderSlave.getAsset(postmaskId);
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
   * Execute rendering when batch and assets are ready.
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

    const { layers, width, height } = batch;

    try {
      const results: RenderSegment[] = [];

      for (let i = 0; i < layers.length; i++) {
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

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.textRenderSlave.isAborted() || this.terminated) {
        return;
      }

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
    this.batchCoordinator.clear();
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

    if (this.onmessage) {
      if (this.deferMessages) {
        queueMicrotask(() => {
          this.onmessage?.(event);
        });
      } else {
        this.onmessage(event);
      }
    }

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
    this.batchCoordinator.clear();
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
   */
  registerAssetDirect(id: number, bitmap: ImageBitmap): void {
    if (!this.terminated) {
      this.textRenderSlave.registerAsset(id, bitmap);
    }
  }

  /**
   * Directly register a font asset (bypasses MessagePort).
   */
  registerFontDirect(id: number, family: string, data: ArrayBuffer): void {
    if (!this.terminated) {
      this.textRenderSlave.registerFont(id, family, data);
    }
  }
}
