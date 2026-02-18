/**
 * Unit tests for batch-segmenter.ts
 *
 * Tests the batch segmentation logic that groups consecutive layers
 * with combinable composite modes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  COMBINABLE_MODES,
  isCombinableMode,
  segmentLayerResults,
  createSegmentationContext,
  batchSegmentResults,
} from './batch-segmenter';
import type { LayerResult } from './index';
import type { CanvasCompositeOperation } from '../types/pimco';

// =============================================================================
// Mocks
// =============================================================================

// Mock canvas utilities
vi.mock('../utils/canvas', () => {
  const mockCtx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    canvas: { width: 100, height: 100 },
  };

  const mockCanvas = {
    width: 100,
    height: 100,
    getContext: vi.fn().mockReturnValue(mockCtx),
  };

  return {
    createCanvasWithContext: vi.fn().mockImplementation((width: number, height: number) => ({
      canvas: { ...mockCanvas, width, height },
      ctx: { ...mockCtx, canvas: { width, height } },
    })),
    clearCanvas: vi.fn(),
    canvasToImageBitmap: vi.fn().mockImplementation(() => Promise.resolve(createMockImageBitmap())),
  };
});

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

/**
 * Create a layer result for testing.
 */
function createLayerResult(
  index: number,
  compositemode: CanvasCompositeOperation = 'source-over',
  compositealpha = 1
): LayerResult {
  return {
    bitmap: createMockImageBitmap(),
    index,
    compositemode,
    compositealpha,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('COMBINABLE_MODES', () => {
  it('should include source-over', () => {
    expect(COMBINABLE_MODES.has('source-over')).toBe(true);
  });

  it('should include screen', () => {
    expect(COMBINABLE_MODES.has('screen')).toBe(true);
  });

  it('should include lighten', () => {
    expect(COMBINABLE_MODES.has('lighten')).toBe(true);
  });

  it('should include lighter', () => {
    expect(COMBINABLE_MODES.has('lighter')).toBe(true);
  });

  it('should have exactly 4 combinable modes', () => {
    expect(COMBINABLE_MODES.size).toBe(4);
  });

  it('should not include non-combinable modes', () => {
    const nonCombinable: CanvasCompositeOperation[] = [
      'source-in',
      'source-out',
      'source-atop',
      'destination-over',
      'destination-in',
      'destination-out',
      'destination-atop',
      'copy',
      'xor',
      'multiply',
      'overlay',
      'darken',
      'color-dodge',
      'color-burn',
      'hard-light',
      'soft-light',
      'difference',
      'exclusion',
      'hue',
      'saturation',
      'color',
      'luminosity',
    ];

    for (const mode of nonCombinable) {
      expect(COMBINABLE_MODES.has(mode)).toBe(false);
    }
  });
});

describe('isCombinableMode', () => {
  it('should return true for combinable modes', () => {
    expect(isCombinableMode('source-over')).toBe(true);
    expect(isCombinableMode('screen')).toBe(true);
    expect(isCombinableMode('lighten')).toBe(true);
    expect(isCombinableMode('lighter')).toBe(true);
  });

  it('should return false for non-combinable modes', () => {
    expect(isCombinableMode('multiply')).toBe(false);
    expect(isCombinableMode('overlay')).toBe(false);
    expect(isCombinableMode('destination-in')).toBe(false);
    expect(isCombinableMode('source-in')).toBe(false);
    expect(isCombinableMode('difference')).toBe(false);
  });
});

describe('segmentLayerResults', () => {
  it('should return empty array for empty input', () => {
    const segments = segmentLayerResults([]);
    expect(segments).toEqual([]);
  });

  it('should create single segment for one combinable layer', () => {
    const results = [createLayerResult(0, 'source-over')];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(1);
    expect(segments[0].layers.length).toBe(1);
    expect(segments[0].compositemode).toBe('source-over');
  });

  it('should create single segment for one non-combinable layer', () => {
    const results = [createLayerResult(0, 'multiply')];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(1);
    expect(segments[0].layers.length).toBe(1);
    expect(segments[0].compositemode).toBe('multiply');
  });

  it('should group consecutive combinable layers', () => {
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'lighten'),
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(1);
    expect(segments[0].layers.length).toBe(3);
    expect(segments[0].compositemode).toBe('source-over'); // First layer's mode
  });

  it('should create standalone segment for non-combinable layer', () => {
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'multiply'),
      createLayerResult(2, 'source-over'),
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(3);
    expect(segments[0].layers.length).toBe(1);
    expect(segments[0].compositemode).toBe('source-over');
    expect(segments[1].layers.length).toBe(1);
    expect(segments[1].compositemode).toBe('multiply');
    expect(segments[2].layers.length).toBe(1);
    expect(segments[2].compositemode).toBe('source-over');
  });

  it('should group combinable layers between non-combinable layers', () => {
    const results = [
      createLayerResult(0, 'multiply'), // standalone
      createLayerResult(1, 'source-over'), // group start
      createLayerResult(2, 'screen'), // grouped
      createLayerResult(3, 'overlay'), // standalone
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(3);
    expect(segments[0].layers.length).toBe(1);
    expect(segments[0].compositemode).toBe('multiply');
    expect(segments[1].layers.length).toBe(2);
    expect(segments[1].compositemode).toBe('source-over');
    expect(segments[2].layers.length).toBe(1);
    expect(segments[2].compositemode).toBe('overlay');
  });

  it('should handle consecutive non-combinable layers', () => {
    const results = [
      createLayerResult(0, 'multiply'),
      createLayerResult(1, 'overlay'),
      createLayerResult(2, 'difference'),
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(3);
    segments.forEach((segment, i) => {
      expect(segment.layers.length).toBe(1);
      expect(segment.layers[0].index).toBe(i);
    });
  });

  it('should preserve compositealpha from first layer in segment', () => {
    const results = [
      { ...createLayerResult(0, 'source-over'), compositealpha: 0.5 },
      { ...createLayerResult(1, 'screen'), compositealpha: 0.8 },
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(1);
    expect(segments[0].compositealpha).toBe(0.5);
  });

  it('should handle all combinable modes in sequence', () => {
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'lighten'),
      createLayerResult(3, 'lighter'),
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(1);
    expect(segments[0].layers.length).toBe(4);
  });

  it('should handle complex mixed sequence', () => {
    const results = [
      createLayerResult(0, 'source-over'), // group 1
      createLayerResult(1, 'screen'), // group 1
      createLayerResult(2, 'destination-in'), // standalone
      createLayerResult(3, 'lighter'), // group 2
      createLayerResult(4, 'lighten'), // group 2
      createLayerResult(5, 'xor'), // standalone
      createLayerResult(6, 'source-over'), // group 3
    ];
    const segments = segmentLayerResults(results);

    expect(segments.length).toBe(5);
    expect(segments[0].layers.length).toBe(2); // source-over, screen
    expect(segments[1].layers.length).toBe(1); // destination-in
    expect(segments[2].layers.length).toBe(2); // lighter, lighten
    expect(segments[3].layers.length).toBe(1); // xor
    expect(segments[4].layers.length).toBe(1); // source-over
  });
});

describe('createSegmentationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create context with correct dimensions', () => {
    const ctx = createSegmentationContext(800, 600);

    expect(ctx.width).toBe(800);
    expect(ctx.height).toBe(600);
    expect(ctx.canvas).toBeDefined();
    expect(ctx.ctx).toBeDefined();
  });
});

