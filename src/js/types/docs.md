# Types Module

## Purpose

This module defines all TypeScript types used throughout the multi-threaded 2D product image renderer. It provides type-safe interfaces for:

1. **PIMCO Types** (`pimco.ts`): ProductImageComponent and related rendering data structures
2. **Message Types** (`messages.ts`): Inter-component communication protocol for workers

## How It Works

### PIMCO Types

The `ProductImageComponent` (PIMCO) is the core data structure representing a single render layer. Layers are composited back-to-front based on their `order` field.

**Key Design Decisions:**

1. **Layer Classification**: The `mask` field determines layer type:
   - `string` URL → Standard layer (image-based mask)
   - `PimcoMaskSubstitutionCompiled` object → Text layer (effect pipeline)

2. **Blend Modes**: Two distinct blend systems:
   - `BlendMode`: Intra-layer blending (color/texture onto base image)
   - `CanvasCompositeOperation`: Inter-layer compositing

3. **New Fields**:
   - `compositealpha`: Inter-layer opacity (default: 1.0)
   - `shadow`: Added to `PimcoMaskSubstitutionEffect` union

### Message Types

All worker communication uses typed messages with a discriminated `type` field. This enables type-safe message handling via type guards.

**Message Flow:**

```
┌──────────────────────────────────────────────────────────────┐
│                        RenderMaster                           │
│    ┌─────────────────┐              ┌─────────────────┐      │
│    │  init/batch/    │              │ fetch/distribute/│      │
│    │  abort          │              │ preload/register │      │
│    └────────┬────────┘              └────────┬────────┘      │
└─────────────┼─────────────────────────────────┼──────────────┘
              │                                 │
              ▼                                 ▼
       ┌──────────────┐                 ┌──────────────┐
       │    Slave     │◄────asset-data──│Asset Manager │
       │   Workers    │                 │    Worker    │
       └──────┬───────┘                 └──────────────┘
              │
              ▼
       ready/capabilities/
       result/error
```

## Interface

### PIMCO Types

```typescript
import {
  ProductImageComponent,
  BlendMode,
  CanvasCompositeOperation,
  PimcoMaskSubstitutionCompiled,
  isTextLayerMask,
  isStandardLayerMask,
} from '@/js/types';

// Example: Classify a layer
function classifyLayer(layer: ProductImageComponent) {
  if (isTextLayerMask(layer.mask)) {
    // Text layer - route to TextRenderSlave
    return 'text';
  } else {
    // Standard layer - route to StandardRenderSlave
    return 'standard';
  }
}
```

### Message Types

```typescript
import {
  BatchMessage,
  ResultMessage,
  isResultMessage,
  RenderSegment,
} from '@/js/types';

// Example: Handle worker messages
worker.onmessage = (event: MessageEvent) => {
  const msg = event.data;

  if (isResultMessage(msg)) {
    // Type-safe access to segments
    const segments: RenderSegment[] = msg.segments;
    composeSegments(segments);
  }
};
```

### Type Guard Functions

All message types have corresponding type guards for runtime type checking:

| Type | Guard Function |
|------|----------------|
| `InitMessage` | `isInitMessage()` |
| `BatchMessage` | `isBatchMessage()` |
| `AbortMessage` | `isAbortMessage()` |
| `ReadyMessage` | `isReadyMessage()` |
| `CapabilitiesMessage` | `isCapabilitiesMessage()` |
| `ResultMessage` | `isResultMessage()` |
| `ErrorMessage` | `isErrorMessage()` |
| `FetchMessage` | `isFetchMessage()` |
| `DistributeMessage` | `isDistributeMessage()` |
| `PreloadMessage` | `isPreloadMessage()` |
| `RegisterSlaveMessage` | `isRegisterSlaveMessage()` |
| `FetchCompleteMessage` | `isFetchCompleteMessage()` |
| `DistributeCompleteMessage` | `isDistributeCompleteMessage()` |
| `AssetDataMessage` | `isAssetDataMessage()` |

## Key Types Reference

### ProductImageComponent

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `name` | `string` | Human-readable name |
| `mode` | `'color' \| 'image'` | Color mode |
| `color` | `string \| string[] \| Record<string, string>` | Color value(s) |
| `texture` | `string` | Texture URL |
| `alpha` | `number` | Intra-layer opacity (0-1) |
| `blend` | `BlendMode` | Intra-layer blend mode |
| `mask` | `string \| PimcoMaskSubstitutionCompiled` | Mask definition |
| `image` | `string` | Base image URL |
| `order` | `number` | Z-order (ascending) |
| `compositemode` | `CanvasCompositeOperation` | Inter-layer composite |
| `compositealpha` | `number` | Inter-layer opacity |

### RenderSegment

| Field | Type | Description |
|-------|------|-------------|
| `bitmap` | `ImageBitmap` | Rendered bitmap |
| `compositemode` | `CanvasCompositeOperation` | Composite operation |
| `compositealpha` | `number` | Composite opacity |

### FallbackScenario

| Scenario | Master | OffscreenCanvas | WebGL2 | Standard Slaves | Text Slaves |
|----------|--------|-----------------|--------|-----------------|-------------|
| A | main | Yes | Yes | workers | workers |
| B | main | Yes | No | workers | virtual |
| C | main | No | - | virtual | virtual |
| D | worker | Yes | Yes | workers | workers |
| E | worker | Yes | No | workers | virtual |
| F | worker | No | - | virtual | virtual |

## Tests

Type guards are pure functions that can be unit tested:

```typescript
describe('isResultMessage', () => {
  it('should return true for valid ResultMessage', () => {
    const msg = { type: 'result', segments: [] };
    expect(isResultMessage(msg)).toBe(true);
  });

  it('should return false for other message types', () => {
    const msg = { type: 'error', message: 'test' };
    expect(isResultMessage(msg)).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(isResultMessage(null)).toBe(false);
    expect(isResultMessage(undefined)).toBe(false);
    expect(isResultMessage('result')).toBe(false);
  });
});
```

Note: Type definitions themselves don't have runtime tests since they are compile-time only. The type guard functions are tested in the integration tests.
