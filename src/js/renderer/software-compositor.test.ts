/**
 * Unit tests for Software Compositor.
 *
 * Tests the pixel-level blending operations and buffer management
 * used in Scenario F when no canvas support is available.
 */

import { describe, it, expect } from 'vitest';
import {
  createPixelBuffer,
  pixelBufferToBytes,
  blendBuffers,
  type PixelBuffer,
} from './software-compositor';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a pixel buffer filled with a solid color.
 */
function createSolidColorBuffer(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number
): PixelBuffer {
  const buffer = createPixelBuffer(width, height);
  const pixels = width * height;

  for (let i = 0; i < pixels; i++) {
    const offset = i * 4;
    buffer.data[offset] = r;
    buffer.data[offset + 1] = g;
    buffer.data[offset + 2] = b;
    buffer.data[offset + 3] = a;
  }

  return buffer;
}

/**
 * Get pixel at coordinates from a buffer.
 */
function getPixel(
  buffer: PixelBuffer,
  x: number,
  y: number
): { r: number; g: number; b: number; a: number } {
  const offset = (y * buffer.width + x) * 4;
  return {
    r: buffer.data[offset],
    g: buffer.data[offset + 1],
    b: buffer.data[offset + 2],
    a: buffer.data[offset + 3],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('createPixelBuffer', () => {
  it('should create buffer with correct dimensions', () => {
    const buffer = createPixelBuffer(100, 50);

    expect(buffer.width).toBe(100);
    expect(buffer.height).toBe(50);
    expect(buffer.data.length).toBe(100 * 50 * 4);
  });

  it('should initialize buffer with zeros', () => {
    const buffer = createPixelBuffer(10, 10);

    for (const value of buffer.data) {
      expect(value).toBe(0);
    }
  });

  it('should handle 1x1 buffer', () => {
    const buffer = createPixelBuffer(1, 1);

    expect(buffer.width).toBe(1);
    expect(buffer.height).toBe(1);
    expect(buffer.data.length).toBe(4);
  });

  it('should handle large buffers', () => {
    const buffer = createPixelBuffer(1920, 1080);

    expect(buffer.width).toBe(1920);
    expect(buffer.height).toBe(1080);
    expect(buffer.data.length).toBe(1920 * 1080 * 4);
  });
});

describe('pixelBufferToBytes', () => {
  it('should convert float values to bytes', () => {
    const buffer = createPixelBuffer(1, 1);
    buffer.data[0] = 0; // R
    buffer.data[1] = 0.5; // G
    buffer.data[2] = 1.0; // B
    buffer.data[3] = 0.25; // A

    const bytes = pixelBufferToBytes(buffer);

    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(128); // 0.5 * 255 rounded
    expect(bytes[2]).toBe(255);
    expect(bytes[3]).toBe(64); // 0.25 * 255 rounded
  });

  it('should clamp values above 1', () => {
    const buffer = createPixelBuffer(1, 1);
    buffer.data[0] = 1.5;
    buffer.data[1] = 2.0;
    buffer.data[2] = 100;
    buffer.data[3] = 1.0;

    const bytes = pixelBufferToBytes(buffer);

    expect(bytes[0]).toBe(255);
    expect(bytes[1]).toBe(255);
    expect(bytes[2]).toBe(255);
    expect(bytes[3]).toBe(255);
  });

  it('should clamp values below 0', () => {
    const buffer = createPixelBuffer(1, 1);
    buffer.data[0] = -0.5;
    buffer.data[1] = -1.0;
    buffer.data[2] = -100;
    buffer.data[3] = 0;

    const bytes = pixelBufferToBytes(buffer);

    expect(bytes[0]).toBe(0);
    expect(bytes[1]).toBe(0);
    expect(bytes[2]).toBe(0);
    expect(bytes[3]).toBe(0);
  });

  it('should return Uint8ClampedArray', () => {
    const buffer = createPixelBuffer(1, 1);
    const bytes = pixelBufferToBytes(buffer);

    expect(bytes).toBeInstanceOf(Uint8ClampedArray);
  });
});

describe('blendBuffers', () => {
  describe('source-over', () => {
    it('should blend opaque source over transparent destination', () => {
      const dst = createPixelBuffer(1, 1);
      const src = createSolidColorBuffer(1, 1, 1, 0, 0, 1); // Opaque red

      blendBuffers(dst, src, 'source-over', 1);

      const pixel = getPixel(dst, 0, 0);
      expect(pixel.r).toBeCloseTo(1, 2);
      expect(pixel.g).toBeCloseTo(0, 2);
      expect(pixel.b).toBeCloseTo(0, 2);
      expect(pixel.a).toBeCloseTo(1, 2);
    });

    it('should blend semi-transparent source over opaque destination', () => {
      const dst = createSolidColorBuffer(1, 1, 0, 0, 1, 1); // Opaque blue
      const src = createSolidColorBuffer(1, 1, 1, 0, 0, 0.5); // 50% red

      blendBuffers(dst, src, 'source-over', 1);

      const pixel = getPixel(dst, 0, 0);
      // outA = 0.5 + 1 * 0.5 = 1
      // outR = (1 * 0.5 + 0 * 1 * 0.5) / 1 = 0.5
      // outB = (0 * 0.5 + 1 * 1 * 0.5) / 1 = 0.5
      expect(pixel.r).toBeCloseTo(0.5, 2);
      expect(pixel.b).toBeCloseTo(0.5, 2);
      expect(pixel.a).toBeCloseTo(1, 2);
    });

    it('should apply global alpha to source', () => {
      const dst = createPixelBuffer(1, 1);
      const src = createSolidColorBuffer(1, 1, 1, 0, 0, 1);

      blendBuffers(dst, src, 'source-over', 0.5);

      const pixel = getPixel(dst, 0, 0);
      expect(pixel.a).toBeCloseTo(0.5, 2);
    });

    it('should not modify destination when source is fully transparent', () => {
      const dst = createSolidColorBuffer(1, 1, 0, 0, 1, 1);
      const src = createSolidColorBuffer(1, 1, 1, 0, 0, 0);

      blendBuffers(dst, src, 'source-over', 1);

      const pixel = getPixel(dst, 0, 0);
      expect(pixel.r).toBeCloseTo(0, 2);
      expect(pixel.b).toBeCloseTo(1, 2);
    });
  });

  describe('multiply', () => {
    it('should multiply colors correctly', () => {
      const dst = createSolidColorBuffer(1, 1, 0.5, 0.5, 0.5, 1);
      const src = createSolidColorBuffer(1, 1, 1, 0.5, 0, 1);

      blendBuffers(dst, src, 'multiply', 1);

      const pixel = getPixel(dst, 0, 0);
      // Multiply: 0.5 * 1 = 0.5, 0.5 * 0.5 = 0.25, 0.5 * 0 = 0
      expect(pixel.r).toBeCloseTo(0.5, 2);
      expect(pixel.g).toBeCloseTo(0.25, 2);
      expect(pixel.b).toBeCloseTo(0, 2);
    });
  });

  describe('screen', () => {
    it('should screen colors correctly', () => {
      const dst = createSolidColorBuffer(1, 1, 0.5, 0.5, 0.5, 1);
      const src = createSolidColorBuffer(1, 1, 0.5, 0.5, 0.5, 1);

      blendBuffers(dst, src, 'screen', 1);

      const pixel = getPixel(dst, 0, 0);
      // Screen: 1 - (1-0.5)(1-0.5) = 1 - 0.25 = 0.75
      expect(pixel.r).toBeCloseTo(0.75, 2);
      expect(pixel.g).toBeCloseTo(0.75, 2);
      expect(pixel.b).toBeCloseTo(0.75, 2);
    });
  });

  describe('lighter', () => {
    it('should add colors (clamped)', () => {
      const dst = createSolidColorBuffer(1, 1, 0.6, 0.3, 0.8, 1);
      const src = createSolidColorBuffer(1, 1, 0.5, 0.9, 0.4, 1);

      blendBuffers(dst, src, 'lighter', 1);

      const pixel = getPixel(dst, 0, 0);
      // Lighter: clamped addition
      expect(pixel.r).toBe(1); // 0.6 + 0.5 = 1.1 -> clamped to 1
      expect(pixel.g).toBe(1); // 0.3 + 0.9 = 1.2 -> clamped to 1
      expect(pixel.b).toBe(1); // 0.8 + 0.4 = 1.2 -> clamped to 1
    });
  });

  describe('difference', () => {
    it('should compute absolute difference', () => {
      const dst = createSolidColorBuffer(1, 1, 0.8, 0.3, 0.5, 1);
      const src = createSolidColorBuffer(1, 1, 0.3, 0.7, 0.5, 1);

      blendBuffers(dst, src, 'difference', 1);

      const pixel = getPixel(dst, 0, 0);
      // Difference: |0.8 - 0.3| = 0.5, |0.3 - 0.7| = 0.4, |0.5 - 0.5| = 0
      expect(pixel.r).toBeCloseTo(0.5, 2);
      expect(pixel.g).toBeCloseTo(0.4, 2);
      expect(pixel.b).toBeCloseTo(0, 2);
    });
  });

  describe('destination-in', () => {
    it('should mask destination by source alpha', () => {
      const dst = createSolidColorBuffer(1, 1, 1, 0, 0, 1);
      const src = createSolidColorBuffer(1, 1, 0, 1, 0, 0.5);

      blendBuffers(dst, src, 'destination-in', 1);

      const pixel = getPixel(dst, 0, 0);
      // destination-in: keeps dst color, multiplies dst alpha by src alpha
      expect(pixel.r).toBeCloseTo(1, 2);
      expect(pixel.a).toBeCloseTo(0.5, 2);
    });
  });

  describe('dimension mismatch', () => {
    it('should throw error when buffer dimensions do not match', () => {
      const dst = createPixelBuffer(100, 100);
      const src = createPixelBuffer(50, 50);

      expect(() => {
        blendBuffers(dst, src, 'source-over', 1);
      }).toThrow('Buffer dimensions must match');
    });
  });
});

describe('multi-pixel blending', () => {
  it('should blend all pixels in buffer', () => {
    const dst = createSolidColorBuffer(10, 10, 0, 0, 0, 0);
    const src = createSolidColorBuffer(10, 10, 1, 0.5, 0.25, 1);

    blendBuffers(dst, src, 'source-over', 1);

    // Check multiple pixels
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const pixel = getPixel(dst, x, y);
        expect(pixel.r).toBeCloseTo(1, 2);
        expect(pixel.g).toBeCloseTo(0.5, 2);
        expect(pixel.b).toBeCloseTo(0.25, 2);
        expect(pixel.a).toBeCloseTo(1, 2);
      }
    }
  });

  it('should handle gradient patterns', () => {
    const width = 10;
    const height = 1;
    const dst = createPixelBuffer(width, height);
    const src = createPixelBuffer(width, height);

    // Create gradient in source
    for (let x = 0; x < width; x++) {
      const offset = x * 4;
      const value = x / (width - 1); // 0 to 1
      src.data[offset] = value;
      src.data[offset + 1] = 0;
      src.data[offset + 2] = 0;
      src.data[offset + 3] = 1;
    }

    blendBuffers(dst, src, 'source-over', 1);

    // Check gradient preserved
    for (let x = 0; x < width; x++) {
      const pixel = getPixel(dst, x, 0);
      const expected = x / (width - 1);
      expect(pixel.r).toBeCloseTo(expected, 1);
    }
  });
});
