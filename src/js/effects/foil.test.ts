import { describe, it, expect } from 'vitest';
import { extractFoilParams, getFoilEffectInfo } from './foil';
import { isOffscreenCanvasSupported } from '../utils/canvas';

/**
 * Check if we're in an environment that supports OffscreenCanvas.
 * Canvas-dependent tests are skipped in Node.js environments.
 */
const hasOffscreenCanvas = (): boolean => {
  try {
    return isOffscreenCanvasSupported();
  } catch {
    return false;
  }
};

// ============================================================================
// extractFoilParams Tests
// ============================================================================

describe('extractFoilParams', () => {
  it('should return default alpha erosion radius when no params', () => {
    const result = extractFoilParams({});

    expect(result.alphaErosionRadius).toBe(1); // Default value
  });

  it('should extract alpha erosion radius from effectparams', () => {
    const result = extractFoilParams({
      effectparams: {
        AlphaErosionRadius: 2.5,
      },
    });

    expect(result.alphaErosionRadius).toBe(2.5);
  });

  it('should handle zero erosion radius', () => {
    const result = extractFoilParams({
      effectparams: {
        AlphaErosionRadius: 0,
      },
    });

    expect(result.alphaErosionRadius).toBe(0);
  });

  it('should ignore non-numeric erosion radius', () => {
    const result = extractFoilParams({
      effectparams: {
        AlphaErosionRadius: 'invalid' as unknown as number,
      },
    });

    expect(result.alphaErosionRadius).toBe(1); // Default value
  });

  it('should handle missing effectparams object', () => {
    const result = extractFoilParams({
      effect: 'foil',
    });

    expect(result.alphaErosionRadius).toBe(1); // Default value
  });

  it('should handle null effectparams', () => {
    const result = extractFoilParams({
      effectparams: null as unknown as Record<string, unknown>,
    });

    expect(result.alphaErosionRadius).toBe(1); // Default value
  });
});

// ============================================================================
// getFoilEffectInfo Tests
// ============================================================================

describe('getFoilEffectInfo', () => {
  it('should return effect info with given erosion radius', () => {
    const result = getFoilEffectInfo(1.5);

    expect(result.erosionRadius).toBe(1.5);
    expect(result.embossThreshold).toBe(43.5);
    expect(result.shadowBlur).toBe(2);
    expect(result.embossBlur).toBe(1);
  });

  it('should return consistent threshold values', () => {
    const result1 = getFoilEffectInfo(1);
    const result2 = getFoilEffectInfo(2);

    // Thresholds should be the same regardless of erosion radius
    expect(result1.embossThreshold).toBe(result2.embossThreshold);
    expect(result1.shadowBlur).toBe(result2.shadowBlur);
    expect(result1.embossBlur).toBe(result2.embossBlur);
  });

  it('should handle zero erosion radius', () => {
    const result = getFoilEffectInfo(0);

    expect(result.erosionRadius).toBe(0);
  });
});

// ============================================================================
// createFoilEmboss Tests (require OffscreenCanvas)
// ============================================================================

describe('createFoilEmboss', () => {
  it.skipIf(!hasOffscreenCanvas())('should create both highlight and shadow canvases', async () => {
    const { createFoilEmboss } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = createFoilEmboss(mockMask, 100, 100);

    expect(result.highlight.canvas.width).toBe(100);
    expect(result.highlight.canvas.height).toBe(100);
    expect(result.shadow.canvas.width).toBe(100);
    expect(result.shadow.canvas.height).toBe(100);
    expect(result.highlight.ctx).toBeDefined();
    expect(result.shadow.ctx).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various canvas sizes', async () => {
    const { createFoilEmboss } = await import('./foil');

    const sizes = [
      [50, 50],
      [200, 100],
      [100, 200],
    ];

    for (const [width, height] of sizes) {
      const mockMask = new OffscreenCanvas(width, height);
      const result = createFoilEmboss(mockMask, width, height);

      expect(result.highlight.canvas.width).toBe(width);
      expect(result.highlight.canvas.height).toBe(height);
      expect(result.shadow.canvas.width).toBe(width);
      expect(result.shadow.canvas.height).toBe(height);
    }
  });
});

