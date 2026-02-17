# Render Slave Module

## Purpose

The Render Slave module provides the core rendering logic for **standard layers** in the multi-threaded 2D product image renderer. Standard layers are those where the `mask` field is a URL string (as opposed to text layers where `mask` is a `PimcoMaskSubstitutionCompiled` object).

The module consists of three main components:
1. **Intra-Layer Pipeline** - The 5-step rendering process for a single layer
2. **RenderSlave Class** - Asset management and batch rendering coordination
3. **Batch Segmenter** - Groups consecutive combinable layers to reduce composition overhead

## How It Works

### Intra-Layer Pipeline

The intra-layer pipeline renders a single standard layer through 5 sequential steps:

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTRA-LAYER PIPELINE                          │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │ Step 1:      │   │ Step 2:      │   │ Step 3:      │        │
│  │ Draw Base    │──▶│ Apply Color/ │──▶│ Apply        │        │
│  │ Image        │   │ Texture      │   │ Highlight 1  │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         │                                      │                 │
│         │            ┌──────────────┐   ┌──────────────┐        │
│         │            │ Step 5:      │◀──│ Step 4:      │        │
│         └───────────▶│ Apply Mask   │   │ Apply        │        │
│                      │ (dest-in)    │   │ Highlight 2  │        │
│                      └──────────────┘   └──────────────┘        │
│                             │                                    │
│                             ▼                                    │
│                    [Rendered Layer]                              │
└─────────────────────────────────────────────────────────────────┘
```

#### Step 1: Draw Base Image
- Clears the work canvas
- Applies placement transforms (position, size, rotation, scale, skew)
- Draws the base image at the calculated position

#### Step 2: Apply Color or Texture
- For **color mode**: Fills with solid color using specified blend mode and alpha
- For **image mode**: Draws texture image using specified blend mode and alpha

#### Step 3: Apply Highlight 1
- Draws the first highlight image (if defined)
- Uses `hlblend1` and `hlalpha1` for blend mode and opacity

#### Step 4: Apply Highlight 2
- Draws the second highlight image (if defined)
- Falls back to highlight 1's image/blend if not specified
- Uses `hlblend2` and `hlalpha2` for blend mode and opacity

#### Step 5: Apply Mask
- Applies the mask image using `destination-in` composite operation
- Only areas where the mask is opaque remain visible

### Placement System

The placement system converts percentage-based values to pixel coordinates:

```typescript
interface ImagePlacementDefinition {
  left?: number;    // X position as percentage (0-1)
  top?: number;     // Y position as percentage (0-1)
  width?: number;   // Width as percentage (0-1)
  height?: number;  // Height as percentage (0-1)
  fit?: 'contain' | 'cover' | 'fill';  // Fit mode
  position?: [number, number];  // Anchor for fit modes
  transform?: ImagePlacementTransform[] | FixedSizeArray<number, 6>;
}
```

**Fit Modes:**
- `contain`: Fit inside bounds, maintaining aspect ratio (may have letterboxing)
- `cover`: Fill bounds, maintaining aspect ratio (may crop)
- `fill`: Stretch to fill bounds (may distort)

**Transform Types:**
- `rotate`: Rotation by angle (radians)
- `scale`: Scale by x/y factors
- `translate`: Translation by x/y pixels or percentages
- `skew`: Skew by x/y angles

### Batch Segmentation

The Batch Segmenter groups consecutive layers with combinable composite modes into single render segments. This reduces the number of composition operations needed by the master during final composition.

```
Layer Sequence:                          Resulting Segments:
┌──────────────┐                         ┌──────────────────┐
│ Layer 1      │ (source-over)     ─┐    │ Segment 1        │
├──────────────┤                    ├───▶│ (3 layers merged)│
│ Layer 2      │ (screen)          ─┤    └──────────────────┘
├──────────────┤                    │
│ Layer 3      │ (lighten)         ─┘    ┌──────────────────┐
├──────────────┤                    ────▶│ Segment 2        │
│ Layer 4      │ (multiply)              │ (standalone)     │
├──────────────┤                         └──────────────────┘
│ Layer 5      │ (source-over)     ────▶ ┌──────────────────┐
└──────────────┘                         │ Segment 3        │
                                         │ (standalone)     │
                                         └──────────────────┘
