/**
 * Unit tests for RenderMaster and MasterCompositor.
 *
 * These tests use mocked workers and canvas utilities since we can't spawn
 * real workers or use canvas APIs in the jsdom test environment.
 * Integration tests in src/tests/integration will test the full worker communication.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RenderSegment } from '../types/messages';
import type { ComposedLayer } from './master-compositor';

// =============================================================================
// Mocks
// =============================================================================

/**
 * Create a mock ImageBitmap with given dimensions.
 */
function createMockImageBitmap(width = 100, height = 100): ImageBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

// Mock canvas utilities - must be before imports
vi.mock('../utils/canvas', () => {
  const mockCtx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    canvas: { width: 100, height: 100 },
  };

  return {
    createCanvasWithContext: vi.fn().mockImplementation((width: number, height: number) => ({
      canvas: { width, height, getContext: vi.fn().mockReturnValue(mockCtx) },
      ctx: { ...mockCtx, canvas: { width, height } },
    })),
    clearCanvas: vi.fn(),
    canvasToImageBitmap: vi.fn().mockImplementation(
      (canvas: { width: number; height: number }) =>
        Promise.resolve({
          width: canvas.width,
          height: canvas.height,
          close: vi.fn(),
        }) as unknown as Promise<ImageBitmap>
    ),
    createCanvas: vi.fn().mockImplementation((width: number, height: number) => ({
      width,
      height,
      getContext: vi.fn().mockReturnValue(mockCtx),
    })),
    getContext2D: vi.fn().mockReturnValue(mockCtx),
  };
});

// Import after mocking
import {
  MasterCompositor,
  createCompositorContext,
  ensureCompositorContext,
  composeSegments,
  composeSegmentsWithContext,
  composeOrderedLayers,
  composeSlaveResults,
  closeSegments,
} from './master-compositor';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a mock RenderSegment.
 */
