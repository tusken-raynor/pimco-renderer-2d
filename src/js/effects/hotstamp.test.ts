import { describe, it, expect } from 'vitest';
import { extractHotstampParams, getHotstampFillColor } from './hotstamp';
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
// extractHotstampParams Tests
// ============================================================================

describe('extractHotstampParams', () => {
  it('should extract eindex from effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { eindex: 0.25 },
    };

    const { eindex } = extractHotstampParams(maskData);
    expect(eindex).toBe(0.25);
  });

  it('should return undefined for missing eindex', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowBlur: 5 },
    };

    const { eindex } = extractHotstampParams(maskData);
    expect(eindex).toBeUndefined();
  });

  it('should return undefined for empty effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {},
    };

    const { eindex } = extractHotstampParams(maskData);
    expect(eindex).toBeUndefined();
  });

  it('should return undefined for missing effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {};

    const { eindex } = extractHotstampParams(maskData);
    expect(eindex).toBeUndefined();
  });

  it('should handle non-numeric eindex values', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { eindex: 'invalid' as unknown as number },
    };

    const { eindex } = extractHotstampParams(maskData);
    expect(eindex).toBeUndefined();
  });
});

// ============================================================================
// getHotstampFillColor Tests
// ============================================================================

describe('getHotstampFillColor', () => {
  it('should return rgba fill color for black input', () => {
    const result = getHotstampFillColor('#000000');

    // Black has max distance from white (dist ≈ 1)
    expect(result.distFromWhite).toBeCloseTo(1, 2);
    // distFactor should be near 0
    expect(result.fillColor).toMatch(/^rgba\(/);
    expect(result.colorOpacity).toBeGreaterThan(0);
  });

  it('should return rgba fill color for white input', () => {
    const result = getHotstampFillColor('#ffffff');

    // White has zero distance from white
    expect(result.distFromWhite).toBeCloseTo(0, 2);
    // distFactor should be near 1, giving orange-brown tint (35, 22, 0)
    expect(result.fillColor).toMatch(/^rgba\(35, 22, 0/);
  });

  it('should use provided eindex instead of calculating', () => {
    const providedEindex = 0.3;
    const result = getHotstampFillColor('#888888', providedEindex);

    expect(result.colorOpacity).toBe(providedEindex);
  });

  it('should calculate correct color opacity for gray', () => {
    const result = getHotstampFillColor('#808080');

    // Gray should have intermediate distance
    expect(result.distFromWhite).toBeGreaterThan(0.2);
    expect(result.distFromWhite).toBeLessThan(0.8);
    expect(result.colorOpacity).toBeGreaterThan(0.051);
  });

  it('should handle invalid hex gracefully', () => {
    const result = getHotstampFillColor('not-a-color');

    // Should fall back to black [0,0,0]
    expect(result.distFromWhite).toBeCloseTo(1, 2);
  });

  it('should differ from engraving fill color', async () => {
    const { getEngravingFillColor } = await import('./engraving');

    const engravingResult = getEngravingFillColor('#ffffff');
    const hotstampResult = getHotstampFillColor('#ffffff');

    // Both should compute same opacity from same color
    expect(engravingResult.colorOpacity).toBeCloseTo(hotstampResult.colorOpacity, 5);

    // But fill colors should differ (different RGB multipliers)
    // Engraving: rgba(68, 34, 0, ...) vs Hotstamp: rgba(35, 22, 0, ...)
    expect(engravingResult.fillColor).not.toBe(hotstampResult.fillColor);
  });
});

// ============================================================================
// createHotstampEmboss Tests (require OffscreenCanvas)
// ============================================================================

describe('createHotstampEmboss', () => {
  it.skipIf(!hasOffscreenCanvas())('should create both highlight and shadow canvases', async () => {
    const { createHotstampEmboss } = await import('./hotstamp');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = createHotstampEmboss(mockMask, 100, 100);

    expect(result.highlight.canvas.width).toBe(100);
    expect(result.highlight.canvas.height).toBe(100);
    expect(result.shadow.canvas.width).toBe(100);
    expect(result.shadow.canvas.height).toBe(100);
    expect(result.highlight.ctx).toBeDefined();
    expect(result.shadow.ctx).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various canvas sizes', async () => {
    const { createHotstampEmboss } = await import('./hotstamp');

    const sizes = [
      [50, 50],
      [200, 100],
      [100, 200],
    ];

    for (const [width, height] of sizes) {
      const mockMask = new OffscreenCanvas(width, height);
      const result = createHotstampEmboss(mockMask, width, height);

      expect(result.highlight.canvas.width).toBe(width);
      expect(result.highlight.canvas.height).toBe(height);
      expect(result.shadow.canvas.width).toBe(width);
      expect(result.shadow.canvas.height).toBe(height);
    }
  });
});

// ============================================================================
// applyHotstampEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyHotstampEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas matching input dimensions',
    async () => {
      const { applyHotstampEffect } = await import('./hotstamp');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyHotstampEffect({
        width: 100,
        height: 100,
        color: '#333333',
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
    const { applyHotstampEffect } = await import('./hotstamp');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight <= 43.5 should skip embossing
    const result = applyHotstampEffect({
      width: 100,
      height: 100,
      color: '#333333',
      alpha: 1.0,
      mask: mockMask,
      textHeight: 40, // Below threshold
    });

    expect(result.canvas).toBeDefined();
    expect(result.ctx.globalCompositeOperation).toBe('source-over');
  });

  it.skipIf(!hasOffscreenCanvas())('should apply dual embossing for large text', async () => {
    const { applyHotstampEffect } = await import('./hotstamp');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight > 43.5 should apply embossing
    const result = applyHotstampEffect({
      width: 100,
      height: 100,
      color: '#333333',
      alpha: 1.0,
      mask: mockMask,
      textHeight: 50, // Above threshold
    });

    expect(result.canvas).toBeDefined();
    expect(result.ctx.globalCompositeOperation).toBe('source-over');
  });

  it.skipIf(!hasOffscreenCanvas())('should handle provided eindex', async () => {
    const { applyHotstampEffect } = await import('./hotstamp');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = applyHotstampEffect({
      width: 100,
      height: 100,
      color: '#333333',
      alpha: 1.0,
      eindex: 0.25,
      mask: mockMask,
      textHeight: 50,
    });

    expect(result.canvas).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should handle various alpha values', async () => {
    const { applyHotstampEffect } = await import('./hotstamp');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const alphaValues = [0.1, 0.5, 1.0];

    for (const alpha of alphaValues) {
      const result = applyHotstampEffect({
        width: 100,
        height: 100,
        color: '#333333',
        alpha,
        mask: mockMask,
        textHeight: 50,
      });

      expect(result.canvas).toBeDefined();
      expect(result.ctx.globalAlpha).toBe(1); // Should be reset after effect
    }
  });
});

// ============================================================================
// processHotstampEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processHotstampEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processHotstampEffectLayer } = await import('./hotstamp');

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
      color: '#333333',
      alpha: 1.0,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {},
    };

    const result = processHotstampEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should process layer with eindex in maskData', async () => {
    const { processHotstampEffectLayer } = await import('./hotstamp');

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
      color: '#333333',
      alpha: 0.8,
      blend: 'normal' as const,
      compositemode: 'source-over' as const,
      compositealpha: 1.0,
      maskData: {
        effectparams: { eindex: 0.3 },
      },
    };

    const result = processHotstampEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });
});

// ============================================================================
// Re-exported function tests (colorDistance, calculateEindex, distanceFromEindex)
// ============================================================================

describe('re-exported functions from engraving', () => {
  it('should export colorDistance', async () => {
    const { colorDistance } = await import('./hotstamp');
    expect(typeof colorDistance).toBe('function');
  });

  it('should export calculateEindex', async () => {
    const { calculateEindex } = await import('./hotstamp');
    expect(typeof calculateEindex).toBe('function');
  });

  it('should export distanceFromEindex', async () => {
    const { distanceFromEindex } = await import('./hotstamp');
    expect(typeof distanceFromEindex).toBe('function');
  });
});
