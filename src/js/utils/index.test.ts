import { describe, it, expect } from 'vitest';
import {
  // Color utilities
  parseHexColor,
  parseHexColorWithAlpha,
  rgbToHex,
  rgbaToHex,
  relativeLuminance,
  brightness,
  isDarkColor,
  multiplyColor,
  highlightSaturate,
  alphaBlend,
  lerpColor,
  clampColorValue,
  // Canvas utilities
  isOffscreenCanvasSupported,
  createCanvas,
  getContext2D,
  createCanvasWithContext,
  resetCanvasContext,
  clearCanvas,
  cloneCanvas,
  resizeCanvas,
  drawImageFit,
  isWebGL2Supported,
} from './index';

// ============================================================================
// Color Utilities Tests
// ============================================================================

describe('parseHexColor', () => {
  it('should parse 6-digit hex with #', () => {
    expect(parseHexColor('#ff0000')).toEqual([255, 0, 0]);
    expect(parseHexColor('#00ff00')).toEqual([0, 255, 0]);
    expect(parseHexColor('#0000ff')).toEqual([0, 0, 255]);
    expect(parseHexColor('#ffffff')).toEqual([255, 255, 255]);
    expect(parseHexColor('#000000')).toEqual([0, 0, 0]);
  });

  it('should parse 6-digit hex without #', () => {
    expect(parseHexColor('ff0000')).toEqual([255, 0, 0]);
    expect(parseHexColor('AABBCC')).toEqual([170, 187, 204]);
  });

  it('should parse 3-digit hex', () => {
    expect(parseHexColor('#f00')).toEqual([255, 0, 0]);
    expect(parseHexColor('#abc')).toEqual([170, 187, 204]);
    expect(parseHexColor('fff')).toEqual([255, 255, 255]);
  });

  it('should handle case insensitivity', () => {
    expect(parseHexColor('#AABBCC')).toEqual([170, 187, 204]);
    expect(parseHexColor('#aAbBcC')).toEqual([170, 187, 204]);
  });

  it('should return null for invalid hex', () => {
    expect(parseHexColor('#gg0000')).toBeNull();
    expect(parseHexColor('not-hex')).toBeNull();
    expect(parseHexColor('')).toBeNull();
    expect(parseHexColor('#')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull(); // 5 digits
    expect(parseHexColor('#1234567')).toBeNull(); // 7 digits
  });
});

describe('parseHexColorWithAlpha', () => {
  it('should parse 6-digit hex with alpha=1', () => {
    expect(parseHexColorWithAlpha('#ff0000')).toEqual([255, 0, 0, 1]);
  });

  it('should parse 8-digit hex with alpha', () => {
    expect(parseHexColorWithAlpha('#ff000080')).toEqual([255, 0, 0, 128 / 255]);
    expect(parseHexColorWithAlpha('#ff0000ff')).toEqual([255, 0, 0, 1]);
    expect(parseHexColorWithAlpha('#ff000000')).toEqual([255, 0, 0, 0]);
  });

  it('should parse 3-digit hex with alpha=1', () => {
    expect(parseHexColorWithAlpha('#f00')).toEqual([255, 0, 0, 1]);
  });

  it('should parse 4-digit hex with alpha', () => {
    expect(parseHexColorWithAlpha('#f008')).toEqual([255, 0, 0, 136 / 255]);
    expect(parseHexColorWithAlpha('#f00f')).toEqual([255, 0, 0, 1]);
  });

  it('should return null for invalid hex', () => {
    expect(parseHexColorWithAlpha('#12')).toBeNull();
    expect(parseHexColorWithAlpha('invalid')).toBeNull();
  });
});

describe('rgbToHex', () => {
  it('should convert RGB to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('should clamp values to valid range', () => {
    expect(rgbToHex(300, -50, 128)).toBe('#ff0080');
  });

  it('should round decimal values', () => {
    expect(rgbToHex(127.4, 127.6, 128)).toBe('#7f8080');
  });
});

describe('rgbaToHex', () => {
  it('should convert RGBA to hex', () => {
    expect(rgbaToHex(255, 0, 0, 1)).toBe('#ff0000ff');
    expect(rgbaToHex(255, 0, 0, 0)).toBe('#ff000000');
    expect(rgbaToHex(255, 0, 0, 0.5)).toBe('#ff000080');
  });

  it('should clamp alpha to valid range', () => {
    expect(rgbaToHex(255, 0, 0, 2)).toBe('#ff0000ff');
    expect(rgbaToHex(255, 0, 0, -1)).toBe('#ff000000');
  });
});

