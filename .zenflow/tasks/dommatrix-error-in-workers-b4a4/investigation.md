# Investigation: DOMMatrix Error in Workers

## Bug Summary

The application throws an error when attempting to construct a `DOMMatrix` using a CSS transform string inside a Web Worker:

```
[DevApp Error] RenderError: Failed to construct 'DOMMatrix': DOMMatrix can't be constructed with strings on workers.
    at RenderMaster.handleSlaveMessage (index.ts:599:30)
```

## Root Cause Analysis

### The Problem

The `DOMMatrix` constructor has two forms:
1. `new DOMMatrix()` - Creates an identity matrix (works everywhere)
2. `new DOMMatrix(init)` where `init` can be:
   - A numeric array `[a, b, c, d, e, f]` for 2D or 16 values for 3D (works everywhere)
   - A CSS transform string like `"translate(10px, 20px) rotate(45deg)"` (**only works in main thread**)

The CSS string parsing relies on the CSS parser, which is not available in Web Worker contexts. This is **by design per the W3C specification**, not a browser bug.

**References:**
- [MDN content issue #10351](https://github.com/mdn/content/issues/10351) - Documents this limitation
- [W3C fxtf-drafts issue #346](https://github.com/w3c/fxtf-drafts/issues/346) - Discusses it as a "code portability footgun"

**Key insight:** `DOMMatrix` *is* available in workers. The `new DOMMatrix()` constructor and all methods like `.translate()`, `.scale()`, `.rotate()` work fine. Only the **string argument** to the constructor fails because it requires CSS parsing infrastructure.

### Location of the Bug

**File:** `src/js/text-render-slave/transforms.ts`
**Function:** `buildTransformMatrix()` at line 200

```typescript
// Line 200 - THIS FAILS IN WORKERS
return new DOMMatrix(transformParts.join(' '));
```

The function builds a CSS transform string like:
```
translate(500px, 400px) scale(2, 1.5) rotate(45deg) translate(50px, 0px)
```

And passes it to `new DOMMatrix(...)`, which throws in worker contexts.

### Call Chain

1. `RenderMaster` receives an error message from a slave worker
2. The error originated in `TextRenderSlave` (runs in a Web Worker)
3. `TextRenderSlave` calls `applyTransformAndDraw()` from `transforms.ts:219`
4. `applyTransformAndDraw()` calls `buildTransformMatrix()` at `transforms.ts:238`
5. `buildTransformMatrix()` calls `new DOMMatrix(cssString)` at `transforms.ts:200`
6. The browser throws: "DOMMatrix can't be constructed with strings on workers"

## Affected Components

| Component | File | Impact |
|-----------|------|--------|
| `buildTransformMatrix()` | `src/js/text-render-slave/transforms.ts:166-201` | Primary bug location |
| `applyTransformAndDraw()` | `src/js/text-render-slave/transforms.ts:219-248` | Calls the buggy function |
| `TextRenderSlave` | `src/js/text-render-slave/index.ts` | Runs in worker, imports transforms |
| `RenderMaster` | `src/js/renderer/index.ts:599` | Receives and surfaces the error |

## Proposed Solution

Replace the CSS string-based `DOMMatrix` construction with numeric matrix operations that work in all contexts.

### Approach: Build the Matrix Using Numeric Operations

Instead of:
```typescript
return new DOMMatrix(transformParts.join(' '));
```

Compute the matrix values directly using matrix multiplication:

```typescript
export function buildTransformMatrix(
  parsed: ParsedTransform,
  canvasWidth: number,
  canvasHeight: number,
  alignmentOffset: number
): DOMMatrix {
  const centerX = canvasWidth * 0.5 + parsed.translateX;
  const centerY = canvasHeight * 0.5 + parsed.translateY;

  // Start with identity matrix
  let matrix = new DOMMatrix();

  // 1. Translate to center + offset
  matrix = matrix.translate(centerX, centerY);

  // 2. Scale (if non-identity)
  if (parsed.scaleX !== 1 || parsed.scaleY !== 1) {
    matrix = matrix.scale(parsed.scaleX, parsed.scaleY);
  }

  // 3. Rotate (if non-zero) - DOMMatrix.rotate() takes degrees
  if (parsed.rotation !== 0) {
    matrix = matrix.rotate(parsed.rotation);
  }

  // 4. Alignment offset
  if (alignmentOffset !== 0) {
    matrix = matrix.translate(alignmentOffset, 0);
  }

  return matrix;
}
```

### Why This Works

- `new DOMMatrix()` with no arguments creates an identity matrix (works in workers)
- `DOMMatrix.translate()`, `DOMMatrix.scale()`, and `DOMMatrix.rotate()` are method calls that return new `DOMMatrix` instances (work in workers)
- These methods perform the same mathematical transformations as the CSS string parsing, but without requiring the CSS parser

### Edge Cases and Considerations

1. **Transform order is preserved**: The method chain applies transforms in the same order as the CSS string (left-to-right in CSS = first-applied)

2. **Rotation units**: `DOMMatrix.rotate()` takes degrees (same as our `parsed.rotation`), so no conversion needed

3. **Scale**: `DOMMatrix.scale()` accepts (scaleX, scaleY) parameters directly

4. **Existing tests**: The test file (`transforms.test.ts`) uses a mock `DOMMatrix` that parses CSS strings. The tests should still pass because:
   - Tests run in Node.js with a mock that handles both approaches
   - The mathematical result is identical

5. **No other usages**: The Grep search confirmed `new DOMMatrix(string)` only appears in:
   - `transforms.ts:200` (the bug)
   - `old-src-ref/` (legacy reference code)
   - Test files (mocks)

## Test Results

To be completed during implementation phase.