describe('batchSegmentResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array for empty input', async () => {
    const segments = await batchSegmentResults([], 100, 100);
    expect(segments).toEqual([]);
  });

  it('should return single segment for one layer', async () => {
    const results = [createLayerResult(0, 'source-over')];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(1);
    expect(segments[0].compositemode).toBe('source-over');
    expect(segments[0].compositealpha).toBe(1);
  });

  it('should compose multiple combinable layers into single segment', async () => {
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'lighten'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(1);
    expect(segments[0].compositemode).toBe('source-over');
    expect(segments[0].bitmap).toBeDefined();
  });

  it('should create separate segments for non-combinable layers', async () => {
    const results = [createLayerResult(0, 'multiply'), createLayerResult(1, 'overlay')];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(2);
    expect(segments[0].compositemode).toBe('multiply');
    expect(segments[1].compositemode).toBe('overlay');
  });

  it('should preserve bitmap for single-layer segments', async () => {
    const result = createLayerResult(0, 'multiply');
    const originalBitmap = result.bitmap;

    const segments = await batchSegmentResults([result], 100, 100);

    // Single layer should use original bitmap (no composition needed)
    expect(segments[0].bitmap).toBe(originalBitmap);
  });

  it('should preserve compositealpha for segments', async () => {
    const results = [{ ...createLayerResult(0, 'source-over'), compositealpha: 0.7 }];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments[0].compositealpha).toBe(0.7);
  });

  it('should handle mixed sequence correctly', async () => {
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'multiply'),
      createLayerResult(3, 'lighten'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(3);
    expect(segments[0].compositemode).toBe('source-over'); // Combined: source-over + screen
    expect(segments[1].compositemode).toBe('multiply'); // Standalone
    expect(segments[2].compositemode).toBe('lighten'); // Standalone (single combinable)
  });
});

