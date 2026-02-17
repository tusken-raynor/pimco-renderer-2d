/**
 * Unit tests for TextRenderSlave module.
 *
 * Note: Tests that require canvas context use mocked canvas utils.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TextLayerDescriptor } from '../types/messages';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';

// =============================================================================
// Mock Canvas and ImageBitmap
// =============================================================================

interface MockContext {
  canvas: { width: number; height: number };
  font: string;
  textAlign: string;
  textBaseline: string;
  fillStyle: string;
  letterSpacing: string;
  globalCompositeOperation: string;
  globalAlpha: number;
  measureText: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

function createMockContext(width: number, height: number): MockContext {
  return {
    canvas: { width, height },
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillStyle: '#000000',
    letterSpacing: '',
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    measureText: vi.fn().mockReturnValue({ width: 100 }),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  };
}

interface MockCanvas {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
}

function createMockCanvas(width: number, height: number): MockCanvas {
  const ctx = createMockContext(width, height);
  return {
    width,
    height,
    getContext: vi.fn().mockReturnValue(ctx),
  };
}

// Mock ImageBitmap global for instanceof checks
class MockImageBitmap {
  width = 100;
  height = 100;
  close = vi.fn();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ImageBitmap = MockImageBitmap;

// Helper to create a mock ImageBitmap
function createMockImageBitmap(): ImageBitmap {
  return new MockImageBitmap() as unknown as ImageBitmap;
}

// Mock the canvas utils module
vi.mock('../utils/canvas', () => ({
  createCanvas: vi.fn((width: number, height: number) => createMockCanvas(width, height)),
  getContext2D: vi.fn((canvas: MockCanvas) => canvas.getContext('2d')),
  canvasToImageBitmap: vi.fn().mockResolvedValue({
    width: 100,
    height: 100,
    close: vi.fn(),
  }),
}));

// Import after mocking
import {
  TextRenderSlave,
  createTextRenderSlave,
  textResultsToSegments,
  type TextLayerResult,
} from './index';

// Helper to create a test text layer descriptor
function createTextLayerDescriptor(
  overrides: Partial<TextLayerDescriptor> = {}
): TextLayerDescriptor {
  return {
    id: 'test-layer',
    assetIds: {
      image: 1,
    },
    mode: 'color',
    color: '#ff0000',
    alpha: 1,
    blend: 'normal',
    compositemode: 'source-over',
    compositealpha: 1,
    maskData: {
      content: 'Test Text',
      type: {
        fontfamily: 'Arial',
        fontweight: 400,
        lineheight: 0.08,
      },
    },
    ...overrides,
  };
}

describe('TextRenderSlave', () => {
  let slave: TextRenderSlave;

  beforeEach(() => {
    slave = createTextRenderSlave();
  });

  afterEach(() => {
    slave.destroy();
  });

  describe('constructor', () => {
    it('should create instance via factory function', () => {
      expect(slave).toBeInstanceOf(TextRenderSlave);
    });

    it('should initialize with empty asset store', () => {
      expect(slave.hasAsset(1)).toBe(false);
    });

    it('should initialize with empty font cache', () => {
      expect(slave.hasFont(1)).toBe(false);
    });

    it('should initialize with abort flag false', () => {
      expect(slave.isAborted()).toBe(false);
    });
  });

  describe('asset management', () => {
    it('should register and retrieve assets', () => {
      const mockBitmap = createMockImageBitmap();
      slave.registerAsset(1, mockBitmap);

      expect(slave.hasAsset(1)).toBe(true);
      expect(slave.getAsset(1)).toBe(mockBitmap);
    });

    it('should return undefined for unregistered assets', () => {
      expect(slave.getAsset(999)).toBeUndefined();
    });

    it('should handle multiple assets', () => {
      const bitmap1 = createMockImageBitmap();
      const bitmap2 = createMockImageBitmap();

      slave.registerAsset(1, bitmap1);
      slave.registerAsset(2, bitmap2);

      expect(slave.hasAsset(1)).toBe(true);
      expect(slave.hasAsset(2)).toBe(true);
      expect(slave.getAsset(1)).toBe(bitmap1);
      expect(slave.getAsset(2)).toBe(bitmap2);
    });

    it('should overwrite existing assets', () => {
      const bitmap1 = createMockImageBitmap();
      const bitmap2 = createMockImageBitmap();

      slave.registerAsset(1, bitmap1);
      slave.registerAsset(1, bitmap2);

      expect(slave.getAsset(1)).toBe(bitmap2);
    });

    it('should clear all assets', () => {
      slave.registerAsset(1, createMockImageBitmap());
      slave.registerAsset(2, createMockImageBitmap());

      slave.clearAssets();

      expect(slave.hasAsset(1)).toBe(false);
      expect(slave.hasAsset(2)).toBe(false);
    });
  });

  describe('font management', () => {
    it('should register and retrieve fonts', () => {
      const fontData = new ArrayBuffer(100);
      slave.registerFont(1, 'TestFont', fontData);

      expect(slave.hasFont(1)).toBe(true);
      const font = slave.getFont(1);
      expect(font).toBeDefined();
      expect(font?.family).toBe('TestFont');
      expect(font?.data).toBe(fontData);
      expect(font?.loaded).toBe(false);
    });

    it('should return undefined for unregistered fonts', () => {
      expect(slave.getFont(999)).toBeUndefined();
    });

    it('should handle multiple fonts', () => {
      slave.registerFont(1, 'Font1', new ArrayBuffer(10));
      slave.registerFont(2, 'Font2', new ArrayBuffer(20));

      expect(slave.hasFont(1)).toBe(true);
      expect(slave.hasFont(2)).toBe(true);
      expect(slave.getFont(1)?.family).toBe('Font1');
      expect(slave.getFont(2)?.family).toBe('Font2');
    });

    it('should clear fonts with clearAssets', () => {
      slave.registerFont(1, 'TestFont', new ArrayBuffer(100));

      slave.clearAssets();

      expect(slave.hasFont(1)).toBe(false);
    });
  });

  describe('abort handling', () => {
    it('should start with abort flag false', () => {
      expect(slave.isAborted()).toBe(false);
    });

    it('should set abort flag', () => {
      slave.abort();
      expect(slave.isAborted()).toBe(true);
    });

    it('should reset abort flag', () => {
      slave.abort();
      slave.resetAbort();
      expect(slave.isAborted()).toBe(false);
    });
  });

  describe('rasterizeText', () => {
    it('should rasterize text from mask data', () => {
      const maskData: PimcoMaskSubstitutionCompiled = {
        content: 'Hello World',
        type: {
          fontfamily: 'Arial',
          fontweight: 400,
        },
      };

      const result = slave.rasterizeText(maskData, 500, 500);

      expect(result.canvas).toBeDefined();
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.measurement.text).toBe('Hello World');
    });

    it('should handle empty content', () => {
      const maskData: PimcoMaskSubstitutionCompiled = {
        content: '',
      };

      const result = slave.rasterizeText(maskData, 500, 500);

      expect(result.canvas).toBeDefined();
      expect(result.measurement.text).toBe('');
    });

    it('should apply typography settings', () => {
      const maskData: PimcoMaskSubstitutionCompiled = {
        content: 'test',
        type: {
          texttransform: 'uppercase',
        },
      };

      const result = slave.rasterizeText(maskData, 500, 500);

      expect(result.measurement.text).toBe('TEST');
    });
  });

  describe('renderLayer', () => {
    it('should return null when aborted', async () => {
      slave.abort();

      const layer = createTextLayerDescriptor();
      const result = await slave.renderLayer(layer, 500, 500, 0);

      expect(result).toBeNull();
    });

    it('should return null when maskData is missing', async () => {
      const layer = {
        id: 'test',
        assetIds: { image: 1 },
        mode: 'color' as const,
        alpha: 1,
        blend: 'normal' as const,
        compositemode: 'source-over' as const,
        compositealpha: 1,
        maskData: undefined as unknown as PimcoMaskSubstitutionCompiled,
      };

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await slave.renderLayer(layer, 500, 500, 0);

      expect(result).toBeNull();
      consoleWarn.mockRestore();
    });

    it('should render text layer successfully', async () => {
      const layer = createTextLayerDescriptor({
        maskData: {
          content: 'Test',
        },
      });

      const result = await slave.renderLayer(layer, 500, 500, 0);

      expect(result).toBeDefined();
      expect(result?.bitmap).toBeDefined();
      expect(result?.index).toBe(0);
      expect(result?.compositemode).toBe('source-over');
      expect(result?.compositealpha).toBe(1);
    });

    it('should apply post-mask when available', async () => {
      const postMaskBitmap = createMockImageBitmap();
      slave.registerAsset(10, postMaskBitmap);

      const layer = createTextLayerDescriptor({
        assetIds: {
          image: 1,
          postmask: 10,
        },
        maskData: {
          content: 'Test',
        },
      });

      const result = await slave.renderLayer(layer, 500, 500, 0);

      expect(result).toBeDefined();
      expect(result?.bitmap).toBeDefined();
    });

    it('should preserve layer index', async () => {
      const layer = createTextLayerDescriptor();

      const result = await slave.renderLayer(layer, 500, 500, 5);

      expect(result?.index).toBe(5);
    });

    it('should preserve composite settings', async () => {
      const layer = createTextLayerDescriptor({
        compositemode: 'multiply',
        compositealpha: 0.5,
      });

      const result = await slave.renderLayer(layer, 500, 500, 0);

      expect(result?.compositemode).toBe('multiply');
      expect(result?.compositealpha).toBe(0.5);
    });
  });

  describe('renderBatch', () => {
    it('should render empty batch', async () => {
      const results = await slave.renderBatch([], 500, 500);

      expect(results).toEqual([]);
    });

    it('should render single layer', async () => {
      const layers = [createTextLayerDescriptor()];

      const results = await slave.renderBatch(layers, 500, 500);

      expect(results).toHaveLength(1);
      expect(results[0].bitmap).toBeDefined();
    });

    it('should render multiple layers', async () => {
      const layers = [
        createTextLayerDescriptor({ id: 'layer1', maskData: { content: 'Layer 1' } }),
        createTextLayerDescriptor({ id: 'layer2', maskData: { content: 'Layer 2' } }),
        createTextLayerDescriptor({ id: 'layer3', maskData: { content: 'Layer 3' } }),
      ];

      const results = await slave.renderBatch(layers, 500, 500);

      expect(results).toHaveLength(3);
      expect(results[0].index).toBe(0);
      expect(results[1].index).toBe(1);
      expect(results[2].index).toBe(2);
    });

    it('should reset abort flag at start', async () => {
      slave.abort();
      expect(slave.isAborted()).toBe(true);

      await slave.renderBatch([], 500, 500);

      expect(slave.isAborted()).toBe(false);
    });

    it('should stop rendering when aborted', async () => {
      const layers = [
        createTextLayerDescriptor({ id: 'layer1', maskData: { content: 'Layer 1' } }),
        createTextLayerDescriptor({ id: 'layer2', maskData: { content: 'Layer 2' } }),
        createTextLayerDescriptor({ id: 'layer3', maskData: { content: 'Layer 3' } }),
      ];

      // Abort after first layer
      let layerCount = 0;
      const originalRenderLayer = slave.renderLayer.bind(slave);
      vi.spyOn(slave, 'renderLayer').mockImplementation(async (...args) => {
        layerCount++;
        if (layerCount >= 2) {
          slave.abort();
        }
        return originalRenderLayer(...args);
      });

      const results = await slave.renderBatch(layers, 500, 500);

      // Should have rendered 1-2 layers before abort
      expect(results.length).toBeLessThan(3);
    });

    it('should skip failed layers', async () => {
      const layers = [
        createTextLayerDescriptor({ id: 'layer1', maskData: { content: 'Good' } }),
        {
          ...createTextLayerDescriptor({ id: 'layer2' }),
          maskData: undefined as unknown as PimcoMaskSubstitutionCompiled,
        }, // Invalid
        createTextLayerDescriptor({ id: 'layer3', maskData: { content: 'Good' } }),
      ];

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const results = await slave.renderBatch(layers, 500, 500);

      // Should have 2 successful renders (indices 0 and 2)
      expect(results).toHaveLength(2);
      consoleWarn.mockRestore();
    });
  });

  describe('destroy', () => {
    it('should clear assets on destroy', () => {
      slave.registerAsset(1, createMockImageBitmap());
      slave.registerFont(1, 'TestFont', new ArrayBuffer(100));

      slave.destroy();

      expect(slave.hasAsset(1)).toBe(false);
      expect(slave.hasFont(1)).toBe(false);
    });
  });
});

describe('textResultsToSegments', () => {
  it('should convert empty results to empty segments', () => {
    const segments = textResultsToSegments([]);
    expect(segments).toEqual([]);
  });

  it('should convert results to segments', () => {
    const results: TextLayerResult[] = [
      {
        bitmap: createMockImageBitmap(),
        index: 0,
        compositemode: 'source-over',
        compositealpha: 1,
      },
      {
        bitmap: createMockImageBitmap(),
        index: 1,
        compositemode: 'multiply',
        compositealpha: 0.5,
      },
    ];

    const segments = textResultsToSegments(results);

    expect(segments).toHaveLength(2);
    expect(segments[0].compositemode).toBe('source-over');
    expect(segments[0].compositealpha).toBe(1);
    expect(segments[1].compositemode).toBe('multiply');
    expect(segments[1].compositealpha).toBe(0.5);
  });

  it('should preserve bitmap references', () => {
    const bitmap = createMockImageBitmap();
    const results: TextLayerResult[] = [
      {
        bitmap,
        index: 0,
        compositemode: 'source-over',
        compositealpha: 1,
      },
    ];

    const segments = textResultsToSegments(results);

    expect(segments[0].bitmap).toBe(bitmap);
  });

  it('should not include index in segments', () => {
    const results: TextLayerResult[] = [
      {
        bitmap: createMockImageBitmap(),
        index: 5,
        compositemode: 'source-over',
        compositealpha: 1,
      },
    ];

    const segments = textResultsToSegments(results);

    expect(segments[0]).not.toHaveProperty('index');
  });
});
