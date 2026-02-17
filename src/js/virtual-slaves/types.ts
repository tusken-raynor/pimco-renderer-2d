/**
 * Type definitions for virtual slaves.
 */

import type {
  MasterToSlaveMessage,
  SlaveToMasterMessage,
  AssetDataMessage,
} from '../types/messages';

/**
 * Options for creating a virtual slave.
 */
export interface VirtualSlaveOptions {
  /** Whether to defer message handling to the next microtask (default: true) */
  deferMessages?: boolean;
}

/**
 * MessagePort-like interface for virtual slaves.
 *
 * This interface matches the subset of MessagePort/Worker that RenderMaster uses,
 * allowing virtual slaves to be used interchangeably with real workers.
 */
export interface VirtualSlavePort {
  /**
   * Post a message to the virtual slave.
   *
   * @param message - Message to send
   * @param transfer - Transferable objects (ignored for virtual slaves)
   */
  postMessage(message: MasterToSlaveMessage, transfer?: Transferable[]): void;

  /**
   * Handler for messages from the virtual slave.
   */
  onmessage: ((event: MessageEvent<SlaveToMasterMessage>) => void) | null;

  /**
   * Handler for errors from the virtual slave.
   */
  onerror: ((event: ErrorEvent | Event) => void) | null;

  /**
   * Terminate the virtual slave (cleanup resources).
   */
  terminate(): void;

  /**
   * Add an event listener.
   */
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SlaveToMasterMessage>) => void
  ): void;

  /**
   * Remove an event listener.
   */
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<SlaveToMasterMessage>) => void
  ): void;
}

/**
 * Interface for the asset port used by virtual slaves.
 */
export interface VirtualAssetPort {
  /**
   * Handler for asset data messages.
   */
  onmessage: ((event: MessageEvent<AssetDataMessage>) => void) | null;

  /**
   * Post a message (not used for asset port, but required for interface).
   */
  postMessage(message: unknown): void;

  /**
   * Close the port.
   */
  close(): void;
}

/**
 * Simulated MessageEvent for virtual slave communication.
 */
export interface VirtualMessageEvent<T> {
  readonly data: T;
  readonly ports: readonly MessagePort[];
}

/**
 * Create a virtual MessageEvent.
 *
 * @param data - Event data
 * @param ports - Optional ports array
 * @returns A MessageEvent-like object
 */
export function createVirtualMessageEvent<T>(
  data: T,
  ports: readonly MessagePort[] = []
): MessageEvent<T> {
  // Create a minimal MessageEvent-like object
  return {
    data,
    ports,
    // Include other required MessageEvent properties with defaults
    type: 'message',
    bubbles: false,
    cancelable: false,
    composed: false,
    defaultPrevented: false,
    eventPhase: 0,
    isTrusted: false,
    returnValue: true,
    timeStamp: Date.now(),
    lastEventId: '',
    origin: '',
    source: null,
    target: null,
    currentTarget: null,
    srcElement: null,
    cancelBubble: false,
    composedPath: () => [],
    initEvent: () => {
      /* no-op */
    },
    initMessageEvent: () => {
      /* no-op */
    },
    preventDefault: () => {
      /* no-op */
    },
    stopImmediatePropagation: () => {
      /* no-op */
    },
    stopPropagation: () => {
      /* no-op */
    },
    NONE: 0,
    CAPTURING_PHASE: 1,
    AT_TARGET: 2,
    BUBBLING_PHASE: 3,
  } as unknown as MessageEvent<T>;
}
