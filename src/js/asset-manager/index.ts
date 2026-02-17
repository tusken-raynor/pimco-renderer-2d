/**
 * Asset Manager module for centralized asset loading and distribution.
 * Handles loading, caching, and distributing images (and fonts/meshes in future) to render slaves.
 */

import { AssetLoadError, wrapError } from '../errors';
import type {
  AssetRequest,
  AssetDelivery,
  AssetType,
  FetchMessage,
  DistributeMessage,
  RegisterSlaveMessage,
  FetchCompleteMessage,
  DistributeCompleteMessage,
  MasterToAssetManagerMessage,
  AssetDataMessage,
} from '../types';
import {
  isFetchMessage,
  isDistributeMessage,
  isPreloadMessage,
  isRegisterSlaveMessage,
} from '../types';
import { loadImage, cloneImageBitmap } from './image-loader';

/**
 * Type guard to check if data is an ImageBitmap.
 * Uses duck-typing to avoid issues in test environments where ImageBitmap may not be defined.
 */
function isImageBitmap(data: unknown): data is ImageBitmap {
  return (
    typeof data === 'object' &&
    data !== null &&
    'width' in data &&
    'height' in data &&
    'close' in data &&
    typeof (data as ImageBitmap).close === 'function'
  );
}

/**
 * Cached asset entry with metadata.
 */
interface CachedAsset {
  /** The cached asset data */
  data: ImageBitmap | ArrayBuffer;
  /** Asset type */
  assetType: AssetType;
  /** Original URL */
  url: string;
  /** Timestamp when cached */
  cachedAt: number;
}

/**
 * Registered slave entry.
 */
interface RegisteredSlave {
  /** Slave's unique ID */
  id: number;
  /** MessagePort for communication */
  port: MessagePort;
}

/**
 * Options for AssetManager.
 */
export interface AssetManagerOptions {
  /** Maximum number of cached assets (default: 100) */
  maxCacheSize?: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Current number of cached assets */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Number of cached images */
  imageCount: number;
  /** Number of cached fonts */
  fontCount: number;
  /** Number of cached meshes */
  meshCount: number;
}

/**
 * Asset Manager class for centralized asset loading and distribution.
 *
 * The Asset Manager:
 * 1. Loads images via fetch + createImageBitmap
 * 2. Maintains a URL-to-ID cache
 * 3. Distributes assets to slaves via MessagePort
 * 4. Handles preloading for performance optimization
 */
export class AssetManager {
  /** Cache mapping asset ID to cached asset data */
  private cache = new Map<number, CachedAsset>();

  /** Reverse lookup: URL to asset ID */
  private urlToId = new Map<string, number>();

  /** Registered slaves */
  private slaves = new Map<number, RegisteredSlave>();

  /** Maximum cache size */
  private maxCacheSize: number;

  /** Abort controller for cancelling pending operations */
  private abortController: AbortController | null = null;

  constructor(options: AssetManagerOptions = {}) {
    this.maxCacheSize = options.maxCacheSize ?? 100;
  }

  /**
   * Handle incoming message from the Master.
   * Routes messages to appropriate handlers.
   *
   * @param message - The message from Master
   * @returns Promise resolving to response message
   */
  async handleMessage(
    message: MasterToAssetManagerMessage
  ): Promise<FetchCompleteMessage | DistributeCompleteMessage | null> {
    if (isFetchMessage(message)) {
      return this.handleFetch(message);
    }

    if (isDistributeMessage(message)) {
      return this.handleDistribute(message);
    }

    if (isPreloadMessage(message)) {
      // Preload uses same logic as fetch, just fire-and-forget
      await this.handleFetch(message as unknown as FetchMessage);
      return null;
    }

    if (isRegisterSlaveMessage(message)) {
      this.handleRegisterSlave(message);
      return null;
    }

    return null;
  }

  /**
   * Handle fetch message - load assets from URLs.
   */
  private async handleFetch(message: FetchMessage): Promise<FetchCompleteMessage> {
    const failed: number[] = [];

    // Create a new abort controller for this batch
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Load assets in parallel
    const loadPromises = message.assets.map(async (asset) => {
      try {
        // Check if already cached
        if (this.cache.has(asset.id)) {
          return; // Already loaded
        }

        // Also check URL cache to avoid reloading same URL
        const existingId = this.urlToId.get(asset.url);
        if (existingId !== undefined) {
          const existingAsset = this.cache.get(existingId);
          if (existingAsset) {
            // Copy to new ID
            this.cache.set(asset.id, existingAsset);
            return;
          }
        }

        // Load based on asset type
        const data = await this.loadAsset(asset, signal);

        // Cache the asset
        this.cacheAsset(asset.id, asset.url, asset.assetType, data);
      } catch (error) {
        if (signal.aborted) {
          return; // Don't report aborted loads as failures
        }
        failed.push(asset.id);
        console.error(`Failed to load asset ${String(asset.id)} (${asset.url}):`, error);
      }
    });

    await Promise.all(loadPromises);

    // Enforce cache size limit
    this.enforceCache();

    return { type: 'fetch-complete', failed };
  }

  /**
   * Load a single asset based on its type.
   */
  private async loadAsset(
    asset: AssetRequest,
    signal?: AbortSignal
  ): Promise<ImageBitmap | ArrayBuffer> {
    switch (asset.assetType) {
      case 'image':
        return loadImage(asset.url, signal ? { signal } : {});

      case 'font':
        // Font loading - fetch as ArrayBuffer
        return this.loadBinaryAsset(asset.url, signal);

      case 'mesh':
        // Mesh loading - fetch as ArrayBuffer
        return this.loadBinaryAsset(asset.url, signal);

      default: {
        const unknownType = asset.assetType as string;
        throw new AssetLoadError(asset.url, unknownType, `Unknown asset type: ${unknownType}`);
      }
    }
  }

