/**
 * Unit tests for VirtualStandardSlave.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VirtualStandardSlave } from './virtual-standard-slave';
import type { SlaveToMasterMessage, CapabilitiesMessage } from '../types/messages';

describe('VirtualStandardSlave', () => {
  let slave: VirtualStandardSlave;

  beforeEach(() => {
    slave = new VirtualStandardSlave({ deferMessages: false });
  });

  afterEach(() => {
    slave.terminate();
  });

  describe('initialization', () => {
    it('should send capabilities and ready messages on init', () => {
      const messages: SlaveToMasterMessage[] = [];

      slave.onmessage = (event) => {
        messages.push(event.data);
      };

      slave.postMessage({ type: 'init' });

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe('capabilities');
      expect(messages[1].type).toBe('ready');
    });

    it('should report capabilities correctly', () => {
      let capabilitiesMsg: CapabilitiesMessage | undefined;

      slave.onmessage = (event) => {
        if (event.data.type === 'capabilities') {
          capabilitiesMsg = event.data;
        }
      };

      slave.postMessage({ type: 'init' });

      expect(capabilitiesMsg).toBeDefined();
      expect(typeof capabilitiesMsg?.offscreenCanvas).toBe('boolean');
      expect(typeof capabilitiesMsg?.webgl2).toBe('boolean');
    });
  });

  describe('termination', () => {
    it('should set terminated flag on terminate', () => {
      expect(slave.isTerminated()).toBe(false);
      slave.terminate();
      expect(slave.isTerminated()).toBe(true);
    });

    it('should ignore messages after termination', () => {
      const messages: SlaveToMasterMessage[] = [];

      slave.onmessage = (event) => {
        messages.push(event.data);
      };

      slave.terminate();
      slave.postMessage({ type: 'init' });

      expect(messages).toHaveLength(0);
    });

    it('should clear handlers on terminate', () => {
      slave.onmessage = vi.fn();
      slave.onerror = vi.fn();
      slave.terminate();

      expect(slave.onmessage).toBeNull();
      expect(slave.onerror).toBeNull();
    });
  });

  describe('event listeners', () => {
    it('should support addEventListener for message events', () => {
      const listener = vi.fn();
      slave.addEventListener('message', listener);

      slave.postMessage({ type: 'init' });

      expect(listener).toHaveBeenCalled();
    });

    it('should support removeEventListener', () => {
      const listener = vi.fn();
      slave.addEventListener('message', listener);
      slave.removeEventListener('message', listener);

      slave.postMessage({ type: 'init' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should call both onmessage and listeners', () => {
      const onmessageHandler = vi.fn();
      const listener = vi.fn();

      slave.onmessage = onmessageHandler;
      slave.addEventListener('message', listener);

      slave.postMessage({ type: 'init' });

      expect(onmessageHandler).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('abort handling', () => {
    it('should handle abort message without error', () => {
      let errorReceived = false;

      slave.onmessage = (event) => {
        if (event.data.type === 'error') {
          errorReceived = true;
        }
      };

      slave.postMessage({ type: 'init' });
      slave.postMessage({ type: 'abort' });

      expect(errorReceived).toBe(false);
    });
  });

  describe('deferred messages', () => {
    it('should defer messages when deferMessages option is true', async () => {
      const deferredSlave = new VirtualStandardSlave({ deferMessages: true });
      const messages: SlaveToMasterMessage[] = [];

      deferredSlave.onmessage = (event) => {
        messages.push(event.data);
      };

      deferredSlave.postMessage({ type: 'init' });

      // Messages should not be received synchronously
      expect(messages).toHaveLength(0);

      // Wait for microtasks
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });

      expect(messages.length).toBeGreaterThan(0);

      deferredSlave.terminate();
    });
  });

  describe('direct asset registration', () => {
    it('should accept direct asset registration', () => {
      // Use a mock bitmap since createImageBitmap is not available in jsdom
      const mockBitmap = {
        width: 1,
        height: 1,
        close: vi.fn(),
      } as unknown as ImageBitmap;

      // Should not throw
      expect(() => {
        slave.registerAssetDirect(1, mockBitmap);
      }).not.toThrow();
    });

    it('should ignore asset registration after termination', () => {
      const mockBitmap = {
        width: 1,
        height: 1,
        close: vi.fn(),
      } as unknown as ImageBitmap;

      slave.terminate();

      // Should not throw after termination
      expect(() => {
        slave.registerAssetDirect(1, mockBitmap);
      }).not.toThrow();
    });
  });

  describe('batch rendering', () => {
    it('should handle empty batch', async () => {
      const deferredSlave = new VirtualStandardSlave({ deferMessages: true });
      let resultReceived = false;

      deferredSlave.onmessage = (event) => {
        if (event.data.type === 'result') {
          resultReceived = true;
        }
      };

      deferredSlave.postMessage({ type: 'init' });

      // Wait for init
      await new Promise((resolve) => setTimeout(resolve, 10));

      deferredSlave.postMessage({
        type: 'batch',
        layers: [],
        width: 100,
        height: 100,
      });

      // Wait for batch processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(resultReceived).toBe(true);

      deferredSlave.terminate();
    });
  });
});