```

**Combinable Modes:**
These modes can be batched together because they are associative:
- `source-over`: Standard alpha compositing
- `screen`: Lightening blend
- `lighten`: Take lighter of each channel
- `lighter`: Add RGB values (also known as 'add')

**Non-Combinable Modes:**
All other modes require standalone segments to preserve correct visual output:
- `multiply`, `overlay`, `darken`, `color-dodge`, `color-burn`
- `hard-light`, `soft-light`, `difference`, `exclusion`
- `source-in`, `source-out`, `source-atop`
- `destination-over`, `destination-in`, `destination-out`, `destination-atop`
- `copy`, `xor`
- `hue`, `saturation`, `color`, `luminosity`

### RenderSlave Class

The `RenderSlave` class manages assets and coordinates batch rendering:

```typescript
class RenderSlave {
  // Asset management
  registerAsset(id: number, bitmap: ImageBitmap): void;
  hasAsset(id: number): boolean;
  getAsset(id: number): ImageBitmap | undefined;
  clearAssets(): void;

  // Abort handling
  abort(): void;
  resetAbort(): void;
  isAborted(): boolean;

  // Rendering
  renderLayer(layer: LayerDescriptor, width: number, height: number, index: number): Promise<LayerResult | null>;
  renderBatch(layers: LayerDescriptor[], width: number, height: number): Promise<LayerResult[]>;

  // Cleanup
  destroy(): void;
}
```

## Interface

### Types

```typescript
// Resolved placement with pixel values
interface ResolvedPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  transform: ImagePlacementTransform<number>[] | FixedSizeArray<number, 6> | null;
}

// Assets for rendering a layer
interface LayerAssets {
  image: ImageBitmap;
  mask: ImageBitmap;
  texture?: ImageBitmap;
  hlimage1?: ImageBitmap;
  hlimage2?: ImageBitmap;
}

// Layer configuration
interface LayerConfig {
  id: string;
  mode: 'color' | 'image';
  color?: string;
  alpha: number;
  blend: BlendMode;
  hlalpha1?: number;
  hlblend1?: BlendMode;
  hlalpha2?: number;
  hlblend2?: BlendMode;
  placement?: ImagePlacementDefinition;
}

// Pipeline execution context
interface PipelineContext {
  work: { canvas: AnyCanvas; ctx: Canvas2DContext };
  color: { canvas: AnyCanvas; ctx: Canvas2DContext };
  width: number;
  height: number;
}

// Result from rendering a layer
interface LayerResult {
  bitmap: ImageBitmap;
  index: number;
  compositemode: CanvasCompositeOperation;
  compositealpha: number;
}
```

### Functions

```typescript
// Create pipeline context
function createPipelineContext(width: number, height: number): PipelineContext;

// Derive placement from config
function derivePlacement(
  config: LayerConfig,
  targetWidth: number,
  targetHeight: number,
  srcWidth: number,
  srcHeight: number
): ResolvedPlacement;

// Individual pipeline steps
function step1DrawBaseImage(ctx: PipelineContext, assets: LayerAssets, placement: ResolvedPlacement): void;
function step2ApplyColorOrTexture(ctx: PipelineContext, assets: LayerAssets, config: LayerConfig, placement: ResolvedPlacement): void;
function step3ApplyHighlight1(ctx: PipelineContext, assets: LayerAssets, config: LayerConfig, placement: ResolvedPlacement): void;
function step4ApplyHighlight2(ctx: PipelineContext, assets: LayerAssets, config: LayerConfig, placement: ResolvedPlacement): void;
function step5ApplyMask(ctx: PipelineContext, assets: LayerAssets, placement: ResolvedPlacement): void;

// Execute full pipeline
function executeIntraLayerPipeline(ctx: PipelineContext, assets: LayerAssets, config: LayerConfig): AnyCanvas;

// Convert results to segments (simple, no batching)
function resultsToSegments(results: LayerResult[]): RenderSegment[];