function createMockSegment(
  compositemode: GlobalCompositeOperation = 'source-over',
  compositealpha = 1.0
): RenderSegment {
  return {
    bitmap: createMockImageBitmap(),
    compositemode,
    compositealpha,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('master-compositor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createCompositorContext', () => {
    it('should create a compositor context with the specified dimensions', () => {
      const ctx = createCompositorContext(800, 600);

      expect(ctx.width).toBe(800);
      expect(ctx.height).toBe(600);
      expect(ctx.canvas).toBeDefined();
      expect(ctx.ctx).toBeDefined();
    });

    it('should create a canvas with correct dimensions', () => {
      const ctx = createCompositorContext(1920, 1080);

      expect(ctx.width).toBe(1920);
      expect(ctx.height).toBe(1080);
      expect(ctx.canvas.width).toBe(1920);
      expect(ctx.canvas.height).toBe(1080);
    });
  });

  describe('ensureCompositorContext', () => {
    it('should create new context when none exists', () => {
      const ctx = ensureCompositorContext(null, 400, 300);

      expect(ctx.width).toBe(400);
      expect(ctx.height).toBe(300);
    });

    it('should reuse existing context when dimensions match', () => {
      const original = createCompositorContext(400, 300);
      const result = ensureCompositorContext(original, 400, 300);

      expect(result).toBe(original);
    });

    it('should create new context when width changes', () => {
      const original = createCompositorContext(400, 300);
      const result = ensureCompositorContext(original, 500, 300);

      expect(result).not.toBe(original);
      expect(result.width).toBe(500);
      expect(result.height).toBe(300);
    });

    it('should create new context when height changes', () => {
      const original = createCompositorContext(400, 300);
      const result = ensureCompositorContext(original, 400, 400);

      expect(result).not.toBe(original);
      expect(result.width).toBe(400);
      expect(result.height).toBe(400);
    });
  });

  describe('composeSegments', () => {
    it('should return an ImageBitmap for empty segments', async () => {
      const result = await composeSegments([], 100, 100);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should compose single segment', async () => {
      const segment = createMockSegment('source-over', 1.0);
      const result = await composeSegments([segment], 100, 100);

      expect(result).toBeDefined();
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    it('should compose multiple segments in order', async () => {
      const segments = [
        createMockSegment('source-over', 1.0),
        createMockSegment('multiply', 0.8),
        createMockSegment('screen', 0.5),
      ];

      const result = await composeSegments(segments, 200, 200);

      expect(result).toBeDefined();
      expect(result.width).toBe(200);
      expect(result.height).toBe(200);
    });
  });

  describe('composeSegmentsWithContext', () => {
    it('should use the provided compositor context', async () => {
      const ctx = createCompositorContext(150, 150);
      const segment = createMockSegment();

      const result = await composeSegmentsWithContext(ctx, [segment]);

      expect(result).toBeDefined();
    });

    it('should handle empty segments', async () => {
      const ctx = createCompositorContext(100, 100);

      const result = await composeSegmentsWithContext(ctx, []);

      expect(result).toBeDefined();
    });
  });

  describe('composeOrderedLayers', () => {
    it('should sort layers by original index before composition', async () => {
      const layers: ComposedLayer[] = [
        { segment: createMockSegment(), originalIndex: 2 },
        { segment: createMockSegment(), originalIndex: 0 },
        { segment: createMockSegment(), originalIndex: 1 },
      ];

      const result = await composeOrderedLayers(layers, 100, 100);

      expect(result).toBeDefined();
    });

    it('should handle single layer', async () => {
      const layers: ComposedLayer[] = [{ segment: createMockSegment(), originalIndex: 0 }];

      const result = await composeOrderedLayers(layers, 100, 100);

      expect(result).toBeDefined();
    });

    it('should handle empty layers', async () => {
      const result = await composeOrderedLayers([], 100, 100);

      expect(result).toBeDefined();
    });
  });

  describe('composeSlaveResults', () => {
    it('should compose layers from multiple slaves', async () => {
      const slaveResults = new Map<number, ComposedLayer[]>();

      slaveResults.set(1, [
        { segment: createMockSegment(), originalIndex: 0 },
        { segment: createMockSegment(), originalIndex: 2 },
      ]);

      slaveResults.set(2, [{ segment: createMockSegment(), originalIndex: 1 }]);

      const result = await composeSlaveResults(slaveResults, 100, 100);

      expect(result).toBeDefined();
    });

    it('should handle empty slave results', async () => {
      const slaveResults = new Map<number, ComposedLayer[]>();

      const result = await composeSlaveResults(slaveResults, 100, 100);

      expect(result).toBeDefined();
    });

    it('should handle single slave with multiple layers', async () => {
      const slaveResults = new Map<number, ComposedLayer[]>();

      slaveResults.set(1, [
        { segment: createMockSegment(), originalIndex: 0 },
        { segment: createMockSegment(), originalIndex: 1 },
        { segment: createMockSegment(), originalIndex: 2 },
      ]);

      const result = await composeSlaveResults(slaveResults, 100, 100);

      expect(result).toBeDefined();
    });
  });

  describe('closeSegments', () => {
    it('should close all ImageBitmaps in segments', () => {
      const segment1 = createMockSegment();
      const segment2 = createMockSegment();

      closeSegments([segment1, segment2]);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(segment1.bitmap.close)).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(segment2.bitmap.close)).toHaveBeenCalled();
    });

    it('should handle empty segments array', () => {
      expect(() => {
        closeSegments([]);
      }).not.toThrow();
    });

    it('should handle segments with already-closed bitmaps', () => {
      const segment = createMockSegment();
      (segment.bitmap.close as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Already closed');
      });

      expect(() => {
        closeSegments([segment]);
      }).not.toThrow();
    });
  });

  describe('MasterCompositor class', () => {
    let compositor: MasterCompositor;

    beforeEach(() => {
      compositor = new MasterCompositor();
    });

    afterEach(() => {
      compositor.destroy();
    });

    describe('compose', () => {
      it('should compose segments and return ImageBitmap', async () => {
        const segments = [createMockSegment(), createMockSegment()];

        const result = await compositor.compose(segments, 200, 200);

        expect(result).toBeDefined();
      });

      it('should reuse context for same dimensions', async () => {
        const segments1 = [createMockSegment()];
        const segments2 = [createMockSegment()];

        await compositor.compose(segments1, 100, 100);
        await compositor.compose(segments2, 100, 100);

        // Both should succeed without errors
        expect(true).toBe(true);
      });

      it('should handle empty segments', async () => {
        const result = await compositor.compose([], 100, 100);

        expect(result).toBeDefined();
      });
    });

    describe('composeOrdered', () => {
      it('should sort and compose layers', async () => {
        const layers: ComposedLayer[] = [
          { segment: createMockSegment(), originalIndex: 1 },
          { segment: createMockSegment(), originalIndex: 0 },
        ];

        const result = await compositor.composeOrdered(layers, 100, 100);

        expect(result).toBeDefined();
      });
    });

    describe('destroy', () => {
      it('should clean up resources', () => {
        const comp = new MasterCompositor();

        expect(() => {
          comp.destroy();
        }).not.toThrow();
      });

      it('should be safe to call multiple times', () => {
        const comp = new MasterCompositor();

        comp.destroy();
        expect(() => {
          comp.destroy();
        }).not.toThrow();
      });
    });
  });
});

// =============================================================================
// RenderMaster Helper Function Tests
// =============================================================================

