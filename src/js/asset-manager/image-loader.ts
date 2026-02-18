/**
 * Image loading utilities for the Asset Manager.
 * Handles fetching images and converting them to ImageBitmap format.
 */

import { AssetLoadError } from '../errors';

/**
 * Options for loading images.
 */
export interface ImageLoadOptions {
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
  /** Whether to apply image smoothing (default: true) */
  imageSmoothing?: boolean;
}

/**
 * Load an image from a URL and return it as an ImageBitmap.
 * Uses fetch + createImageBitmap for efficient worker-compatible loading.
 *
 * @param url - The URL to load the image from
 * @param options - Optional loading configuration
 * @returns Promise resolving to ImageBitmap
 * @throws AssetLoadError if loading fails
 */
export async function loadImage(url: string, options: ImageLoadOptions = {}): Promise<ImageBitmap> {
  const { signal } = options;

  try {
    // Fetch the image data
    const fetchOptions: RequestInit = {
      credentials: 'same-origin',
    };
    if (signal) {
      fetchOptions.signal = signal;
    }
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new AssetLoadError(
        url,
        'image',
        `HTTP ${String(response.status)}: ${response.statusText}`
      );
    }

    // Get the blob data
    const blob = await response.blob();

    // Check if aborted during blob read
    if (signal?.aborted) {
      throw new AssetLoadError(url, 'image', 'Load aborted');
    }

    // Create ImageBitmap from blob
    // This is the most efficient format for worker-based rendering
    const bitmap = await createImageBitmap(blob);

    return bitmap;
  } catch (error) {
    // Re-throw AssetLoadError as-is
    if (error instanceof AssetLoadError) {
      throw error;
    }

    // Handle abort errors
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AssetLoadError(url, 'image', 'Load aborted');
    }

    // Wrap other errors
    const message = error instanceof Error ? error.message : String(error);
    throw new AssetLoadError(
      url,
      'image',
      `Failed to load image: ${message}`,
      {},
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load multiple images in parallel.
 * Returns a Map of URL to ImageBitmap for successful loads.
 * Failed loads are reported in the returned object.
 *
 * @param urls - Array of URLs to load
 * @param options - Optional loading configuration
 * @returns Object with loaded bitmaps and failed URLs
 */
export async function loadImages(
  urls: string[],
  options: ImageLoadOptions = {}
): Promise<{
  bitmaps: Map<string, ImageBitmap>;
  failed: string[];
}> {
  const bitmaps = new Map<string, ImageBitmap>();
  const failed: string[] = [];

  // Load all images in parallel
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const bitmap = await loadImage(url, options);
      return { url, bitmap };
    })
  );

  // Process results
  for (const result of results) {
    if (result.status === 'fulfilled') {
      bitmaps.set(result.value.url, result.value.bitmap);
    } else {
      // Extract URL from the error context
      const error: unknown = result.reason;
      if (error instanceof AssetLoadError) {
        failed.push(error.url);
      }
    }
  }

  return { bitmaps, failed };
}

/**
 * Create a clone of an ImageBitmap.
 * Useful for transferring to multiple workers.
 *
 * @param bitmap - The bitmap to clone
 * @returns A new ImageBitmap with the same content
 */
export async function cloneImageBitmap(bitmap: ImageBitmap): Promise<ImageBitmap> {
  // We need to draw to a canvas and then create a new bitmap
  // This is because ImageBitmap doesn't have a native clone method
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get 2d context for cloning');
  }

  ctx.drawImage(bitmap, 0, 0);

  return createImageBitmap(canvas);
}
