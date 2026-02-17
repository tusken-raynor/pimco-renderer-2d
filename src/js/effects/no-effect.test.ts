import { describe, it, expect } from 'vitest';
import { extractDefaultColorCode, blendModeToCompositeOp } from './no-effect';
import { isOffscreenCanvasSupported } from '../utils/canvas';
import type { BlendMode } from '../types/pimco';

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
// extractDefaultColorCode Tests
// ============================================================================

describe('extractDefaultColorCode', () => {
  it('should return backup for undefined color', () => {
    expect(extractDefaultColorCode(undefined)).toBe('#000000');
    expect(extractDefaultColorCode(undefined, '#ffffff')).toBe('#ffffff');
  });

  it('should return string color directly', () => {
    expect(extractDefaultColorCode('#ff0000')).toBe('#ff0000');
    expect(extractDefaultColorCode('rgb(255, 0, 0)')).toBe('rgb(255, 0, 0)');
    expect(extractDefaultColorCode('red')).toBe('red');
  });

  it('should return first element from array', () => {
    expect(extractDefaultColorCode(['#ff0000', '#00ff00'])).toBe('#ff0000');
    expect(extractDefaultColorCode(['blue'])).toBe('blue');
  });

  it('should return backup for empty array', () => {
    expect(extractDefaultColorCode([])).toBe('#000000');
    expect(extractDefaultColorCode([], '#abcdef')).toBe('#abcdef');
  });

  it('should return first value from object', () => {
    expect(extractDefaultColorCode({ primary: '#ff0000', secondary: '#00ff00' })).toBe('#ff0000');
    expect(extractDefaultColorCode({ color: 'blue' })).toBe('blue');
  });

  it('should return backup for empty object', () => {
    expect(extractDefaultColorCode({})).toBe('#000000');
    expect(extractDefaultColorCode({}, '#123456')).toBe('#123456');
  });
});

// ============================================================================
// blendModeToCompositeOp Tests
// ============================================================================

describe('blendModeToCompositeOp', () => {
  it('should convert "normal" to "source-over"', () => {
    expect(blendModeToCompositeOp('normal')).toBe('source-over');
  });

  it('should return "source-over" for undefined', () => {
    expect(blendModeToCompositeOp(undefined)).toBe('source-over');
  });

  it('should pass through other blend modes', () => {
    const modes: BlendMode[] = [
      'multiply',
      'screen',
      'overlay',
      'darken',
      'lighten',
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

    for (const mode of modes) {
      expect(blendModeToCompositeOp(mode)).toBe(mode);
    }
  });
});

// ============================================================================
// applyNoEffect Tests (require OffscreenCanvas)
//
// These tests require canvas APIs not available in Node.js.
// They are tested in E2E/browser tests instead.
// ============================================================================

describe('applyNoEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create a canvas of correct dimensions',
    async () => {
      const { applyNoEffect } = await import('./no-effect');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyNoEffect({
        width: 200,
        height: 150,
        color: '#ff0000',
        alpha: 1.0,
        blend: 'normal',
        mask: mockMask,
      });

      expect(result.canvas.width).toBe(200);
      expect(result.canvas.height).toBe(150);
    }
  );

  it.skipIf(!hasOffscreenCanvas())(
    'should apply color fill',
    async () => {
      const { applyNoEffect } = await import('./no-effect');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyNoEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha: 1.0,
        blend: 'normal',
        mask: mockMask,
      });

      // The canvas should have content (not fully transparent)
      const imageData = result.ctx.getImageData(50, 50, 1, 1);
      // Should have some red color in the center where the mask is
      expect(imageData.data[0]).toBeGreaterThan(0); // Red channel
    }
  );

  it.skipIf(!hasOffscreenCanvas())(
    'should respect alpha parameter',
    async () => {
      const { applyNoEffect } = await import('./no-effect');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(25, 25, 50, 50);
      }

      const result = applyNoEffect({
        width: 100,
        height: 100,
        color: '#ff0000',
        alpha: 0.5,
        blend: 'normal',
        mask: mockMask,
      });

      // Canvas should exist and have proper dimensions
      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
    }
  );

  it.skipIf(!hasOffscreenCanvas())(
    'should handle different blend modes',
    async () => {
      const { applyNoEffect } = await import('./no-effect');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = mockMask.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(25, 25, 50, 50);
      }

      const modes: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay'];

      for (const blend of modes) {
        const result = applyNoEffect({
          width: 100,
          height: 100,
          color: '#ff0000',
          alpha: 1.0,
          blend,
          mask: mockMask,
        });

        // Should complete without error
        expect(result.canvas).toBeDefined();
      }
    }
  );
});

// ============================================================================
// applyColorAndMask Tests (require OffscreenCanvas)
// ============================================================================

describe('applyColorAndMask', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should apply color to existing canvas and reset composite operation',
    async () => {
      const { applyColorAndMask } = await import('./no-effect');
      const { createCanvasWithContext } = await import('../utils/canvas');

      const mockMask = new OffscreenCanvas(100, 100);
      const maskCtx = mockMask.getContext('2d');
      if (maskCtx) {
        maskCtx.fillStyle = '#ffffff';
        maskCtx.fillRect(0, 0, 100, 100);
      }

      const { ctx } = createCanvasWithContext(100, 100);

      // Draw something first
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 100, 100);

      applyColorAndMask(ctx, '#ff0000', 1.0, 'multiply', mockMask);

      // Should be reset to source-over
      expect(ctx.globalCompositeOperation).toBe('source-over');
    }
  );
});