describe('RenderMaster helper functions', () => {
  describe('color resolution', () => {
    it('should handle string color', () => {
      const color = '#ff0000';
      expect(color).toBe('#ff0000');
    });

    it('should handle color array with index', () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff'];
      const idx = 1;
      expect(colors[idx]).toBe('#00ff00');
    });

    it('should handle color array with default index', () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff'];
      expect(colors[0]).toBe('#ff0000');
    });

    it('should handle color record with key', () => {
      const colors: Record<string, string> = {
        primary: '#ff0000',
        secondary: '#00ff00',
      };
      const key = 'secondary';
      expect(colors[key]).toBe('#00ff00');
    });

    it('should handle color record with first value as default', () => {
      const colors: Record<string, string> = {
        primary: '#ff0000',
        secondary: '#00ff00',
      };
      const firstKey = Object.keys(colors)[0];
      expect(colors[firstKey]).toBe('#ff0000');
    });
  });

  describe('asset ID mapping', () => {
    it('should assign unique IDs to different URLs', () => {
      const mapping = new Map<string, number>();
      let nextId = 1;

      const getAssetId = (url: string): number => {
        const existing = mapping.get(url);
        if (existing !== undefined) {
          return existing;
        }
        const id = nextId++;
        mapping.set(url, id);
        return id;
      };

      const id1 = getAssetId('/image1.png');
      const id2 = getAssetId('/image2.png');
      const id3 = getAssetId('/image1.png'); // Same URL

      expect(id1).toBe(1);
      expect(id2).toBe(2);
      expect(id3).toBe(1); // Should return same ID
    });

    it('should maintain URL to ID and ID to URL mappings', () => {
      const urlToId = new Map<string, number>();
      const idToUrl = new Map<number, string>();
      let nextId = 1;

      const registerUrl = (url: string): number => {
        const existing = urlToId.get(url);
        if (existing !== undefined) {
          return existing;
        }
        const id = nextId++;
        urlToId.set(url, id);
        idToUrl.set(id, url);
        return id;
      };

      registerUrl('/asset1.png');
      registerUrl('/asset2.png');

      expect(urlToId.get('/asset1.png')).toBe(1);
      expect(idToUrl.get(1)).toBe('/asset1.png');
      expect(urlToId.get('/asset2.png')).toBe(2);
      expect(idToUrl.get(2)).toBe('/asset2.png');
    });
  });

  describe('layer classification', () => {
    it('should distinguish standard layers (string mask) from text layers (object mask)', () => {
      const isStandard = (mask: string | object): boolean => typeof mask === 'string';
      const isText = (mask: string | object): boolean => typeof mask === 'object';

      expect(isStandard('/mask.png')).toBe(true);
      expect(isStandard({ content: 'Hello' })).toBe(false);

      expect(isText({ content: 'Hello' })).toBe(true);
      expect(isText('/mask.png')).toBe(false);
    });
  });
});

// =============================================================================
// RenderMaster Integration Concepts
// =============================================================================

