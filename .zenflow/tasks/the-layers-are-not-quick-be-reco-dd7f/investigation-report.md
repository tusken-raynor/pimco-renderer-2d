# Investigation Report: Layer Ordering Bug

## Bug Description

Layers are not being recombined in the correct order after processing by render slaves. This results in incorrect visual output where layers may appear in the wrong z-order in the final composited image.

## Root Cause Analysis

### Architecture Overview

The renderer uses a **master-slave architecture**:

1. **RenderMaster** (`src/js/renderer/index.ts`) - Orchestrates the pipeline, distributes layers to slaves, collects results, and composes the final output
2. **Standard Render Slave** (`src/js/render-slave/index.ts`) - Processes standard layers (URL-based masks)
3. **Text Render Slave** (`src/js/text-render-slave/index.ts`) - Processes text layers (PimcoMaskSubstitutionCompiled masks)
4. **Batch Segmenter** (`src/js/render-slave/batch-segmenter.ts`) - Groups consecutive layers with combinable composite modes into single segments

### The Bug Location

The bug occurs in two places:

#### 1. Batch Segmenter Loses Index Information (`src/js/render-slave/batch-segmenter.ts:213-246`)

When `batchSegmentResults()` converts `LayerResult[]` (which includes `index` fields) into `RenderSegment[]`, it **discards the original layer indices**:

```typescript
// Current RenderSegment type (src/js/types/messages.ts:235-242)
export interface RenderSegment {
  bitmap: ImageBitmap;
  compositemode: CanvasCompositeOperation;
  compositealpha: number;
  // NO index tracking!
}
```

When multiple layers are combined into one segment (batching optimization), the information about which original layer indices are represented is permanently lost.

#### 2. Master Assumes 1:1 Mapping (`src/js/renderer/index.ts:1212-1218`)

The master reconstructs layer ordering by assuming each segment corresponds to one layer:

```typescript
for (let i = 0; i < segments.length; i++) {
  const originalIndex = indices[i] ?? i;  // BUG: Wrong when segments are batched!
  composedLayers.push({
    segment: segments[i],
    originalIndex,
  });
}
```

This is incorrect because:
- When 3 layers are batched into 1 segment, `segments.length` is 1 but `indices.length` is 3
- The segment gets assigned index `indices[0]`, but should represent `indices[0]`, `indices[1]`, and `indices[2]`
- When composing, only one of the original indices is preserved, causing misordering

### Bug Manifestation Scenarios

#### Scenario 1: Standard Layers with Combinable Modes

```
Input layers (indices 0-3):
[Layer 0 (source-over), Layer 1 (screen), Layer 2 (lighten), Layer 3 (multiply)]

After batch segmentation:
[Segment 0 (contains 0,1,2 combined), Segment 1 (Layer 3 alone)]
  → Only 2 segments returned, but 4 original indices

Master's reconstruction:
- Segment 0 → index 0 ✓ (but should represent 0,1,2)
- Segment 1 → index 1 ✗ (should be 3!)

Result: Layer 3 is placed at z-order 1 instead of 3
```

#### Scenario 2: Text Layer Mixed with Standard Layers

```
Input layers:
[StandardLayer 0, StandardLayer 1, TextLayer 2, StandardLayer 3]

Distribution:
- Standard slave: [Layer 0, Layer 1, Layer 3] (indices [0, 1, 3])
- Text slave: [Layer 2] (indices [2])

Standard slave batches layers 0,1 together:
- Returns 2 segments for indices [0, 1, 3]

Master reconstruction:
- Standard segment 0 → index 0 ✓
- Standard segment 1 → index 1 ✗ (should be 3)
- Text segment 0 → index 2 ✓

Result: Layer 3 appears between layers 1 and 2
```

## Affected Files

| File | Issue |
|------|-------|
| `src/js/types/messages.ts:235-242` | `RenderSegment` type lacks index tracking |
| `src/js/render-slave/batch-segmenter.ts:47-55` | `PendingSegment` doesn't track original indices |
| `src/js/render-slave/batch-segmenter.ts:67-116` | `segmentLayerResults()` doesn't collect indices |
| `src/js/render-slave/batch-segmenter.ts:213-246` | `batchSegmentResults()` doesn't return indices |
| `src/js/renderer/index.ts:1212-1218` | Master's incorrect index reconstruction |
| `src/workers/text-render-slave.worker.ts:354-380` | Text slave doesn't use batch segmentation (different but related) |

## Impact

- **Severity**: HIGH
- **Visual Impact**: Layers appear in wrong order, causing incorrect compositing
- **Trigger Conditions**:
  - Multiple layers with combinable composite modes (source-over, screen, lighten, lighter)
  - Text layers mixed with standard layers in varying positions
  - Larger layer counts exacerbate the issue

## Fix Plan

### Required Changes

1. **Add `orderIndex` field to `RenderSegment`** (`src/js/types/messages.ts`)
   - Add `orderIndex: number` field to track the highest original layer index in the segment
   - This value determines where the segment should be placed in final composition

2. **Update `PendingSegment` interface** (`src/js/render-slave/batch-segmenter.ts`)
   - Add `originalIndices: number[]` to track which layers are combined into each segment

3. **Update `segmentLayerResults()`** (`src/js/render-slave/batch-segmenter.ts:67-116`)
   - Collect `result.index` values into `PendingSegment.originalIndices` when grouping layers

4. **Update `batchSegmentResults()`** (`src/js/render-slave/batch-segmenter.ts:213-246`)
   - Pass through the highest index (top layer) as `orderIndex` in returned segments
   - When layers are combined, use `Math.max(...pending.originalIndices)` as the segment's order

5. **Update Master's composition logic** (`src/js/renderer/index.ts:1200-1229`)
   - Use `segment.orderIndex` directly instead of mapping by position
   - Remove the incorrect `indices[i]` assumption

6. **Update Text Render Slave Worker** (`src/workers/text-render-slave.worker.ts`)
   - Add `orderIndex` to returned segments (text slaves don't batch, so it's 1:1 with layer index)

### Implementation Order

1. Update `RenderSegment` type definition
2. Update batch segmenter types and functions
3. Update standard render slave worker (already uses batch segmenter)
4. Update text render slave worker
5. Update master composition logic
6. Write tests for mixed layer ordering scenarios

### Test Strategy

- Test with combinable composite modes being batched
- Test with text layers interspersed between standard layers
- Test with multiple slaves and round-robin distribution
- Verify final composition order matches input layer order
