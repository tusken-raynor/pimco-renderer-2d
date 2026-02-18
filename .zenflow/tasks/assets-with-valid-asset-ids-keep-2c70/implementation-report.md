# Implementation Report: Asset Cache Warning Bug Fix

**Task**: Assets with valid asset IDs keep getting warning
**Branch**: assets-with-valid-asset-ids-keep-2c70
**Date**: 2026-02-17

---

## Summary

Implemented a fix for the race condition causing "Asset X not in cache, cannot deliver" warnings. The fix uses an event-driven approach where slaves wait for both batch messages AND required assets before rendering, eliminating the need for new message types.

---

## Root Cause (from Investigation)

The bug was a race condition between asset distribution and batch rendering dispatch:

1. Master called `distributeAssets()` which sent asset-data messages via MessagePort
2. Asset Manager returned `distribute-complete` immediately after queueing messages
3. Master received `distribute-complete` and sent batch messages via `worker.postMessage()`
4. **Race condition**: Slaves could receive batch messages before asset-data messages due to different message channels having no guaranteed ordering

---

## Fix Implementation

### Approach: Event-Driven Batch/Asset Synchronization

Instead of adding new message types for explicit synchronization, the fix leverages the existing information available to slaves. Each slave:

1. Extracts required asset IDs from the layer descriptors in the batch message (non-negative IDs indicate valid assets)
2. Waits until BOTH conditions are met before rendering:
   - A batch message has been received from the master
   - All assets referenced in the batch have been received via MessagePort

Either the batch arrival OR an asset arrival can trigger the render check.

### Files Modified

#### 1. `src/workers/render-slave.worker.ts`

Added event-driven synchronization:

```typescript
// Pending batch state - stores batch info until assets are ready
let pendingBatch: {
  layers: LayerDescriptor[];
  width: number;
  height: number;
  requiredAssetIds: Set<number>;
} | null = null;

// Extract required asset IDs from layer descriptors
function extractRequiredAssetIds(layers: LayerDescriptor[]): Set<number> {
  const assetIds = new Set<number>();
  for (const layer of layers) {
    const ids = layer.assetIds;
    if (ids.image >= 0) assetIds.add(ids.image);
    if (ids.mask !== undefined && ids.mask >= 0) assetIds.add(ids.mask);
    if (ids.texture !== undefined && ids.texture >= 0) assetIds.add(ids.texture);
    if (ids.hlimage1 !== undefined && ids.hlimage1 >= 0) assetIds.add(ids.hlimage1);
    if (ids.hlimage2 !== undefined && ids.hlimage2 >= 0) assetIds.add(ids.hlimage2);
  }
  return assetIds;
}

// Check if all required assets are available
function hasAllRequiredAssets(): boolean {
  if (!pendingBatch) return false;
  for (const assetId of pendingBatch.requiredAssetIds) {
    if (!renderSlave.hasAsset(assetId)) return false;
  }
  return true;
}

// Try to render if we have both batch and assets
async function tryRender(): Promise<void> {
  if (!pendingBatch || !hasAllRequiredAssets()) return;
  // Capture batch info and clear pending state, then render...
}
```

Key changes:
- `handleBatch()` stores batch info in `pendingBatch` and calls `tryRender()`
- `handleAssetData()` registers asset and calls `tryRender()`
- `tryRender()` checks both conditions before proceeding

#### 2. `src/workers/text-render-slave.worker.ts`

Same event-driven approach adapted for text layers:
- Extracts `texture`, `font`, and `postmask` asset IDs from text layer descriptors
- Checks both `textRenderSlave.getAsset()` and `textRenderSlave.hasFont()` for asset availability

#### 3. `src/js/virtual-slaves/virtual-standard-slave.ts`

Class-based implementation with same approach:
- Added `pendingBatch` private property
- Added `extractRequiredAssetIds()`, `hasAllRequiredAssets()`, and `tryRender()` methods
- Updated `handleBatch()` and `handleAssetData()` to use event-driven flow

#### 4. `src/js/virtual-slaves/virtual-text-slave.ts`

Same changes as virtual-standard-slave.ts for text rendering.

#### 5. `src/js/types/messages.ts` and `src/js/types/index.ts`

Removed obsolete types from initial approach:
- Removed `PrepareAssetsMessage` and `AssetsReadyMessage` interfaces
- Removed `isPrepareAssetsMessage()` and `isAssetsReadyMessage()` type guards
- Updated union types to remove these messages

#### 6. `src/js/renderer/index.ts`

Reverted master-side synchronization changes:
- Removed `assetsReadyResolver` from SlaveState
- Removed prepare-assets sending logic
- Simplified back to just calling `distributeAssets()` and then sending batch

### Message Flow (Unchanged from Original Design)

The master's message flow remains the same:

1. Master calls `distributeAssets()` → Asset Manager queues asset-data via MessagePorts
2. Master sends `batch` messages to slaves

**The difference is now in the slaves**:

1. Slave receives batch message → stores it as `pendingBatch`, extracts required asset IDs
2. Slave calls `tryRender()` → checks if all assets present → waits if not
3. Slave receives asset-data → registers asset, calls `tryRender()`
4. When both conditions met → `tryRender()` renders the batch

---

## Test Results

```
Unit Tests:      732 passed (25 test files)
TypeScript:      No errors
```

All existing tests continue to pass, confirming no regressions.

Removed obsolete test file:
- `src/js/renderer/asset-synchronization.test.ts` - tested the removed message types

---

## Edge Cases Handled

1. **Assets arrive before batch**: `tryRender()` waits for batch to be set
2. **Batch arrives before assets**: `tryRender()` waits for all assets to be registered
3. **Zero required assets**: `tryRender()` proceeds immediately after batch received
4. **Abort during wait**: `handleAbort()` clears `pendingBatch`, `tryRender()` checks terminated state
5. **Virtual slaves**: Same synchronization logic as real workers

---

## Performance Impact

- **Zero additional messages**: No new message types or round-trips required
- **Minimal CPU overhead**: Simple Set-based asset tracking
- **No additional latency in typical case**: Assets usually arrive before batch due to message ordering
- **Graceful handling of race conditions**: Renders as soon as both conditions are met

---

## Verification

The fix ensures the slave rendering flow is:

```
1. Slave: receive batch → store in pendingBatch, extract required asset IDs
2. Slave: tryRender() → check hasAllRequiredAssets() → false, wait
3. Slave: receive asset-data → register asset
4. Slave: tryRender() → check hasAllRequiredAssets() → false, wait (repeat)
5. Slave: receive final asset-data → register asset
6. Slave: tryRender() → check hasAllRequiredAssets() → true, RENDER!
```

The warning "Asset X not in cache, cannot deliver" should no longer occur because slaves wait for all required assets before attempting to render.

---

## Advantages of This Approach

1. **No new message types**: Uses existing message infrastructure
2. **Self-contained in slaves**: No master changes required
3. **Simpler**: Each slave independently determines when to render
4. **Original design intent**: The layer descriptors already contain asset ID information
5. **More robust**: Works regardless of message arrival order
