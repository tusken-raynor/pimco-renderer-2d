import { describe, it, expect } from 'vitest';
import { extractEmbroideryParams, getEmbroideryColorBrightness } from './embroidery';
import { isOffscreenCanvasSupported } from '../utils/canvas';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';

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
// extractEmbroideryParams Tests
// ============================================================================

describe('extractEmbroideryParams', () => {
  it('should extract AlphaErosionRadius from effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { AlphaErosionRadius: 2.5 },
    };

    const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(maskData);
    expect(alphaErosionRadius).toBe(2.5);
    expect(fuzziness).toBe(1.0); // Default
  });

  it('should extract EmbroideryFuzziness from effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { EmbroideryFuzziness: 0.5 },
    };

    const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(maskData);
    expect(alphaErosionRadius).toBe(0); // Default
    expect(fuzziness).toBe(0.5);
  });

  it('should extract both parameters when present', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {
        AlphaErosionRadius: 1.5,
        EmbroideryFuzziness: 0.75,
      },
    };

    const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(maskData);
    expect(alphaErosionRadius).toBe(1.5);
    expect(fuzziness).toBe(0.75);
  });

  it('should return defaults for empty effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {},
    };

    const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(maskData);
    expect(alphaErosionRadius).toBe(0);
    expect(fuzziness).toBe(1.0);
  });

  it('should return defaults for missing effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {};

    const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(maskData);
    expect(alphaErosionRadius).toBe(0);
    expect(fuzziness).toBe(1.0);
  });

  it('should handle non-numeric values gracefully', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {
        AlphaErosionRadius: 'invalid' as unknown as number,
        EmbroideryFuzziness: null as unknown as number,
      },
    };

    const { alphaErosionRadius, fuzziness } = extractEmbroideryParams(maskData);
    expect(alphaErosionRadius).toBe(0); // Default due to type check
    expect(fuzziness).toBe(1.0); // Default due to type check
  });
});

// ============================================================================
// getEmbroideryColorBrightness Tests
// ============================================================================

describe('getEmbroideryColorBrightness', () => {
  it('should return low brightness for black', () => {
    const result = getEmbroideryColorBrightness('#000000');

    expect(result.brightness).toBeCloseTo(0, 2);
    expect(result.rgb).toEqual([0, 0, 0]);
  });

  it('should return high brightness for white', () => {
    const result = getEmbroideryColorBrightness('#ffffff');

    expect(result.brightness).toBeCloseTo(1, 2);
    expect(result.rgb).toEqual([255, 255, 255]);
  });

  it('should return medium brightness for gray', () => {
    const result = getEmbroideryColorBrightness('#808080');

    expect(result.brightness).toBeGreaterThan(0.3);
    expect(result.brightness).toBeLessThan(0.7);
    expect(result.rgb).toEqual([128, 128, 128]);
  });

  it('should handle 3-digit hex', () => {
    const result = getEmbroideryColorBrightness('#fff');

    expect(result.brightness).toBeCloseTo(1, 2);
    expect(result.rgb).toEqual([255, 255, 255]);
  });

  it('should handle invalid hex gracefully', () => {
    const result = getEmbroideryColorBrightness('not-a-color');

    // Falls back to black
    expect(result.brightness).toBeCloseTo(0, 2);
    expect(result.rgb).toEqual([0, 0, 0]);
  });

  it('should calculate brightness correctly for colored inputs', () => {
    // Red (high red, no green/blue)
    const red = getEmbroideryColorBrightness('#ff0000');
    expect(red.rgb).toEqual([255, 0, 0]);
    expect(red.brightness).toBeGreaterThan(0);
    expect(red.brightness).toBeLessThan(1);

    // Green (dominant in brightness calculation)
    const green = getEmbroideryColorBrightness('#00ff00');
    expect(green.rgb).toEqual([0, 255, 0]);
    expect(green.brightness).toBeGreaterThan(red.brightness); // Green has higher weight

    // Blue (lowest weight in brightness)
    const blue = getEmbroideryColorBrightness('#0000ff');
    expect(blue.rgb).toEqual([0, 0, 255]);
    expect(blue.brightness).toBeLessThan(red.brightness); // Blue has lowest weight
  });
});