describe('edge cases', () => {
  it('should handle single layer with each combinable mode', async () => {
    const modes: CanvasCompositeOperation[] = ['source-over', 'screen', 'lighten', 'lighter'];

    for (const mode of modes) {
      const results = [createLayerResult(0, mode)];
      const segments = await batchSegmentResults(results, 100, 100);

      expect(segments.length).toBe(1);
      expect(segments[0].compositemode).toBe(mode);
    }
  });

  it('should handle single layer with each non-combinable mode', async () => {
    const modes: CanvasCompositeOperation[] = [
      'multiply',
      'overlay',
      'destination-in',
      'source-in',
      'xor',
    ];

    for (const mode of modes) {
      const results = [createLayerResult(0, mode)];
      const segments = await batchSegmentResults(results, 100, 100);

      expect(segments.length).toBe(1);
      expect(segments[0].compositemode).toBe(mode);
    }
  });

  it('should handle zero compositealpha', async () => {
    const results = [{ ...createLayerResult(0, 'source-over'), compositealpha: 0 }];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments[0].compositealpha).toBe(0);
  });

  it('should handle large number of layers', async () => {
    const results: LayerResult[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(createLayerResult(i, 'source-over'));
    }

    const segments = await batchSegmentResults(results, 100, 100);

    // All 100 source-over layers should be combined into 1 segment
    expect(segments.length).toBe(1);
  });

  it('should handle alternating combinable/non-combinable modes', async () => {
    const results: LayerResult[] = [];
    for (let i = 0; i < 10; i++) {
      results.push(createLayerResult(i, i % 2 === 0 ? 'source-over' : 'multiply'));
    }

    const segments = await batchSegmentResults(results, 100, 100);

    // Each layer becomes its own segment since they alternate
    expect(segments.length).toBe(10);
  });
});