describe('relativeLuminance', () => {
  it('should calculate luminance for black and white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBeCloseTo(1, 2);
  });

  it('should calculate luminance for primary colors', () => {
    // Red has relatively low luminance
    const redLum = relativeLuminance(255, 0, 0);
    // Green has high luminance
    const greenLum = relativeLuminance(0, 255, 0);
    // Blue has low luminance
    const blueLum = relativeLuminance(0, 0, 255);

    expect(greenLum).toBeGreaterThan(redLum);
    expect(greenLum).toBeGreaterThan(blueLum);
  });
});

describe('brightness', () => {
  it('should return 0 for black', () => {
    expect(brightness(0, 0, 0)).toBe(0);
  });

  it('should return 255 for white', () => {
    expect(brightness(255, 255, 255)).toBeCloseTo(255, 0);
  });

  it('should calculate brightness for colors', () => {
    const redBrightness = brightness(255, 0, 0);
    const greenBrightness = brightness(0, 255, 0);
    const blueBrightness = brightness(0, 0, 255);

    // Green should be brightest, then red, then blue
    expect(greenBrightness).toBeGreaterThan(redBrightness);
    expect(redBrightness).toBeGreaterThan(blueBrightness);
  });
});

describe('isDarkColor', () => {
  it('should identify black as dark', () => {
    expect(isDarkColor(0, 0, 0)).toBe(true);
  });

  it('should identify white as not dark', () => {
    expect(isDarkColor(255, 255, 255)).toBe(false);
  });

  it('should use custom threshold', () => {
    // Mid-gray is around 127.5 brightness
    expect(isDarkColor(128, 128, 128, 130)).toBe(true);
    expect(isDarkColor(128, 128, 128, 120)).toBe(false);
  });
});

describe('multiplyColor', () => {
  it('should multiply colors correctly', () => {
    expect(multiplyColor([255, 255, 255], [255, 255, 255])).toEqual([255, 255, 255]);
    expect(multiplyColor([255, 255, 255], [0, 0, 0])).toEqual([0, 0, 0]);
    expect(multiplyColor([255, 255, 255], [128, 128, 128])).toEqual([128, 128, 128]);
  });

  it('should handle partial multiplications', () => {
    expect(multiplyColor([200, 100, 50], [255, 255, 255])).toEqual([200, 100, 50]);
    expect(multiplyColor([200, 100, 50], [128, 128, 128])).toEqual([100, 50, 25]);
  });
});

describe('highlightSaturate', () => {
  it('should saturate and multiply colors', () => {
    const result = highlightSaturate([100, 100, 100], [255, 255, 255]);
    // Doubled values are 200, multiplied by 255/256 ~ 200
    expect(result[0]).toBeGreaterThan(100);
    expect(result[1]).toBeGreaterThan(100);
    expect(result[2]).toBeGreaterThan(100);
  });

  it('should distribute overflow to other channels', () => {
    // When red is 200, doubled = 400, excess = 145 (400-255), halved = 72
    // This extra gets added to green and blue
    const result = highlightSaturate([200, 50, 50], [255, 255, 255]);
    expect(result[1]).toBeGreaterThan(50);
    expect(result[2]).toBeGreaterThan(50);
  });

  it('should clamp results to 255', () => {
    const result = highlightSaturate([255, 255, 255], [255, 255, 255]);
    expect(result[0]).toBeLessThanOrEqual(255);
    expect(result[1]).toBeLessThanOrEqual(255);
    expect(result[2]).toBeLessThanOrEqual(255);
  });
});

describe('alphaBlend', () => {
  it('should blend with opaque foreground', () => {
    const result = alphaBlend([255, 0, 0, 1], [0, 255, 0, 1]);
    expect(result).toEqual([255, 0, 0, 1]);
  });

  it('should blend with transparent foreground', () => {
    const result = alphaBlend([255, 0, 0, 0], [0, 255, 0, 1]);
    expect(result).toEqual([0, 255, 0, 1]);
  });

  it('should blend with semi-transparent foreground', () => {
    const result = alphaBlend([255, 0, 0, 0.5], [0, 255, 0, 1]);
    // With fg alpha=0.5 and bg alpha=1:
    // outAlpha = 0.5 + 1 * 0.5 = 1
    // outR = (255 * 0.5 + 0 * 1 * 0.5) / 1 = 127.5
    // outG = (0 * 0.5 + 255 * 1 * 0.5) / 1 = 127.5
    expect(result[0]).toBeCloseTo(128, 0);
    expect(result[1]).toBeCloseTo(128, 0);
    expect(result[2]).toBe(0);
    expect(result[3]).toBe(1);
  });

  it('should handle fully transparent colors', () => {
    const result = alphaBlend([255, 0, 0, 0], [0, 255, 0, 0]);
    expect(result).toEqual([0, 0, 0, 0]);
  });
});

