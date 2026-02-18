/**
 * Virtual Standard Slave.
 *
 * A main-thread implementation of the standard render slave that uses
 * HTMLCanvasElement instead of OffscreenCanvas. This is used as a fallback
 * when OffscreenCanvas is not available (scenarios C and F).
 *
 * The virtual slave provides the same MessagePort interface as a real worker,
 * allowing it to be used interchangeably by the RenderMaster.
 */

import { RenderSlave } from '../render-slave';
import { batchSegmentResults } from '../render-slave/batch-segmenter';
import { probeCapabilities } from '../renderer/capability-probe';
import { wrapError } from '../errors';
import {
  isInitMessage,
  isBatchMessage,
  isAbortMessage,
  isAssetDataMessage,
  isPrepareAssetsMessage,
} from '../types';
import type {
  MasterToSlaveMessage,
  AssetManagerToSlaveMessage,
  CapabilitiesMessage,
  ResultMessage,
  ErrorMessage,
  ReadyMessage,
  AssetsReadyMessage,
  SlaveToMasterMessage,
  RenderSegment,
  LayerDescriptor,
  PrepareAssetsMessage,
} from '../types';
import type { VirtualSlavePort, VirtualSlaveOptions } from './types';
import { createVirtualMessageEvent } from './types';

/**
 * Virtual Standard Slave class.
 *
 * Implements the same interface as a Worker, but runs in the main thread
 * using HTMLCanvasElement for rendering.
 */
export class VirtualStandardSlave implements VirtualSlavePort {
  /** Internal render slave instance */
  private renderSlave: RenderSlave;

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

  /** Asset synchronization tracking */
  private expectedAssetCount = 0;
  private expectedAssetIds = new Set<number>();
  private receivedAssetIds = new Set<number>();
  private assetsReadySent = false;

  constructor(options: VirtualSlaveOptions = {}) {
    this.deferMessages = options.deferMessages ?? true;
    this.renderSlave = new RenderSlave();
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
      } else if (isPrepareAssetsMessage(message)) {
        this.handlePrepareAssets(message);
      } else if (isBatchMessage(message)) {
        // Handle async batch rendering
        void this.handleBatch(message.layers, message.width, message.height);
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

    // Only handle image assets (standard slave doesn't need fonts or meshes)
    if (message.assetType === 'image') {
      // Asset data for images is always ImageBitmap after decoding
      this.renderSlave.registerAsset(message.id, message.data as ImageBitmap);

      // Track received assets for synchronization
      if (this.expectedAssetIds.has(message.id)) {
        this.receivedAssetIds.add(message.id);

        // Check if all expected assets have been received
        if (!this.assetsReadySent && this.receivedAssetIds.size === this.expectedAssetCount) {
          this.assetsReadySent = true;
          this.sendAssetsReady();
        }
      }
    }
  }

  /**
   * Handle prepare-assets message from Master.
   * Sets up tracking for expected assets and sends ready immediately if count is zero.
   */
  private handlePrepareAssets(message: PrepareAssetsMessage): void {
    this.expectedAssetCount = message.expectedCount;
    this.expectedAssetIds = new Set(message.assetIds);
    this.receivedAssetIds.clear();
    this.assetsReadySent = false;

    // If expecting zero assets, immediately signal ready
    if (this.expectedAssetCount === 0) {
      this.assetsReadySent = true;
      this.sendAssetsReady();
    }
  }

  /**
   * Handle init message - probe capabilities and report ready.
   */
  private handleInit(): void {
    this.sendCapabilities();
    this.sendReady();
  }

  /**
   * Handle batch message - render all layers and return segments.
   */
  private async handleBatch(
    layers: LayerDescriptor[],
    width: number,
    height: number
  ): Promise<void> {
    if (this.terminated) {
      return;
    }

    try {
      // Render all layers in the batch
      const results = await this.renderSlave.renderBatch(layers, width, height);

      // Check if we were aborted during async rendering
      // (state may change during await - disable lint)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.renderSlave.isAborted() || this.terminated) {
        return;
      }

      // Convert to optimized segments with batching
      const segments = await batchSegmentResults(results, width, height);

      // Check abort again after async segmentation
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.renderSlave.isAborted() || this.terminated) {
        return;
      }

      // Send result
      this.sendResult(segments);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!this.renderSlave.isAborted() && !this.terminated) {
        this.sendError(error);
      }
    }
  }

  /**
   * Handle abort message - cancel current rendering.
   */
  private handleAbort(): void {
    this.renderSlave.abort();
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
   * Send assets-ready message.
   * Indicates that all expected assets have been received.
   */
  private sendAssetsReady(): void {
    const msg: AssetsReadyMessage = {
      type: 'assets-ready',
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
    this.renderSlave.abort();
    this.renderSlave.destroy();
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
   * Directly register an asset (bypasses MessagePort).
   * Useful for testing or when not using Asset Manager.
   *
   * @param id - Asset ID
   * @param bitmap - Asset ImageBitmap
   */
  registerAssetDirect(id: number, bitmap: ImageBitmap): void {
    if (!this.terminated) {
      this.renderSlave.registerAsset(id, bitmap);
    }
  }
}
