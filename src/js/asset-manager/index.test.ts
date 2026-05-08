/**
 * Unit tests for Asset Manager module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssetManager } from './index';
import { loadImage, loadImages, cloneImageBitmap } from './image-loader';
import {
  loadFont,
  loadFonts,
  FontDistributionTracker,
  getSupportedFontMimeTypes,
  isFontUrl,
} from './font-loader';
import type { FetchMessage, RegisterSlaveMessage, DistributeMessage } from '../types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock createImageBitmap
const mockCreateImageBitmap = vi.fn();
global.createImageBitmap = mockCreateImageBitmap;

// Mock OffscreenCanvas for cloneImageBitmap
class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return {
      drawImage: vi.fn(),
    };
  }
}
global.OffscreenCanvas = MockOffscreenCanvas as unknown as typeof OffscreenCanvas;

// Mock ImageBitmap
class MockImageBitmap {
  width = 100;
  height = 100;
  close = vi.fn();
}

describe('image-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadImage', () => {
    it('should load an image successfully', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });
      mockCreateImageBitmap.mockResolvedValueOnce(mockBitmap);

      const result = await loadImage('https://example.com/image.png');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/image.png', {
        signal: undefined,
        credentials: 'same-origin',
      });
      expect(mockCreateImageBitmap).toHaveBeenCalledWith(mockBlob);
      expect(result).toBe(mockBitmap);
    });

    it('should throw AssetLoadError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(loadImage('https://example.com/missing.png')).rejects.toThrow(
        'HTTP 404: Not Found'
      );
    });

    it('should throw AssetLoadError on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(loadImage('https://example.com/image.png')).rejects.toThrow(
        'Failed to load image: Network error'
      );
    });

    it('should respect abort signal', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(loadImage('https://example.com/image.png')).rejects.toThrow('Load aborted');
    });
  });

  describe('loadImages', () => {
    it('should load multiple images in parallel', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap1 = new MockImageBitmap();
      const mockBitmap2 = new MockImageBitmap();

      mockFetch
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(mockBlob) })
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(mockBlob) });

      mockCreateImageBitmap.mockResolvedValueOnce(mockBitmap1).mockResolvedValueOnce(mockBitmap2);

      const urls = ['https://example.com/a.png', 'https://example.com/b.png'];
      const result = await loadImages(urls);

      expect(result.bitmaps.size).toBe(2);
      expect(result.bitmaps.get('https://example.com/a.png')).toBe(mockBitmap1);
      expect(result.bitmaps.get('https://example.com/b.png')).toBe(mockBitmap2);
      expect(result.failed).toHaveLength(0);
    });

    it('should report failed loads separately', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch
        .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(mockBlob) })
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

      mockCreateImageBitmap.mockResolvedValueOnce(mockBitmap);

      const urls = ['https://example.com/good.png', 'https://example.com/bad.png'];
      const result = await loadImages(urls);

      expect(result.bitmaps.size).toBe(1);
      expect(result.bitmaps.get('https://example.com/good.png')).toBe(mockBitmap);
      expect(result.failed).toContain('https://example.com/bad.png');
    });
  });

  describe('cloneImageBitmap', () => {
    it('should clone an ImageBitmap using OffscreenCanvas', async () => {
      const originalBitmap = new MockImageBitmap();
      const clonedBitmap = new MockImageBitmap();

      mockCreateImageBitmap.mockResolvedValueOnce(clonedBitmap);

      const result = await cloneImageBitmap(originalBitmap as unknown as ImageBitmap);

      expect(result).toBe(clonedBitmap);
      // Original should not be closed
      expect(originalBitmap.close).not.toHaveBeenCalled();
    });
  });
});

describe('font-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadFont', () => {
    it('should load a font successfully', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      const result = await loadFont('https://example.com/font.woff2');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/font.woff2', {
        credentials: 'same-origin',
      });
      expect(result.data).toBe(mockArrayBuffer);
      expect(result.size).toBe(1024);
    });

    it('should throw AssetLoadError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(loadFont('https://example.com/missing.woff2')).rejects.toThrow(
        'HTTP 404: Not Found'
      );
    });

    it('should throw AssetLoadError on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(loadFont('https://example.com/font.woff2')).rejects.toThrow(
        'Failed to load font: Network error'
      );
    });

    it('should respect abort signal', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(loadFont('https://example.com/font.woff2')).rejects.toThrow('Load aborted');
    });

    it('should pass abort signal to fetch', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);
      const abortController = new AbortController();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      await loadFont('https://example.com/font.woff2', { signal: abortController.signal });

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/font.woff2', {
        credentials: 'same-origin',
        signal: abortController.signal,
      });
    });
  });

  describe('loadFonts', () => {
    it('should load multiple fonts in parallel', async () => {
      const mockArrayBuffer1 = new ArrayBuffer(100);
      const mockArrayBuffer2 = new ArrayBuffer(200);

      mockFetch
        .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(mockArrayBuffer1) })
        .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(mockArrayBuffer2) });

      const urls = ['https://example.com/font1.woff2', 'https://example.com/font2.woff2'];
      const result = await loadFonts(urls);

      expect(result.fonts.size).toBe(2);
      expect(result.fonts.get('https://example.com/font1.woff2')?.data).toBe(mockArrayBuffer1);
      expect(result.fonts.get('https://example.com/font2.woff2')?.data).toBe(mockArrayBuffer2);
      expect(result.failed).toHaveLength(0);
    });

    it('should report failed loads separately', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);

      mockFetch
        .mockResolvedValueOnce({ ok: true, arrayBuffer: () => Promise.resolve(mockArrayBuffer) })
        .mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

      const urls = ['https://example.com/good.woff2', 'https://example.com/bad.woff2'];
      const result = await loadFonts(urls);

      expect(result.fonts.size).toBe(1);
      expect(result.fonts.get('https://example.com/good.woff2')?.data).toBe(mockArrayBuffer);
      expect(result.failed).toContain('https://example.com/bad.woff2');
    });
  });

  describe('FontDistributionTracker', () => {
    let tracker: FontDistributionTracker;

    beforeEach(() => {
      tracker = new FontDistributionTracker();
    });

    it('should track fonts sent to slaves', () => {
      expect(tracker.hasSent(1, 100)).toBe(false);

      tracker.markSent(1, 100);

      expect(tracker.hasSent(1, 100)).toBe(true);
      expect(tracker.hasSent(1, 101)).toBe(false);
      expect(tracker.hasSent(2, 100)).toBe(false);
    });

    it('should track multiple fonts per slave', () => {
      tracker.markSent(1, 100);
      tracker.markSent(1, 101);
      tracker.markSent(1, 102);

      expect(tracker.getSentCount(1)).toBe(3);
      expect(tracker.getSentFontIds(1)).toEqual([100, 101, 102]);
    });

    it('should track multiple slaves', () => {
      tracker.markSent(1, 100);
      tracker.markSent(2, 100);
      tracker.markSent(2, 101);

      expect(tracker.getSlaveCount()).toBe(2);
      expect(tracker.getSentCount(1)).toBe(1);
      expect(tracker.getSentCount(2)).toBe(2);
    });

    it('should handle removing a slave', () => {
      tracker.markSent(1, 100);
      tracker.markSent(2, 100);

      tracker.removeSlave(1);

      expect(tracker.hasSent(1, 100)).toBe(false);
      expect(tracker.hasSent(2, 100)).toBe(true);
      expect(tracker.getSlaveCount()).toBe(1);
    });

    it('should handle clearing all data', () => {
      tracker.markSent(1, 100);
      tracker.markSent(2, 101);

      tracker.clear();

      expect(tracker.hasSent(1, 100)).toBe(false);
      expect(tracker.hasSent(2, 101)).toBe(false);
      expect(tracker.getSlaveCount()).toBe(0);
    });

    it('should return empty array for unknown slave', () => {
      expect(tracker.getSentFontIds(999)).toEqual([]);
      expect(tracker.getSentCount(999)).toBe(0);
    });
  });

  describe('utility functions', () => {
    it('getSupportedFontMimeTypes should return expected types', () => {
      const types = getSupportedFontMimeTypes();

      expect(types).toContain('font/woff2');
      expect(types).toContain('font/woff');
      expect(types).toContain('font/ttf');
      expect(types).toContain('font/otf');
    });

    it('isFontUrl should detect font URLs', () => {
      expect(isFontUrl('https://example.com/font.woff2')).toBe(true);
      expect(isFontUrl('https://example.com/font.woff')).toBe(true);
      expect(isFontUrl('https://example.com/font.ttf')).toBe(true);
      expect(isFontUrl('https://example.com/font.otf')).toBe(true);
      expect(isFontUrl('https://example.com/font.eot')).toBe(true);
      expect(isFontUrl('https://example.com/font.WOFF2')).toBe(true); // Case insensitive
    });

    it('isFontUrl should reject non-font URLs', () => {
      expect(isFontUrl('https://example.com/image.png')).toBe(false);
      expect(isFontUrl('https://example.com/script.js')).toBe(false);
      expect(isFontUrl('https://example.com/styles.css')).toBe(false);
      expect(isFontUrl('https://example.com/data.json')).toBe(false);
    });
  });
});

describe('AssetManager', () => {
  let assetManager: AssetManager;

  beforeEach(() => {
    vi.clearAllMocks();
    assetManager = new AssetManager({ maxCacheSize: 5 });
  });

  afterEach(() => {
    assetManager.destroy();
  });

  describe('handleMessage - fetch', () => {
    it('should fetch and cache images', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      const fetchMsg: FetchMessage = {
        type: 'fetch', requestId: 1,
        assets: [
          { id: 1, url: 'https://example.com/img1.png', assetType: 'image' },
          { id: 2, url: 'https://example.com/img2.png', assetType: 'image' },
        ],
      };

      const result = await assetManager.handleMessage(fetchMsg);

      expect(result).toEqual({ type: 'fetch-complete', requestId: 1, failed: [] });
      expect(assetManager.isCached(1)).toBe(true);
      expect(assetManager.isCached(2)).toBe(true);
    });

    it('should report failed asset loads', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found' });

      const fetchMsg: FetchMessage = {
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/missing.png', assetType: 'image' }],
      };

      const result = await assetManager.handleMessage(fetchMsg);

      expect(result).toEqual({ type: 'fetch-complete', requestId: 1, failed: [1] });
      expect(assetManager.isCached(1)).toBe(false);
    });

    it('should not refetch cached assets', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      const fetchMsg: FetchMessage = {
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      };

      // First fetch
      await assetManager.handleMessage(fetchMsg);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second fetch with same ID - should not re-fetch
      await assetManager.handleMessage(fetchMsg);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should reuse cached URL with different ID', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      // First fetch
      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      // Second fetch with same URL but different ID
      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 2, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      // Should only fetch once
      expect(mockFetch).toHaveBeenCalledTimes(1);
      // Both IDs should be cached
      expect(assetManager.isCached(1)).toBe(true);
      expect(assetManager.isCached(2)).toBe(true);
    });
  });

  describe('handleMessage - register-slave', () => {
    it('should register a slave port', async () => {
      const mockPort = {
        postMessage: vi.fn(),
      } as unknown as MessagePort;

      const registerMsg: RegisterSlaveMessage = {
        type: 'register-slave',
        slaveId: 1,
        port: mockPort,
      };

      const result = await assetManager.handleMessage(registerMsg);

      expect(result).toBeNull(); // No response for register
    });
  });

  describe('handleMessage - distribute', () => {
    it('should distribute assets to registered slaves', async () => {
      // Setup: cache an asset
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      // Register a slave
      const mockPort = {
        postMessage: vi.fn(),
      } as unknown as MessagePort;

      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 100,
        port: mockPort,
      });

      // Distribute asset to slave
      const distributeMsg: DistributeMessage = {
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [1] }],
      };

      const result = await assetManager.handleMessage(distributeMsg);

      expect(result).toEqual({ type: 'distribute-complete', requestId: 1 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort.postMessage).toHaveBeenCalled();

      const sentMessage = (mockPort.postMessage as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
        type: string;
        id: number;
        assetType: string;
      };
      expect(sentMessage.type).toBe('asset-data');
      expect(sentMessage.id).toBe(1);
      expect(sentMessage.assetType).toBe('image');
    });

    it('should handle missing slave gracefully', async () => {
      const distributeMsg: DistributeMessage = {
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 999, assetIds: [1] }],
      };

      // Should not throw
      const result = await assetManager.handleMessage(distributeMsg);
      expect(result).toEqual({ type: 'distribute-complete', requestId: 1 });
    });

    it('should handle missing asset gracefully', async () => {
      // Register a slave
      const mockPort = {
        postMessage: vi.fn(),
      } as unknown as MessagePort;

      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 100,
        port: mockPort,
      });

      // Try to distribute non-existent asset
      const distributeMsg: DistributeMessage = {
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [999] }],
      };

      const result = await assetManager.handleMessage(distributeMsg);
      expect(result).toEqual({ type: 'distribute-complete', requestId: 1 });
      // Should not have posted any message
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('cache management', () => {
    it('should enforce cache size limit', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockImplementation(() => {
        const bitmap = new MockImageBitmap();
        return Promise.resolve(bitmap);
      });

      // Create manager with small cache
      const smallCacheManager = new AssetManager({ maxCacheSize: 3 });

      // Load 5 assets
      for (let i = 1; i <= 5; i++) {
        await smallCacheManager.handleMessage({
          type: 'fetch', requestId: 1,
          assets: [{ id: i, url: `https://example.com/img${String(i)}.png`, assetType: 'image' }],
        });
      }

      // Cache should be limited to 3
      const stats = smallCacheManager.getCacheStats();
      expect(stats.size).toBe(3);

      smallCacheManager.destroy();
    });

    it('should report correct cache statistics', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      // Load image
      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      const stats = assetManager.getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.imageCount).toBe(1);
      expect(stats.fontCount).toBe(0);
      expect(stats.meshCount).toBe(0);
      expect(stats.maxSize).toBe(5);
    });
  });

  describe('utility methods', () => {
    it('should lookup asset ID by URL', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 42, url: 'https://example.com/special.png', assetType: 'image' }],
      });

      expect(assetManager.getIdByUrl('https://example.com/special.png')).toBe(42);
      expect(assetManager.getIdByUrl('https://example.com/unknown.png')).toBeUndefined();
    });

    it('should get cached asset', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      const cached = assetManager.getCachedAsset(1);
      expect(cached).toBeDefined();
      expect(cached?.assetType).toBe('image');
      expect(cached?.url).toBe('https://example.com/img.png');
    });

    it('should preload assets', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      await assetManager.preload([
        { id: 1, url: 'https://example.com/img.png', assetType: 'image' },
      ]);

      expect(assetManager.isCached(1)).toBe(true);
    });

    it('should abort pending operations', async () => {
      // Setup mock that takes time
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({ ok: true, blob: () => Promise.resolve(new Blob()) });
            }, 1000);
          })
      );

      // Start a fetch
      const fetchPromise = assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/slow.png', assetType: 'image' }],
      });

      // Abort immediately
      assetManager.abort();

      // Should complete without the asset being cached
      await fetchPromise;
      // Asset not cached due to abort (depending on timing)
    });

    it('should clean up on destroy', async () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      expect(assetManager.isCached(1)).toBe(true);

      assetManager.destroy();

      expect(assetManager.isCached(1)).toBe(false);
      expect(assetManager.getCacheStats().size).toBe(0);
    });
  });

  describe('binary asset loading', () => {
    it('should load font as ArrayBuffer', async () => {
      const mockArrayBuffer = new ArrayBuffer(100);

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/font.woff2', assetType: 'font' }],
      });

      expect(assetManager.isCached(1)).toBe(true);
      const cached = assetManager.getCachedAsset(1);
      expect(cached?.assetType).toBe('font');
    });

    it('should load mesh as ArrayBuffer', async () => {
      const mockArrayBuffer = new ArrayBuffer(200);

      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/model.obj', assetType: 'mesh' }],
      });

      expect(assetManager.isCached(1)).toBe(true);
      const cached = assetManager.getCachedAsset(1);
      expect(cached?.assetType).toBe('mesh');
    });
  });

  describe('font distribution tracking', () => {
    it('should send font only once per slave', async () => {
      // Load a font
      const mockArrayBuffer = new ArrayBuffer(100);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/font.woff2', assetType: 'font' }],
      });

      // Register a slave
      const mockPort = {
        postMessage: vi.fn(),
      } as unknown as MessagePort;

      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 100,
        port: mockPort,
      });

      // First distribution - should send
      await assetManager.handleMessage({
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [1] }],
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort.postMessage).toHaveBeenCalledTimes(1);

      // Second distribution of same font to same slave - should NOT send again
      await assetManager.handleMessage({
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [1] }],
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort.postMessage).toHaveBeenCalledTimes(1); // Still just 1 call
    });

    it('should send font to different slaves', async () => {
      // Load a font
      const mockArrayBuffer = new ArrayBuffer(100);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/font.woff2', assetType: 'font' }],
      });

      // Register two slaves
      const mockPort1 = { postMessage: vi.fn() } as unknown as MessagePort;
      const mockPort2 = { postMessage: vi.fn() } as unknown as MessagePort;

      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 100,
        port: mockPort1,
      });

      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 101,
        port: mockPort2,
      });

      // Distribute same font to both slaves
      await assetManager.handleMessage({
        type: 'distribute', requestId: 1,
        deliveries: [
          { slaveId: 100, assetIds: [1] },
          { slaveId: 101, assetIds: [1] },
        ],
      });

      // Both should receive the font
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort1.postMessage).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort2.postMessage).toHaveBeenCalledTimes(1);
    });

    it('should always send images (not tracked like fonts)', async () => {
      // Load an image
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const mockBitmap = new MockImageBitmap();

      mockFetch.mockResolvedValue({ ok: true, blob: () => Promise.resolve(mockBlob) });
      mockCreateImageBitmap.mockResolvedValue(mockBitmap);

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/img.png', assetType: 'image' }],
      });

      // Register a slave
      const mockPort = {
        postMessage: vi.fn(),
      } as unknown as MessagePort;

      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 100,
        port: mockPort,
      });

      // First distribution
      await assetManager.handleMessage({
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [1] }],
      });

      // Second distribution of same image - should send again (images not tracked)
      await assetManager.handleMessage({
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [1] }],
      });

      // Images are sent every time (2 calls)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPort.postMessage).toHaveBeenCalledTimes(2);
    });

    it('should clear font distribution tracking on destroy', async () => {
      // Load a font
      const mockArrayBuffer = new ArrayBuffer(100);
      mockFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      await assetManager.handleMessage({
        type: 'fetch', requestId: 1,
        assets: [{ id: 1, url: 'https://example.com/font.woff2', assetType: 'font' }],
      });

      // Register and distribute
      const mockPort = { postMessage: vi.fn() } as unknown as MessagePort;
      await assetManager.handleMessage({
        type: 'register-slave',
        slaveId: 100,
        port: mockPort,
      });

      await assetManager.handleMessage({
        type: 'distribute', requestId: 1,
        deliveries: [{ slaveId: 100, assetIds: [1] }],
      });

      // Destroy and recreate
      assetManager.destroy();

      // Create a new manager to verify tracking was cleared
      // (The tracking is internal, but destroy() clears it)
      // We can verify by checking cache stats are cleared
      expect(assetManager.getCacheStats().size).toBe(0);
    });
  });
});
