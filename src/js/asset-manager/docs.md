# Asset Manager Module

## Purpose

The Asset Manager provides centralized asset loading, caching, and distribution for the multi-threaded renderer. It runs in its own Web Worker and handles:

- Loading images via `fetch` + `createImageBitmap`
- Loading fonts and meshes as `ArrayBuffer`
- Caching loaded assets with LRU eviction
- Distributing assets to render slaves via `MessagePort`
- Coordinating preloading for performance optimization

## Architecture

```
┌─────────────────────┐
│    RenderMaster     │
│    (Main Thread)    │
└─────────┬───────────┘
          │ MessagePort
          ▼
┌─────────────────────┐
│   Asset Manager     │
│     (Worker)        │
│  ┌───────────────┐  │
│  │  URL Cache    │  │
│  │  ID → Asset   │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Slave Ports   │  │
│  │ ID → Port     │  │
│  └───────────────┘  │
└────┬─────┬─────┬────┘
     │     │     │
     ▼     ▼     ▼
┌────────┐ ┌────────┐ ┌────────┐
│Slave 1 │ │Slave 2 │ │Slave N │
└────────┘ └────────┘ └────────┘
```

## How It Works

### Asset Loading

1. **Fetch Request**: Master sends `fetch` message with asset requests
2. **URL Deduplication**: Check if URL already cached under different ID
3. **Parallel Loading**: Load all uncached assets in parallel
4. **Type-Specific Loading**:
   - Images: `fetch` → `blob` → `createImageBitmap`
   - Fonts/Meshes: `fetch` → `arrayBuffer`
5. **Caching**: Store in cache with timestamp for LRU eviction
6. **Response**: Return `fetch-complete` with list of failed asset IDs

### Asset Distribution

1. **Register Slaves**: Master registers slave MessagePorts with Asset Manager
2. **Distribute Request**: Master sends `distribute` message with deliveries
3. **Clone & Transfer**:
   - ImageBitmap: Clone via OffscreenCanvas, transfer to slave
   - ArrayBuffer: Slice to copy, transfer to slave
4. **Response**: Return `distribute-complete` when all deliveries done

### Cache Management

- LRU eviction based on `cachedAt` timestamp
- Configurable max cache size (default: 100)
- ImageBitmaps are closed on eviction to free GPU memory
- URL-to-ID reverse lookup prevents redundant fetches

## Interface

### AssetManager Class

```typescript
interface AssetManagerOptions {
  maxCacheSize?: number; // Default: 100
}

class AssetManager {
  constructor(options?: AssetManagerOptions);

  // Handle incoming messages from Master
  handleMessage(message: MasterToAssetManagerMessage): Promise<Response | null>;

  // Preload assets (fire-and-forget)
  preload(assets: AssetRequest[]): Promise<void>;

  // Check if asset is cached
  isCached(id: number): boolean;

  // Get cached asset by ID
  getCachedAsset(id: number): CachedAsset | undefined;

  // Get asset ID by URL
  getIdByUrl(url: string): number | undefined;

  // Abort pending operations
  abort(): void;

  // Cleanup all resources
  destroy(): void;

  // Get cache statistics
  getCacheStats(): CacheStats;
}
```

### Message Protocol

**Master → Asset Manager:**

```typescript
// Request to fetch assets
{ type: 'fetch', assets: AssetRequest[] }

// Request to distribute to slaves
{ type: 'distribute', deliveries: AssetDelivery[] }

// Preload for future use
{ type: 'preload', assets: AssetRequest[] }

// Register a slave's port
{ type: 'register-slave', slaveId: number, port: MessagePort }
```

**Asset Manager → Master:**

```typescript
// Fetch completed
{ type: 'fetch-complete', failed: number[] }

// Distribution completed
{ type: 'distribute-complete' }
```

**Asset Manager → Slave:**

```typescript
// Asset data delivery
{ type: 'asset-data', id: number, assetType: AssetType, data: ImageBitmap | ArrayBuffer }
```

### Image Loader Utilities

```typescript
// Load single image
function loadImage(url: string, options?: ImageLoadOptions): Promise<ImageBitmap>;

// Load multiple images in parallel
function loadImages(
  urls: string[],
  options?: ImageLoadOptions
): Promise<{
  bitmaps: Map<string, ImageBitmap>;
  failed: string[];
}>;

// Clone an ImageBitmap for transfer
function cloneImageBitmap(bitmap: ImageBitmap): Promise<ImageBitmap>;
```

## Usage Example

```typescript
// In worker context
import { AssetManager } from '../js/asset-manager';

const manager = new AssetManager({ maxCacheSize: 50 });

// Handle messages from master
self.onmessage = async (event) => {
  const response = await manager.handleMessage(event.data);
  if (response) {
    self.postMessage(response);
  }
};
```

## Tests

Unit tests cover:

### Image Loader (`image-loader.ts`)

- Successful image loading
- HTTP error handling (404, etc.)
- Network error handling
- Abort signal cancellation
- Parallel loading with failure reporting
- ImageBitmap cloning

### AssetManager (`index.ts`)

- Fetch and cache images
- Report failed asset loads
- Avoid refetching cached assets
- Reuse cached URL with different ID
- Register slave ports
- Distribute assets to slaves
- Handle missing slaves gracefully
- Handle missing assets gracefully
- Enforce cache size limit
- Cache statistics reporting
- URL-to-ID lookup
- Preloading
- Abort pending operations
- Resource cleanup on destroy
- Binary asset loading (fonts, meshes)

## Error Handling

The module uses the standardized error classes:

- `AssetLoadError`: Thrown when asset fetching fails
  - Contains URL, asset type, and HTTP status info
- Errors are wrapped via `wrapError()` before logging

## Performance Considerations

1. **Parallel Loading**: All assets in a fetch request load in parallel
2. **Caching**: Prevents redundant network requests
3. **ImageBitmap**: GPU-optimized format for fast drawing
4. **Transferables**: Assets are transferred (zero-copy) to slaves
5. **Clone on Distribute**: Original stays cached, clones sent to slaves

## Browser Compatibility

Relies on:

- `fetch` API
- `createImageBitmap`
- `OffscreenCanvas` (for cloning)
- `MessagePort` / `MessageChannel`
- Web Workers

All features are available in modern browsers (Chrome 69+, Firefox 105+, Safari 14.1+, Edge 79+).
