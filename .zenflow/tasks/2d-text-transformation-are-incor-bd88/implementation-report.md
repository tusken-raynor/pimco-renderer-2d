# Implementation Report: 2D Text Transformation Bug

**Date**: 2026-02-18
**Task**: 2D Text Transformation are incorrect
**Status**: Fixed

---

## Summary

Fixed the 2D text transformation bug by adding a `textWidth` parameter to `applyTransformAndDraw()`. The bug occurred because the alignment offset was being calculated based on the source canvas width (which is full-sized after the effect pipeline) instead of the original text width.

---

## Root Cause Analysis

### Initial Investigation (Incorrect Hypothesis)

The initial investigation suggested that the transformation order was wrong - that CSS transforms evaluate right-to-left while DOMMatrix methods evaluate left-to-right. Testing revealed this was incorrect; the transformation order in the code was already correct.

### Actual Root Cause

The real bug was in how the **alignment offset** was calculated:

**Old System (Correct):**
- The effect pipeline produced a **tight-fitted canvas** around the text (same dimensions as measured text width/height)
- The source passed to `applyWithTransformation` had `source.width` = text width
- Alignment offset was correctly calculated as `source.width / 2`

**New System (Buggy):**
- The effect pipeline produces a **full-sized canvas** (canvasWidth x canvasHeight)
- The source passed to `applyTransformAndDraw` had `source.width` = canvas width
- Alignment offset was incorrectly calculated as `canvasWidth / 2` instead of `textWidth / 2`

**Example of the Bug:**
- Canvas: 1000x800 pixels
- Text: 200 pixels wide, left-aligned
- Old code: offset = 200/2 = 100px (correct)
- New code: offset = 1000/2 = 500px (wrong - text shifted way off-screen)

---

## The Fix

### Changes Made

1. **`src/js/text-render-slave/transforms.ts`**
   - Added optional `textWidth` parameter to `applyTransformAndDraw()`
   - When provided, uses `textWidth` instead of `source.width` for alignment calculation
   - Updated documentation to explain the parameter's purpose

2. **`src/workers/text-render-slave.worker.ts`**
   - Updated call to `applyTransformAndDraw()` to pass `rasterized.width` as `textWidth`

3. **`src/js/text-render-slave/index.ts`**
   - Updated call to `applyTransformAndDraw()` to explicitly pass `rasterized.width`
   - Added clarifying comment

4. **`src/js/text-render-slave/transforms.test.ts`**
   - Added 9 tests for CSS string vs numeric matrix comparison
   - Added 3 tests for the new `textWidth` parameter behavior

### Code Changes

**transforms.ts - Function signature:**
```typescript
export function applyTransformAndDraw(
  targetCtx: Canvas2DContext,
  source: AnyCanvas | ImageBitmap,
  transform: PimcoMaskSubstitutionTransformation | undefined,
  canvasWidth: number,
  canvasHeight: number,
  alignment?: TextAlignment,
  textWidth?: number  // NEW: Original text width for alignment offset
): void {
  // ...
  const alignmentWidth = textWidth ?? sourceWidth;
  const alignmentOffset = calculateAlignmentOffset(alignment, alignmentWidth);
  // ...
}
```

**text-render-slave.worker.ts - Usage:**
```typescript
applyTransformAndDraw(
  outputCtx,
  effectCanvas,
  maskData.transform,
  width,
  height,
  alignment,
  rasterized.width  // Pass actual text width
);
```

---

## Verification Results

### Transform Tests
All 60 transform tests pass, including:
- 9 CSS string vs numeric matrix comparison tests
- 3 new `textWidth` parameter tests
- Original unit tests for all transform functions

### Full Test Suite
```
Test Files  25 passed (25)
Tests       647 passed | 102 skipped (749)
```

---

## Key Learning

The original investigation focused on the wrong area (transformation order) because:
1. The investigation report hypothesis was plausible
2. I initially validated tests against a helper function that had the same bug as production code

The actual bug was discovered by:
1. Tracing through the old code to understand the full pipeline
2. Discovering that `preEffect()` resized worker canvases to fit text
3. Realizing the new effect pipeline produces full-sized canvases
4. Understanding that `source.width` had different meanings in old vs new code

---

## Files Modified

| File | Change Type | Description |
|------|-------------|-------------|
| `src/js/text-render-slave/transforms.ts` | Modified | Added `textWidth` parameter to `applyTransformAndDraw()` |
| `src/workers/text-render-slave.worker.ts` | Modified | Pass `rasterized.width` as `textWidth` |
| `src/js/text-render-slave/index.ts` | Modified | Pass `rasterized.width` as `textWidth` |
| `src/js/text-render-slave/transforms.test.ts` | Modified | Added 12 new tests |

---

## Future Considerations

1. The `textWidth` parameter is optional for backwards compatibility
2. When source canvas IS tight-fitted (like in index.ts), passing `textWidth` is optional but recommended for clarity
3. The effect pipeline could potentially be changed to produce tight-fitted canvases like the old system, but that would require more extensive changes
