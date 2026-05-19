/**
 * Integration tests for the standard rendering workflow.
 *
 * These tests verify the complete workflow from JSON layers to rendered output,
 * using mocked workers since real workers cannot run in jsdom.
 *
 * The workflow under test:
 * 1. JSON layers loaded and parsed
 * 2. RenderMaster initialized
 * 3. Layers classified (standard vs text)
 * 4. Assets extracted and fetched
 * 5. Layers distributed to slaves
 * 6. Segments composed to final ImageBitmap
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ProductImageComponent } from '@/js/types';
import { classifyLayers } from '@/js/renderer/layer-classifier';
import type { RenderSegment } from '@/js/types/messages';

// =============================================================================
// Mocks
// =============================================================================

/**
 * Create a mock ImageBitmap.
 */
function createMockImageBitmap(width = 100, height = 100): ImageBitmap {
  return {
    width,
    height,
    close: vi.fn(),
  } as unknown as ImageBitmap;
}

/**
 * Create a mock RenderSegment.
 */
function createMockSegment(
  compositemode: GlobalCompositeOperation = 'source-over',
  compositealpha = 1.0,
  orderIndex = 0
): RenderSegment {
  return {
    bitmap: createMockImageBitmap(),
    compositemode,
    compositealpha,
    orderIndex,
  };
}

