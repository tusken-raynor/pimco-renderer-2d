/**
 * Canvas utilities for the 2D renderer.
 * Provides helpers for canvas/context creation, manipulation, and cleanup.
 */

/**
 * Type representing a 2D rendering context from either a regular canvas or offscreen canvas.
 */
export type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Type representing either a regular canvas or offscreen canvas.
 */
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * Check if OffscreenCanvas is supported in the current environment.
 *
 * @returns true if OffscreenCanvas is available
 */
export function isOffscreenCanvasSupported(): boolean {
  return typeof OffscreenCanvas !== 'undefined';
}

/**
 * Create a canvas element (OffscreenCanvas if supported, HTMLCanvasElement otherwise).
 *
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param preferOffscreen - Whether to prefer OffscreenCanvas when available (default: true)
 * @returns A canvas element
 */
export function createCanvas(width: number, height: number, preferOffscreen = true): AnyCanvas {
  if (preferOffscreen && isOffscreenCanvasSupported()) {
    return new OffscreenCanvas(width, height);
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  // Fallback for worker context without OffscreenCanvas support
  throw new Error('Unable to create canvas: no canvas API available');
}

/**
 * Get a 2D context from a canvas with common options.
 *
 * @param canvas - The canvas element
 * @param options - Context options
 * @returns The 2D rendering context, or null if unavailable
 */
export function getContext2D(
  canvas: AnyCanvas,
  options: CanvasRenderingContext2DSettings = {}
): Canvas2DContext | null {
  return canvas.getContext('2d', options) as Canvas2DContext | null;
}

/**
 * Create a canvas with a 2D context already attached.
 *
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param options - Context options (e.g., willReadFrequently)
 * @returns Object with canvas and context
 */
export function createCanvasWithContext(
  width: number,
  height: number,
  options: CanvasRenderingContext2DSettings = {}
): { canvas: AnyCanvas; ctx: Canvas2DContext } {
  const canvas = createCanvas(width, height);
  const ctx = getContext2D(canvas, options);

  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  return { canvas, ctx };
}

/**
 * Reset a canvas context to its default state.
 * This clears the canvas and resets all context properties to defaults.
 * Based on the legacy resetCanvasContext function.
 *
 * @param ctx - The canvas 2D context to reset
 */
export function resetCanvasContext(ctx: Canvas2DContext): void {
  const canvas = ctx.canvas;

  // Reset transformations
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // Clear the canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Reset line styles
  ctx.lineWidth = 1;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);

  // Reset fill and stroke styles
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';

  // Reset global alpha and composite operation
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Reset text properties
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'inherit';

  // Reset shadow properties
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Reset image smoothing
  ctx.imageSmoothingEnabled = true;

  // Reset the filter
  ctx.filter = 'none';

  // Clear any active clipping region by restoring default state
  // Note: This assumes the context was saved before clipping
  // For full reset, the canvas dimensions need to be re-assigned
  try {
    ctx.restore();
  } catch {
    // Ignore if there's no state to restore
  }

  // Start a new path
  ctx.beginPath();
}

/**
 * Clear a canvas completely (transparent).
 *
 * @param ctx - The canvas 2D context
 */