describe('lerpColor', () => {
  it('should return first color at t=0', () => {
    expect(lerpColor([255, 0, 0], [0, 255, 0], 0)).toEqual([255, 0, 0]);
  });

  it('should return second color at t=1', () => {
    expect(lerpColor([255, 0, 0], [0, 255, 0], 1)).toEqual([0, 255, 0]);
  });

  it('should interpolate at t=0.5', () => {
    expect(lerpColor([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
  });

  it('should clamp t to valid range', () => {
    expect(lerpColor([255, 0, 0], [0, 255, 0], -0.5)).toEqual([255, 0, 0]);
    expect(lerpColor([255, 0, 0], [0, 255, 0], 1.5)).toEqual([0, 255, 0]);
  });
});

describe('clampColorValue', () => {
  it('should clamp values to default range', () => {
    expect(clampColorValue(128)).toBe(128);
    expect(clampColorValue(-50)).toBe(0);
    expect(clampColorValue(300)).toBe(255);
  });

  it('should clamp to custom range', () => {
    expect(clampColorValue(50, 0, 100)).toBe(50);
    expect(clampColorValue(150, 0, 100)).toBe(100);
    expect(clampColorValue(-10, 0, 100)).toBe(0);
  });

  it('should round decimal values', () => {
    expect(clampColorValue(127.4)).toBe(127);
    expect(clampColorValue(127.6)).toBe(128);
  });
});

// ============================================================================
// Canvas Utilities Tests
// ============================================================================

// Note: Many canvas tests require a real canvas implementation which jsdom doesn't provide.
// These tests verify API behavior and are more thoroughly tested in E2E tests with a real browser.

describe('isOffscreenCanvasSupported', () => {
  it('should return a boolean', () => {
    expect(typeof isOffscreenCanvasSupported()).toBe('boolean');
  });
});

describe('createCanvas', () => {
  it('should create a canvas with specified dimensions', () => {
    const canvas = createCanvas(100, 200, false);
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(200);
  });

  it('should create an OffscreenCanvas when supported and preferred', () => {
    if (isOffscreenCanvasSupported()) {
      const canvas = createCanvas(100, 100, true);
      expect(canvas).toBeInstanceOf(OffscreenCanvas);
    }
  });

  it('should create an HTMLCanvasElement when not preferring offscreen', () => {
    // In browser environment with DOM
    if (typeof document !== 'undefined') {
      const canvas = createCanvas(100, 100, false);
      expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    }
  });
});

describe('getContext2D', () => {
  // Note: jsdom doesn't implement canvas context, so we test that function doesn't throw
  it('should handle canvas context request', () => {
    const canvas = createCanvas(100, 100, false);
    // In jsdom, this returns null but shouldn't throw
    expect(() => getContext2D(canvas)).not.toThrow();
  });
});

describe('createCanvasWithContext', () => {
  // Skip in jsdom since canvas context isn't available
  it.skipIf(!isOffscreenCanvasSupported())(
    'should create canvas with context when OffscreenCanvas available',
    () => {
      const { canvas, ctx } = createCanvasWithContext(100, 200);
      expect(canvas.width).toBe(100);
      expect(canvas.height).toBe(200);
      expect(ctx).not.toBeNull();
    }
  );
});

describe('resizeCanvas', () => {
  it('should resize canvas dimensions', () => {
    const canvas = createCanvas(100, 100);
    resizeCanvas(canvas, 200, 150, false);

    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
  });
});

describe('isWebGL2Supported', () => {
  it('should return a boolean', () => {
    expect(typeof isWebGL2Supported()).toBe('boolean');
  });
});

// The following tests require a real canvas context and are better suited for E2E/browser tests:
// - resetCanvasContext
// - clearCanvas
// - cloneCanvas
// - resizeCanvas (with content preservation)
// - drawImageFit
// - drawCover
// - drawContain
// - canvasToImageBitmap
// - imageDataToImageBitmap

describe('Canvas utilities API existence', () => {
  it('should export all canvas utility functions', () => {
    expect(typeof resetCanvasContext).toBe('function');
    expect(typeof clearCanvas).toBe('function');
    expect(typeof cloneCanvas).toBe('function');
    expect(typeof drawImageFit).toBe('function');
  });
});