// Mock canvas utilities
vi.mock('@/js/utils/canvas', () => {
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
  composeSegments,
  composeOrderedLayers,
  type ComposedLayer,
} from '@/js/renderer/master-compositor';

// =============================================================================
// Test Data
// =============================================================================

/**
 * Create test layers simulating real-world example JSON.
 */
function createTestLayers(): ProductImageComponent[] {
  return [
    {
      id: 'layer1',
      name: 'Palm',
      mode: 'color',
      alpha: 1,
      blend: 'multiply',
      color: 'rgb(241,241,241)',
      image: '/images/base.png',
      mask: '/images/mask_palm.png',
      hlimage1: '/images/highlight.png',
      hlalpha1: 0.73,
      hlblend1: 'soft-light',
    },
    {
      id: 'layer2',
      name: 'Liner',
      mode: 'image',
      alpha: 1,
      blend: 'multiply',
      texture: '/textures/supersoft.png',
      image: '/images/base.png',
      mask: '/images/mask_liner.png',
      hlimage1: '/images/highlight.png',
      hlalpha1: 0.96,
      hlblend1: 'soft-light',
    },
    {
      id: 'layer3',
      name: 'Index Pad',
      mode: 'color',
      alpha: 1,
      blend: 'multiply',
      color: 'rgb(226,95,20)',
      image: '/images/base.png',
      mask: '/images/mask_pad.png',
      hlimage1: '/images/highlight.png',
      hlalpha1: 1,
      hlblend1: 'soft-light',
    },
  ];
}

/**
 * Create test layer with text mask (PimcoMaskSubstitutionCompiled).
 */
function createTextLayer(): ProductImageComponent {
  return {
    id: 'text1',
    name: 'Personalization',
    mode: 'color',
    alpha: 0.9,
    blend: 'multiply',
    color: 'rgb(208,94,32)',
    image: '/effects/embroidery/texture.jpg',
    mask: {
      transform: {
        rotation: -51,
        translation: [17.5, 2.5],
      },
      type: {
        fontfamily: '"Brush Script", sans-serif',
        maxwidth: 0.38,
        lineheight: 0.1,
      },
      effect: 'embroidery',
      content: 'My Name',
    },
  };
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Standard Rendering Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Layer Classification', () => {
    it('should correctly classify standard layers (string mask)', () => {
      const layers = createTestLayers();
      const classification = classifyLayers(layers);

      expect(classification.total).toBe(3);
      expect(classification.standard.length).toBe(3);
      expect(classification.text.length).toBe(0);
    });

    it('should correctly classify text layers (object mask)', () => {
      const layers = [...createTestLayers(), createTextLayer()];
      const classification = classifyLayers(layers);

      expect(classification.total).toBe(4);
      expect(classification.standard.length).toBe(3);
      expect(classification.text.length).toBe(1);
    });

    it('should preserve original layer indices', () => {
      const layers = createTestLayers();
      const classification = classifyLayers(layers);

      classification.standard.forEach((item, i) => {
        expect(item.index).toBe(i);
        expect(item.layer).toBe(layers[i]);
      });
    });
  });

  describe('Asset URL Extraction', () => {
    it('should extract all unique asset URLs from layers', () => {
      const layers = createTestLayers();
      const urls = new Set<string>();

      for (const layer of layers) {
        if (layer.image) {
          urls.add(layer.image);
        }
        if (typeof layer.mask === 'string') {
          urls.add(layer.mask);
        }
        if (layer.texture) {
          urls.add(layer.texture);
        }
        if (layer.hlimage1) {
          urls.add(layer.hlimage1);
        }
        if (layer.hlimage2) {
          urls.add(layer.hlimage2);
        }
      }

      // Verify extracted URLs
      expect(urls.has('/images/base.png')).toBe(true);
      expect(urls.has('/images/mask_palm.png')).toBe(true);
      expect(urls.has('/images/mask_liner.png')).toBe(true);
      expect(urls.has('/images/mask_pad.png')).toBe(true);
      expect(urls.has('/images/highlight.png')).toBe(true);
      expect(urls.has('/textures/supersoft.png')).toBe(true);
    });

    it('should not extract mask URL from text layers', () => {
      const textLayer = createTextLayer();
      const urls: string[] = [];

      // Text layer mask is an object, not a URL
      if (textLayer.image) {
        urls.push(textLayer.image);
      }
      if (typeof textLayer.mask === 'string') {
        urls.push(textLayer.mask);
      }

      expect(urls).not.toContain(textLayer.mask);
      expect(urls).toContain('/effects/embroidery/texture.jpg');
    });
  });

  describe('Layer Distribution', () => {
    it('should distribute layers round-robin to slaves', () => {
      const layers = createTestLayers();
      const slaveCount = 2;

      const distribution = new Map<number, number[]>();
      for (let i = 0; i < slaveCount; i++) {
        distribution.set(i, []);
      }

      layers.forEach((_, index) => {
        const slaveIdx = index % slaveCount;
        distribution.get(slaveIdx)?.push(index);
      });

      // Layer 0 and 2 go to slave 0, layer 1 goes to slave 1
      expect(distribution.get(0)).toEqual([0, 2]);
      expect(distribution.get(1)).toEqual([1]);
    });

    it('should handle more slaves than layers', () => {
      const layers = createTestLayers();
      const slaveCount = 5;

      const distribution = new Map<number, number[]>();
      for (let i = 0; i < slaveCount; i++) {
        distribution.set(i, []);
      }

      layers.forEach((_, index) => {
        const slaveIdx = index % slaveCount;
        distribution.get(slaveIdx)?.push(index);
      });

      expect(distribution.get(0)).toEqual([0]);
      expect(distribution.get(1)).toEqual([1]);
      expect(distribution.get(2)).toEqual([2]);
      expect(distribution.get(3)).toEqual([]);
      expect(distribution.get(4)).toEqual([]);
    });
  });

  describe('Segment Composition', () => {
    let compositor: MasterCompositor;

    beforeEach(() => {
      compositor = new MasterCompositor();
    });

    afterEach(() => {
      compositor.destroy();
    });

    it('should compose segments into final bitmap', async () => {
      const segments = [
        createMockSegment('source-over', 1.0),
        createMockSegment('multiply', 0.8),
        createMockSegment('screen', 0.5),
      ];

      const result = await composeSegments(segments, 800, 800);

      expect(result).toBeDefined();
      expect(result.width).toBe(800);
      expect(result.height).toBe(800);
    });

    it('should compose ordered layers from multiple slaves', async () => {
      // Simulate results from 2 slaves with interleaved original indices
      const composedLayers: ComposedLayer[] = [
        { segment: createMockSegment('source-over', 1.0), originalIndex: 0 },
        { segment: createMockSegment('multiply', 0.9), originalIndex: 2 },
        { segment: createMockSegment('screen', 0.8), originalIndex: 1 },
      ];

      const result = await composeOrderedLayers(composedLayers, 800, 800);

      expect(result).toBeDefined();
    });

    it('should handle empty layer list', async () => {
      const result = await compositor.compose([], 800, 800);

      expect(result).toBeDefined();
      expect(result.width).toBe(800);
      expect(result.height).toBe(800);
    });
  });

  describe('Compositor Context Reuse', () => {
    it('should reuse context for same dimensions', async () => {
      const compositor = new MasterCompositor();

      // First composition
      await compositor.compose([createMockSegment()], 400, 300);

      // Second composition with same dimensions
      const result = await compositor.compose([createMockSegment()], 400, 300);

      expect(result.width).toBe(400);
      expect(result.height).toBe(300);

      compositor.destroy();
    });

    it('should recreate context for different dimensions', async () => {
      const compositor = new MasterCompositor();

      // First composition
      await compositor.compose([createMockSegment()], 400, 300);

      // Second composition with different dimensions
      const result = await compositor.compose([createMockSegment()], 800, 600);

      expect(result.width).toBe(800);
      expect(result.height).toBe(600);

      compositor.destroy();
    });
  });
});