export function clearCanvas(ctx: Canvas2DContext): void {
  const canvas = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Clone a canvas to a new canvas element.
 *
 * @param source - The source canvas to clone
 * @returns A new canvas with the same content
 */
export function cloneCanvas(source: AnyCanvas): AnyCanvas {
  const clone = createCanvas(source.width, source.height);
  const ctx = getContext2D(clone);

  if (ctx) {
    ctx.drawImage(source, 0, 0);
  }

  return clone;
}

/**
 * Resize a canvas while preserving its content.
 *
 * @param canvas - The canvas to resize
 * @param newWidth - New width in pixels
 * @param newHeight - New height in pixels
 * @param preserveContent - Whether to preserve existing content (default: true)
 * @returns The resized canvas (same reference)
 */
export function resizeCanvas(
  canvas: AnyCanvas,
  newWidth: number,
  newHeight: number,
  preserveContent = true
): AnyCanvas {
  if (preserveContent && canvas.width > 0 && canvas.height > 0) {
    // Clone the current content
    const clone = cloneCanvas(canvas);

    // Resize the canvas
    canvas.width = newWidth;
    canvas.height = newHeight;

    // Draw the cloned content back
    const ctx = getContext2D(canvas);
    if (ctx) {
      ctx.drawImage(clone, 0, 0);
    }
  } else {
    canvas.width = newWidth;
    canvas.height = newHeight;
  }

  return canvas;
}

/**
 * Draw an image to fit within specified dimensions while maintaining aspect ratio.
 *
 * @param ctx - The canvas 2D context
 * @param image - The image to draw
 * @param x - X position
 * @param y - Y position
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @param fit - Fit mode: 'contain' (fit inside), 'cover' (fill and crop), 'fill' (stretch)
 */
export function drawImageFit(
  ctx: Canvas2DContext,
  image: CanvasImageSource,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  fit: 'contain' | 'cover' | 'fill' = 'contain'
): void {
  // Get image dimensions - handle various source types
  let imgWidth: number;
  let imgHeight: number;

  if ('videoWidth' in image && 'videoHeight' in image) {
    // HTMLVideoElement
    imgWidth = image.videoWidth;
    imgHeight = image.videoHeight;
  } else if ('width' in image && 'height' in image) {
    // ImageBitmap, HTMLImageElement, HTMLCanvasElement, OffscreenCanvas, etc.
    imgWidth = image.width as number;
    imgHeight = image.height as number;
  } else {
    // Unsupported source type
    return;
  }

  if (
    typeof imgWidth !== 'number' ||
    typeof imgHeight !== 'number' ||
    imgWidth <= 0 ||
    imgHeight <= 0
  ) {
    return;
  }

  let drawWidth: number;
  let drawHeight: number;
  let drawX = x;
  let drawY = y;

  if (fit === 'fill') {
    drawWidth = maxWidth;
    drawHeight = maxHeight;
  } else {
    const aspectRatio = imgWidth / imgHeight;
    const targetAspect = maxWidth / maxHeight;

    if (
      (fit === 'contain' && aspectRatio > targetAspect) ||
      (fit === 'cover' && aspectRatio < targetAspect)
    ) {
      // Width-constrained
      drawWidth = maxWidth;
      drawHeight = maxWidth / aspectRatio;
    } else {
      // Height-constrained
      drawHeight = maxHeight;
      drawWidth = maxHeight * aspectRatio;
    }

    // Center the image
    drawX = x + (maxWidth - drawWidth) / 2;
    drawY = y + (maxHeight - drawHeight) / 2;
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

/**
 * Apply a DOMMatrix transformation to a context.
 *
 * @param ctx - The canvas 2D context
 * @param matrix - The DOMMatrix to apply
 */
export function applyMatrix(ctx: Canvas2DContext, matrix: DOMMatrix): void {
  ctx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
}

/**
 * Get the current transformation matrix from a context.
 *
 * @param ctx - The canvas 2D context
 * @returns The current transformation as a DOMMatrix
 */
export function getTransformMatrix(ctx: Canvas2DContext): DOMMatrix {
  return ctx.getTransform();
}

/**
 * Check if a context has WebGL2 support (for OffscreenCanvas).
 * This is useful for determining if effects can be applied.
 *
 * @returns true if WebGL2 is supported
 */
export function isWebGL2Supported(): boolean {
  try {
    if (!isOffscreenCanvasSupported()) {
      // Check via regular canvas
      if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        return !!canvas.getContext('webgl2');
      }
      return false;
    }

    const canvas = new OffscreenCanvas(1, 1);
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

/**
 * Convert an ImageData object to an ImageBitmap.
 * This is useful for transferring image data between workers.
 *
 * @param imageData - The ImageData to convert
 * @returns Promise resolving to an ImageBitmap
 */
export async function imageDataToImageBitmap(imageData: ImageData): Promise<ImageBitmap> {
  return createImageBitmap(imageData);
}

/**
 * Convert a canvas to an ImageBitmap.
 *
 * @param canvas - The canvas to convert
 * @returns Promise resolving to an ImageBitmap
 */
export async function canvasToImageBitmap(canvas: AnyCanvas): Promise<ImageBitmap> {
  return createImageBitmap(canvas);
}

/**
 * Draw an image or canvas to fill the entire canvas while preserving aspect ratio.
 * Crops the source if necessary.
 *
 * @param ctx - Target context
 * @param source - Source image or canvas
 */
export function drawCover(ctx: Canvas2DContext, source: CanvasImageSource): void {
  const canvas = ctx.canvas;
  drawImageFit(ctx, source, 0, 0, canvas.width, canvas.height, 'cover');
}

/**
 * Draw an image or canvas to fit inside the canvas while preserving aspect ratio.
 * May leave transparent areas.
 *
 * @param ctx - Target context
 * @param source - Source image or canvas
 */
export function drawContain(ctx: Canvas2DContext, source: CanvasImageSource): void {
  const canvas = ctx.canvas;
  drawImageFit(ctx, source, 0, 0, canvas.width, canvas.height, 'contain');
}
