/**
 * Virtual Standard Slave.
 *
 * A main-thread implementation of the standard render slave that uses
 * HTMLCanvasElement instead of OffscreenCanvas. This is used as a fallback
 * when OffscreenCanvas is not available (scenarios C and F).
 *
 * The virtual slave provides the same MessagePort interface as a real worker,
 * allowing it to be used interchangeably by the RenderMaster.
 *
 * Synchronization:
 * The slave waits until both conditions are met before rendering:
 * 1. A batch message has been received from the master
 * 2. All assets referenced in the batch (non-negative IDs) have been received
 * Either the batch arrival or an asset arrival can trigger rendering.
 */

import { RenderSlave } from '../render-slave';
import { batchSegmentResults } from '../render-slave/batch-segmenter';
import { createStandardBatchCoordinator, type PendingBatch } from '../render-slave/batch-coordinator';
import { probeCapabilities } from '../renderer/capability-probe';
import { wrapError } from '../errors';
import { isInitMessage, isBatchMessage, isAbortMessage, isAssetDataMessage } from '../types';
import type {
  MasterToSlaveMessage,
  AssetManagerToSlaveMessage,
  CapabilitiesMessage,
  ResultMessage,
  ErrorMessage,
  ReadyMessage,
  SlaveToMasterMessage,
  RenderSegment,
  LayerDescriptor,
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

  constructor(options: VirtualSlaveOptions = {}) {
    this.deferMessages = options.deferMessages ?? true;
    this.renderSlave = new RenderSlave();

    // Create batch coordinator with render callback
    this.batchCoordinator = createStandardBatchCoordinator(
      this.renderSlave,
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
        this.handleBatch(message.layers, message.width, message.height);
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
      this.renderSlave.registerAsset(message.id, message.data as ImageBitmap);

      // Notify coordinator that an asset was received
      this.batchCoordinator.handleAssetReceived();
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
   * Handle batch message - delegate to coordinator.
   */
  private handleBatch(layers: LayerDescriptor[], width: number, height: number): void {
    this.renderSlave.resetAbort();
    this.batchCoordinator.handleBatch(layers, width, height);
  }

  /**
   * Execute rendering when batch and assets are ready.
   */
  private async executeRender(batch: PendingBatch<LayerDescriptor>): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.terminated) {
      return;
    }

    const { layers, width, height } = batch;

    try {
      const results = await this.renderSlave.renderBatch(layers, width, height);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.renderSlave.isAborted() || this.terminated) {
        return;
      }

      const segments = await batchSegmentResults(results, width, height);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (this.renderSlave.isAborted() || this.terminated) {
        return;
      }

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
    this.renderSlave.abort();
    this.renderSlave.destroy();
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
   * Directly register an asset (bypasses MessagePort).
   */
  registerAssetDirect(id: number, bitmap: ImageBitmap): void {
    if (!this.terminated) {
      this.renderSlave.registerAsset(id, bitmap);
    }
  }
}
