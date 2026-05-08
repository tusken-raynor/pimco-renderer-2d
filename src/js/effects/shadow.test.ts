import { describe, it, expect } from 'vitest';
import { extractShadowParams, scaleToResolution } from './shadow';
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
// extractShadowParams Tests
// ============================================================================

describe('extractShadowParams', () => {
  it('should extract ShadowSpread parameter', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowSpread: 10 },
    };

    const { spread, blur } = extractShadowParams(maskData);
    expect(spread).toBe(10);
    expect(blur).toBe(0);
  });

  it('should extract ShadowBlur parameter', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowBlur: 5.5 },
    };

    const { spread, blur } = extractShadowParams(maskData);
    expect(spread).toBe(0);
    expect(blur).toBe(5.5);
  });

  it('should extract both parameters', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowSpread: 8, ShadowBlur: 3 },
    };

    const { spread, blur } = extractShadowParams(maskData);
    expect(spread).toBe(8);
    expect(blur).toBe(3);
  });

  it('should return zeros for missing effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {};

    const { spread, blur } = extractShadowParams(maskData);
    expect(spread).toBe(0);
    expect(blur).toBe(0);
  });

  it('should return zeros for empty effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {},
    };

    const { spread, blur } = extractShadowParams(maskData);
    expect(spread).toBe(0);
    expect(blur).toBe(0);
  });

  it('should round spread to integer', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowSpread: 10.7 },
    };

    const { spread } = extractShadowParams(maskData);
    expect(spread).toBe(11);
  });

  it('should handle non-numeric values gracefully', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { ShadowSpread: 'invalid' as unknown as number },
    };

    const { spread, blur } = extractShadowParams(maskData);
    expect(spread).toBe(0);
    expect(blur).toBe(0);
  });
});

// ============================================================================
// scaleToResolution Tests
// ============================================================================

describe('scaleToResolution', () => {
  it('should return same value for base resolution (2048)', () => {
    expect(scaleToResolution(10, 2048)).toBe(10);
    expect(scaleToResolution(100, 2048)).toBe(100);
  });

  it('should scale down for smaller canvas', () => {
    expect(scaleToResolution(10, 1024)).toBe(5);
    expect(scaleToResolution(100, 512)).toBe(25);
  });

  it('should scale up for larger canvas', () => {
    expect(scaleToResolution(10, 4096)).toBe(20);
    expect(scaleToResolution(50, 8192)).toBe(200);
  });

  it('should handle zero values', () => {
    expect(scaleToResolution(0, 1024)).toBe(0);
    expect(scaleToResolution(10, 0)).toBe(0);
  });

  it('should handle decimal results', () => {
    const result = scaleToResolution(10, 1000);
    expect(result).toBeCloseTo((10 * 1000) / 2048, 5);
  });
});

// ============================================================================
// applyShadowEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyShadowEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas with various parameters',
    async () => {
      const { applyShadowEffect } = await import('./shadow');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(25, 25, 50, 50);
      }

      // Test basic shadow
      const result1 = applyShadowEffect({
        width: 100,
        height: 100,
        color: '#000000',
        alpha: 1.0,
        spread: 0,
        blur: 0,
        mask: mockMask,
      });
      expect(result1.canvas).toBeDefined();
      expect(result1.ctx).toBeDefined();

      // Test with spread (expands canvas)
      const result2 = applyShadowEffect({
        width: 100,
        height: 100,
        color: '#000000',
        alpha: 1.0,
        spread: 10,
        blur: 0,
        mask: mockMask,
      });
      expect(result2.canvas.width).toBeGreaterThan(100);
      expect(result2.canvas.height).toBeGreaterThan(100);

      // Test with blur (expands canvas)
      const result3 = applyShadowEffect({
        width: 100,
        height: 100,
        color: '#000000',
        alpha: 1.0,
        spread: 0,
        blur: 10,
        mask: mockMask,
      });
      expect(result3.canvas.width).toBeGreaterThan(100);
      expect(result3.canvas.height).toBeGreaterThan(100);

      // Test with both spread and blur
      const result4 = applyShadowEffect({
        width: 100,
        height: 100,
        color: '#000000',
        alpha: 1.0,
        spread: 10,
        blur: 5,
        mask: mockMask,
      });
      expect(result4.canvas).toBeDefined();

      // Test multi-pass alpha
      const result5 = applyShadowEffect({
        width: 100,
        height: 100,
        color: '#000000',
        alpha: 3.0,
        spread: 0,
        blur: 0,
        mask: mockMask,
      });
      expect(result5.canvas).toBeDefined();
    }
  );
});
