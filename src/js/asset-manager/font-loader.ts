/**
 * Font loading utilities for the Asset Manager.
 * Handles fetching fonts and tracking font distribution to text slaves.
 */

import { AssetLoadError } from '../errors';

/**
 * Options for loading fonts.
 */
export interface FontLoadOptions {
  /** Optional abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Result of loading a font.
 */
export interface FontLoadResult {
  /** Font data as ArrayBuffer */
  data: ArrayBuffer;
  /** Byte size of the font */
  size: number;
}

/**
 * Load a font from a URL and return it as an ArrayBuffer.
 * Fonts are loaded as binary data for use with the FontFace API in workers.
 *
 * @param url - The URL to load the font from
 * @param options - Optional loading configuration
 * @returns Promise resolving to FontLoadResult
 * @throws AssetLoadError if loading fails
 */
export async function loadFont(
  url: string,
  options: FontLoadOptions = {}
): Promise<FontLoadResult> {
  const { signal } = options;

  try {
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
        'font',
        `HTTP ${String(response.status)}: ${response.statusText}`
      );
    }

    // Check if aborted during fetch
    if (signal?.aborted) {
      throw new AssetLoadError(url, 'font', 'Load aborted');
    }

    const data = await response.arrayBuffer();

    // Check if aborted during buffer read
    if (signal?.aborted) {
      throw new AssetLoadError(url, 'font', 'Load aborted');
    }

    return {
      data,
      size: data.byteLength,
    };
  } catch (error) {
    // Re-throw AssetLoadError as-is
    if (error instanceof AssetLoadError) {
      throw error;
    }

    // Handle abort errors
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AssetLoadError(url, 'font', 'Load aborted');
    }

    // Wrap other errors
    const message = error instanceof Error ? error.message : String(error);
    throw new AssetLoadError(
      url,
      'font',
      `Failed to load font: ${message}`,
      {},
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Load multiple fonts in parallel.
 * Returns a Map of URL to ArrayBuffer for successful loads.
 * Failed loads are reported in the returned object.
 *
 * @param urls - Array of URLs to load
 * @param options - Optional loading configuration
 * @returns Object with loaded font data and failed URLs
 */
export async function loadFonts(
  urls: string[],
  options: FontLoadOptions = {}
): Promise<{
  fonts: Map<string, FontLoadResult>;
  failed: string[];
}> {
  const fonts = new Map<string, FontLoadResult>();
  const failed: string[] = [];

  // Load all fonts in parallel
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const result = await loadFont(url, options);
      return { url, result };
    })
  );

  // Process results
  for (const result of results) {
    if (result.status === 'fulfilled') {
      fonts.set(result.value.url, result.value.result);
    } else {
      // Extract URL from the error context
      const error: unknown = result.reason;
      if (error instanceof AssetLoadError) {
        failed.push(error.url);
      }
    }
  }

  return { fonts, failed };
}

/**
 * Tracks which fonts have been sent to which text slaves.
 * Used to ensure fonts are only transferred once per slave.
 */
export class FontDistributionTracker {
  /** Map of slave ID to Set of font asset IDs already sent */
  private sentFonts = new Map<number, Set<number>>();

  /**
   * Check if a font has already been sent to a slave.
   *
   * @param slaveId - The slave's unique ID
   * @param fontId - The font asset's unique ID
   * @returns True if font was already sent to this slave
   */
  hasSent(slaveId: number, fontId: number): boolean {
    const sent = this.sentFonts.get(slaveId);
    return sent?.has(fontId) ?? false;
  }

  /**
   * Mark a font as sent to a slave.
   *
   * @param slaveId - The slave's unique ID
   * @param fontId - The font asset's unique ID
   */
  markSent(slaveId: number, fontId: number): void {
    let sent = this.sentFonts.get(slaveId);
    if (!sent) {
      sent = new Set();
      this.sentFonts.set(slaveId, sent);
    }
    sent.add(fontId);
  }

  /**
   * Get the count of fonts sent to a specific slave.
   *
   * @param slaveId - The slave's unique ID
   * @returns Number of fonts sent to this slave
   */
  getSentCount(slaveId: number): number {
    return this.sentFonts.get(slaveId)?.size ?? 0;
  }

  /**
   * Get all font IDs that have been sent to a slave.
   *
   * @param slaveId - The slave's unique ID
   * @returns Array of font asset IDs sent to this slave
   */
  getSentFontIds(slaveId: number): number[] {
    const sent = this.sentFonts.get(slaveId);
    return sent ? Array.from(sent) : [];
  }

  /**
   * Remove tracking for a slave (e.g., when slave is terminated).
   *
   * @param slaveId - The slave's unique ID
   */
  removeSlave(slaveId: number): void {
    this.sentFonts.delete(slaveId);
  }

  /**
   * Clear all tracking data.
   */
  clear(): void {
    this.sentFonts.clear();
  }

  /**
   * Get the total number of tracked slaves.
   */
  getSlaveCount(): number {
    return this.sentFonts.size;
  }
}

/**
 * Get supported font MIME types for validation.
 */
export function getSupportedFontMimeTypes(): string[] {
  return [
    'font/woff2',
    'font/woff',
    'font/ttf',
    'font/otf',
    'application/font-woff2',
    'application/font-woff',
    'application/x-font-ttf',
    'application/x-font-otf',
  ];
}

/**
 * Check if a URL appears to be a font file based on extension.
 *
 * @param url - The URL to check
 * @returns True if URL ends with a known font extension
 */
export function isFontUrl(url: string): boolean {
  const fontExtensions = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
  const lowerUrl = url.toLowerCase();
  return fontExtensions.some((ext) => lowerUrl.endsWith(ext));
}
