/**
 * Asset Manager Worker Entry Point.
 *
 * This worker handles centralized asset loading, caching, and distribution.
 * It communicates with the RenderMaster via the main worker port and
 * with render slaves via registered MessagePorts.
 *
 * Message Protocol:
 * - fetch: Load assets by URL, returns fetch-complete with failed IDs
 * - distribute: Send cached assets to registered slaves
 * - preload: Load assets for future use (no response)
 * - register-slave: Register a slave's MessagePort for asset delivery
 */

import { AssetManager } from '../js/asset-manager';
import { isRegisterSlaveMessage } from '../js/types';
import type { MasterToAssetManagerMessage, ErrorMessage } from '../js/types';
import { wrapError } from '../js/errors';

// Create the Asset Manager instance
const assetManager = new AssetManager({
  maxCacheSize: 100,
});

/**
 * Handle incoming messages from the Master.
 */
self.onmessage = async (event: MessageEvent<MasterToAssetManagerMessage>) => {
  const message = event.data;

  try {
    // Handle register-slave specially since it has a transferred port
    if (isRegisterSlaveMessage(message)) {
      // The port is transferred via event.ports
      // Cast ports array to allow undefined check (runtime safety)
      const ports = event.ports as readonly (MessagePort | undefined)[];
      const port = ports[0];
      if (port) {
        await assetManager.handleMessage({
          ...message,
          port,
        });
      } else {
        console.error('register-slave message received without MessagePort');
      }
      return;
    }

    // Handle other messages
    const response = await assetManager.handleMessage(message);

    // Send response if any
    if (response) {
      self.postMessage(response);
    }
  } catch (error) {
    // Send error message back to master
    const wrapped = wrapError(error);
    const errorMsg: ErrorMessage = {
      type: 'error',
      message: wrapped.message,
      code: wrapped.code,
      context: wrapped.context,
    };
    self.postMessage(errorMsg);
  }
};

/**
 * Handle worker errors.
 */
self.onerror = (event: string | Event) => {
  // onerror can receive either a string or an Event
  if (typeof event === 'string') {
    const errorMsg: ErrorMessage = {
      type: 'error',
      message: event,
      code: 'WORKER_ERROR',
      context: {},
    };
    self.postMessage(errorMsg);
  } else if (event instanceof ErrorEvent) {
    const errorMsg: ErrorMessage = {
      type: 'error',
      message: event.message || 'Unknown worker error',
      code: 'WORKER_ERROR',
      context: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    };
    self.postMessage(errorMsg);
  }
};

/**
 * Handle unhandled promise rejections.
 */
self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const error = wrapError(event.reason);
  const errorMsg: ErrorMessage = {
    type: 'error',
    message: error.message,
    code: 'UNHANDLED_REJECTION',
    context: error.context,
  };
  self.postMessage(errorMsg);
};

// Signal that worker is ready (no logging per eslint rules)
