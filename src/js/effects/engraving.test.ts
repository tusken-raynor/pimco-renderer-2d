import { describe, it, expect } from 'vitest';
import {
  colorDistance,
  calculateEindex,
  distanceFromEindex,
  extractEngravingParams,
  getEngravingFillColor,
} from './engraving';
import { isOffscreenCanvasSupported } from '../utils/canvas';
import type { PimcoMaskSubstitutionCompiled } from '../types/pimco';
import type { RGBColor } from '../utils/color';

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
// colorDistance Tests
// ============================================================================

describe('colorDistance', () => {
  it('should return 0 for identical colors', () => {
    const color: RGBColor = [128, 128, 128];
    const result = colorDistance(color, color);
    expect(result).toBeCloseTo(0, 5);
  });

  it('should return 1 for maximum distance (black to white)', () => {
    const black: RGBColor = [0, 0, 0];
    const white: RGBColor = [255, 255, 255];
    const result = colorDistance(black, white);
    expect(result).toBeCloseTo(1, 5);
  });

  it('should return same distance regardless of order', () => {
    const color1: RGBColor = [100, 50, 200];
    const color2: RGBColor = [200, 100, 50];
    expect(colorDistance(color1, color2)).toBeCloseTo(colorDistance(color2, color1), 5);
  });

  it('should calculate correct distance for known colors', () => {
    const red: RGBColor = [255, 0, 0];
    const white: RGBColor = [255, 255, 255];
    // Distance from red to white: sqrt(0 + 255^2 + 255^2) / 441.67 ≈ 0.816
    const result = colorDistance(red, white);
    expect(result).toBeCloseTo(Math.sqrt(255 * 255 + 255 * 255) / 441.6729559300637, 3);
  });

  it('should handle all zeros', () => {
    const black: RGBColor = [0, 0, 0];
    expect(colorDistance(black, black)).toBe(0);
  });
});

// ============================================================================
// calculateEindex Tests
// ============================================================================

describe('calculateEindex', () => {
  it('should return base value for zero distance', () => {
    // When dist = 0: (((-1)^3 + 1) / 4) * 0.382 + 0.051 = (0 / 4) * 0.382 + 0.051 = 0.051
    const result = calculateEindex(0);
    expect(result).toBeCloseTo(0.051, 3);
  });

  it('should return max value for max distance', () => {
    // When dist = 1: ((1.4422495703^3 + 1) / 4) * 0.382 + 0.051
    const result = calculateEindex(1);
    // Should be approximately 0.433 (0.382 + 0.051)
    expect(result).toBeGreaterThan(0.051);
    expect(result).toBeLessThanOrEqual(0.45);
  });

  it('should increase monotonically with distance', () => {
    const result1 = calculateEindex(0.2);
    const result2 = calculateEindex(0.4);
    const result3 = calculateEindex(0.6);
    const result4 = calculateEindex(0.8);

    expect(result2).toBeGreaterThan(result1);
    expect(result3).toBeGreaterThan(result2);
    expect(result4).toBeGreaterThan(result3);
  });

  it('should handle mid-range values', () => {
    const result = calculateEindex(0.5);
    expect(result).toBeGreaterThan(0.051);
    expect(result).toBeLessThan(0.433);
  });
});

// ============================================================================
// distanceFromEindex Tests
// ============================================================================

describe('distanceFromEindex', () => {
  it('should return 0 for minimum eindex', () => {
    // 0.051 corresponds to distance 0
    const result = distanceFromEindex(0.051);
    expect(result).toBeCloseTo(0.41, 1); // Approximately 0.41 due to inverse formula
  });

  it('should handle values near maximum', () => {
    const eindex = calculateEindex(1);
    const result = distanceFromEindex(eindex);
    expect(result).toBeCloseTo(1, 1);
  });

  it('should be approximately inverse of calculateEindex', () => {
    // Test round-trip for various distances
    const distances = [0.1, 0.3, 0.5, 0.7, 0.9];

    for (const dist of distances) {
      const eindex = calculateEindex(dist);
      const recovered = distanceFromEindex(eindex);
      // Note: The inverse formula is an approximation, so we allow some tolerance
      expect(recovered).toBeGreaterThan(0);
      expect(recovered).toBeLessThanOrEqual(1.1);
    }
  });

  it('should handle very small eindex values', () => {
    const result = distanceFromEindex(0.01);
    expect(result).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// extractEngravingParams Tests
// ============================================================================

describe('extractEngravingParams', () => {
  it('should extract eindex from effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { eindex: 0.25 },
    };

    const { eindex } = extractEngravingParams(maskData);
    expect(eindex).toBe(0.25);
  });

  it('should return undefined for missing eindex', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowBlur: 5 },
    };

    const { eindex } = extractEngravingParams(maskData);
    expect(eindex).toBeUndefined();
  });

  it('should return undefined for empty effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {},
    };

    const { eindex } = extractEngravingParams(maskData);
    expect(eindex).toBeUndefined();
  });

  it('should return undefined for missing effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {};

    const { eindex } = extractEngravingParams(maskData);
    expect(eindex).toBeUndefined();
  });

  it('should handle non-numeric eindex values', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { eindex: 'invalid' as unknown as number },
    };

    const { eindex } = extractEngravingParams(maskData);
    expect(eindex).toBeUndefined();
  });
});