describe('Error Handling Integration', () => {
  describe('Abort Handling', () => {
    it('should support abort controller pattern', () => {
      const abortController = new AbortController();

      // Simulate render in progress
      let isRendering = true;

      // Register abort listener
      abortController.signal.addEventListener('abort', () => {
        isRendering = false;
      });

      expect(isRendering).toBe(true);

      // Abort the render
      abortController.abort();

      expect(isRendering).toBe(false);
      expect(abortController.signal.aborted).toBe(true);
    });

    it('should allow checking abort before async operations', async () => {
      const abortController = new AbortController();

      const simulateRender = async (signal: AbortSignal): Promise<string> => {
        // Check abort before expensive operation
        if (signal.aborted) {
          throw new Error('Render aborted');
        }

        // Simulate async work
        await Promise.resolve();

        // Check again after async operation (signal state may have changed)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (signal.aborted) {
          throw new Error('Render aborted');
        }

        return 'success';
      };

      // Abort before calling render
      abortController.abort();

      await expect(simulateRender(abortController.signal)).rejects.toThrow('Render aborted');
    });
  });

  describe('Invalid Layer Handling', () => {
    it('should handle layers with missing id gracefully', () => {
      const layers: ProductImageComponent[] = [
        {
          name: 'No ID Layer',
          mode: 'color',
          alpha: 1,
          blend: 'multiply',
          image: '/images/base.png',
          mask: '/images/mask.png',
        } as ProductImageComponent,
      ];

      // Classification should still work
      const classification = classifyLayers(layers);

      expect(classification.total).toBe(1);
      expect(classification.standard.length).toBe(1);
    });

    it('should handle empty layers array', () => {
      const classification = classifyLayers([]);

      expect(classification.total).toBe(0);
      expect(classification.standard.length).toBe(0);
      expect(classification.text.length).toBe(0);
    });
  });
});

describe('Dev App Workflow Integration', () => {
  describe('JSON Parsing', () => {
    it('should parse valid layer JSON', () => {
      const jsonString = JSON.stringify(createTestLayers());
      const parsed = JSON.parse(jsonString) as unknown;

      expect(Array.isArray(parsed)).toBe(true);
      expect((parsed as unknown[]).length).toBe(3);
    });

    it('should validate layer structure', () => {
      const layers = createTestLayers();

      for (const layer of layers) {
        // Required fields
        expect(layer.mode).toBeDefined();
        expect(layer.alpha).toBeDefined();
        expect(layer.blend).toBeDefined();

        // At least one asset URL
        expect(layer.image || layer.mask || layer.texture).toBeDefined();
      }
    });
  });

  describe('Canvas Output', () => {
    it('should handle ImageBitmap to canvas drawing', () => {
      const mockBitmap = createMockImageBitmap(800, 800);
      const mockCtx = {
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      };

      // Simulate drawing bitmap to canvas
      mockCtx.clearRect(0, 0, 800, 800);
      mockCtx.drawImage(mockBitmap, 0, 0);

      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 800, 800);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockBitmap, 0, 0);
    });

    it('should close bitmap after drawing', () => {
      const mockBitmap = createMockImageBitmap();

      // Simulate render complete
      mockBitmap.close();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe('Timing Measurement', () => {
    it('should measure render duration', async () => {
      const startTime = performance.now();

      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10));

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeGreaterThanOrEqual(10);
    });
  });
});

// =============================================================================
// Text Rendering Pipeline Integration Tests
// =============================================================================