// Convert results to segments with batching optimization
function batchSegmentResults(results: LayerResult[], width: number, height: number): Promise<RenderSegment[]>;

// Check if a mode is combinable
function isCombinableMode(mode: CanvasCompositeOperation): boolean;

// Group layer results into segments
function segmentLayerResults(results: LayerResult[]): PendingSegment[];
```

## Example Usage

### Rendering a Single Layer

```typescript
import {
  createPipelineContext,
  executeIntraLayerPipeline,
  type LayerAssets,
  type LayerConfig,
} from './render-slave/intra-layer-pipeline';

// Create pipeline context
const ctx = createPipelineContext(1000, 800);

// Prepare assets (received from Asset Manager)
const assets: LayerAssets = {
  image: baseImageBitmap,
  mask: maskImageBitmap,
  texture: textureImageBitmap,
};

// Configure the layer
const config: LayerConfig = {
  id: 'layer-1',
  mode: 'color',
  color: '#ff0000',
  alpha: 0.8,
  blend: 'multiply',
  placement: {
    left: 0.1,
    top: 0.1,
    width: 0.8,
    height: 0.8,
    fit: 'contain',
  },
};

// Execute pipeline
const resultCanvas = executeIntraLayerPipeline(ctx, assets, config);

// Convert to ImageBitmap for transfer
const bitmap = await createImageBitmap(resultCanvas);
```

### Using the RenderSlave Class

```typescript
import { RenderSlave, resultsToSegments } from './render-slave';

// Create slave instance
const slave = new RenderSlave();

// Register assets (received from Asset Manager)
slave.registerAsset(1, baseImageBitmap);
slave.registerAsset(2, maskImageBitmap);
slave.registerAsset(3, textureImageBitmap);

// Prepare layer descriptors
const layers: LayerDescriptor[] = [
  {
    id: 'layer-1',
    assetIds: { image: 1, mask: 2, texture: 3 },
    mode: 'image',
    alpha: 1,
    blend: 'normal',
    compositemode: 'source-over',
    compositealpha: 1,
  },
];

// Render batch
const results = await slave.renderBatch(layers, 1000, 800);

// Convert to segments for master
const segments = resultsToSegments(results);

// Cleanup
slave.destroy();
```

### Using Batch Segmentation

```typescript
import { RenderSlave } from './render-slave';
import { batchSegmentResults } from './render-slave/batch-segmenter';

// Create slave and render batch
const slave = new RenderSlave();
// ... register assets ...
const results = await slave.renderBatch(layers, 1000, 800);

// Convert to optimized segments (reduces segment count)
const segments = await batchSegmentResults(results, 1000, 800);