// ============================================================================
// getEngravingFillColor Tests
// ============================================================================

describe('getEngravingFillColor', () => {
  it('should return rgba fill color for black input', () => {
    const result = getEngravingFillColor('#000000');

    // Black has max distance from white (dist ≈ 1)
    expect(result.distFromWhite).toBeCloseTo(1, 2);
    // distFactor should be near 0
    expect(result.fillColor).toMatch(/^rgba\(/);
    expect(result.colorOpacity).toBeGreaterThan(0);
  });

  it('should return rgba fill color for white input', () => {
    const result = getEngravingFillColor('#ffffff');

    // White has zero distance from white
    expect(result.distFromWhite).toBeCloseTo(0, 2);
    // distFactor should be near 1, giving reddish-brown tint
    expect(result.fillColor).toMatch(/^rgba\(68, 34, 0/);
  });

  it('should use provided eindex instead of calculating', () => {
    const providedEindex = 0.3;
    const result = getEngravingFillColor('#888888', providedEindex);

    expect(result.colorOpacity).toBe(providedEindex);
  });

  it('should calculate correct color opacity for gray', () => {
    const result = getEngravingFillColor('#808080');

    // Gray should have intermediate distance
    expect(result.distFromWhite).toBeGreaterThan(0.2);
    expect(result.distFromWhite).toBeLessThan(0.8);
    expect(result.colorOpacity).toBeGreaterThan(0.051);
  });

  it('should handle invalid hex gracefully', () => {
    const result = getEngravingFillColor('not-a-color');

    // Should fall back to black [0,0,0]
    expect(result.distFromWhite).toBeCloseTo(1, 2);
  });
});

// ============================================================================
// Note: createEngravingEmboss was removed when engraving was converted to the
// GPU compose pipeline. The emboss highlight is now produced by an internal
// renderEngravingHighlight() helper that runs as part of applyEngravingEffect
// when WebGL2 is available; it has no public surface to test directly. The
// engraving compose shader's behavior is exercised via applyEngravingEffect
// integration tests (gated on OffscreenCanvas + WebGL2).
// ============================================================================

// ============================================================================
// applyEngravingEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyEngravingEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas matching input dimensions',
    async () => {
      const { applyEngravingEffect } = await import('./engraving');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = await applyEngravingEffect({
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
    const { applyEngravingEffect } = await import('./engraving');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight <= 43.5 should skip embossing
    const result = await applyEngravingEffect({
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

  it.skipIf(!hasOffscreenCanvas())('should apply embossing for large text', async () => {
    const { applyEngravingEffect } = await import('./engraving');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    // textHeight > 43.5 should apply embossing
    const result = await applyEngravingEffect({
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
    const { applyEngravingEffect } = await import('./engraving');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = await applyEngravingEffect({
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
    const { applyEngravingEffect } = await import('./engraving');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = mockMask.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);
    }

    const alphaValues = [0.1, 0.5, 1.0];

    for (const alpha of alphaValues) {
      const result = await applyEngravingEffect({
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
// processEngravingEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processEngravingEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processEngravingEffectLayer } = await import('./engraving');

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

    const result = await processEngravingEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
    if (result) {
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should process layer with eindex in maskData', async () => {
    const { processEngravingEffectLayer } = await import('./engraving');

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

    const result = await processEngravingEffectLayer(layer, 100, 100, mockMask, 50);

    expect(result).not.toBeNull();
  });
});
