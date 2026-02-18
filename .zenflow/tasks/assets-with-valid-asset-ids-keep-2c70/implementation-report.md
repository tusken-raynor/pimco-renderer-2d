# Implementation Report: Asset Cache Warning Bug Fix

**Task**: Assets with valid asset IDs keep getting warning
**Branch**: assets-with-valid-asset-ids-keep-2c70
**Date**: 2026-02-17

---

## Summary

Implemented a fix for the race condition causing "Asset X not in cache, cannot deliver" warnings. The fix adds explicit synchronization where slaves confirm asset receipt before the master sends batch render commands.

---

## Root Cause (from Investigation)

The bug was a race condition between asset distribution and batch rendering dispatch:

1. Master called `distributeAssets()` which sent asset-data messages via MessagePort
2. Asset Manager returned `distribute-complete` immediately after queueing messages
3. Master received `distribute-complete` and sent batch messages via `worker.postMessage()`
4. **Race condition**: Slaves could receive batch messages before asset-data messages due to different message channels having no guaranteed ordering

---

## Fix Implementation

### Approach: Slave Asset Confirmation (Option A from investigation)

Slaves send an `assets-ready` confirmation after receiving all expected assets, and the master waits for all confirmations before sending batch messages.

### Files Modified

#### 1. `src/js/types/messages.ts`

Added two new message types:

```typescript
// Master → Slave: Prepare slave to receive specific assets
export interface PrepareAssetsMessage {
  type: 'prepare-assets';
  expectedCount: number;
  assetIds: number[];
}

// Slave → Master: All expected assets received
export interface AssetsReadyMessage {
  type: 'assets-ready';
}
```

Added corresponding type guards:
- `isPrepareAssetsMessage()`
- `isAssetsReadyMessage()`

Updated union types:
- `MasterToSlaveMessage` now includes `PrepareAssetsMessage`
- `SlaveToMasterMessage` now includes `AssetsReadyMessage`

#### 2. `src/js/types/index.ts`

Exported the new types and type guards.

#### 3. `src/workers/render-slave.worker.ts`

Added asset synchronization tracking:
- `expectedAssetCount`, `expectedAssetIds`, `receivedAssetIds`, `assetsReadySent` variables
- `handlePrepareAssets()` function to set up tracking
- `sendAssetsReady()` function to send confirmation
- Updated `handleAssetData()` to track received assets and send ready when complete
- Updated message handler to process `prepare-assets` messages

#### 4. `src/workers/text-render-slave.worker.ts`

Same changes as render-slave.worker.ts for text rendering.

#### 5. `src/js/virtual-slaves/virtual-standard-slave.ts`

Added asset synchronization tracking for virtual slaves:
- Private tracking variables
- `handlePrepareAssets()` method
- `sendAssetsReady()` method
- Updated `handleAssetData()` and message handler

#### 6. `src/js/virtual-slaves/virtual-text-slave.ts`

Same changes as virtual-standard-slave.ts for text virtual slaves.

#### 7. `src/js/renderer/index.ts`

Updated master renderer to implement synchronization:

1. Added `assetsReadyResolver` to `SlaveState` interface
2. Added `isAssetsReadyMessage` to imports
3. Updated `handleSlaveMessage()` to handle `assets-ready` confirmations
4. Modified `render()` method to:
   - Send `prepare-assets` messages to all slaves before asset distribution
   - Set up promise resolvers for each slave's `assets-ready` confirmation
   - Wait for `Promise.all(assetsReadyPromises)` after `distributeAssets()`
   - Only send batch messages after all slaves confirm asset receipt

### New Message Flow

1. Master determines which assets each slave needs
2. Master sends `prepare-assets` to each slave with expected asset count
3. Master calls `distributeAssets()` → Asset Manager sends `asset-data` via MessagePorts
4. Slaves track received assets, send `assets-ready` when count matches
5. Master awaits all `assets-ready` confirmations
6. **Only then** master sends `batch` messages to slaves
7. Slaves render with guaranteed asset availability

---

## Tests Added

### `src/js/renderer/asset-synchronization.test.ts`

New test file with 17 tests covering:

1. **Message Type Tests**
   - `PrepareAssetsMessage` structure validation
   - `AssetsReadyMessage` structure validation
   - Type guard functionality (`isPrepareAssetsMessage`, `isAssetsReadyMessage`)

2. **Slave Asset Tracking Tests**
   - Track expected asset count from prepare-assets message
   - Track received assets and signal ready when all received
   - Immediately signal ready when expecting zero assets
   - Ignore assets not in expected list
   - Not double-count duplicate assets

3. **Master Synchronization Tests**
   - Wait for all slaves to report ready
   - Resolve immediately when no slaves specified
   - Handle out-of-order slave ready messages

4. **Race Condition Prevention Tests**
   - Verify correct ordering: assets received → assets-ready sent → batch sent
   - Demonstrate the bug scenario (batch before asset-data) for documentation

---

## Test Results

```
Unit Tests:      634 passed (26 test files)
Integration:     80 passed (3 test files)
TypeScript:      No errors
```

All existing tests continue to pass, confirming no regressions.

---

## Edge Cases Handled

1. **Zero assets**: Slaves immediately send `assets-ready` when `expectedCount` is 0
2. **Unexpected assets**: Ignored (not counted toward expected count)
3. **Duplicate assets**: Set-based tracking prevents double-counting
4. **Abort during wait**: Existing abort handling clears pending state
5. **Virtual slaves**: Same synchronization logic as real workers

---

## Performance Impact

- **Minimal latency increase**: One additional round-trip per slave per render
- **No additional network requests**: Uses existing MessagePort infrastructure
- **Parallel confirmation**: All slaves confirm independently in parallel
- **Zero assets fast path**: Immediate confirmation when no assets needed

---

## Verification

The fix ensures that the sequence is always:

```
1. Master: send prepare-assets
2. Master: send distribute (to Asset Manager)
3. Asset Manager: send asset-data (to slaves via MessagePort)
4. Slave: receive asset-data, track count
5. Slave: send assets-ready (when all received)
6. Master: receive assets-ready (wait for all)
7. Master: send batch (now safe - assets guaranteed available)
```

The warning "Asset X not in cache, cannot deliver" should no longer occur because slaves will always have received and registered their assets before any batch message arrives.
