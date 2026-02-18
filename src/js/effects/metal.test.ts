import { describe, it, expect } from 'vitest';
import { getMetalEmbossMatrix } from './metal';
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
// getMetalEmbossMatrix Tests
// ============================================================================

describe('getMetalEmbossMatrix', () => {
  it('should return a 3x3 matrix', () => {
    const matrix = getMetalEmbossMatrix();

    expect(matrix).toHaveLength(3);
    expect(matrix[0]).toHaveLength(3);
    expect(matrix[1]).toHaveLength(3);
    expect(matrix[2]).toHaveLength(3);
  });

  it('should return the expected metal emboss matrix', () => {
    const matrix = getMetalEmbossMatrix();

    // Expected: [[-1, -1, -1], [-1, -1, 1], [1, 1, 1]]
    expect(matrix).toEqual([
      [-1, -1, -1],
      [-1, -1, 1],
      [1, 1, 1],
    ]);
  });

  it('should return a copy (not the original)', () => {
    const matrix1 = getMetalEmbossMatrix();
    const matrix2 = getMetalEmbossMatrix();

    // Should be equal but not the same reference
    expect(matrix1).toEqual(matrix2);
    expect(matrix1).not.toBe(matrix2);

    // Modifying one should not affect the other
    matrix1[0][0] = 999;
    expect(matrix2[0][0]).toBe(-1);
  });

  it('should differ from standard emboss matrix', () => {
    const metalMatrix = getMetalEmbossMatrix();

    // Standard emboss matrix: [[0, -1, -1], [0, -1, 1], [1, 1, 0]]
    const standardMatrix = [
      [0, -1, -1],
      [0, -1, 1],
      [1, 1, 0],
    ];

    expect(metalMatrix).not.toEqual(standardMatrix);
  });
});

// ============================================================================
// createMetalEmboss Tests (require OffscreenCanvas)
// ============================================================================

describe('createMetalEmboss', () => {
  it.skipIf(!hasOffscreenCanvas())('should create both highlight and shadow canvases', async () => {
    const { createMetalEmboss } = await import('./metal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = createMetalEmboss(mockMask, 100, 100);

    expect(result.highlight.canvas.width).toBe(100);
    expect(result.highlight.canvas.height).toBe(100);
    expect(result.shadow.canvas.width).toBe(100);
    expect(result.shadow.canvas.height).toBe(100);
    expect(result.highlight.ctx).toBeDefined();
    expect(result.shadow.ctx).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various canvas sizes', async () => {
    const { createMetalEmboss } = await import('./metal');

    const sizes = [
      [50, 50],
      [200, 100],
      [100, 200],
    ];

    for (const [width, height] of sizes) {
      const mockMask = new OffscreenCanvas(width, height);
      const result = createMetalEmboss(mockMask, width, height);

      expect(result.highlight.canvas.width).toBe(width);
      expect(result.highlight.canvas.height).toBe(height);
      expect(result.shadow.canvas.width).toBe(width);
      expect(result.shadow.canvas.height).toBe(height);
    }
  });
});

// ============================================================================
// applyMetalEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyMetalEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas matching input dimensions',
    async () => {
      const { applyMetalEffect } = await import('./metal');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyMetalEffect({
        width: 100,
        height: 100,
        color: '#cccccc',
        alpha: 1.0,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should skip embossing for small text', async () => {
    const { applyMetalEffect } = await import('./metal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight <= 43.5 should skip embossing
    const result = applyMetalEffect({
      width: 100,
      height: 100,
      color: '#cccccc',
      alpha: 1.0,
      mask: mockMask,
      textHeight: 40, // Below threshold
    });

    expect(result.canvas).toBeDefined();
    expect(result.ctx.globalCompositeOperation).toBe('source-over');
  });

  it.skipIf(!hasOffscreenCanvas())('should apply embossing for large text', async () => {
    const { applyMetalEffect } = await import('./metal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight > 43.5 should apply embossing
    const result = applyMetalEffect({
      width: 100,
      height: 100,
      color: '#cccccc',
      alpha: 1.0,
      mask: mockMask,
      textHeight: 50, // Above threshold
    });

    expect(result.canvas).toBeDefined();
    expect(result.ctx.globalCompositeOperation).toBe('source-over');
  });

  it.skipIf(!hasOffscreenCanvas())('should handle texture when provided', async () => {
    const { applyMetalEffect } = await import('./metal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // Create a mock brushed metal texture
    const textureCanvas = new OffscreenCanvas(50, 50);
    const textureCtx = textureCanvas.getContext('2d');
    if (textureCtx) {
      // Simple striped pattern for brushed metal
      for (let y = 0; y < 50; y++) {
        textureCtx.fillStyle = y % 2 === 0 ? '#dddddd' : '#bbbbbb';
        textureCtx.fillRect(0, y, 50, 1);
      }
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const result = applyMetalEffect({
      width: 100,
      height: 100,
      color: '#cccccc',
      alpha: 1.0,
      mask: mockMask,
      texture: textureBitmap,
      textHeight: 50,
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various alpha values', async () => {
    const { applyMetalEffect } = await import('./metal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const alphaValues = [0.1, 0.5, 1.0];

    for (const alpha of alphaValues) {
      const result = applyMetalEffect({
        width: 100,
        height: 100,
        color: '#cccccc',
        alpha,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
      expect(result.ctx.globalAlpha).toBe(1); // Should be reset after effect
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various metal tint colors', async () => {
    const { applyMetalEffect } = await import('./metal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const colors = ['#cccccc', '#c0c0c0', '#ffd700', '#d4af37']; // Silver, Gold variants

    for (const color of colors) {
      const result = applyMetalEffect({
        width: 100,
        height: 100,
        color,
        alpha: 1.0,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
    }
  });
});

// ============================================================================
// processMetalEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processMetalEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processMetalEffectLayer } = await import('./metal');

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
      color: '#cccccc',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processMetalEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should process layer with texture', async () => {
    const { processMetalEffectLayer } = await import('./metal');

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
      textureCtx.fillStyle = '#dddddd';
      textureCtx.fillRect(0, 0, 50, 50);
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const layer = {
      id: 'test-layer',
      assetIds: { image: 1 },
      mode: 'color' as const,
      color: '#cccccc',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processMetalEffectLayer(layer, 100, 100, mockMask, 50, textureBitmap);

    expect(result).not.toBeNull();
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should process layer for small text (no embossing)',
    async () => {
      const { processMetalEffectLayer } = await import('./metal');

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
        color: '#cccccc',
        alpha: 0.8,
        blend: 'normal' as const,
        compositemode: 'source-over' as const,
        compositealpha: 1.0,
        maskData: {},
      };

      const result = processMetalEffectLayer(layer, 100, 100, mockMask, 30); // Below threshold

      expect(result).not.toBeNull();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should handle undefined color gracefully', async () => {
    const { processMetalEffectLayer } = await import('./metal');

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
    const result = processMetalEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });
});