// ============================================================================
// applyFoilEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyFoilEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas with correct dimensions for small text (no emboss)',
    async () => {
      const { applyFoilEffect } = await import('./foil');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyFoilEffect({
        width: 100,
        height: 100,
        color: '#ffd700',
        alpha: 1.0,
        blend: 'normal',
        alphaErosionRadius: 1,
        mask: mockMask,
        textHeight: 30, // Below threshold
      });

      // For small text, canvas should match input dimensions
      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );

  it.skipIf(!hasOffscreenCanvas())(
    'should create larger canvas for large text (with shadow offset)',
    async () => {
      const { applyFoilEffect } = await import('./foil');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyFoilEffect({
        width: 100,
        height: 100,
        color: '#ffd700',
        alpha: 1.0,
        blend: 'normal',
        alphaErosionRadius: 1,
        mask: mockMask,
        textHeight: 50, // Above threshold
      });

      // For large text, canvas should be wider due to shadow offset
      expect(result.canvas.width).toBe(102); // width + 2 for shadow
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should handle zero alpha erosion radius', async () => {
    const { applyFoilEffect } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = applyFoilEffect({
      width: 100,
      height: 100,
      color: '#ffd700',
      alpha: 1.0,
      blend: 'normal',
      alphaErosionRadius: 0,
      mask: mockMask,
      textHeight: 30,
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle texture when provided', async () => {
    const { applyFoilEffect } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // Create a mock foil texture
    const textureCanvas = new OffscreenCanvas(50, 50);
    const textureCtx = textureCanvas.getContext('2d');
    if (textureCtx) {
      // Simple gradient for foil
      const gradient = textureCtx.createLinearGradient(0, 0, 50, 50);
      gradient.addColorStop(0, '#ffd700');
      gradient.addColorStop(1, '#ffec8b');
      textureCtx.fillStyle = gradient;
      textureCtx.fillRect(0, 0, 50, 50);
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const result = applyFoilEffect({
      width: 100,
      height: 100,
      color: '#ffd700',
      alpha: 1.0,
      blend: 'normal',
      alphaErosionRadius: 1,
      mask: mockMask,
      texture: textureBitmap,
      textHeight: 50,
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various blend modes', async () => {
    const { applyFoilEffect } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const blendModes = ['normal', 'multiply', 'screen', 'overlay'] as const;

    for (const blend of blendModes) {
      const result = applyFoilEffect({
        width: 100,
        height: 100,
        color: '#ffd700',
        alpha: 1.0,
        blend,
        alphaErosionRadius: 1,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various alpha values', async () => {
    const { applyFoilEffect } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const alphaValues = [0.1, 0.5, 1.0];

    for (const alpha of alphaValues) {
      const result = applyFoilEffect({
        width: 100,
        height: 100,
        color: '#ffd700',
        alpha,
        blend: 'normal',
        alphaErosionRadius: 1,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
      expect(result.ctx.globalCompositeOperation).toBe('source-over');
    }
  });
});

// ============================================================================
// processFoilEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processFoilEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processFoilEffectLayer } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const layer = {
      id: 'test-layer',
      assetIds: { image: 1 },
      mode: 'color' as const,
      color: '#ffd700',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processFoilEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should process layer with custom erosion radius',
    async () => {
      const { processFoilEffectLayer } = await import('./foil');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const layer = {
        id: 'test-layer',
        assetIds: { image: 1 },
        mode: 'color' as const,
        color: '#ffd700',
        alpha: 1.0,
        blend: 'normal' as const,
        compositemode: 'source-over' as const,
        compositealpha: 1.0,
        maskData: {
          effectparams: {
            AlphaErosionRadius: 2.5,
          },
        },
      };

      const result = processFoilEffectLayer(layer, 100, 100, mockMask, 50);

      expect(result).not.toBeNull();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should process layer with texture', async () => {
    const { processFoilEffectLayer } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // Create a mock texture
    const textureCanvas = new OffscreenCanvas(50, 50);
    const textureCtx = textureCanvas.getContext('2d');
    if (textureCtx) {
      textureCtx.fillStyle = '#ffd700';
      textureCtx.fillRect(0, 0, 50, 50);
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const layer = {
      id: 'test-layer',
      assetIds: { image: 1 },
      mode: 'color' as const,
      color: '#ffd700',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processFoilEffectLayer(layer, 100, 100, mockMask, 50, textureBitmap);

    expect(result).not.toBeNull();
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should process layer for small text (no embossing)',
    async () => {
      const { processFoilEffectLayer } = await import('./foil');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const layer = {
        id: 'test-layer',
        assetIds: { image: 1 },
        mode: 'color' as const,
        color: '#ffd700',
        alpha: 0.8,
        blend: 'normal' as const,
        compositemode: 'source-over' as const,
        compositealpha: 1.0,
        maskData: {},
      };

      const result = processFoilEffectLayer(layer, 100, 100, mockMask, 30); // Below threshold

      expect(result).not.toBeNull();
      if (result) {
        // For small text, canvas should match input dimensions
        expect(result.width).toBe(100);
        expect(result.height).toBe(100);
      }
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should handle undefined color gracefully', async () => {
    const { processFoilEffectLayer } = await import('./foil');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const layer = {
      id: 'test-layer',
      assetIds: { image: 1 },
      mode: 'color' as const,
      // color is undefined
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    // Should use default color '#000000'
    const result = processFoilEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });
});
