/**
 * Software Compositor Module.
 *
 * Provides ImageData-based composition for Scenario F where neither OffscreenCanvas
 * nor Canvas is available (worker context without OffscreenCanvas support).
 *
 * This compositor performs pixel-by-pixel blending operations entirely in software,
 * without relying on canvas composite operations.
 */

import type { RenderSegment } from '../types/messages';
import type { CanvasCompositeOperation } from '../types/pimco';

/**
 * Pixel data for software composition.
 * Uses Float32 for precision during blending calculations.
 */
export interface PixelBuffer {
  /** RGBA pixel data */
  data: Float32Array;
  /** Buffer width */
  width: number;
  /** Buffer height */
  height: number;
}

/**
 * Create an empty pixel buffer filled with transparent black.
 *
 * @param width - Buffer width
 * @param height - Buffer height
 * @returns Empty pixel buffer
 */
export function createPixelBuffer(width: number, height: number): PixelBuffer {
  const data = new Float32Array(width * height * 4);
  return { data, width, height };
}

/**
 * Convert ImageBitmap to pixel buffer using a temporary canvas.
 * This is only possible in main thread or when OffscreenCanvas is available.
 *
 * @param bitmap - Source ImageBitmap
 * @param targetWidth - Target buffer width
 * @param targetHeight - Target buffer height
 * @returns Pixel buffer with image data
 */
export function imageBitmapToPixelBuffer(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number
): PixelBuffer {
  // Try OffscreenCanvas first (may be available in some worker contexts)
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(targetWidth, targetHeight);
    ctx = canvas.getContext('2d');
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx = canvas.getContext('2d');
  } else {
    // In this worst case scenario, we can't extract pixels
    // Return empty buffer - this shouldn't happen if caller checks capabilities
    console.warn('Cannot extract pixels from ImageBitmap without canvas support');
    return createPixelBuffer(targetWidth, targetHeight);
  }

  if (!ctx) {
    return createPixelBuffer(targetWidth, targetHeight);
  }

  // Draw bitmap to canvas
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

  // Extract pixel data
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = new Float32Array(targetWidth * targetHeight * 4);

  // Convert to normalized float values [0, 1]
  for (let i = 0; i < imageData.data.length; i++) {
    data[i] = imageData.data[i] / 255;
  }

  return { data, width: targetWidth, height: targetHeight };
}

/**
 * Convert pixel buffer to Uint8ClampedArray for creating ImageData.
 *
 * @param buffer - Source pixel buffer
 * @returns Clamped byte array
 */
export function pixelBufferToBytes(buffer: PixelBuffer): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(buffer.width * buffer.height * 4);

  for (let i = 0; i < buffer.data.length; i++) {
    // Clamp and convert to byte
    bytes[i] = Math.round(Math.max(0, Math.min(1, buffer.data[i])) * 255);
  }

  return bytes;
}

/**
 * Convert pixel buffer to ImageBitmap.
 *
 * @param buffer - Source pixel buffer
 * @returns Promise resolving to ImageBitmap
 */
export async function pixelBufferToImageBitmap(buffer: PixelBuffer): Promise<ImageBitmap> {
  const bytes = pixelBufferToBytes(buffer);
  // Create a new ArrayBuffer and copy data to ensure ArrayBuffer type (not SharedArrayBuffer)
  const pixelData = new Uint8ClampedArray(bytes.length);
  pixelData.set(bytes);

  const imageData = new ImageData(pixelData, buffer.width, buffer.height);

  return createImageBitmap(imageData);
}

/**
 * Blend source pixel onto destination pixel using the specified operation.
 *
 * @param dst - Destination RGBA values (modified in place)
 * @param src - Source RGBA values
 * @param operation - Composite operation to apply
 * @param alpha - Global alpha to apply to source
 */
