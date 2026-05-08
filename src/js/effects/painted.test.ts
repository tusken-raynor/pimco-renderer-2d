import { describe, it, expect } from 'vitest';
import { extractPaintedParams, getPaintedEffectInfo } from './painted';
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
// extractPaintedParams Tests
// ============================================================================

describe('extractPaintedParams', () => {
  it('should return default inset shrink when no params', () => {
    const result = extractPaintedParams({});

    expect(result.paintedInsetShrink).toBe(1.0); // Default value
  });

  it('should extract inset shrink from effectparams', () => {
    const result = extractPaintedParams({
      effectparams: {
        PaintedInsetShrink: 2.5,
      },
    });

    expect(result.paintedInsetShrink).toBe(2.5);
  });

  it('should handle zero inset shrink', () => {
    const result = extractPaintedParams({
      effectparams: {
        PaintedInsetShrink: 0,
      },
    });

    expect(result.paintedInsetShrink).toBe(0);
  });

  it('should ignore non-numeric inset shrink', () => {
    const result = extractPaintedParams({
      effectparams: {
        PaintedInsetShrink: 'invalid' as unknown as number,
      },
    });

    expect(result.paintedInsetShrink).toBe(1.0); // Default value
  });

  it('should handle missing effectparams object', () => {
    const result = extractPaintedParams({
      effect: 'painted',
    });

    expect(result.paintedInsetShrink).toBe(1.0); // Default value
  });

  it('should handle null effectparams', () => {
    const result = extractPaintedParams({
      effectparams: null as unknown as Record<string, unknown>,
    });

    expect(result.paintedInsetShrink).toBe(1.0); // Default value
  });

  it('should handle negative inset shrink values', () => {
    const result = extractPaintedParams({
      effectparams: {
        PaintedInsetShrink: -1.5,
      },
    });

    expect(result.paintedInsetShrink).toBe(-1.5);
  });
});

// ============================================================================
// getPaintedEffectInfo Tests
// ============================================================================

describe('getPaintedEffectInfo', () => {
  it('should return effect info with given inset shrink', () => {
    const result = getPaintedEffectInfo(1.5);

    expect(result.insetShrink).toBe(1.5);
    expect(result.embossThreshold).toBe(43.5);
    expect(result.defaultInsetShrink).toBe(1.0);
  });

  it('should return consistent threshold values', () => {
    const result1 = getPaintedEffectInfo(1);
    const result2 = getPaintedEffectInfo(2);

    // Thresholds should be the same regardless of inset shrink
    expect(result1.embossThreshold).toBe(result2.embossThreshold);
    expect(result1.defaultInsetShrink).toBe(result2.defaultInsetShrink);
  });

  it('should handle zero inset shrink', () => {
    const result = getPaintedEffectInfo(0);

    expect(result.insetShrink).toBe(0);
  });
});

// ============================================================================
// applyPaintedEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyPaintedEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas matching input dimensions',
    async () => {
      const { applyPaintedEffect } = await import('./painted');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyPaintedEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha: 1.0,
        paintedInsetShrink: 1.0,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should skip embossing for small text', async () => {
    const { applyPaintedEffect } = await import('./painted');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight <= 43.5 should skip embossing
    const result = applyPaintedEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      paintedInsetShrink: 1.0,
      mask: mockMask,
      textHeight: 40, // Below threshold
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should apply embossing for large text', async () => {
    const { applyPaintedEffect } = await import('./painted');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight > 43.5 should apply embossing
    const result = applyPaintedEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      paintedInsetShrink: 1.0,
      mask: mockMask,
      textHeight: 50, // Above threshold
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle texture when provided', async () => {
    const { applyPaintedEffect } = await import('./painted');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // Create a mock paint texture
    const textureCanvas = new OffscreenCanvas(50, 50);
    const textureCtx = textureCanvas.getContext('2d');
    if (textureCtx) {
      // Simple pattern for paint texture
      textureCtx.fillStyle = '#ff5555';
      textureCtx.fillRect(0, 0, 50, 50);
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const result = applyPaintedEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      paintedInsetShrink: 1.0,
      mask: mockMask,
      texture: textureBitmap,
      textHeight: 50,
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various alpha values', async () => {
    const { applyPaintedEffect } = await import('./painted');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const alphaValues = [0.1, 0.5, 1.0];

    for (const alpha of alphaValues) {
      const result = applyPaintedEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha,
        paintedInsetShrink: 1.0,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various inset shrink values', async () => {
    const { applyPaintedEffect } = await import('./painted');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const shrinkValues = [0, 0.5, 1.0, 2.0];

    for (const paintedInsetShrink of shrinkValues) {
      const result = applyPaintedEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha: 1.0,
        paintedInsetShrink,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various paint colors', async () => {
    const { applyPaintedEffect } = await import('./painted');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000'];

    for (const color of colors) {
      const result = applyPaintedEffect({
        width: 100,
        height: 100,
        color,
        alpha: 1.0,
        paintedInsetShrink: 1.0,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
    }
  });
});

// ============================================================================
// processPaintedEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processPaintedEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processPaintedEffectLayer } = await import('./painted');

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
      color: '#ff0000',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processPaintedEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should process layer with custom inset shrink', async () => {
    const { processPaintedEffectLayer } = await import('./painted');

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
      color: '#ff0000',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {
        effectparams: {
          PaintedInsetShrink: 2.5,
        },
      },
    };

    const result = processPaintedEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });

  it.skipIf(!hasOffscreenCanvas())('should process layer with texture', async () => {
    const { processPaintedEffectLayer } = await import('./painted');

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
      textureCtx.fillStyle = '#ff5555';
      textureCtx.fillRect(0, 0, 50, 50);
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const layer = {
      id: 'test-layer',
      assetIds: { image: 1 },
      mode: 'color' as const,
      color: '#ff0000',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processPaintedEffectLayer(layer, 100, 100, mockMask, 50, textureBitmap);

    expect(result).not.toBeNull();
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should process layer for small text (no embossing)',
    async () => {
      const { processPaintedEffectLayer } = await import('./painted');

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
        color: '#ff0000',
        alpha: 0.8,
        blend: 'normal' as const,
        compositemode: 'source-over' as const,
        compositealpha: 1.0,
        maskData: {},
      };

      const result = processPaintedEffectLayer(layer, 100, 100, mockMask, 30); // Below threshold

      expect(result).not.toBeNull();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should handle undefined color gracefully', async () => {
    const { processPaintedEffectLayer } = await import('./painted');

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
    const result = processPaintedEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle multiply blend mode', async () => {
    const { processPaintedEffectLayer } = await import('./painted');

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
      color: '#ff0000',
      alpha: 1.0,
      blend: 'multiply' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processPaintedEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });
});
