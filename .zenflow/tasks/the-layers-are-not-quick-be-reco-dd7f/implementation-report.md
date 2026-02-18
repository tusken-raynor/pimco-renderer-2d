# Implementation Report: Layer Ordering Bug Fix

## Summary

Fixed a bug where layers were not recombined in the correct order after processing by render slaves. The issue occurred because the batch segmentation system lost track of original layer indices when combining consecutive layers, causing incorrect z-ordering in the final composited image.

## Root Cause

1. **Missing index tracking in `RenderSegment`**: The `RenderSegment` interface had no field to track the original layer index
2. **Batch segmentation discarded indices**: When `batchSegmentResults()` combined multiple layers into one segment, the original indices were permanently lost
3. **Master used incorrect index reconstruction**: The master assumed 1:1 mapping between segments and indices, which broke when layers were batched together

## Changes Made

### 1. Type Definition Updates

**`src/js/types/messages.ts`**
- Added `orderIndex: number` field to `RenderSegment` interface to track the original layer position
- Added `indices: number[]` field to `BatchMessage` interface to pass original indices from master to slaves

### 2. Batch Segmenter Updates

**`src/js/render-slave/batch-segmenter.ts`**
- Added `originalIndices: number[]` to `PendingSegment` interface
- Updated `segmentLayerResults()` to collect layer indices when grouping
- Updated `batchSegmentResults()` to set `orderIndex` as the highest index in combined segments (using `Math.max(...pending.originalIndices)`)

### 3. Master Composition Logic

**`src/js/renderer/index.ts`**
- Updated batch message sending to include `indices` array
- Simplified composition logic to use `segment.orderIndex` directly instead of incorrect position-based mapping

### 4. Render Slave Workers

**`src/workers/render-slave.worker.ts`**
- Updated `handleBatch()` to accept and pass `indices` to `renderBatch()`
- Indices are passed through to layer rendering for correct `orderIndex` tracking

**`src/js/render-slave/index.ts`**
- Updated `renderBatch()` signature to accept optional `indices` parameter
- Updated `resultsToSegments()` to include `orderIndex` in output

**`src/workers/text-render-slave.worker.ts`**
- Updated `handleBatch()` to use indices from batch message
- Each text layer segment now includes correct `orderIndex`

### 5. Virtual Slaves

**`src/js/virtual-slaves/virtual-standard-slave.ts`**
- Updated `handleBatch()` to accept and use indices

**`src/js/virtual-slaves/virtual-text-slave.ts`**
- Updated `handleBatch()` to accept and use indices
- Each segment includes `orderIndex` for correct composition ordering

### 6. Utility Functions

**`src/js/text-render-slave/index.ts`**
- Updated `textResultsToSegments()` to include `orderIndex`

## Tests Added

**`src/js/render-slave/batch-segmenter.test.ts`** - Added 6 new tests for `orderIndex` tracking:
- `should set orderIndex to layer index for single-layer segments`
- `should set orderIndex to highest layer index when layers are combined`
- `should track orderIndex correctly in mixed sequences`
- `should handle non-sequential indices correctly`
- `should preserve orderIndex for each non-combinable layer`
- `should handle complex mixed sequence with correct orderIndex values`

## Test Results

- All 632 unit tests pass
- All 39 batch-segmenter tests pass (including 6 new tests)
- TypeScript compilation passes with no errors

## Files Modified

| File | Changes |
|------|---------|
| `src/js/types/messages.ts` | Added `orderIndex` to `RenderSegment`, added `indices` to `BatchMessage` |
| `src/js/render-slave/batch-segmenter.ts` | Added index tracking through segmentation pipeline |
| `src/js/render-slave/index.ts` | Updated `renderBatch()` and `resultsToSegments()` |
| `src/js/text-render-slave/index.ts` | Updated `textResultsToSegments()` |
| `src/js/renderer/index.ts` | Updated batch message sending and composition logic |
| `src/workers/render-slave.worker.ts` | Updated to pass indices to renderBatch |
| `src/workers/text-render-slave.worker.ts` | Updated to use indices and set orderIndex |
| `src/js/virtual-slaves/virtual-standard-slave.ts` | Updated handleBatch signature |
| `src/js/virtual-slaves/virtual-text-slave.ts` | Updated handleBatch signature |
| `src/js/render-slave/batch-segmenter.test.ts` | Added 6 new orderIndex tests |
| `src/js/virtual-slaves/virtual-standard-slave.test.ts` | Updated test batch messages |
| `src/js/virtual-slaves/virtual-text-slave.test.ts` | Updated test batch messages |
| `src/js/renderer/index.test.ts` | Updated mock segment helper |
| `src/tests/integration/render-pipeline.test.ts` | Updated mock segment helper |

## How the Fix Works

1. **Master sends indices**: When distributing layers to slaves, the master now includes the `indices` array in the batch message
2. **Slaves track indices**: Render slaves use these indices when creating `LayerResult` objects
3. **Batch segmentation preserves order**: When layers are combined into segments, the highest index (topmost layer) is preserved as `orderIndex`
4. **Master uses orderIndex**: During final composition, the master uses `segment.orderIndex` directly to determine layer positioning

### Example Scenario

```
Input layers: [Layer 0, Layer 1, Layer 2 (text), Layer 3]

Distribution:
- Standard slave: [Layer 0, Layer 1, Layer 3] (indices [0, 1, 3])
- Text slave: [Layer 2] (indices [2])

Standard slave batches 0+1:
- Segment 0: combined layers, orderIndex = 1
- Segment 1: Layer 3, orderIndex = 3

Text slave:
- Segment 0: Layer 2, orderIndex = 2

Final composition sorts by orderIndex:
- Segment (orderIndex=1) → z-order position 1
- Segment (orderIndex=2) → z-order position 2
- Segment (orderIndex=3) → z-order position 3

Result: Correct layer ordering preserved!
```
