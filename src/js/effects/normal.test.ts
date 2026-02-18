import { describe, it, expect } from 'vitest';
import {
  extractNormalParams,
  scaleToResolution,
  getValidLightDirections,
  getNormalEffectInfo,
} from './normal';
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
// extractNormalParams Tests
// ============================================================================

describe('extractNormalParams', () => {
  it('should extract NormalRoundness parameter', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalRoundness: 5 },
    };

    const { roundness, intensity, lightDirection } = extractNormalParams(maskData);
    expect(roundness).toBe(5);
    expect(intensity).toBe(1.0);
    expect(lightDirection).toBe('N');
  });

  it('should extract NormalIntensity parameter', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalIntensity: 2.5 },
    };

    const { roundness, intensity, lightDirection } = extractNormalParams(maskData);
    expect(roundness).toBe(0);
    expect(intensity).toBe(2.5);
    expect(lightDirection).toBe('N');
  });

  it('should extract NormalLightDir parameter', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalLightDir: 'SE' },
    };

    const { roundness, intensity, lightDirection } = extractNormalParams(maskData);
    expect(roundness).toBe(0);
    expect(intensity).toBe(1.0);
    expect(lightDirection).toBe('SE');
  });

  it('should extract all parameters', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalRoundness: 3, NormalIntensity: 1.5, NormalLightDir: 'NW' },
    };

    const { roundness, intensity, lightDirection } = extractNormalParams(maskData);
    expect(roundness).toBe(3);
    expect(intensity).toBe(1.5);
    expect(lightDirection).toBe('NW');
  });

  it('should return defaults for missing effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {};

    const { roundness, intensity, lightDirection } = extractNormalParams(maskData);
    expect(roundness).toBe(0);
    expect(intensity).toBe(1.0);
    expect(lightDirection).toBe('N');
  });

  it('should return defaults for empty effectparams', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: {},
    };

    const { roundness, intensity, lightDirection } = extractNormalParams(maskData);
    expect(roundness).toBe(0);
    expect(intensity).toBe(1.0);
    expect(lightDirection).toBe('N');
  });

  it('should handle non-numeric roundness gracefully', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalRoundness: 'invalid' as unknown as number },
    };

    const { roundness } = extractNormalParams(maskData);
    expect(roundness).toBe(0);
  });

  it('should handle non-numeric intensity gracefully', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalIntensity: 'invalid' as unknown as number },
    };

    const { intensity } = extractNormalParams(maskData);
    expect(intensity).toBe(1.0);
  });

  it('should handle invalid light direction gracefully', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalLightDir: 'INVALID' },
    };

    const { lightDirection } = extractNormalParams(maskData);
    expect(lightDirection).toBe('N');
  });

  it('should handle lowercase light direction', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalLightDir: 'sw' },
    };

    const { lightDirection } = extractNormalParams(maskData);
    expect(lightDirection).toBe('SW');
  });

  it('should handle mixed-case light direction', () => {
    const maskData: PimcoMaskSubstitutionCompiled = {
      effectparams: { NormalLightDir: 'Ne' },
    };

    const { lightDirection } = extractNormalParams(maskData);
    expect(lightDirection).toBe('NE');
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
// getValidLightDirections Tests
// ============================================================================

describe('getValidLightDirections', () => {
  it('should return all 8 directions', () => {
    const directions = getValidLightDirections();
    expect(directions).toHaveLength(8);
  });

  it('should contain all cardinal directions', () => {
    const directions = getValidLightDirections();
    expect(directions).toContain('N');
    expect(directions).toContain('E');
    expect(directions).toContain('S');
    expect(directions).toContain('W');
  });

  it('should contain all intercardinal directions', () => {
    const directions = getValidLightDirections();
    expect(directions).toContain('NE');
    expect(directions).toContain('SE');
    expect(directions).toContain('SW');
    expect(directions).toContain('NW');
  });

  it('should be in correct order (clockwise from N)', () => {
    const directions = getValidLightDirections();
    expect(directions).toEqual(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  });
});

// ============================================================================
// getNormalEffectInfo Tests
// ============================================================================

describe('getNormalEffectInfo', () => {
  it('should return provided parameters', () => {
    const info = getNormalEffectInfo(5, 2.0, 'SE');
    expect(info.roundness).toBe(5);
    expect(info.intensity).toBe(2.0);
    expect(info.lightDirection).toBe('SE');
  });

  it('should return default values', () => {
    const info = getNormalEffectInfo(0, 1.0, 'N');
    expect(info.defaultRoundness).toBe(0);
    expect(info.defaultIntensity).toBe(1.0);
    expect(info.defaultLightDirection).toBe('N');
  });
});

// ============================================================================
// applyRoundnessBlur Tests (require OffscreenCanvas)
// ============================================================================

describe('applyRoundnessBlur', () => {
  it.skipIf(!hasOffscreenCanvas())('should return copy of source when roundness is 0', async () => {
    const { applyRoundnessBlur } = await import('./normal');

    const sourceCanvas = new OffscreenCanvas(100, 100);
    const ctx = getOffscreenContext(sourceCanvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(25, 25, 50, 50);

    const result = applyRoundnessBlur(sourceCanvas, 0);
    expect(result.canvas.width).toBe(100);
    expect(result.canvas.height).toBe(100);
    expect(result.offsetX).toBe(0);
    expect(result.offsetY).toBe(0);
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should expand canvas dimensions for positive roundness',
    async () => {
      const { applyRoundnessBlur } = await import('./normal');

      const sourceCanvas = new OffscreenCanvas(100, 100);
      const ctx = getOffscreenContext(sourceCanvas);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25, 25, 50, 50);

      const roundness = 10;
      const result = applyRoundnessBlur(sourceCanvas, roundness);

      // Canvas should be expanded by 2 * (roundness * 2) = 4 * roundness
      const expectedMargin = roundness * 2;
      expect(result.canvas.width).toBe(100 + expectedMargin * 2);
      expect(result.canvas.height).toBe(100 + expectedMargin * 2);
    }
  );

  it.skipIf(!hasOffscreenCanvas())(
    'should return correct offset for positive roundness',
    async () => {
      const { applyRoundnessBlur } = await import('./normal');

      const sourceCanvas = new OffscreenCanvas(100, 100);
      const ctx = getOffscreenContext(sourceCanvas);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(25, 25, 50, 50);

      const roundness = 15;
      const result = applyRoundnessBlur(sourceCanvas, roundness);

      const expectedMargin = roundness * 2;
      expect(result.offsetX).toBe(expectedMargin);
      expect(result.offsetY).toBe(expectedMargin);
    }
  );
});

// ============================================================================
// createColoredTextContent Tests (require OffscreenCanvas)
// ============================================================================

describe('createColoredTextContent', () => {
  it.skipIf(!hasOffscreenCanvas())('should create canvas with correct dimensions', async () => {
    const { createColoredTextContent } = await import('./normal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = getOffscreenContext(mockMask);
    ctx.fillStyle = '#000000';
    ctx.fillRect(25, 25, 50, 50);

    const result = createColoredTextContent(mockMask, 100, 100, '#ff0000', 1.0, 'normal');

    expect(result.canvas.width).toBe(100);
    expect(result.canvas.height).toBe(100);
    expect(result.ctx).toBeDefined();
  });

  it.skipIf(!hasOffscreenCanvas())('should reset composite operation to source-over', async () => {
    const { createColoredTextContent } = await import('./normal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = getOffscreenContext(mockMask);
    ctx.fillStyle = '#000000';
    ctx.fillRect(25, 25, 50, 50);

    const result = createColoredTextContent(mockMask, 100, 100, '#ff0000', 1.0, 'multiply');

    expect(result.ctx.globalCompositeOperation).toBe('source-over');
  });
});

// ============================================================================
// createNormalMapInput Tests (require OffscreenCanvas)
// ============================================================================

describe('createNormalMapInput', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create canvas with black background and correct dimensions',
    async () => {
      const { createNormalMapInput } = await import('./normal');

      const textContent = new OffscreenCanvas(100, 100);
      const ctx = getOffscreenContext(textContent);
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(25, 25, 50, 50);

      const result = createNormalMapInput(textContent, 100, 100);

      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );
});

// ============================================================================
// applyNormalEffect Tests (require OffscreenCanvas)
// ============================================================================

describe('applyNormalEffect', () => {
  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas with correct dimensions (no roundness)',
    async () => {
      const { applyNormalEffect } = await import('./normal');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = getOffscreenContext(mockMask);
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);

      const result = applyNormalEffect({
        width: 100,
        height: 100,
        color: '#ffffff',
        alpha: 1.0,
        blend: 'normal',
        mask: mockMask,
        roundness: 0,
        intensity: 1.0,
        lightDirection: 'N',
      });

      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
      expect(result.ctx).toBeDefined();
    }
  );

  it.skipIf(!hasOffscreenCanvas())(
    'should create result canvas with correct dimensions (with roundness)',
    async () => {
      const { applyNormalEffect } = await import('./normal');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = getOffscreenContext(mockMask);
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);

      const result = applyNormalEffect({
        width: 100,
        height: 100,
        color: '#ffffff',
        alpha: 1.0,
        blend: 'normal',
        mask: mockMask,
        roundness: 5,
        intensity: 1.0,
        lightDirection: 'N',
      });

      // Output canvas should still be original dimensions
      expect(result.canvas.width).toBe(100);
      expect(result.canvas.height).toBe(100);
    }
  );

  it.skipIf(!hasOffscreenCanvas())('should work with various light directions', async () => {
    const { applyNormalEffect } = await import('./normal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = getOffscreenContext(mockMask);
    ctx.fillStyle = '#000000';
    ctx.fillRect(25, 25, 50, 50);

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

    for (const direction of directions) {
      const result = applyNormalEffect({
        width: 100,
        height: 100,
        color: '#ffffff',
        alpha: 1.0,
        blend: 'normal',
        mask: mockMask,
        roundness: 0,
        intensity: 1.0,
        lightDirection: direction,
      });

      expect(result.canvas).toBeDefined();
      expect(result.ctx).toBeDefined();
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should work with various intensity values', async () => {
    const { applyNormalEffect } = await import('./normal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = getOffscreenContext(mockMask);
    ctx.fillStyle = '#000000';
    ctx.fillRect(25, 25, 50, 50);

    const intensities = [0.5, 1.0, 1.5, 2.0, 3.0];

    for (const intensity of intensities) {
      const result = applyNormalEffect({
        width: 100,
        height: 100,
        color: '#ffffff',
        alpha: 1.0,
        blend: 'normal',
        mask: mockMask,
        roundness: 0,
        intensity,
        lightDirection: 'N',
      });

      expect(result.canvas).toBeDefined();
      expect(result.ctx).toBeDefined();
    }
  });

  it.skipIf(!hasOffscreenCanvas())('should work with texture', async () => {
    const { applyNormalEffect } = await import('./normal');

    const mockMask = new OffscreenCanvas(100, 100);
    const maskCtx = getOffscreenContext(mockMask);
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(25, 25, 50, 50);

    // Create a mock texture
    const mockTexture = new OffscreenCanvas(20, 20);
    const texCtx = getOffscreenContext(mockTexture);
    texCtx.fillStyle = '#cccccc';
    texCtx.fillRect(0, 0, 20, 20);

    // Convert to ImageBitmap
    const imageBitmap = await createImageBitmap(mockTexture);

    const result = applyNormalEffect({
      width: 100,
      height: 100,
      color: '#ffffff',
      alpha: 1.0,
      blend: 'multiply',
      mask: mockMask,
      roundness: 0,
      intensity: 1.0,
      lightDirection: 'N',
      texture: imageBitmap,
    });

    expect(result.canvas).toBeDefined();
    expect(result.ctx).toBeDefined();

    imageBitmap.close();
  });
});

// ============================================================================
// processNormalEffectLayer Tests (require OffscreenCanvas)
// ============================================================================

describe('processNormalEffectLayer', () => {
  it.skipIf(!hasOffscreenCanvas())('should process layer with default parameters', async () => {
    const { processNormalEffectLayer } = await import('./normal');

    const mockMask = new OffscreenCanvas(100, 100);
    const ctx = getOffscreenContext(mockMask);
    ctx.fillStyle = '#000000';
    ctx.fillRect(25, 25, 50, 50);

    const layer = {
      color: '#ffffff',
      alpha: 1.0,
      blend: 'normal' as const,
      maskData: {},
    };

    const result = processNormalEffectLayer(layer as never, 100, 100, mockMask);

    expect(result).not.toBeNull();
    expect(result?.width).toBe(100);
    expect(result?.height).toBe(100);
  });

  it.skipIf(!hasOffscreenCanvas())(
    'should process layer with custom effect parameters',
    async () => {
      const { processNormalEffectLayer } = await import('./normal');

      const mockMask = new OffscreenCanvas(100, 100);
      const ctx = getOffscreenContext(mockMask);
      ctx.fillStyle = '#000000';
      ctx.fillRect(25, 25, 50, 50);

      const layer = {
        color: '#ffffff',
        alpha: 0.8,
        blend: 'multiply' as const,
        maskData: {
          effectparams: {
            NormalRoundness: 3,
            NormalIntensity: 1.5,
            NormalLightDir: 'SE',
          },
        },
      };

      const result = processNormalEffectLayer(layer as never, 100, 100, mockMask);

      expect(result).not.toBeNull();
      expect(result?.width).toBe(100);
      expect(result?.height).toBe(100);
    }
  );
});
