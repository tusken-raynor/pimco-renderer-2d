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

/**
 * Helper to get 2D context from OffscreenCanvas with type safety.
 */
function getOffscreenContext(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context from OffscreenCanvas');
  }
  return ctx;
}

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
// applySpread Tests (require OffscreenCanvas)
//
// These tests require canvas APIs not available in Node.js.
// They are tested in E2E/browser tests instead.
// ============================================================================

describe('applySpread', () => {
  it.skipIf(!hasOffscreenCanvas())('should return original when spread is 0', async () => {
    const { applySpread } = await import('./shadow');

    const canvas = new OffscreenCanvas(100, 100);
    const mockCtx = getOffscreenContext(canvas);
    mockCtx.fillStyle = '#ffffff';
    mockCtx.fillRect(25, 25, 50, 50);

    const result = applySpread(mockCtx, 0);
    expect(result.canvas).toBe(mockCtx.canvas);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it.skipIf(!hasOffscreenCanvas())('should return original when spread is negative', async () => {
    const { applySpread } = await import('./shadow');

    const canvas = new OffscreenCanvas(100, 100);
    const mockCtx = getOffscreenContext(canvas);
    mockCtx.fillStyle = '#ffffff';
    mockCtx.fillRect(25, 25, 50, 50);

    const result = applySpread(mockCtx, -5);
    expect(result.canvas).toBe(mockCtx.canvas);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should expand canvas dimensions for positive spread',
    async () => {
      const { applySpread } = await import('./shadow');

      const canvas = new OffscreenCanvas(100, 100);
      const mockCtx = getOffscreenContext(canvas);
      mockCtx.fillStyle = '#ffffff';
      mockCtx.fillRect(25, 25, 50, 50);

      const spread = 10;
      const result = applySpread(mockCtx, spread);

      expect(result.canvas.width).toBe(100 + 2 * spread);
      expect(result.canvas.height).toBe(100 + 2 * spread);
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should return correct offset for positive spread', async () => {
    const { applySpread } = await import('./shadow');

    const canvas = new OffscreenCanvas(100, 100);
    const mockCtx = getOffscreenContext(canvas);
    mockCtx.fillStyle = '#ffffff';
    mockCtx.fillRect(25, 25, 50, 50);

    const spread = 15;
    const result = applySpread(mockCtx, spread);

    expect(result.offsetX).toBe(spread);
    expect(result.offsetY).toBe(spread);
  });
});

// ============================================================================
// applyColorFill Tests (require OffscreenCanvas)
// ============================================================================

describe('applyColorFill', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should fill with specified color and reset composite',
    async () => {
      const { applyColorFill } = await import('./shadow');
      const { createCanvasWithContext } = await import('../utils/canvas');

      const { ctx } = createCanvasWithContext(100, 100);

      // Draw something first to create alpha mask
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 50, 50);

      applyColorFill(ctx, '#ff0000');

      // Check that composite operation is reset
      expect(ctx.globalCompositeOperation).toBe('source-over');
    }
  );
});

// ============================================================================
// applyBlur Tests (require OffscreenCanvas)
// ============================================================================

describe('applyBlur', () => {
  it.skipIf(!hasOffscreenCanvas())('should return original for zero blur', async () => {
    const { applyBlur } = await import('./shadow');

    const mockCanvas = new OffscreenCanvas(100, 100);
    const ctx = mockCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25, 25, 50, 50);
    }

    const result = applyBlur(mockCanvas, 0);
    expect(result.canvas).toBe(mockCanvas);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it.skipIf(!hasOffscreenCanvas())('should expand canvas for positive blur', async () => {
    const { applyBlur } = await import('./shadow');

    const mockCanvas = new OffscreenCanvas(100, 100);
    const ctx = mockCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25, 25, 50, 50);
    }

    const blur = 10;
    const result = applyBlur(mockCanvas, blur);

    expect(result.canvas.width).toBe(100 + 2 * blur);
    expect(result.canvas.height).toBe(100 + 2 * blur);
  });
});

// ============================================================================
// applyMultiPassAlpha Tests (require OffscreenCanvas)
// ============================================================================

describe('applyMultiPassAlpha', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should handle various alpha values and reset state',
    async () => {
      const { applyMultiPassAlpha } = await import('./shadow');

      const sourceCanvas = new OffscreenCanvas(100, 100);
      const srcCtx = sourceCanvas.getContext('2d');
      if (srcCtx) {
        srcCtx.fillStyle = 'rgba(255, 0, 0, 1)';
        srcCtx.fillRect(0, 0, 100, 100);
      }

      const targetCanvas = new OffscreenCanvas(100, 100);
      const targetCtx = getOffscreenContext(targetCanvas);

      // Test alpha <= 1.0
      applyMultiPassAlpha(targetCtx, sourceCanvas, 0.5);
      expect(targetCtx.globalAlpha).toBe(1.0);
      expect(targetCtx.globalCompositeOperation).toBe('source-over');

      // Test alpha > 1.0 (multiple passes)
      applyMultiPassAlpha(targetCtx, sourceCanvas, 2.5);
      expect(targetCtx.globalAlpha).toBe(1.0);

      // Test zero alpha
      applyMultiPassAlpha(targetCtx, sourceCanvas, 0);
      expect(targetCtx.globalAlpha).toBe(1.0);

      // Test with offset
      applyMultiPassAlpha(targetCtx, sourceCanvas, 1.0, 10, 20);
      expect(targetCtx.globalAlpha).toBe(1.0);
    }
  );
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
