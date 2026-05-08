/**
 * Unit tests for text rasterization module.
 *
 * Note: Tests that require canvas context (measureText, rasterizeText) use mocked canvas utils.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PimcoMaskSubstitutionTypeDefinition } from '../types/pimco';

// =============================================================================
// Mock Canvas Context
// =============================================================================

interface MockContext {
  canvas: { width: number; height: number };
  font: string;
  textAlign: string;
  textBaseline: string;
  fillStyle: string;
  letterSpacing: string;
  globalCompositeOperation: string;
  globalAlpha: number;
  measureText: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
}

function createMockContext(width: number, height: number): MockContext {
  return {
    canvas: { width, height },
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillStyle: '#000000',
    letterSpacing: '',
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    measureText: vi.fn().mockReturnValue({ width: 100 }),
    fillText: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
  };
}

interface MockCanvas {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
}

function createMockCanvas(width: number, height: number): MockCanvas {
  const ctx = createMockContext(width, height);
  return {
    width,
    height,
    getContext: vi.fn().mockReturnValue(ctx),
  };
}

// Mock the canvas utils module
vi.mock('../utils/canvas', () => ({
  createCanvas: vi.fn((width: number, height: number) => createMockCanvas(width, height)),
  getContext2D: vi.fn(
    (canvas: MockCanvas): MockContext | null => canvas.getContext('2d') as MockContext | null
  ),
}));

// Import after mocking
import {
  applyTextTransform,
  parseTypography,
  buildFontString,
  measureText,
  rasterizeText,
  TextRasterizer,
  createTextRasterizer,
  type TypographyConfig,
} from './text-rasterizer';

describe('applyTextTransform', () => {
  it('should return original text for "none" transform', () => {
    expect(applyTextTransform('Hello World', 'none')).toBe('Hello World');
  });

  it('should convert text to uppercase', () => {
    expect(applyTextTransform('Hello World', 'uppercase')).toBe('HELLO WORLD');
  });

  it('should convert text to lowercase', () => {
    expect(applyTextTransform('Hello World', 'lowercase')).toBe('hello world');
  });

  it('should capitalize first letter of each word', () => {
    expect(applyTextTransform('hello world', 'capitalize')).toBe('Hello World');
  });

  it('should handle empty string', () => {
    expect(applyTextTransform('', 'uppercase')).toBe('');
  });

  it('should handle single character', () => {
    expect(applyTextTransform('a', 'uppercase')).toBe('A');
    expect(applyTextTransform('A', 'lowercase')).toBe('a');
    expect(applyTextTransform('a', 'capitalize')).toBe('A');
  });

  it('should handle special characters', () => {
    expect(applyTextTransform('hello-world', 'capitalize')).toBe('Hello-World');
  });
});

describe('parseTypography', () => {
  const workWidth = 1000;

  it('should use default values when type is undefined', () => {
    const config = parseTypography(undefined, workWidth);

    expect(config.fontFamily).toBe('sans-serif');
    expect(config.fontWeight).toBe('700'); // Matches legacy dfltWeight
    expect(config.fontSize).toBe(70); // 1000 * 0.07 (legacy LH)
    expect(config.letterSpacing).toBe('');
    expect(config.textTransform).toBe('none');
    expect(config.alignment).toBe('center');
    expect(config.widthScale).toBe(1);
    expect(config.heightScale).toBe(1);
  });

  it('should parse custom typography values', () => {
    const type: PimcoMaskSubstitutionTypeDefinition = {
      fontfamily: 'Arial',
      fontweight: 700,
      lineheight: 0.1,
      letterspacing: '0.05em',
      texttransform: 'uppercase',
      alignment: 'left',
      widthscale: 1.2,
      heightscale: 1.5,
    };

    const config = parseTypography(type, workWidth);

    expect(config.fontFamily).toBe('Arial');
    expect(config.fontWeight).toBe(700);
    expect(config.fontSize).toBe(100); // 1000 * 0.1
    expect(config.letterSpacing).toBe('0.05em');
    expect(config.textTransform).toBe('uppercase');
    expect(config.alignment).toBe('left');
    expect(config.widthScale).toBe(1.2);
    expect(config.heightScale).toBe(1.5);
  });

  it('should handle partial typography definition', () => {
    const type: PimcoMaskSubstitutionTypeDefinition = {
      fontfamily: 'Helvetica',
    };

    const config = parseTypography(type, workWidth);

    expect(config.fontFamily).toBe('Helvetica');
    expect(config.fontWeight).toBe('700'); // Default (matches legacy dfltWeight)
    expect(config.alignment).toBe('center'); // Default
  });

  it('should calculate font size based on workWidth and lineheight', () => {
    const type1: PimcoMaskSubstitutionTypeDefinition = { lineheight: 0.05 };
    expect(parseTypography(type1, 1000).fontSize).toBe(50);

    const type2: PimcoMaskSubstitutionTypeDefinition = { lineheight: 0.12 };
    expect(parseTypography(type2, 500).fontSize).toBe(60);
  });
});

describe('buildFontString', () => {
  it('should build correct CSS font string', () => {
    const config: TypographyConfig = {
      fontFamily: 'Arial',
      fontWeight: '700',
      fontSize: 24,
      letterSpacing: '',
      textTransform: 'none',
      alignment: 'center',
      widthScale: 1,
      heightScale: 1,
    };

    expect(buildFontString(config)).toBe('700 24px/100% Arial');
  });

  it('should handle numeric font weight', () => {
    const config: TypographyConfig = {
      fontFamily: 'sans-serif',
      fontWeight: 400,
      fontSize: 16,
      letterSpacing: '',
      textTransform: 'none',
      alignment: 'center',
      widthScale: 1,
      heightScale: 1,
    };

    expect(buildFontString(config)).toBe('400 16px/100% sans-serif');
  });

  it('should handle multiple font families', () => {
    const config: TypographyConfig = {
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontWeight: '400',
      fontSize: 20,
      letterSpacing: '',
      textTransform: 'none',
      alignment: 'center',
      widthScale: 1,
      heightScale: 1,
    };

    expect(buildFontString(config)).toBe('400 20px/100% Arial, Helvetica, sans-serif');
  });
});

describe('measureText', () => {
  const workWidth = 1000;

  it('should return zero dimensions for empty content', () => {
    const measurement = measureText('', undefined, workWidth);

    expect(measurement.width).toBe(0);
    expect(measurement.height).toBe(0);
    expect(measurement.text).toBe('');
    expect(measurement.scale).toBe(1);
  });

  it('should measure text with default typography', () => {
    const measurement = measureText('Hello', undefined, workWidth);

    expect(measurement.text).toBe('Hello');
    expect(measurement.width).toBeGreaterThan(0);
    expect(measurement.height).toBeGreaterThan(0);
    expect(measurement.typography).toBeDefined();
  });

  it('should apply text transform during measurement', () => {
    const type: PimcoMaskSubstitutionTypeDefinition = {
      texttransform: 'uppercase',
    };

    const measurement = measureText('hello', type, workWidth);

    expect(measurement.text).toBe('HELLO');
  });

  it('should apply width scale factor', () => {
    const type1: PimcoMaskSubstitutionTypeDefinition = {
      widthscale: 1,
    };
    const type2: PimcoMaskSubstitutionTypeDefinition = {
      widthscale: 1.5,
    };

    const m1 = measureText('Test', type1, workWidth);
    const m2 = measureText('Test', type2, workWidth);

    // Width should be larger with widthscale 1.5
    expect(m2.width).toBeGreaterThan(m1.width);
  });

  it('should apply height scale factor', () => {
    const type1: PimcoMaskSubstitutionTypeDefinition = {
      heightscale: 1,
    };
    const type2: PimcoMaskSubstitutionTypeDefinition = {
      heightscale: 2,
    };

    const m1 = measureText('Test', type1, workWidth);
    const m2 = measureText('Test', type2, workWidth);

    // Height should be larger with heightscale 2
    expect(m2.height).toBeGreaterThan(m1.height);
  });
});

describe('rasterizeText', () => {
  const workWidth = 500;
  const workHeight = 500;

  it('should return a canvas with empty text', () => {
    const result = rasterizeText({
      workWidth,
      workHeight,
      content: '',
    });

    expect(result.canvas).toBeDefined();
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  it('should rasterize text to canvas', () => {
    const result = rasterizeText({
      workWidth,
      workHeight,
      content: 'Hello World',
    });

    expect(result.canvas).toBeDefined();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
    expect(result.measurement.text).toBe('Hello World');
  });

  it('should apply typography settings', () => {
    const type: PimcoMaskSubstitutionTypeDefinition = {
      fontfamily: 'Arial',
      fontweight: 700,
      texttransform: 'uppercase',
    };

    const result = rasterizeText({
      workWidth,
      workHeight,
      type,
      content: 'hello',
    });

    expect(result.measurement.text).toBe('HELLO');
    expect(result.measurement.typography.fontFamily).toBe('Arial');
    expect(result.measurement.typography.fontWeight).toBe(700);
  });

  it('should have correct dimensions matching measurement', () => {
    const result = rasterizeText({
      workWidth,
      workHeight,
      content: 'Test Content',
    });

    expect(result.width).toBe(result.measurement.width);
    expect(result.height).toBe(result.measurement.height);
  });

  it('should handle different alignments', () => {
    const leftAligned = rasterizeText({
      workWidth,
      workHeight,
      type: { alignment: 'left' },
      content: 'Left',
    });

    const centerAligned = rasterizeText({
      workWidth,
      workHeight,
      type: { alignment: 'center' },
      content: 'Center',
    });

    const rightAligned = rasterizeText({
      workWidth,
      workHeight,
      type: { alignment: 'right' },
      content: 'Right',
    });

    // All should produce valid canvases
    expect(leftAligned.canvas).toBeDefined();
    expect(centerAligned.canvas).toBeDefined();
    expect(rightAligned.canvas).toBeDefined();

    // Check alignment settings were applied
    expect(leftAligned.measurement.typography.alignment).toBe('left');
    expect(centerAligned.measurement.typography.alignment).toBe('center');
    expect(rightAligned.measurement.typography.alignment).toBe('right');
  });
});

describe('TextRasterizer class', () => {
  let rasterizer: TextRasterizer;

  beforeEach(() => {
    rasterizer = createTextRasterizer();
  });

  afterEach(() => {
    rasterizer.destroy();
  });

  it('should create instance via factory function', () => {
    expect(rasterizer).toBeInstanceOf(TextRasterizer);
  });

  it('should measure text', () => {
    const measurement = rasterizer.measure('Test', undefined, 1000);

    expect(measurement.text).toBe('Test');
    expect(measurement.width).toBeGreaterThan(0);
    expect(measurement.height).toBeGreaterThan(0);
  });

  it('should rasterize text', () => {
    const result = rasterizer.rasterize({
      workWidth: 500,
      workHeight: 500,
      content: 'Hello',
    });

    expect(result.canvas).toBeDefined();
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should transform text', () => {
    expect(rasterizer.transform('hello', 'uppercase')).toBe('HELLO');
    expect(rasterizer.transform('HELLO', 'lowercase')).toBe('hello');
    expect(rasterizer.transform('hello world', 'capitalize')).toBe('Hello World');
    expect(rasterizer.transform('hello', 'none')).toBe('hello');
  });

  it('should handle multiple operations', () => {
    // Measure first
    const m1 = rasterizer.measure('First', undefined, 1000);
    expect(m1.text).toBe('First');

    // Measure second
    const m2 = rasterizer.measure('Second', undefined, 1000);
    expect(m2.text).toBe('Second');

    // Rasterize
    const r1 = rasterizer.rasterize({
      workWidth: 500,
      workHeight: 500,
      content: 'Rasterized',
    });
    expect(r1.measurement.text).toBe('Rasterized');
  });

  it('should be reusable after destroy', () => {
    rasterizer.destroy();

    // Should still work after destroy (creates new internal resources)
    const measurement = rasterizer.measure('After destroy', undefined, 1000);
    expect(measurement.text).toBe('After destroy');
  });
});

describe('edge cases', () => {
  it('should handle very small workWidth', () => {
    const measurement = measureText('Hello', undefined, 10);

    expect(measurement.width).toBeGreaterThanOrEqual(0);
    expect(measurement.height).toBeGreaterThanOrEqual(0);
  });

  it('should handle very large workWidth', () => {
    const measurement = measureText('Hello', undefined, 10000);

    expect(measurement.width).toBeGreaterThan(0);
    expect(measurement.height).toBeGreaterThan(0);
  });

  it('should handle unicode characters', () => {
    const measurement = measureText('Hello 世界 🌍', undefined, 1000);

    expect(measurement.text).toBe('Hello 世界 🌍');
    expect(measurement.width).toBeGreaterThan(0);
  });

  it('should handle newlines in text', () => {
    const measurement = measureText('Line 1\nLine 2', undefined, 1000);

    // Currently treats as single line (newlines render as spaces in canvas)
    expect(measurement.text).toBe('Line 1\nLine 2');
    expect(measurement.width).toBeGreaterThan(0);
  });

  it('should handle whitespace-only text', () => {
    const measurement = measureText('   ', undefined, 1000);

    // Canvas measureText returns width for spaces
    expect(measurement.text).toBe('   ');
  });

  it('should handle zero lineheight', () => {
    const type: PimcoMaskSubstitutionTypeDefinition = {
      lineheight: 0,
    };

    const measurement = measureText('Test', type, 1000);

    // Font size will be 0, resulting in minimal dimensions
    expect(measurement.typography.fontSize).toBe(0);
  });

  it('should handle negative scale factors', () => {
    const type: PimcoMaskSubstitutionTypeDefinition = {
      widthscale: -1,
      heightscale: -1,
    };

    const measurement = measureText('Test', type, 1000);

    // Negative scales should still produce some result
    expect(measurement.typography.widthScale).toBe(-1);
    expect(measurement.typography.heightScale).toBe(-1);
  });
});