  /**
   * Load a binary asset (font, mesh) as ArrayBuffer.
   */
  private async loadBinaryAsset(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
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
        'binary',
        `HTTP ${String(response.status)}: ${response.statusText}`
      );
    }

    return response.arrayBuffer();
  }

  /**
   * Cache an asset with metadata.
   */
  private cacheAsset(
    id: number,
    url: string,
    assetType: AssetType,
    data: ImageBitmap | ArrayBuffer
  ): void {
    this.cache.set(id, {
      data,
      assetType,
      url,
      cachedAt: Date.now(),
    });
    this.urlToId.set(url, id);
  }

  /**
   * Enforce maximum cache size by removing oldest entries.
   */
  private enforceCache(): void {
    if (this.cache.size <= this.maxCacheSize) {
      return;
    }

    // Get entries sorted by age (oldest first)
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.cachedAt - b.cachedAt
    );

    // Remove oldest entries until we're under the limit
    const toRemove = entries.slice(0, entries.length - this.maxCacheSize);
    for (const [id, asset] of toRemove) {
      // Close ImageBitmap to free memory
      if (isImageBitmap(asset.data)) {
        asset.data.close();
      }
      this.cache.delete(id);
      // Remove from URL lookup too
      for (const [url, cachedId] of this.urlToId) {
        if (cachedId === id) {
          this.urlToId.delete(url);
          break;
        }
      }
    }
  }

  /**
   * Handle distribute message - send assets to slaves.
   */
  private async handleDistribute(message: DistributeMessage): Promise<DistributeCompleteMessage> {
    for (const delivery of message.deliveries) {
      await this.deliverToSlave(delivery);
    }

    return { type: 'distribute-complete' };
  }

  /**
   * Deliver assets to a single slave.
   */
  private async deliverToSlave(delivery: AssetDelivery): Promise<void> {
    const slave = this.slaves.get(delivery.slaveId);
    if (!slave) {
      console.warn(`Slave ${String(delivery.slaveId)} not registered, cannot deliver assets`);
      return;
    }

    for (const assetId of delivery.assetIds) {
      const cachedAsset = this.cache.get(assetId);
      if (!cachedAsset) {
        console.warn(`Asset ${String(assetId)} not in cache, cannot deliver`);
        continue;
      }

      try {
        // Prepare asset data for transfer
        let transferableData: ImageBitmap | ArrayBuffer;
        const transferables: Transferable[] = [];

        if (isImageBitmap(cachedAsset.data)) {
          // Clone the bitmap for transfer (original stays in cache)
          transferableData = await cloneImageBitmap(cachedAsset.data);
          transferables.push(transferableData);
        } else {
          // ArrayBuffer - slice to create a copy
          transferableData = cachedAsset.data.slice(0);
          transferables.push(transferableData);
        }

        // Send asset data message
        const assetDataMsg: AssetDataMessage = {
          type: 'asset-data',
          id: assetId,
          assetType: cachedAsset.assetType,
          data: transferableData,
        };

        slave.port.postMessage(assetDataMsg, transferables);
      } catch (error) {
        console.error(
          `Failed to deliver asset ${String(assetId)} to slave ${String(delivery.slaveId)}:`,
          wrapError(error)
        );
      }
    }
  }

  /**
   * Handle register-slave message - store slave's MessagePort.
   */
  private handleRegisterSlave(message: RegisterSlaveMessage): void {
    this.slaves.set(message.slaveId, {
      id: message.slaveId,
      port: message.port,
    });
  }

  /**
   * Preload assets for future use.
   * Same as fetch but doesn't return failure list.
   *
   * @param assets - Assets to preload
   */
  async preload(assets: AssetRequest[]): Promise<void> {
    await this.handleFetch({ type: 'fetch', assets });
  }

  /**
   * Check if an asset is cached.
   *
   * @param id - Asset ID to check
   * @returns True if asset is in cache
   */
  isCached(id: number): boolean {
    return this.cache.has(id);
  }

  /**
   * Get a cached asset by ID.
   *
   * @param id - Asset ID
   * @returns Cached asset or undefined
   */
  getCachedAsset(id: number): CachedAsset | undefined {
    return this.cache.get(id);
  }

  /**
   * Get asset ID by URL if already cached.
   *
   * @param url - Asset URL
   * @returns Asset ID or undefined
   */
  getIdByUrl(url: string): number | undefined {
    return this.urlToId.get(url);
  }

  /**
   * Abort any pending load operations.
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Clear all cached assets and release resources.
   */
  destroy(): void {
    // Abort pending operations
    this.abort();

    // Close all ImageBitmaps
    for (const [, asset] of this.cache) {
      if (isImageBitmap(asset.data)) {
        asset.data.close();
      }
    }

    // Clear caches
    this.cache.clear();
    this.urlToId.clear();

    // Clear slave ports
    this.slaves.clear();
  }

  /**
   * Get current cache statistics.
   */
  getCacheStats(): CacheStats {
    let imageCount = 0;
    let fontCount = 0;
    let meshCount = 0;

    for (const [, asset] of this.cache) {
      switch (asset.assetType) {
        case 'image':
          imageCount++;
          break;
        case 'font':
          fontCount++;
          break;
        case 'mesh':
          meshCount++;
          break;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      imageCount,
      fontCount,
      meshCount,
    };
  }
}

// Re-export image loader utilities
export { loadImage, loadImages, cloneImageBitmap } from './image-loader';
