# Investigation Report: Asset Cache Warning Bug

**Task**: Assets with valid asset IDs keep getting warning
**Branch**: assets-with-valid-asset-ids-keep-2c70
**Date**: 2026-02-17

---

## Summary

The warning "Asset X not in cache, cannot deliver" occurs due to a **race condition** between asset distribution and batch rendering dispatch. The master sends batch messages to slaves immediately after the Asset Manager finishes *sending* distribution messages, but before slaves have *received and processed* those messages.

---

## Bug Reproduction

The bug manifests when:
1. Assets are fetched and cached in the Asset Manager
2. Distribution messages are sent to slaves via MessagePort
3. Master immediately sends batch render commands
4. Slaves receive batch before asset-data messages are processed
5. Slave attempts to render with assets not yet registered

---

## Root Cause Analysis

### The Warning Location

**File**: `src/js/asset-manager/index.ts:330`

```typescript
const cachedAsset = this.cache.get(assetId);
if (!cachedAsset) {
  console.warn(`Asset ${String(assetId)} not in cache, cannot deliver`);
  continue;
}
```

This warning is generated in the `deliverToSlave` method when an asset ID is requested for delivery but isn't found in the Asset Manager's cache.

### The Race Condition

The core issue is in `src/js/renderer/index.ts` around lines 1064-1134:

```typescript
// Line 1064: Master awaits distribution
await this.distributeAssets(deliveries);

// Lines 1128-1133: Master immediately sends batch
slave.worker.postMessage({
  type: 'batch',
  layers: slaveData.descriptors,
  width: renderWidth,
  height: renderHeight,
});
```

**Problem**: `distributeAssets()` resolves when the Asset Manager finishes *sending* asset-data messages via MessagePort, not when slaves have *received and processed* them.

### Message Flow Analysis

1. **Master** calls `distributeAssets()` → sends `DistributeMessage` to Asset Manager
2. **Asset Manager** iterates through deliveries, sends `asset-data` via slave MessagePorts
3. **Asset Manager** returns `distribute-complete` immediately after loop finishes
4. **Master** receives `distribute-complete` and proceeds
5. **Master** sends `batch` message to each slave via `worker.postMessage()`
6. **Slave** event loop may process `batch` before queued `asset-data` messages
7. **Slave** starts rendering, calls `this.assets.get(assetId)` → returns `undefined`
8. **Rendering fails** silently or produces incomplete output

### Why This Happens

JavaScript's event loop processes messages from different channels (MessagePort vs main worker postMessage) without guaranteed ordering across channels. Even though both sets of messages are sent in order from their respective senders, the receiving slave may process them in a different order.

---

## Impact Assessment

- **Severity**: High - Causes rendering failures with valid assets
- **Frequency**: Intermittent - Depends on timing/message queue state
- **Scope**: Affects all asset-dependent rendering operations
- **User Impact**: Visual glitches, missing layers, or failed renders

---

## Files Requiring Modification

### Primary Changes

1. **`src/js/renderer/index.ts`**
   - Add synchronization to wait for slaves to confirm asset receipt before sending batch

2. **`src/workers/render-slave.worker.ts`**
   - Add `assets-ready` confirmation message sent after processing asset-data messages

3. **`src/js/types/messages.ts`**
   - Add new message types:
     - `AssetsReadyMessage` (Slave → Master)
     - `PrepareAssetsMessage` (Master → Slave) - optional, for explicit asset list

### Secondary Changes (if needed)

4. **`src/js/asset-manager/index.ts`**
   - May need to track expected asset counts per slave for verification

---

## Proposed Fix Approach

### Option A: Slave Asset Confirmation (Recommended)

**Approach**: Slaves send an `assets-ready` confirmation after receiving all expected assets.

**Implementation**:
1. Add `AssetsReadyMessage` type to messages.ts
2. Before distribution, master sends a "prepare" message telling each slave how many assets to expect
3. Slave tracks received assets and sends `assets-ready` when count is reached
4. Master awaits all `assets-ready` confirmations before sending batch messages

**Pros**:
- Explicit synchronization point
- Slaves can report readiness even if some assets fail
- Minimal changes to existing flow

**Cons**:
- Adds slight latency (one round-trip per slave)

### Option B: Batch with Asset Verification

**Approach**: Include asset IDs in batch message; slave waits for all required assets.

**Implementation**:
1. Modify `BatchMessage` to include `requiredAssetIds: number[]`
2. Slave delays rendering until all required assets are registered
3. Add timeout handling for stuck assets

**Pros**:
- No additional message round-trips
- Self-contained fix in slave

**Cons**:
- Requires timeout handling
- May delay rendering indefinitely if assets truly fail
- Harder to debug "stuck" states

### Option C: Sequential Processing (Simplest)

**Approach**: Use a single message channel for both assets and batch.

**Implementation**:
1. Route batch messages through Asset Manager → Slave MessagePort
2. This guarantees in-order delivery since same channel is used

**Pros**:
- Simplest fix
- Leverages existing infrastructure

**Cons**:
- Architectural change to message routing
- May affect other communication patterns

---

## Recommended Solution

**Option A: Slave Asset Confirmation** is recommended because:

1. **Clear semantics**: Explicit "I have all my assets" signal
2. **Debuggable**: Easy to log which slaves are ready vs waiting
3. **Robust**: Handles edge cases (zero assets, failed assets)
4. **Minimal change**: Adds confirmation without restructuring message flow

### Implementation Plan

1. **Add message types** (messages.ts):
   ```typescript
   export interface PrepareAssetsMessage {
     type: 'prepare-assets';
     expectedCount: number;
     assetIds: number[];
   }

   export interface AssetsReadyMessage {
     type: 'assets-ready';
   }
   ```

2. **Update master distribution** (renderer/index.ts):
   - Before calling `distributeAssets()`, send `prepare-assets` to each slave
   - After `distributeAssets()` completes, await `assets-ready` from all slaves
   - Then proceed with batch dispatch

3. **Update slave handling** (render-slave.worker.ts):
   - Track expected asset count when receiving `prepare-assets`
   - Increment counter when receiving `asset-data`
   - Send `assets-ready` when counter reaches expected count

4. **Add type guards** (messages.ts):
   - `isPrepareAssetsMessage()`
   - `isAssetsReadyMessage()`

---

## Test Strategy

1. **Unit test**: Verify asset count tracking in slave
2. **Integration test**: Simulate slow asset delivery, confirm batch waits
3. **Race condition test**: Rapid asset distribution with immediate batch dispatch
4. **Edge cases**:
   - Zero assets (should still work)
   - Failed assets (should not block indefinitely)
   - Abort during wait (should clean up properly)

---

## Conclusion

The bug is a classic race condition caused by assuming message delivery across different channels is synchronous. The fix requires adding explicit synchronization where the master waits for slave confirmation before proceeding with rendering.