// ============================================================================
// applyEmbroideryEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyEmbroideryEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas matching input dimensions',
    async () => {
      const { applyEmbroideryEffect } = await import('./embroidery');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = await applyEmbroideryEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha: 1.0,
        alphaErosionRadius: 0,
        fuzziness: 1.0,
        mask: mockMask,
        textHeight: 50,
        });

      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should skip embossing and shadow for small text', async () => {
    const { applyEmbroideryEffect } = await import('./embroidery');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight <= 43.5 should skip embossing and shadow
    const result = await applyEmbroideryEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      alphaErosionRadius: 0,
      fuzziness: 1.0,
      mask: mockMask,
      textHeight: 40, // Below threshold
    });

    expect(result.canvas).toBeDefined();
    // For small text, result should be the main canvas, not shadow canvas
    expect(result.canvas.width).toBe(100);
  });

  it.skipIf(!hasOffscreenCanvas())('should apply embossing and shadow for large text', async () => {
    const { applyEmbroideryEffect } = await import('./embroidery');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight > 43.5 should apply embossing and shadow
    const result = await applyEmbroideryEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      alphaErosionRadius: 0,
      fuzziness: 1.0,
      mask: mockMask,
      textHeight: 50, // Above threshold
    });

    expect(result.canvas).toBeDefined();
    // For large text, result should be the shadow canvas
    expect(result.canvas.width).toBe(100);
  });

  it.skipIf(!hasOffscreenCanvas())('should handle texture when provided', async () => {
    const { applyEmbroideryEffect } = await import('./embroidery');

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
      textureCtx.fillStyle = '#cccccc';
      textureCtx.fillRect(0, 0, 50, 50);
    }
    const textureBitmap = await createImageBitmap(textureCanvas);

    const result = await applyEmbroideryEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      alphaErosionRadius: 0,
      fuzziness: 1.0,
      mask: mockMask,
      texture: textureBitmap,
      textHeight: 50,
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various alpha values', async () => {
    const { applyEmbroideryEffect } = await import('./embroidery');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const alphaValues = [0.1, 0.5, 1.0];

    for (const alpha of alphaValues) {
      const result = await applyEmbroideryEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha,
        alphaErosionRadius: 0,
        fuzziness: 1.0,
        mask: mockMask,
        textHeight: 50,
        });

      expect(result.canvas).toBeDefined();
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should handle alpha erosion parameter', async () => {
    const { applyEmbroideryEffect } = await import('./embroidery');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // Note: alphaErode requires WebGL2, so this tests the parameter path
    const result = await applyEmbroideryEffect({
      width: 100,
      height: 100,
      color: '#ff0000',
      alpha: 1.0,
      alphaErosionRadius: 2.0, // Test with erosion
      fuzziness: 1.0,
      mask: mockMask,
      textHeight: 50,
    });

    expect(result.canvas).toBeDefined();
  });
});

// ============================================================================
// processEmbroideryEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processEmbroideryEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processEmbroideryEffectLayer } = await import('./embroidery');

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

    const result = await processEmbroideryEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should process layer with effect parameters in maskData',
    async () => {
      const { processEmbroideryEffectLayer } = await import('./embroidery');

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
        maskData: {
          effectparams: {
            AlphaErosionRadius: 1.5,
            EmbroideryFuzziness: 0.75,
          },
        },
      };

      const result = await processEmbroideryEffectLayer(layer, 100, 100, mockMask, 50);

      expect(result).not.toBeNull();
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should process layer with texture', async () => {
    const { processEmbroideryEffectLayer } = await import('./embroidery');

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
      textureCtx.fillStyle = '#cccccc';
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

    const result = await processEmbroideryEffectLayer(
      layer,
      100,
      100,
      mockMask,
      50,
      textureBitmap
    );

    expect(result).not.toBeNull();
  });
});
