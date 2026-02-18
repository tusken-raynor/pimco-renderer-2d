# Investigation Report: 2D Text Transformation Bug

**Generated**: 2026-02-18
**Task**: 2D Text Transformation are incorrect
**Status**: Root cause identified, fix planned

---

## Executive Summary

The 2D text transformations are incorrect after porting from a CSS string-based DOMMatrix construction to numeric method calls. **The root cause is the incorrect transformation application order** - CSS transform strings evaluate right-to-left while DOMMatrix method chaining evaluates left-to-right.

---

## Bug Analysis

### Reproduction

The bug manifests when text layers have transformation properties (translation, rotation, scale). The text appears in the wrong position, rotated/scaled around the wrong pivot point.

### Root Cause

**Old Code (string-based, correct):**
```typescript
// old-src-ref/src/renderer/index.ts:1372-1374
const matrix = new DOMMatrix(
  `translate(${translateX}px, ${translateY}px) ${toScaleString(sub.transform?.scale)} ${toRotationString(sub.transform?.rotation)} translate(${offset}px, 0)`
);
```

CSS transform strings are evaluated **right-to-left**. The actual execution order is:
1. `translate(offset, 0)` - alignment offset applied FIRST
2. `rotate(...)` - rotation applied SECOND
3. `scale(...)` - scale applied THIRD
4. `translate(centerX, centerY)` - positioning applied LAST

**New Code (numeric, incorrect):**
```typescript
// src/js/text-render-slave/transforms.ts:182-200
let matrix = new DOMMatrix();
matrix = matrix.translate(centerX, centerY);  // 1. Position (WRONG - should be last)
matrix = matrix.scale(parsed.scaleX, parsed.scaleY);  // 2. Scale
matrix = matrix.rotate(parsed.rotation);  // 3. Rotation
matrix = matrix.translate(alignmentOffset, 0);  // 4. Alignment (WRONG - should be first)
```

DOMMatrix method chaining is evaluated **left-to-right**. The execution order is:
1. `translate(centerX, centerY)` - positioning applied FIRST (should be LAST)
2. `scale(...)` - scale applied SECOND
3. `rotate(...)` - rotation applied THIRD
4. `translate(alignmentOffset, 0)` - alignment applied LAST (should be FIRST)

### Impact

| Aspect | Impact |
|--------|--------|
| **Affected Components** | Text rendering with any transformation |
| **Affected Contexts** | Text layers in Web Worker environment |
| **Visual Manifestation** | Rotated/scaled text in wrong position, wrong pivot point |
| **Severity** | HIGH - Core transformation pipeline is broken |

---

## Files Affected

### Files to Modify

1. **`src/js/text-render-slave/transforms.ts`** (lines 182-200)
   - `buildTransformMatrix()` function needs operation order reversed

2. **`src/js/text-render-slave/transforms.test.ts`**
   - Test expectations may need updating to verify correct behavior

### Reference Files

- **`old-src-ref/src/renderer/index.ts`** (lines 1343-1399)
  - Original working implementation with CSS string approach

---

## Fix Plan

### Approach

Reverse the operation order in `buildTransformMatrix()` to match the CSS string evaluation order:

```typescript
// Correct order (mimics CSS right-to-left evaluation)
let matrix = new DOMMatrix();

// 1. Alignment offset FIRST (innermost transform)
if (alignmentOffset !== 0) {
  matrix = matrix.translate(alignmentOffset, 0);
}

// 2. Rotation SECOND
if (parsed.rotation !== 0) {
  matrix = matrix.rotate(parsed.rotation);
}

// 3. Scale THIRD
if (parsed.scaleX !== 1 || parsed.scaleY !== 1) {
  matrix = matrix.scale(parsed.scaleX, parsed.scaleY);
}

// 4. Position LAST (outermost transform)
matrix = matrix.translate(centerX, centerY);

return matrix;
```

### Implementation Steps

1. Update `buildTransformMatrix()` in `transforms.ts` to reverse operation order
2. Run existing tests to verify the change
3. Add regression tests comparing numeric vs CSS string results
4. Verify visual output matches original behavior

### Test Strategy

1. **Unit tests**: Verify matrix values match expected transformations
2. **Integration tests**: Compare visual output between old and new implementations
3. **Edge cases**: Test alignment offsets with rotation/scale combinations

---

## Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Breaking other transforms | LOW | Isolated to `buildTransformMatrix()` |
| Test failures | MEDIUM | Tests may need updates to match correct behavior |
| Regression | LOW | Comprehensive test coverage exists |

---

## Summary

The fix is straightforward - reverse the order of operations in `buildTransformMatrix()` from `translate → scale → rotate → alignment` to `alignment → rotate → scale → translate`. This ensures the numeric DOMMatrix method chaining produces the same result as the original CSS string-based approach.