// segments.length <= results.length
// Consecutive combinable layers are merged into single segments
```

## Tests

The module includes comprehensive unit tests:

### intra-layer-pipeline.test.ts
- **derivePlacement**: Tests placement calculation with percentages, fit modes, transforms
- **placementTransformUnits**: Tests unit conversion for transforms
- **applyTransformSequence**: Tests transform application (rotate, scale, translate, skew)
- **step1DrawBaseImage**: Tests base image drawing with transforms
- **step2ApplyColorOrTexture**: Tests color fill and texture application
- **step3ApplyHighlight1**: Tests highlight 1 application
- **step4ApplyHighlight2**: Tests highlight 2 with fallbacks
- **step5ApplyMask**: Tests mask application with destination-in composite
- **Edge cases**: Zero dimensions, missing colors, empty transforms

### index.test.ts
- **Asset management**: Register, retrieve, clear assets
- **Abort handling**: Abort flag set/reset
- **resultsToSegments**: Conversion to render segments
- **LayerDescriptor handling**: Required and optional fields

### batch-segmenter.test.ts
- **COMBINABLE_MODES**: Correct set of combinable modes
- **isCombinableMode**: Mode classification
- **segmentLayerResults**: Grouping logic for various sequences
- **batchSegmentResults**: Full segmentation with composition
- **Edge cases**: Empty input, zero alpha, large batches, alternating modes
- **Optimization verification**: Segment count reduction

## Design Decisions

1. **Reusable Pipeline Context**: The `PipelineContext` is designed to be reused across multiple layer renders within a batch, minimizing canvas creation overhead.

2. **Separate Steps**: Each pipeline step is a standalone function, allowing for:
   - Independent testing
   - Future optimization of individual steps
   - Clear separation of concerns

3. **Transform Centering**: Transforms are automatically centered on the image by adding translate to/from center, matching legacy behavior.

4. **Fallback Logic**: Highlight 2 falls back to highlight 1's image and blend mode if not specified, maintaining compatibility with legacy data.

5. **Asset ID System**: Assets are identified by numeric IDs rather than URLs, enabling efficient worker communication without string passing.

6. **Batch Segmentation**: Consecutive layers with combinable composite modes are merged into single segments before transfer to master. This reduces the number of composition operations in the final pass and minimizes ImageBitmap transfers.

## Worker Entry Point

The `render-slave.worker.ts` file provides the Web Worker entry point for the Standard Render Slave. It handles communication with the Master and Asset Manager.

### Worker Message Protocol

```
┌─────────────┐                      ┌─────────────────┐
│   Master    │                      │  Render Slave   │
│             │────── init ─────────▶│     Worker      │
│             │◀── capabilities ─────│                 │
│             │◀───── ready ─────────│                 │
│             │                      │                 │
│             │────── batch ────────▶│                 │
│             │◀───── result ────────│                 │
│             │                      │                 │
│             │────── abort ────────▶│                 │
└─────────────┘                      └─────────────────┘

┌─────────────┐                      ┌─────────────────┐
│   Asset     │                      │  Render Slave   │
│  Manager    │──── asset-data ─────▶│     Worker      │
│             │  (via MessagePort)   │                 │
└─────────────┘                      └─────────────────┘
```

### Message Types

**Master → Slave:**
- `init`: Initialize the worker, triggers capability probe and ready signal
- `batch`: Render a batch of layers with given dimensions
- `abort`: Cancel current rendering operation

**Slave → Master:**
- `capabilities`: Report OffscreenCanvas and WebGL2 support
- `ready`: Signal worker is ready to receive work
- `result`: Return rendered segments with transferable ImageBitmaps
- `error`: Report rendering errors

**Asset Manager → Slave (via MessagePort):**
- `asset-data`: Receive image assets for rendering

### Worker Lifecycle

1. **Initialization**: Master sends `init` message
2. **Capability Probe**: Worker detects OffscreenCanvas and WebGL2 support
3. **Ready Signal**: Worker sends `capabilities` then `ready` messages
4. **Asset Registration**: Master registers slave with Asset Manager, which sends assets via MessagePort
5. **Batch Rendering**: Master sends `batch` messages, worker renders and returns segments
6. **Abort Handling**: Master can send `abort` to cancel in-progress rendering

### Abort Handling

The worker checks the abort flag at multiple points:
- Between each layer render in a batch
- After batch rendering completes
- After batch segmentation completes

If aborted, the worker silently discards partial results without sending an error.

### Result Transfer

Results are sent using `postMessage` with transferable ImageBitmaps to avoid copying:

```typescript
const segments: RenderSegment[] = [...];
const transferables = segments.map(s => s.bitmap);
self.postMessage({ type: 'result', segments }, transferables);
```

### Error Handling

Errors are wrapped in AppError and sent to the master with:
- Error message
- Error code
- Additional context

The worker also handles:
- Global `onerror` events
- Unhandled promise rejections

## Reference Files

- **Legacy Implementation**: `old-src-ref/src/renderer/index.ts` - `drawPimcoStack()` function (lines 120-221)
- **Transform Handling**: `old-src-ref/src/renderer/index.ts` - `derivePlacement()` (lines 1863-1913), `applyTransformSequence()` (lines 1956-1983)
- **Combinable Modes**: `spec.md` - Combinable Composite Modes section
- **Worker Entry Point**: `src/workers/render-slave.worker.ts`
- **Asset Manager Worker**: `src/workers/asset-manager.worker.ts` - Similar worker pattern