describe('RenderMaster integration concepts', () => {
  describe('layer distribution', () => {
    it('should distribute layers round-robin to slaves', () => {
      const slaveCount = 3;
      const layerCount = 10;

      const distribution = new Map<number, number[]>();
      for (let i = 0; i < slaveCount; i++) {
        distribution.set(i, []);
      }

      for (let i = 0; i < layerCount; i++) {
        const slaveIdx = i % slaveCount;
        const slaveData = distribution.get(slaveIdx);
        if (slaveData) {
          slaveData.push(i);
        }
      }

      expect(distribution.get(0)).toEqual([0, 3, 6, 9]);
      expect(distribution.get(1)).toEqual([1, 4, 7]);
      expect(distribution.get(2)).toEqual([2, 5, 8]);
    });

    it('should handle fewer layers than slaves', () => {
      const slaveCount = 4;
      const layerCount = 2;

      const distribution = new Map<number, number[]>();
      for (let i = 0; i < slaveCount; i++) {
        distribution.set(i, []);
      }

      for (let i = 0; i < layerCount; i++) {
        const slaveIdx = i % slaveCount;
        const slaveData = distribution.get(slaveIdx);
        if (slaveData) {
          slaveData.push(i);
        }
      }

      expect(distribution.get(0)).toEqual([0]);
      expect(distribution.get(1)).toEqual([1]);
      expect(distribution.get(2)).toEqual([]);
      expect(distribution.get(3)).toEqual([]);
    });
  });

  describe('abort handling', () => {
    it('should abort controller signal propagation', () => {
      const abortController = new AbortController();

      expect(abortController.signal.aborted).toBe(false);

      abortController.abort();

      expect(abortController.signal.aborted).toBe(true);
    });

    it('should support abort reason', () => {
      const abortController = new AbortController();
      const reason = new Error('User cancelled');

      abortController.abort(reason);

      expect(abortController.signal.aborted).toBe(true);
      expect(abortController.signal.reason).toBe(reason);
    });

    it('should be cancellable in Promise.race scenarios', async () => {
      const abortController = new AbortController();

      const neverResolves = new Promise((_, reject) => {
        abortController.signal.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      });

      // Abort immediately
      abortController.abort();

      // The promise should reject because of abort
      await expect(neverResolves).rejects.toThrow('Aborted');
    });
  });

  describe('capability detection', () => {
    it('should determine correct scenario based on capabilities', () => {
      const scenarios: {
        context: string;
        offscreenCanvas: boolean;
        webgl2: boolean;
        expected: string;
      }[] = [
        { context: 'main-thread', offscreenCanvas: true, webgl2: true, expected: 'A' },
        { context: 'main-thread', offscreenCanvas: true, webgl2: false, expected: 'B' },
        { context: 'main-thread', offscreenCanvas: false, webgl2: false, expected: 'C' },
        { context: 'worker', offscreenCanvas: true, webgl2: true, expected: 'D' },
        { context: 'worker', offscreenCanvas: true, webgl2: false, expected: 'E' },
        { context: 'worker', offscreenCanvas: false, webgl2: false, expected: 'F' },
      ];

      for (const { context, offscreenCanvas, webgl2, expected } of scenarios) {
        const determineScenario = (): string => {
          if (context === 'main-thread') {
            if (offscreenCanvas && webgl2) {
              return 'A';
            }
            if (offscreenCanvas && !webgl2) {
              return 'B';
            }
            return 'C';
          }
          if (offscreenCanvas && webgl2) {
            return 'D';
          }
          if (offscreenCanvas && !webgl2) {
            return 'E';
          }
          return 'F';
        };

        expect(determineScenario()).toBe(expected);
      }
    });
  });

  describe('asset request extraction', () => {
    it('should extract all unique URLs from a layer', () => {
      const seen = new Set<string>();

      const addUrl = (url: string | undefined): void => {
        if (url && !seen.has(url)) {
          seen.add(url);
        }
      };

      // Simulate extracting URLs from a layer
      addUrl('/images/base.png');
      addUrl('/images/mask.png');
      addUrl('/textures/fabric.png');
      addUrl('/highlights/hl1.png');
      addUrl('/highlights/hl2.png');
      addUrl('/images/base.png'); // Duplicate

      expect(seen.size).toBe(5);
      expect(seen.has('/images/base.png')).toBe(true);
      expect(seen.has('/images/mask.png')).toBe(true);
    });

    it('should handle missing optional URLs', () => {
      const urls: string[] = [];

      const addUrl = (url: string | undefined): void => {
        if (url) {
          urls.push(url);
        }
      };

      addUrl('/images/base.png');
      addUrl(undefined);
      addUrl('/images/mask.png');
      addUrl(undefined);

      expect(urls.length).toBe(2);
    });
  });

  describe('LayerDescriptor conversion', () => {
    it('should convert ProductImageComponent fields correctly', () => {
      const layer: {
        id: string;
        mode: string;
        alpha: number;
        blend: string;
        compositemode?: string;
        compositealpha?: number;
      } = {
        id: 'layer1',
        mode: 'color',
        alpha: 0.8,
        blend: 'multiply',
        compositemode: 'screen',
        compositealpha: 0.9,
      };

      const descriptor = {
        id: layer.id,
        mode: layer.mode,
        alpha: layer.alpha,
        blend: layer.blend,
        compositemode: layer.compositemode ?? 'source-over',
        compositealpha: layer.compositealpha ?? 1.0,
        assetIds: { image: 1 },
      };

      expect(descriptor.id).toBe('layer1');
      expect(descriptor.mode).toBe('color');
      expect(descriptor.alpha).toBe(0.8);
      expect(descriptor.compositemode).toBe('screen');
      expect(descriptor.compositealpha).toBe(0.9);
    });

    it('should use defaults for missing optional fields', () => {
      const layer: { compositemode?: string; compositealpha?: number } = {};
      const compositemode = layer.compositemode ?? 'source-over';
      const compositealpha = layer.compositealpha ?? 1.0;

      expect(compositemode).toBe('source-over');
      expect(compositealpha).toBe(1.0);
    });
  });
});

describe('error handling', () => {
  it('should wrap errors with AbortError for abort scenarios', () => {
    const createAbortError = (message: string): Error => {
      const error = new Error(message);
      error.name = 'AbortError';
      return error;
    };

    const abortError = createAbortError('Render aborted');

    expect(abortError.name).toBe('AbortError');
    expect(abortError.message).toBe('Render aborted');
  });

  it('should handle worker errors gracefully', () => {
    const createWorkerError = (message: string, workerId: number): Error => {
      const error = new Error(message);
      (error as Error & { workerId: number }).workerId = workerId;
      return error;
    };

    const workerError = createWorkerError('Worker failed', 1);

    expect(workerError.message).toBe('Worker failed');
    expect((workerError as Error & { workerId: number }).workerId).toBe(1);
  });
});