function blendPixel(
  dst: { r: number; g: number; b: number; a: number },
  src: { r: number; g: number; b: number; a: number },
  operation: CanvasCompositeOperation,
  alpha: number
): void {
  // Apply global alpha to source
  const srcA = src.a * alpha;

  if (srcA === 0) {
    return; // Fully transparent source, no change
  }

  switch (operation) {
    case 'source-over': {
      // Porter-Duff source-over: Cs + Cd(1 - As)
      const outA = srcA + dst.a * (1 - srcA);
      if (outA === 0) {
        dst.r = dst.g = dst.b = dst.a = 0;
      } else {
        dst.r = (src.r * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (src.g * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (src.b * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'multiply': {
      // Blend mode: multiply colors, then composite
      const blendedR = src.r * dst.r;
      const blendedG = src.g * dst.g;
      const blendedB = src.b * dst.b;

      // Composite with source-over
      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'screen': {
      // Screen: 1 - (1 - Cs)(1 - Cd)
      const blendedR = 1 - (1 - src.r) * (1 - dst.r);
      const blendedG = 1 - (1 - src.g) * (1 - dst.g);
      const blendedB = 1 - (1 - src.b) * (1 - dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'overlay': {
      // Overlay: hard light with reversed order
      const overlayChannel = (s: number, d: number): number => {
        if (d < 0.5) {
          return 2 * s * d;
        }
        return 1 - 2 * (1 - s) * (1 - d);
      };

      const blendedR = overlayChannel(src.r, dst.r);
      const blendedG = overlayChannel(src.g, dst.g);
      const blendedB = overlayChannel(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'darken': {
      // Darken: min(Cs, Cd)
      const blendedR = Math.min(src.r, dst.r);
      const blendedG = Math.min(src.g, dst.g);
      const blendedB = Math.min(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'lighten': {
      // Lighten: max(Cs, Cd)
      const blendedR = Math.max(src.r, dst.r);
      const blendedG = Math.max(src.g, dst.g);
      const blendedB = Math.max(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'lighter': {
      // Lighter (additive): Cs + Cd
      dst.r = Math.min(1, dst.r + src.r * srcA);
      dst.g = Math.min(1, dst.g + src.g * srcA);
      dst.b = Math.min(1, dst.b + src.b * srcA);
      dst.a = Math.min(1, dst.a + srcA);
      break;
    }

    case 'soft-light': {
      // Soft light blending
      const softLightChannel = (s: number, d: number): number => {
        if (s <= 0.5) {
          return d - (1 - 2 * s) * d * (1 - d);
        }
        const g = d <= 0.25 ? ((16 * d - 12) * d + 4) * d : Math.sqrt(d);
        return d + (2 * s - 1) * (g - d);
      };

      const blendedR = softLightChannel(src.r, dst.r);
      const blendedG = softLightChannel(src.g, dst.g);
      const blendedB = softLightChannel(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'hard-light': {
      // Hard light
      const hardLightChannel = (s: number, d: number): number => {
        if (s <= 0.5) {
          return 2 * s * d;
        }
        return 1 - 2 * (1 - s) * (1 - d);
      };

      const blendedR = hardLightChannel(src.r, dst.r);
      const blendedG = hardLightChannel(src.g, dst.g);
      const blendedB = hardLightChannel(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'color-dodge': {
      // Color dodge
      const colorDodgeChannel = (s: number, d: number): number => {
        if (d === 0) {
          return 0;
        }
        if (s === 1) {
          return 1;
        }
        return Math.min(1, d / (1 - s));
      };

      const blendedR = colorDodgeChannel(src.r, dst.r);
      const blendedG = colorDodgeChannel(src.g, dst.g);
      const blendedB = colorDodgeChannel(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'color-burn': {
      // Color burn
      const colorBurnChannel = (s: number, d: number): number => {
        if (d === 1) {
          return 1;
        }
        if (s === 0) {
          return 0;
        }
        return 1 - Math.min(1, (1 - d) / s);
      };

      const blendedR = colorBurnChannel(src.r, dst.r);
      const blendedG = colorBurnChannel(src.g, dst.g);
      const blendedB = colorBurnChannel(src.b, dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'difference': {
      // Difference: |Cs - Cd|
      const blendedR = Math.abs(src.r - dst.r);
      const blendedG = Math.abs(src.g - dst.g);
      const blendedB = Math.abs(src.b - dst.b);

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'exclusion': {
      // Exclusion: Cs + Cd - 2*Cs*Cd
      const blendedR = src.r + dst.r - 2 * src.r * dst.r;
      const blendedG = src.g + dst.g - 2 * src.g * dst.g;
      const blendedB = src.b + dst.b - 2 * src.b * dst.b;

      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (blendedR * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (blendedG * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (blendedB * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
      break;
    }

    // Porter-Duff composite operations
    case 'destination-over': {
      // Cs(1 - Ad) + Cd
      const outA = dst.a + srcA * (1 - dst.a);
      if (outA > 0) {
        dst.r = (src.r * srcA * (1 - dst.a) + dst.r * dst.a) / outA;
        dst.g = (src.g * srcA * (1 - dst.a) + dst.g * dst.a) / outA;
        dst.b = (src.b * srcA * (1 - dst.a) + dst.b * dst.a) / outA;
        dst.a = outA;
      }
      break;
    }

    case 'destination-in': {
      // Cd * As: keeps destination RGB, multiplies destination alpha by source alpha
      // RGB values remain unchanged, only alpha is modified
      dst.a = dst.a * srcA;
      break;
    }

    case 'destination-out': {
      // Cd * (1 - As)
      dst.a = dst.a * (1 - srcA);
      break;
    }

    case 'source-in': {
      // Cs * Ad
      const outA = srcA * dst.a;
      if (outA > 0) {
        dst.r = src.r;
        dst.g = src.g;
        dst.b = src.b;
        dst.a = outA;
      } else {
        dst.r = dst.g = dst.b = dst.a = 0;
      }
      break;
    }

    case 'source-out': {
      // Cs * (1 - Ad)
      const outA = srcA * (1 - dst.a);
      if (outA > 0) {
        dst.r = src.r;
        dst.g = src.g;
        dst.b = src.b;
        dst.a = outA;
      } else {
        dst.r = dst.g = dst.b = dst.a = 0;
      }
      break;
    }

    case 'source-atop': {
      // Cs * Ad + Cd * (1 - As)
      const outA = dst.a; // Output alpha is same as destination
      if (outA > 0) {
        dst.r = src.r * srcA + dst.r * (1 - srcA);
        dst.g = src.g * srcA + dst.g * (1 - srcA);
        dst.b = src.b * srcA + dst.b * (1 - srcA);
      }
      break;
    }

    case 'destination-atop': {
      // Cd * As + Cs * (1 - Ad)
      const outA = srcA; // Output alpha is same as source
      if (outA > 0) {
        dst.r = dst.r * dst.a + src.r * (1 - dst.a);
        dst.g = dst.g * dst.a + src.g * (1 - dst.a);
        dst.b = dst.b * dst.a + src.b * (1 - dst.a);
        dst.a = outA;
      }
      break;
    }

    case 'xor': {
      // Cs * (1 - Ad) + Cd * (1 - As)
      const outA = srcA * (1 - dst.a) + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (src.r * srcA * (1 - dst.a) + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (src.g * srcA * (1 - dst.a) + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (src.b * srcA * (1 - dst.a) + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      } else {
        dst.r = dst.g = dst.b = dst.a = 0;
      }
      break;
    }

    case 'copy': {
      // Replace with source
      dst.r = src.r;
      dst.g = src.g;
      dst.b = src.b;
      dst.a = srcA;
      break;
    }

    default: // Default to source-over for unsupported operations
    {
      const outA = srcA + dst.a * (1 - srcA);
      if (outA > 0) {
        dst.r = (src.r * srcA + dst.r * dst.a * (1 - srcA)) / outA;
        dst.g = (src.g * srcA + dst.g * dst.a * (1 - srcA)) / outA;
        dst.b = (src.b * srcA + dst.b * dst.a * (1 - srcA)) / outA;
        dst.a = outA;
      }
    }
  }
}

/**
 * Blend source buffer onto destination buffer using the specified operation.
 *
 * @param dst - Destination buffer (modified in place)
 * @param src - Source buffer
 * @param operation - Composite operation to apply
 * @param alpha - Global alpha to apply to source
 */
export function blendBuffers(
  dst: PixelBuffer,
  src: PixelBuffer,
  operation: CanvasCompositeOperation,
  alpha: number
): void {
  if (dst.width !== src.width || dst.height !== src.height) {
    throw new Error('Buffer dimensions must match');
  }

  const numPixels = dst.width * dst.height;

  for (let i = 0; i < numPixels; i++) {
    const offset = i * 4;

    const dstPixel = {
      r: dst.data[offset],
      g: dst.data[offset + 1],
      b: dst.data[offset + 2],
      a: dst.data[offset + 3],
    };

    const srcPixel = {
      r: src.data[offset],
      g: src.data[offset + 1],
      b: src.data[offset + 2],
      a: src.data[offset + 3],
    };

    blendPixel(dstPixel, srcPixel, operation, alpha);

    dst.data[offset] = dstPixel.r;
    dst.data[offset + 1] = dstPixel.g;
    dst.data[offset + 2] = dstPixel.b;
    dst.data[offset + 3] = dstPixel.a;
  }
}

/**
 * Compose multiple render segments using software blending.
 *
 * @param segments - Array of render segments to compose
 * @param width - Output width
 * @param height - Output height
 * @returns Promise resolving to the composed ImageBitmap
 */
export async function composeSoftware(
  segments: RenderSegment[],
  width: number,
  height: number
): Promise<ImageBitmap> {
  // Create output buffer
  const output = createPixelBuffer(width, height);

  // Compose each segment
  for (const segment of segments) {
    // Convert segment bitmap to pixel buffer
    const segmentBuffer = imageBitmapToPixelBuffer(segment.bitmap, width, height);

    // Blend onto output
    blendBuffers(output, segmentBuffer, segment.compositemode, segment.compositealpha);
  }

  // Convert to ImageBitmap
  return pixelBufferToImageBitmap(output);
}

/**
 * SoftwareCompositor class for managing software composition state.
 *
 * This is the fallback compositor used in Scenario F when no canvas
 * support is available.
 */
export class SoftwareCompositor {
  private outputBuffer: PixelBuffer | null = null;
  private width = 0;
  private height = 0;

  /**
   * Ensure output buffer has the correct dimensions.
   *
   * @param width - Required width
   * @param height - Required height
   */
  private ensureBuffer(width: number, height: number): void {
    if (this.width !== width || this.height !== height || !this.outputBuffer) {
      this.outputBuffer = createPixelBuffer(width, height);
      this.width = width;
      this.height = height;
    } else {
      // Clear existing buffer
      this.outputBuffer.data.fill(0);
    }
  }

  /**
   * Compose render segments into a final ImageBitmap.
   *
   * @param segments - Array of render segments in composition order
   * @param width - Output width
   * @param height - Output height
   * @returns Promise resolving to the composed ImageBitmap
   */
  async compose(segments: RenderSegment[], width: number, height: number): Promise<ImageBitmap> {
    this.ensureBuffer(width, height);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const output = this.outputBuffer!;

    for (const segment of segments) {
      const segmentBuffer = imageBitmapToPixelBuffer(segment.bitmap, width, height);
      blendBuffers(output, segmentBuffer, segment.compositemode, segment.compositealpha);
    }

    return pixelBufferToImageBitmap(output);
  }

  /**
   * Destroy the compositor and release resources.
   */
  destroy(): void {
    this.outputBuffer = null;
  }
}