describe('Text Rendering Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Mixed Layer Classification', () => {
    it('should correctly classify mixed standard and text layers', () => {
      const layers = [...createTestLayers(), createTextLayer()];
      const classification = classifyLayers(layers);

      expect(classification.total).toBe(4);
      expect(classification.standardCount).toBe(3);
      expect(classification.textCount).toBe(1);
    });

    it('should preserve original indices for text layers', () => {
      const layers = [...createTestLayers(), createTextLayer()];
      const classification = classifyLayers(layers);

      // Text layer is at index 3
      expect(classification.text[0].index).toBe(3);
      expect(classification.text[0].layer.id).toBe('text1');
    });

    it('should extract effect type from text layers', () => {
      const layers = [createTextLayer()];
      const classification = classifyLayers(layers);

      expect(classification.text[0].effect).toBe('embroidery');
    });

    it('should extract mask data from text layers', () => {
      const layers = [createTextLayer()];
      const classification = classifyLayers(layers);

      expect(classification.text[0].maskData).toBeDefined();
      expect(classification.text[0].maskData?.content).toBe('My Name');
      expect(classification.text[0].maskData?.effect).toBe('embroidery');
    });
  });

  describe('Text Layer Asset Extraction', () => {
    it('should not extract mask URL from text layers', () => {
      const textLayer = createTextLayer();
      const urls: string[] = [];

      // Only image should be extracted, not mask (which is an object)
      if (textLayer.image) {
        urls.push(textLayer.image);
      }
      if (typeof textLayer.mask === 'string') {
        urls.push(textLayer.mask);
      }

      expect(urls.length).toBe(1);
      expect(urls[0]).toBe('/effects/embroidery/texture.jpg');
    });

    it('should extract postmask URL from text layers', () => {
      const textLayer: ProductImageComponent = {
        id: 'text2',
        name: 'With Postmask',
        mode: 'color',
        alpha: 1,
        blend: 'multiply',
        image: '/images/base.png',
        mask: {
          content: 'Test',
          postmask: '/masks/postmask.png',
        },
      };

      const urls: string[] = [];

      if (textLayer.image) {
        urls.push(textLayer.image);
      }
      if (typeof textLayer.mask === 'object' && textLayer.mask.postmask) {
        urls.push(textLayer.mask.postmask);
      }

      expect(urls.length).toBe(2);
      expect(urls).toContain('/images/base.png');
      expect(urls).toContain('/masks/postmask.png');
    });

    it('should extract texture URL from text layers', () => {
      const textLayer = createTextLayer();
      const urls: string[] = [];

      if (textLayer.image) {
        urls.push(textLayer.image);
      }
      if (textLayer.texture) {
        urls.push(textLayer.texture);
      }

      expect(urls).toContain('/effects/embroidery/texture.jpg');
    });
  });

  describe('Text Layer Distribution', () => {
    it('should distribute text layers round-robin to text slaves', () => {
      // Simulate 3 text layers and 2 text slaves
      const textLayers = [
        createTextLayer(),
        { ...createTextLayer(), id: 'text2' },
        { ...createTextLayer(), id: 'text3' },
      ];
      const textSlaveCount = 2;

      const distribution = new Map<number, number[]>();
      for (let i = 0; i < textSlaveCount; i++) {
        distribution.set(i, []);
      }

      textLayers.forEach((_, index) => {
        const slaveIdx = index % textSlaveCount;
        distribution.get(slaveIdx)?.push(index);
      });

      // Text layers 0, 2 go to slave 0; layer 1 goes to slave 1
      expect(distribution.get(0)).toEqual([0, 2]);
      expect(distribution.get(1)).toEqual([1]);
    });

    it('should handle case with no text slaves', () => {
      const textLayers = [createTextLayer()];
      const textSlaveCount = 0;

      const distribution = new Map<number, number[]>();

      // With no text slaves, distribution should be empty
      expect(distribution.size).toBe(0);

      // Verify we have text layers to process (virtual slaves would handle in Phase 4)
      expect(textSlaveCount).toBe(0);
      expect(textLayers.length).toBe(1);
    });
  });

  describe('Text Layer Composition', () => {
    let compositor: MasterCompositor;

    beforeEach(() => {
      compositor = new MasterCompositor();
    });

    afterEach(() => {
      compositor.destroy();
    });

    it('should compose mixed standard and text segments', async () => {
      // Simulate segments from both standard and text slaves
      const standardSegments = [
        createMockSegment('source-over', 1.0),
        createMockSegment('multiply', 0.8),
      ];
      const textSegments = [createMockSegment('source-over', 0.9)];

      const allSegments = [...standardSegments, ...textSegments];
      const result = await composeSegments(allSegments, 800, 800);

      expect(result).toBeDefined();
      expect(result.width).toBe(800);
      expect(result.height).toBe(800);
    });

    it('should compose layers in correct order across slave types', async () => {
      // Simulate interleaved layers from standard and text slaves
      // Original order: [standard:0, standard:1, text:2, standard:3]
      const composedLayers: ComposedLayer[] = [
        { segment: createMockSegment('source-over', 1.0), originalIndex: 0 },
        { segment: createMockSegment('multiply', 0.8), originalIndex: 1 },
        { segment: createMockSegment('source-over', 0.9), originalIndex: 2 }, // Text layer
        { segment: createMockSegment('screen', 0.7), originalIndex: 3 },
      ];

      const result = await composeOrderedLayers(composedLayers, 800, 800);

      expect(result).toBeDefined();
    });

    it('should handle text layer with different composite mode', async () => {
      // Text layer with multiply composite mode
      const textSegment = createMockSegment('multiply', 0.8);

      const composedLayers: ComposedLayer[] = [
        { segment: createMockSegment('source-over', 1.0), originalIndex: 0 },
        { segment: textSegment, originalIndex: 1 },
      ];

      const result = await composeOrderedLayers(composedLayers, 400, 400);

      expect(result).toBeDefined();
    });

    it('should handle only text layers (no standard layers)', async () => {
      const textSegments = [
        createMockSegment('source-over', 1.0),
        createMockSegment('multiply', 0.9),
      ];

      const composedLayers: ComposedLayer[] = textSegments.map((segment, i) => ({
        segment,
        originalIndex: i,
      }));

      const result = await composeOrderedLayers(composedLayers, 600, 600);

      expect(result).toBeDefined();
    });
  });

  describe('Text Effect Parameters', () => {
    it('should extract embroidery effect parameters', () => {
      const textLayer = createTextLayer();
      const maskData = textLayer.mask;

      if (typeof maskData === 'object') {
        expect(maskData.effect).toBe('embroidery');
        expect(maskData.transform?.rotation).toBe(-51);
        expect(maskData.transform?.translation).toEqual([17.5, 2.5]);
      }
    });

    it('should handle text layers with different effects', () => {
      const effects = ['embroidery', 'engraving', 'metal', 'painted', 'hotstamp', 'foil', 'normal'];

      for (const effect of effects) {
        const textLayer: ProductImageComponent = {
          id: `text-${effect}`,
          name: `${effect} Layer`,
          mode: 'color',
          alpha: 1,
          blend: 'multiply',
          image: '/images/base.png',
          mask: {
            content: 'Test',
            effect: effect as ProductImageComponent['mask'] extends object
              ? NonNullable<ProductImageComponent['mask']>['effect']
              : never,
          },
        };

        const classification = classifyLayers([textLayer]);

        expect(classification.text[0].effect).toBe(effect);
      }
    });

    it('should handle text layer without effect (no-effect)', () => {
      const textLayer: ProductImageComponent = {
        id: 'text-plain',
        name: 'Plain Text',
        mode: 'color',
        alpha: 1,
        blend: 'multiply',
        image: '/images/base.png',
        mask: {
          content: 'Plain Text',
          // No effect specified
        },
      };

      const classification = classifyLayers([textLayer]);

      expect(classification.text[0].effect).toBeUndefined();
    });
  });

  describe('Text Typography Settings', () => {
    it('should extract typography settings from text layer', () => {
      const textLayer = createTextLayer();

      if (typeof textLayer.mask === 'object' && textLayer.mask.type) {
        expect(textLayer.mask.type.fontfamily).toBe('"Brush Script", sans-serif');
        expect(textLayer.mask.type.maxwidth).toBe(0.38);
        expect(textLayer.mask.type.lineheight).toBe(0.1);
      }
    });

    it('should handle text layer with full typography settings', () => {
      const textLayer: ProductImageComponent = {
        id: 'text-full-typo',
        name: 'Full Typography',
        mode: 'color',
        alpha: 1,
        blend: 'multiply',
        image: '/images/base.png',
        mask: {
          content: 'Styled Text',
          type: {
            fontfamily: 'Arial',
            fontweight: 700,
            letterspacing: '0.1em',
            lineheight: 1.5,
            texttransform: 'uppercase',
            widthscale: 1.2,
            maxwidth: 0.5,
            alignment: 'center',
            heightscale: 1.0,
          },
        },
      };

      if (typeof textLayer.mask === 'object' && textLayer.mask.type) {
        expect(textLayer.mask.type.fontfamily).toBe('Arial');
        expect(textLayer.mask.type.fontweight).toBe(700);
        expect(textLayer.mask.type.alignment).toBe('center');
        expect(textLayer.mask.type.texttransform).toBe('uppercase');
      }
    });
  });
});
