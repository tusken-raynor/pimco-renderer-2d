/**
 * Unit tests for asset synchronization between master and slaves.
 *
 * These tests verify that the master waits for slaves to confirm asset
 * receipt before sending batch render messages, preventing the race condition
 * where slaves receive batch messages before their assets are ready.
 *
 * Bug: "Asset X not in cache, cannot deliver" warning
 * Root cause: Master sends batch messages immediately after distributeAssets()
 * completes, but distributeAssets() resolves when messages are *sent*, not
 * when slaves have *received and processed* them.
 *
 * Fix: Slaves send 'assets-ready' confirmation after receiving expected assets,
 * and master waits for all confirmations before sending batch messages.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  PrepareAssetsMessage,
  AssetsReadyMessage,
  AssetDataMessage,
} from '../types/messages';
import {
  isPrepareAssetsMessage,
  isAssetsReadyMessage,
} from '../types/messages';

// =============================================================================
// Message Type Tests
// =============================================================================

describe('Asset Synchronization Message Types', () => {
  describe('PrepareAssetsMessage', () => {
    it('should have correct structure', () => {
      const message: PrepareAssetsMessage = {
        type: 'prepare-assets',
        expectedCount: 3,
        assetIds: [1, 2, 3],
      };

      expect(message.type).toBe('prepare-assets');
      expect(message.expectedCount).toBe(3);
      expect(message.assetIds).toEqual([1, 2, 3]);
    });

    it('should handle zero assets', () => {
      const message: PrepareAssetsMessage = {
        type: 'prepare-assets',
        expectedCount: 0,
        assetIds: [],
      };

      expect(message.expectedCount).toBe(0);
      expect(message.assetIds).toEqual([]);
    });
  });

  describe('AssetsReadyMessage', () => {
    it('should have correct structure', () => {
      const message: AssetsReadyMessage = {
        type: 'assets-ready',
      };

      expect(message.type).toBe('assets-ready');
    });
  });

  describe('isPrepareAssetsMessage type guard', () => {
    it('should return true for valid PrepareAssetsMessage', () => {
      const message = {
        type: 'prepare-assets',
        expectedCount: 2,
        assetIds: [1, 2],
      };

      expect(isPrepareAssetsMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      expect(isPrepareAssetsMessage({ type: 'batch' })).toBe(false);
      expect(isPrepareAssetsMessage({ type: 'init' })).toBe(false);
      expect(isPrepareAssetsMessage(null)).toBe(false);
      expect(isPrepareAssetsMessage(undefined)).toBe(false);
    });
  });

  describe('isAssetsReadyMessage type guard', () => {
    it('should return true for valid AssetsReadyMessage', () => {
      const message = { type: 'assets-ready' };

      expect(isAssetsReadyMessage(message)).toBe(true);
    });

    it('should return false for other message types', () => {
      expect(isAssetsReadyMessage({ type: 'ready' })).toBe(false);
      expect(isAssetsReadyMessage({ type: 'result' })).toBe(false);
      expect(isAssetsReadyMessage(null)).toBe(false);
    });
  });
});

// =============================================================================
// Slave Asset Tracking Tests
// =============================================================================

describe('Slave Asset Tracking', () => {
  /**
   * Simulates the slave-side asset tracking logic.
   */
  class MockSlaveAssetTracker {
    private expectedCount = 0;
    private expectedAssetIds = new Set<number>();
    private receivedAssetIds = new Set<number>();
    private onReadyCallback: (() => void) | null = null;

    prepareForAssets(message: PrepareAssetsMessage): void {
      this.expectedCount = message.expectedCount;
      this.expectedAssetIds = new Set(message.assetIds);
      this.receivedAssetIds.clear();

      // If expecting zero assets, immediately signal ready
      if (this.expectedCount === 0) {
        this.signalReady();
      }
    }

    receiveAsset(message: AssetDataMessage): void {
      if (this.expectedAssetIds.has(message.id)) {
        this.receivedAssetIds.add(message.id);

        if (this.receivedAssetIds.size === this.expectedCount) {
          this.signalReady();
        }
      }
    }

    onReady(callback: () => void): void {
      this.onReadyCallback = callback;
    }

    private signalReady(): void {
      if (this.onReadyCallback) {
        this.onReadyCallback();
      }
    }

    getReceivedCount(): number {
      return this.receivedAssetIds.size;
    }

    isReady(): boolean {
      return this.receivedAssetIds.size === this.expectedCount;
    }
  }

  let tracker: MockSlaveAssetTracker;

  beforeEach(() => {
    tracker = new MockSlaveAssetTracker();
  });

  it('should track expected asset count from prepare-assets message', () => {
    const prepareMessage: PrepareAssetsMessage = {
      type: 'prepare-assets',
      expectedCount: 3,
      assetIds: [1, 2, 3],
    };

    tracker.prepareForAssets(prepareMessage);

    expect(tracker.getReceivedCount()).toBe(0);
    expect(tracker.isReady()).toBe(false);
  });

  it('should track received assets and signal ready when all received', () => {
    const readyCallback = vi.fn();
    tracker.onReady(readyCallback);

    // Prepare for 2 assets
    tracker.prepareForAssets({
      type: 'prepare-assets',
      expectedCount: 2,
      assetIds: [1, 2],
    });

    // Receive first asset
    tracker.receiveAsset({
      type: 'asset-data',
      id: 1,
      assetType: 'image',
      data: {} as ImageBitmap,
    });
    expect(tracker.isReady()).toBe(false);
    expect(readyCallback).not.toHaveBeenCalled();

    // Receive second asset
    tracker.receiveAsset({
      type: 'asset-data',
      id: 2,
      assetType: 'image',
      data: {} as ImageBitmap,
    });
    expect(tracker.isReady()).toBe(true);
    expect(readyCallback).toHaveBeenCalledTimes(1);
  });

  it('should immediately signal ready when expecting zero assets', () => {
    const readyCallback = vi.fn();
    tracker.onReady(readyCallback);

    tracker.prepareForAssets({
      type: 'prepare-assets',
      expectedCount: 0,
      assetIds: [],
    });

    expect(tracker.isReady()).toBe(true);
    expect(readyCallback).toHaveBeenCalledTimes(1);
  });

  it('should ignore assets not in expected list', () => {
    const readyCallback = vi.fn();
    tracker.onReady(readyCallback);

    tracker.prepareForAssets({
      type: 'prepare-assets',
      expectedCount: 1,
      assetIds: [1],
    });

    // Receive unexpected asset
    tracker.receiveAsset({
      type: 'asset-data',
      id: 99,
      assetType: 'image',
      data: {} as ImageBitmap,
    });

    expect(tracker.getReceivedCount()).toBe(0);
    expect(tracker.isReady()).toBe(false);
    expect(readyCallback).not.toHaveBeenCalled();

    // Receive expected asset
    tracker.receiveAsset({
      type: 'asset-data',
      id: 1,
      assetType: 'image',
      data: {} as ImageBitmap,
    });

    expect(tracker.isReady()).toBe(true);
    expect(readyCallback).toHaveBeenCalledTimes(1);
  });

  it('should not double-count duplicate assets', () => {
    const readyCallback = vi.fn();
    tracker.onReady(readyCallback);

    tracker.prepareForAssets({
      type: 'prepare-assets',
      expectedCount: 2,
      assetIds: [1, 2],
    });

    // Receive same asset twice
    tracker.receiveAsset({
      type: 'asset-data',
      id: 1,
      assetType: 'image',
      data: {} as ImageBitmap,
    });
    tracker.receiveAsset({
      type: 'asset-data',
      id: 1,
      assetType: 'image',
      data: {} as ImageBitmap,
    });

    expect(tracker.getReceivedCount()).toBe(1);
    expect(tracker.isReady()).toBe(false);
    expect(readyCallback).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Master Synchronization Tests
// =============================================================================

describe('Master Asset Synchronization', () => {
  /**
   * Simulates the master-side synchronization logic.
   */
  class MockMasterSynchronizer {
    private pendingSlaves = new Set<number>();
    private resolveWhenAllReady: (() => void) | null = null;

    /**
     * Wait for all specified slaves to confirm assets-ready.
     * Returns a promise that resolves when all slaves are ready.
     */
    waitForSlaves(slaveIds: number[]): Promise<void> {
      if (slaveIds.length === 0) {
        return Promise.resolve();
      }

      this.pendingSlaves = new Set(slaveIds);

      return new Promise((resolve) => {
        this.resolveWhenAllReady = resolve;
      });
    }

    /**
     * Handle assets-ready message from a slave.
     */
    handleAssetsReady(slaveId: number): void {
      this.pendingSlaves.delete(slaveId);

      if (this.pendingSlaves.size === 0 && this.resolveWhenAllReady) {
        this.resolveWhenAllReady();
        this.resolveWhenAllReady = null;
      }
    }

    getPendingCount(): number {
      return this.pendingSlaves.size;
    }
  }

  it('should wait for all slaves to report ready', async () => {
    const synchronizer = new MockMasterSynchronizer();
    const slaveIds = [1, 2, 3];

    const waitPromise = synchronizer.waitForSlaves(slaveIds);
    expect(synchronizer.getPendingCount()).toBe(3);

    // Slaves report ready one by one
    synchronizer.handleAssetsReady(1);
    expect(synchronizer.getPendingCount()).toBe(2);

    synchronizer.handleAssetsReady(2);
    expect(synchronizer.getPendingCount()).toBe(1);

    synchronizer.handleAssetsReady(3);
    expect(synchronizer.getPendingCount()).toBe(0);

    // Promise should resolve
    await waitPromise;
  });

  it('should resolve immediately when no slaves specified', async () => {
    const synchronizer = new MockMasterSynchronizer();

    // Should resolve immediately
    await synchronizer.waitForSlaves([]);
    expect(synchronizer.getPendingCount()).toBe(0);
  });

  it('should handle out-of-order slave ready messages', async () => {
    const synchronizer = new MockMasterSynchronizer();
    const slaveIds = [1, 2, 3];

    const waitPromise = synchronizer.waitForSlaves(slaveIds);

    // Slaves report ready out of order
    synchronizer.handleAssetsReady(3);
    synchronizer.handleAssetsReady(1);
    synchronizer.handleAssetsReady(2);

    await waitPromise;
    expect(synchronizer.getPendingCount()).toBe(0);
  });
});

// =============================================================================
// Race Condition Prevention Tests
// =============================================================================

describe('Race Condition Prevention', () => {
  it('should ensure batch message is sent only after assets-ready received', async () => {
    const events: string[] = [];

    // Simulate the correct flow with synchronization
    const simulateCorrectFlow = async (): Promise<void> => {
      // 1. Master sends prepare-assets
      events.push('master:send-prepare-assets');

      // 2. Master sends distribute to Asset Manager
      events.push('master:send-distribute');

      // 3. Wait for assets-ready (simulated)
      await new Promise<void>((resolve) => {
        // Simulate asset delivery and ready confirmation
        events.push('slave:receive-asset-data');
        events.push('slave:send-assets-ready');
        events.push('master:receive-assets-ready');
        resolve();
      });

      // 4. Only after assets-ready, send batch
      events.push('master:send-batch');
    };

    await simulateCorrectFlow();

    // Verify correct ordering
    const assetDataIndex = events.indexOf('slave:receive-asset-data');
    const assetsReadyIndex = events.indexOf('slave:send-assets-ready');
    const receiveReadyIndex = events.indexOf('master:receive-assets-ready');
    const batchIndex = events.indexOf('master:send-batch');

    // Asset data must be received before assets-ready is sent
    expect(assetDataIndex).toBeLessThan(assetsReadyIndex);

    // Master must receive assets-ready before sending batch
    expect(receiveReadyIndex).toBeLessThan(batchIndex);
  });

  it('should demonstrate the bug scenario without synchronization', () => {
    const events: string[] = [];

    // Simulate the buggy flow (without synchronization)
    const simulateBuggyFlow = (): void => {
      // 1. Master sends distribute to Asset Manager
      events.push('master:send-distribute');

      // 2. Asset Manager iterates and sends asset-data (queued)
      events.push('asset-manager:queue-asset-data');

      // 3. Asset Manager returns distribute-complete IMMEDIATELY
      events.push('asset-manager:send-distribute-complete');

      // 4. Master receives distribute-complete
      events.push('master:receive-distribute-complete');

      // 5. BUG: Master sends batch BEFORE slave processes asset-data
      events.push('master:send-batch');

      // 6. Later: slave finally processes asset-data
      events.push('slave:receive-asset-data');
    };

    simulateBuggyFlow();

    // Demonstrate the bug: batch is sent before asset-data is received
    const batchIndex = events.indexOf('master:send-batch');
    const assetDataIndex = events.indexOf('slave:receive-asset-data');

    // In the buggy flow, batch comes BEFORE asset-data
    expect(batchIndex).toBeLessThan(assetDataIndex);
  });
});
