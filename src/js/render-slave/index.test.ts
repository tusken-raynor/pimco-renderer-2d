/**
 * Unit tests for render-slave index.ts (RenderSlave class)
 *
 * Tests the Standard Render Slave for processing conventional image layers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RenderSlave, resultsToSegments, type LayerResult } from './index';
import type { LayerDescriptor } from '../types/messages';

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

/**
 * Create a layer descriptor for testing.
 */
function createLayerDescriptor(overrides: Partial<LayerDescriptor> = {}): LayerDescriptor {
  return {
    id: 'test-layer',
    assetIds: {
      image: 1,
      mask: 2,
    },
    mode: 'color',
    color: '#ff0000',
    alpha: 1,
    blend: 'normal',
    compositemode: 'source-over',
    compositealpha: 1,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('RenderSlave', () => {
  let slave: RenderSlave;

  beforeEach(() => {
    slave = new RenderSlave();
  });

  afterEach(() => {
    slave.destroy();
  });

  describe('asset management', () => {
    it('should register and retrieve assets', () => {
      const bitmap = createMockImageBitmap();
      slave.registerAsset(1, bitmap);

      expect(slave.hasAsset(1)).toBe(true);
      expect(slave.getAsset(1)).toBe(bitmap);
    });

    it('should return undefined for unregistered assets', () => {
      expect(slave.hasAsset(999)).toBe(false);
      expect(slave.getAsset(999)).toBeUndefined();
    });

    it('should clear all assets', () => {
      slave.registerAsset(1, createMockImageBitmap());
      slave.registerAsset(2, createMockImageBitmap());
      slave.registerAsset(3, createMockImageBitmap());

      expect(slave.hasAsset(1)).toBe(true);
      expect(slave.hasAsset(2)).toBe(true);
      expect(slave.hasAsset(3)).toBe(true);

      slave.clearAssets();

      expect(slave.hasAsset(1)).toBe(false);
      expect(slave.hasAsset(2)).toBe(false);
      expect(slave.hasAsset(3)).toBe(false);
    });

    it('should overwrite assets with same id', () => {
      const bitmap1 = createMockImageBitmap(100, 100);
      const bitmap2 = createMockImageBitmap(200, 200);

      slave.registerAsset(1, bitmap1);
      expect(slave.getAsset(1)).toBe(bitmap1);

      slave.registerAsset(1, bitmap2);
      expect(slave.getAsset(1)).toBe(bitmap2);
    });
  });

  describe('abort handling', () => {
    it('should start in non-aborted state', () => {
      expect(slave.isAborted()).toBe(false);
    });

    it('should set aborted flag when abort() called', () => {
      slave.abort();
      expect(slave.isAborted()).toBe(true);
    });

    it('should reset aborted flag when resetAbort() called', () => {
      slave.abort();
      expect(slave.isAborted()).toBe(true);

      slave.resetAbort();
      expect(slave.isAborted()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clear assets on destroy', () => {
      slave.registerAsset(1, createMockImageBitmap());
      slave.registerAsset(2, createMockImageBitmap());

      slave.destroy();

      expect(slave.hasAsset(1)).toBe(false);
      expect(slave.hasAsset(2)).toBe(false);
    });
  });
});

describe('resultsToSegments', () => {
  it('should convert layer results to render segments', () => {
    const bitmap1 = createMockImageBitmap();
    const bitmap2 = createMockImageBitmap();

    const results: LayerResult[] = [
      {
        bitmap: bitmap1,
        index: 0,
        compositemode: 'source-over',
        compositealpha: 1,
      },
      {
        bitmap: bitmap2,
        index: 1,
        compositemode: 'multiply',
        compositealpha: 0.8,
      },
    ];

    const segments = resultsToSegments(results);

    expect(segments.length).toBe(2);

    expect(segments[0].bitmap).toBe(bitmap1);
    expect(segments[0].compositemode).toBe('source-over');
    expect(segments[0].compositealpha).toBe(1);

    expect(segments[1].bitmap).toBe(bitmap2);
    expect(segments[1].compositemode).toBe('multiply');
    expect(segments[1].compositealpha).toBe(0.8);
  });

  it('should return empty array for empty results', () => {
    const segments = resultsToSegments([]);
    expect(segments).toEqual([]);
  });

  it('should preserve all composite modes', () => {
    const compositeModes: ('source-over' | 'multiply' | 'screen' | 'overlay')[] = [
      'source-over',
      'multiply',
      'screen',
      'overlay',
    ];

    const results: LayerResult[] = compositeModes.map((mode, index) => ({
      bitmap: createMockImageBitmap(),
      index,
      compositemode: mode,
      compositealpha: 1,
    }));

    const segments = resultsToSegments(results);

    compositeModes.forEach((mode, index) => {
      expect(segments[index].compositemode).toBe(mode);
    });
  });
});

describe('LayerDescriptor handling', () => {
  it('should create valid layer descriptor with required fields', () => {
    const descriptor = createLayerDescriptor();

    expect(descriptor.id).toBe('test-layer');
    expect(descriptor.assetIds.image).toBe(1);
    expect(descriptor.assetIds.mask).toBe(2);
    expect(descriptor.mode).toBe('color');
    expect(descriptor.alpha).toBe(1);
    expect(descriptor.blend).toBe('normal');
    expect(descriptor.compositemode).toBe('source-over');
    expect(descriptor.compositealpha).toBe(1);
  });

  it('should create layer descriptor with optional fields', () => {
    const descriptor = createLayerDescriptor({
      assetIds: {
        image: 1,
        mask: 2,
        texture: 3,
        hlimage1: 4,
        hlimage2: 5,
      },
      hlalpha1: 0.5,
      hlblend1: 'screen',
      hlalpha2: 0.3,
      hlblend2: 'overlay',
      placement: {
        left: 0.1,
        top: 0.2,
        width: 0.8,
        height: 0.6,
      },
    });

    expect(descriptor.assetIds.texture).toBe(3);
    expect(descriptor.assetIds.hlimage1).toBe(4);
    expect(descriptor.assetIds.hlimage2).toBe(5);
    expect(descriptor.hlalpha1).toBe(0.5);
    expect(descriptor.hlblend1).toBe('screen');
    expect(descriptor.hlalpha2).toBe(0.3);
    expect(descriptor.hlblend2).toBe('overlay');
    expect(descriptor.placement?.left).toBe(0.1);
  });

  it('should handle image mode', () => {
    const descriptor = createLayerDescriptor({
      mode: 'image',
      assetIds: {
        image: 1,
        mask: 2,
        texture: 3,
      },
    });

    expect(descriptor.mode).toBe('image');
    expect(descriptor.assetIds.texture).toBe(3);
  });
});

describe('edge cases', () => {
  it('should handle layer descriptor with missing optional assetIds', () => {
    const descriptor = createLayerDescriptor({
      assetIds: {
        image: 1,
        mask: 2,
        // No texture, hlimage1, hlimage2
      },
    });

    expect(descriptor.assetIds.texture).toBeUndefined();
    expect(descriptor.assetIds.hlimage1).toBeUndefined();
    expect(descriptor.assetIds.hlimage2).toBeUndefined();
  });

  it('should handle zero alpha values', () => {
    const descriptor = createLayerDescriptor({
      alpha: 0,
      compositealpha: 0,
    });

    expect(descriptor.alpha).toBe(0);
    expect(descriptor.compositealpha).toBe(0);
  });

  it('should handle various blend modes', () => {
    const blendModes: ('normal' | 'multiply' | 'screen' | 'overlay')[] = [
      'normal',
      'multiply',
      'screen',
      'overlay',
    ];

    blendModes.forEach((blend) => {
      const descriptor = createLayerDescriptor({ blend });
      expect(descriptor.blend).toBe(blend);
    });
  });
});