describe('orderIndex tracking', () => {
  it('should set orderIndex to layer index for single-layer segments', async () => {
    const results = [createLayerResult(5, 'multiply')];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(1);
    expect(segments[0].orderIndex).toBe(5);
  });

  it('should set orderIndex to highest layer index when layers are combined', async () => {
    // Layers 0, 1, 2 combined into one segment - orderIndex should be 2 (the top layer)
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'lighten'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(1);
    expect(segments[0].orderIndex).toBe(2);
  });

  it('should track orderIndex correctly in mixed sequences', async () => {
    // Scenario from bug report:
    // [Layer 0 (source-over), Layer 1 (screen), Layer 2 (multiply), Layer 3 (lighten)]
    // After batching: Segment 0 (0+1 combined), Segment 1 (2 alone), Segment 2 (3 alone)
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'multiply'),
      createLayerResult(3, 'lighten'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(3);
    expect(segments[0].orderIndex).toBe(1); // Combined 0+1, top is 1
    expect(segments[1].orderIndex).toBe(2); // Single layer 2
    expect(segments[2].orderIndex).toBe(3); // Single layer 3
  });

  it('should handle non-sequential indices correctly', async () => {
    // Simulate when slaves receive non-sequential layers (e.g., text layers filtered out)
    // Gaps in indices indicate sandwiched layers from other slaves, so we must NOT combine
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(2, 'screen'), // Note: index 1 is missing (handled by text slave)
      createLayerResult(4, 'lighten'), // Note: index 3 is missing (handled by text slave)
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    // Each layer becomes its own segment due to gaps
    expect(segments.length).toBe(3);
    expect(segments[0].orderIndex).toBe(0);
    expect(segments[1].orderIndex).toBe(2);
    expect(segments[2].orderIndex).toBe(4);
  });

  it('should preserve orderIndex for each non-combinable layer', async () => {
    const results = [
      createLayerResult(10, 'multiply'),
      createLayerResult(11, 'overlay'),
      createLayerResult(12, 'difference'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(3);
    expect(segments[0].orderIndex).toBe(10);
    expect(segments[1].orderIndex).toBe(11);
    expect(segments[2].orderIndex).toBe(12);
  });

  it('should handle complex mixed sequence with correct orderIndex values', async () => {
    // This tests the full scenario from the bug report
    const results = [
      createLayerResult(0, 'source-over'), // group 1
      createLayerResult(1, 'screen'), // group 1
      createLayerResult(2, 'destination-in'), // standalone
      createLayerResult(3, 'lighter'), // group 2
      createLayerResult(4, 'lighten'), // group 2
      createLayerResult(5, 'xor'), // standalone
      createLayerResult(6, 'source-over'), // group 3 (single layer)
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(5);
    expect(segments[0].orderIndex).toBe(1); // 0+1 combined, top is 1
    expect(segments[1].orderIndex).toBe(2); // standalone
    expect(segments[2].orderIndex).toBe(4); // 3+4 combined, top is 4
    expect(segments[3].orderIndex).toBe(5); // standalone
    expect(segments[4].orderIndex).toBe(6); // single layer
  });
});

describe('index gap detection (sandwiched text layers)', () => {
  it('should NOT combine layers across index gaps', async () => {
    // Scenario: Standard slave gets layers 1, 2, 3, 5 (layer 4 is text, sent to text slave)
    // Even though all layers are combinable (source-over), we should NOT combine
    // layers 1-3 with layer 5 because layer 4 needs to be sandwiched between them
    const results = [
      createLayerResult(1, 'source-over'),
      createLayerResult(2, 'source-over'),
      createLayerResult(3, 'source-over'),
      createLayerResult(5, 'source-over'), // Gap at index 4!
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    // Should create TWO segments, not one
    expect(segments.length).toBe(2);
    expect(segments[0].orderIndex).toBe(3); // Layers 1+2+3 combined, top is 3
    expect(segments[1].orderIndex).toBe(5); // Layer 5 alone
  });

  it('should detect gaps at the beginning of batch', async () => {
    // Layers 0 sent to text slave, standard slave gets 1, 2, 3
    const results = [
      createLayerResult(1, 'source-over'), // Note: starts at 1, not 0
      createLayerResult(2, 'source-over'),
      createLayerResult(3, 'source-over'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    // All consecutive, should combine
    expect(segments.length).toBe(1);
    expect(segments[0].orderIndex).toBe(3);
  });

  it('should handle multiple gaps in sequence', async () => {
    // Text layers at indices 1 and 4
    // Standard slave gets: 0, 2, 3, 5, 6
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(2, 'source-over'), // Gap at 1
      createLayerResult(3, 'source-over'),
      createLayerResult(5, 'source-over'), // Gap at 4
      createLayerResult(6, 'source-over'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    // Should create THREE segments: [0], [2+3], [5+6]
    expect(segments.length).toBe(3);
    expect(segments[0].orderIndex).toBe(0); // Layer 0 alone (gap after)
    expect(segments[1].orderIndex).toBe(3); // Layers 2+3 combined
    expect(segments[2].orderIndex).toBe(6); // Layers 5+6 combined
  });

  it('should break segments at gaps even with large consecutive runs', async () => {
    // Many consecutive layers, then a gap, then more
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'source-over'),
      createLayerResult(2, 'source-over'),
      createLayerResult(3, 'source-over'),
      createLayerResult(4, 'source-over'),
      // Gap at index 5 (text layer)
      createLayerResult(6, 'source-over'),
      createLayerResult(7, 'source-over'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(2);
    expect(segments[0].orderIndex).toBe(4); // Layers 0-4 combined
    expect(segments[1].orderIndex).toBe(7); // Layers 6-7 combined
  });

  it('should handle gap followed by non-combinable mode', async () => {
    // Gap at index 2, and layer 3 is non-combinable
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'source-over'),
      // Gap at index 2
      createLayerResult(3, 'multiply'), // Non-combinable
      createLayerResult(4, 'source-over'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(3);
    expect(segments[0].orderIndex).toBe(1); // 0+1 combined
    expect(segments[1].orderIndex).toBe(3); // standalone multiply
    expect(segments[2].orderIndex).toBe(4); // standalone source-over
  });

  it('should still combine consecutive layers when there are no gaps', async () => {
    // No gaps - normal behavior should still work
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'screen'),
      createLayerResult(2, 'lighten'),
      createLayerResult(3, 'lighter'),
    ];
    const segments = await batchSegmentResults(results, 100, 100);

    expect(segments.length).toBe(1);
    expect(segments[0].orderIndex).toBe(3);
  });
});

describe('segmentation optimization', () => {
  it('should reduce segment count for consecutive combinable modes', async () => {
    // Without batching: 5 segments
    // With batching: 1 segment
    const results = [
      createLayerResult(0, 'source-over'),
      createLayerResult(1, 'source-over'),
      createLayerResult(2, 'screen'),
      createLayerResult(3, 'lighten'),
      createLayerResult(4, 'lighter'),
    ];

    const segments = await batchSegmentResults(results, 100, 100);
    expect(segments.length).toBe(1);
    expect(segments.length).toBeLessThan(results.length);
  });

  it('should not combine when modes are non-combinable', async () => {
    // Each layer must be its own segment
    const results = [
      createLayerResult(0, 'multiply'),
      createLayerResult(1, 'overlay'),
      createLayerResult(2, 'difference'),
      createLayerResult(3, 'exclusion'),
    ];

    const segments = await batchSegmentResults(results, 100, 100);
    expect(segments.length).toBe(results.length);
  });
});
