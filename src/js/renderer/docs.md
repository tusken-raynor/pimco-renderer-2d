# Renderer Module

## Purpose

The renderer module is responsible for orchestrating the multi-threaded 2D compositing pipeline. It coordinates Web Workers (standard render slaves, text render slaves, and asset manager) to process layers and produce a final composited `ImageBitmap`.

This module also handles browser capability detection to determine the appropriate fallback scenario for different browser environments.

## How It Works

### Capability Detection (`capability-probe.ts`)

The capability probe detects browser support for critical APIs:

1. **OffscreenCanvas**: Required for rendering in Web Workers
2. **WebGL2**: Required for shader-based text effects

Based on these capabilities and the execution context (main thread vs worker), the probe determines one of six fallback scenarios:

| Scenario | Master      | OffscreenCanvas | WebGL2 | Std Slaves | Text Slaves | Composition          |
| -------- | ----------- | --------------- | ------ | ---------- | ----------- | -------------------- |
| A        | main thread | Yes             | Yes    | workers    | workers     | Canvas               |
| B        | main thread | Yes             | No     | workers    | virtual     | Canvas               |
| C        | main thread | No              | -      | virtual    | virtual     | Canvas               |
| D        | worker      | Yes             | Yes    | workers    | workers     | OffscreenCanvas      |
| E        | worker      | Yes             | No     | workers    | virtual     | OffscreenCanvas      |
| F        | worker      | No              | -      | virtual    | virtual     | Software (ImageData) |

**Key Points:**

- Without OffscreenCanvas, all slaves run as "virtual" (on the main thread)
- Without WebGL2, text slaves cannot use shader effects and fall back to virtual
- In worker context without OffscreenCanvas, software composition is used

### Detection Algorithm

```
1. Detect OffscreenCanvas
   - Check if constructor exists
   - Try creating a 1x1 OffscreenCanvas
   - Try getting a 2D context

2. Detect WebGL2
   - If OffscreenCanvas available: create one and try getContext('webgl2')
   - Otherwise (main thread only): create HTMLCanvasElement and try getContext('webgl2')
   - In worker without OffscreenCanvas: conservatively return false

3. Detect Execution Context
   - Worker: window is undefined, self is defined
   - Main thread: window is defined

4. Determine Scenario
   - Based on context + capabilities, select scenario A-F
```

## Interface

### `capability-probe.ts`

```typescript
// Full capability probe (auto-detects context)
probeCapabilities(): CapabilityResult

// Probe with context override (for determining slave scenarios from master)
probeCapabilitiesForContext(contextOverride: ExecutionContext): CapabilityResult

// Individual detection functions
detectCapabilities(): { offscreenCanvas: boolean; webgl2: boolean }
detectOffscreenCanvas(): boolean
detectWebGL2(offscreenCanvasAvailable: boolean): boolean
detectExecutionContext(): ExecutionContext
determineScenario(context: ExecutionContext, offscreenCanvas: boolean, webgl2: boolean): FallbackScenario
```

### Types

```typescript
type ExecutionContext = 'main-thread' | 'worker';

interface CapabilityResult {
  offscreenCanvas: boolean;
  webgl2: boolean;
  scenario: FallbackScenario;
}

type FallbackScenario = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
```

### Example Usage

```typescript
import { probeCapabilities, probeCapabilitiesForContext } from './capability-probe';

// In main thread, determine local capabilities
const result = probeCapabilities();
console.log(`Scenario: ${result.scenario}`);
// => "A" if OffscreenCanvas + WebGL2 supported

// Determine what scenario slaves will use (they run in workers)
const slaveResult = probeCapabilitiesForContext('worker');
console.log(`Slave scenario: ${slaveResult.scenario}`);
// => "D" if workers have OffscreenCanvas + WebGL2
```

## Tests

Unit tests in `capability-probe.test.ts` cover:

1. **All 6 scenarios**: Tests `determineScenario()` with all combinations
2. **OffscreenCanvas detection**:
   - Undefined constructor
   - Constructor that works
   - Constructor that throws
   - getContext returns null
3. **WebGL2 detection**:
   - Via OffscreenCanvas
   - Via HTMLCanvasElement fallback
   - When neither is available
   - When context creation throws
4. **Execution context detection**:
   - Main thread (window defined)
   - Worker (window undefined, self defined)
5. **Integration**: `probeCapabilities()` and `probeCapabilitiesForContext()`

Edge cases:

- Safari-like environments where OffscreenCanvas exists but throws
- Environments with OffscreenCanvas but no WebGL2
- Worker environments without OffscreenCanvas (scenario F)

---

### Layer Classification (`layer-classifier.ts`)

The layer classifier determines how each layer should be rendered based on its `mask` field type:

| Mask Type                              | Layer Type | Renderer          | Description                                  |
| -------------------------------------- | ---------- | ----------------- | -------------------------------------------- |
| String (URL)                           | Standard   | Standard Slave    | Uses image mask for compositing              |
| Object (PimcoMaskSubstitutionCompiled) | Text       | Text Render Slave | Uses effect pipeline with text rasterization |

**Classification Logic:**

```
1. Examine the `mask` field of each ProductImageComponent
2. If typeof mask === 'string' → Standard layer
3. If typeof mask === 'object' → Text layer
4. For text layers, extract effect type from mask.effect
5. Return classification with original indices preserved
```

**Key Points:**

- Classification is deterministic based solely on the `mask` field type
- Original layer order and indices are preserved for correct composition
- Text layers may or may not have an effect specified (no effect = basic text rendering)
- Empty string masks are valid standard layers

### Interface

### `layer-classifier.ts`

```typescript
// Classify a single layer
classifyLayer(layer: ProductImageComponent, index: number): LayerClassification

// Classify all layers with grouping
classifyLayers(layers: ProductImageComponent[]): ClassificationResult

// Type checks
isStandardLayer(layer: ProductImageComponent): boolean
isTextLayer(layer: ProductImageComponent): boolean

// Property accessors
getLayerEffect(layer: ProductImageComponent): PimcoMaskSubstitutionEffect | undefined
getMaskUrl(layer: ProductImageComponent): string | undefined
getMaskData(layer: ProductImageComponent): PimcoMaskSubstitutionCompiled | undefined

// Filtering utilities
filterStandardLayers(layers: ProductImageComponent[]): (ProductImageComponent & { mask: string })[]
filterTextLayers(layers: ProductImageComponent[]): (ProductImageComponent & { mask: PimcoMaskSubstitutionCompiled })[]
```

### Types

```typescript
type LayerType = 'standard' | 'text';

interface LayerClassification {
  type: LayerType;
  index: number; // Original index in layer array
  layer: ProductImageComponent; // Reference to original layer
  effect?: PimcoMaskSubstitutionEffect; // For text layers only
  maskData?: PimcoMaskSubstitutionCompiled; // For text layers only
  maskUrl?: string; // For standard layers only
}

interface ClassificationResult {
  all: LayerClassification[]; // All classifications in order
  standard: LayerClassification[]; // Standard layers only
  text: LayerClassification[]; // Text layers only
  total: number;
  standardCount: number;
  textCount: number;
}
```

### Example Usage

```typescript
import { classifyLayers, isTextLayer, getLayerEffect } from './layer-classifier';

const layers = [
  { id: 'bg', mask: '/masks/bg.png', ... },                    // Standard
  { id: 'logo', mask: { content: 'ACME', effect: 'embroidery' }, ... },  // Text
  { id: 'overlay', mask: '/masks/overlay.png', ... },          // Standard
];

const result = classifyLayers(layers);

console.log(result.standardCount);  // 2
console.log(result.textCount);      // 1
console.log(result.text[0].effect); // 'embroidery'
console.log(result.text[0].index);  // 1 (original position)

// Quick type checks
if (isTextLayer(layers[1])) {
  const effect = getLayerEffect(layers[1]);
  console.log(effect);  // 'embroidery'
}
```

## Tests

Unit tests in `layer-classifier.test.ts` cover:

1. **Single layer classification**:
   - Standard layers with string masks
   - Text layers with object masks
   - Text layers with all effect types
   - Edge cases (empty masks, no effect)

2. **Batch classification**:
   - Empty arrays
   - All standard layers
   - All text layers
   - Mixed layer types
   - Index preservation

3. **Type check functions**:
   - `isStandardLayer()` and `isTextLayer()` correctness

4. **Property accessors**:
   - `getLayerEffect()`, `getMaskUrl()`, `getMaskData()`
   - Undefined returns for wrong layer types

5. **Filter functions**:
   - `filterStandardLayers()` and `filterTextLayers()`
   - Correct type narrowing

6. **Edge cases**:
   - Complex mask data with all optional fields
   - Large numbers of layers (100+)
   - Layers with all optional ProductImageComponent fields

---

## RenderMaster (`index.ts`)

The RenderMaster is the orchestrator of the multi-threaded rendering pipeline. It coordinates Web Workers (Asset Manager, Standard Slaves, and Text Slaves) to process layers and produce a final composited `ImageBitmap`.

### Responsibilities

- Spawn and manage Web Workers
- Perform capability detection on initialization
- Maintain URL-to-numeric-ID asset mapping
- Classify layers (standard vs text)
- Distribute work to slaves
- Collect and compose final output via MasterCompositor
- Handle abort-on-reentry (cancel in-progress render when new render requested)

### Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                           RenderMaster                                │
│                                                                       │
│  ┌──────────────┐                                                    │
│  │    Asset     │                                                    │
│  │   Manager    │                                                    │
│  │   Worker     │                                                    │
│  └───────┬──────┘                                                    │
│          │                                                           │
│          │ MessageChannel (per slave)                                │
│          │                                                           │
│  ┌───────┴────────────────────────────────────────────────────────┐ │
│  │                                                                 │ │
│  │  ┌────────────────────────────────┐  ┌───────────────────────┐ │ │
│  │  │      Standard Slaves           │  │     Text Slaves       │ │ │
│  │  │  ┌──────┐ ┌──────┐ ┌──────┐   │  │  ┌──────┐ ┌──────┐   │ │ │
│  │  │  │Std 1 │ │Std 2 │ │Std N │   │  │  │Text 1│ │Text 2│   │ │ │
│  │  │  └──────┘ └──────┘ └──────┘   │  │  └──────┘ └──────┘   │ │ │
│  │  │  (string mask layers)         │  │  (object mask layers) │ │ │
│  │  └────────────────────────────────┘  └───────────────────────┘ │ │
│  │                                                                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                    │                                  │
│                                    ▼                                  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                      MasterCompositor                            │ │
│  │  - Collects results from standard AND text slaves                │ │
│  │  - Sorts layers by original index (maintains layer order)        │ │
│  │  - Applies compositealpha per segment                            │ │
│  │  - Produces final ImageBitmap                                    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Layer Routing

Layers are classified and routed to the appropriate slave type:

- **Standard Layers** (mask is a string URL): Routed to standard render slaves
- **Text Layers** (mask is a PimcoMaskSubstitutionCompiled object): Routed to text render slaves

Both layer types are distributed round-robin across their respective slave pools.

### Public API

```typescript
class RenderMaster {
  constructor(options?: RenderMasterOptions);

  // Main render method - returns composited ImageBitmap
  render(layers: ProductImageComponent[], width?: number, height?: number): Promise<ImageBitmap>;

  // Preload assets for faster subsequent renders
  preload(urls: string[]): Promise<void>;

  // Get the detected fallback scenario
  getScenario(): FallbackScenario;

  // Get detected capabilities
  getCapabilities(): { offscreenCanvas: boolean; webgl2: boolean; scenario: FallbackScenario };

  // Get the number of active standard slaves
  getSlaveCount(): number;

  // Get the number of active text slaves
  getTextSlaveCount(): number;

  // Cleanup all workers and resources
  destroy(): void;
}

interface RenderMasterOptions {
  width?: number; // Default output width (1024)
  height?: number; // Default output height (1024)
  slaveCount?: number; // Number of standard slaves (navigator.hardwareConcurrency)
  textSlaveCount?: number; // Number of text slaves (2)
}
```

### Render Flow

1. **Initialization**: Spawn Asset Manager, Standard Slaves, and Text Slaves based on capability detection
2. **Layer Classification**: Classify layers as standard (string mask) or text (object mask)
3. **Asset Extraction**: Extract all unique URLs from layers (images, masks, textures, highlights, postmasks)
4. **Asset Fetching**: Send fetch request to Asset Manager, wait for completion
5. **Asset Distribution**: Distribute assets to both standard and text slaves
6. **Work Distribution**: Distribute standard layers to standard slaves and text layers to text slaves (round-robin)
7. **Batch Rendering**: Send batch messages to all slaves in parallel, collect results
8. **Final Composition**: Use MasterCompositor to compose results from both slave types in correct order
9. **Cleanup**: Close segment bitmaps after composition

### Abort Handling

The RenderMaster supports abort-on-reentry:

- If `render()` is called while a previous render is in progress, the previous render is aborted
- Both standard and text slaves receive abort messages and cancel their current work
- The pending promise is rejected with an `AbortError`

### Example Usage

```typescript
import { RenderMaster } from './renderer';

// Create render master
const master = new RenderMaster({
  width: 1920,
  height: 1080,
  slaveCount: 4,
});

// Render layers
const layers = [
  {
    id: 'bg',
    mode: 'image',
    alpha: 1,
    blend: 'normal',
    mask: '/masks/bg.png',
    image: '/images/bg.png',
  },
  {
    id: 'logo',
    mode: 'color',
    alpha: 0.8,
    blend: 'multiply',
    mask: '/masks/logo.png',
    image: '/images/logo.png',
    color: '#ff0000',
  },
];

const bitmap = await master.render(layers);

// Use the bitmap (draw to canvas, etc.)
const canvas = document.getElementById('output') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
ctx.drawImage(bitmap, 0, 0);

// Cleanup when done
master.destroy();
```

---

## MasterCompositor (`master-compositor.ts`)

The MasterCompositor handles final composition of render segments received from slaves.

### Responsibilities

- Compose segments in correct order (sorted by originalIndex)
- Apply composite operations and alpha values per segment
- Produce final `ImageBitmap` output
- Manage reusable canvas context for efficiency

### Interface

```typescript
// Functional API
function composeSegments(
  segments: RenderSegment[],
  width: number,
  height: number
): Promise<ImageBitmap>;
function composeOrderedLayers(
  layers: ComposedLayer[],
  width: number,
  height: number
): Promise<ImageBitmap>;
function composeSlaveResults(
  slaveResults: Map<number, ComposedLayer[]>,
  width: number,
  height: number
): Promise<ImageBitmap>;
function closeSegments(segments: RenderSegment[]): void;

// Context management
function createCompositorContext(width: number, height: number): CompositorContext;
function ensureCompositorContext(
  ctx: CompositorContext | null,
  width: number,
  height: number
): CompositorContext;

// Class API (recommended for repeated compositions)
class MasterCompositor {
  compose(segments: RenderSegment[], width: number, height: number): Promise<ImageBitmap>;
  composeOrdered(layers: ComposedLayer[], width: number, height: number): Promise<ImageBitmap>;
  destroy(): void;
}

// Types
interface ComposedLayer {
  segment: RenderSegment;
  originalIndex: number;
}

interface CompositorContext {
  canvas: AnyCanvas;
  ctx: Canvas2DContext;
  width: number;
  height: number;
}
```

### Composition Logic

1. Sort layers by `originalIndex` (ascending)
2. For each segment:
   - Set `globalCompositeOperation` to segment's `compositemode`
   - Set `globalAlpha` to segment's `compositealpha`
   - Draw segment's `bitmap` to canvas
3. Reset context state
4. Convert canvas to `ImageBitmap`

### Memory Management

- Call `closeSegments()` after composition to free ImageBitmap resources
- The `MasterCompositor.destroy()` method releases internal canvas resources
- Segments with already-closed bitmaps are handled gracefully

---

## SoftwareCompositor (`software-compositor.ts`)

The SoftwareCompositor provides ImageData-based composition for Scenario F, where neither OffscreenCanvas nor Canvas is available (worker context without OffscreenCanvas support).

### Purpose

In Scenario F, the renderer runs in a worker context without OffscreenCanvas support. Since canvas APIs are unavailable, composition must be performed entirely in software using pixel buffer operations.

### How It Works

1. **Pixel Buffers**: Uses Float32Array for precision during blending calculations
2. **Blend Operations**: Implements all Canvas composite operations in software
3. **Conversion**: Converts between ImageBitmap, PixelBuffer, and ImageData

### Supported Blend Operations

| Category    | Operations                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Porter-Duff | `source-over`, `source-in`, `source-out`, `source-atop`, `destination-over`, `destination-in`, `destination-out`, `destination-atop`, `copy`, `xor` |
| Blend Modes | `multiply`, `screen`, `overlay`, `darken`, `lighten`, `lighter`, `color-dodge`, `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion` |

### Interface

```typescript
// Pixel buffer for software composition
interface PixelBuffer {
  data: Float32Array; // RGBA values normalized to 0-1
  width: number;
  height: number;
}

// Create an empty pixel buffer
function createPixelBuffer(width: number, height: number): PixelBuffer;

// Convert ImageBitmap to pixel buffer
function imageBitmapToPixelBuffer(
  bitmap: ImageBitmap,
  targetWidth: number,
  targetHeight: number
): PixelBuffer;

// Convert pixel buffer to ImageBitmap
function pixelBufferToImageBitmap(buffer: PixelBuffer): Promise<ImageBitmap>;

// Blend source buffer onto destination
function blendBuffers(
  dst: PixelBuffer,
  src: PixelBuffer,
  operation: CanvasCompositeOperation,
  alpha: number
): void;

// Compose segments using software blending
function composeSoftware(
  segments: RenderSegment[],
  width: number,
  height: number
): Promise<ImageBitmap>;

// Class API for managed composition
class SoftwareCompositor {
  compose(segments: RenderSegment[], width: number, height: number): Promise<ImageBitmap>;
  destroy(): void;
}
```

### Usage

```typescript
import { SoftwareCompositor } from './software-compositor';

const compositor = new SoftwareCompositor();

// Compose segments
const result = await compositor.compose(segments, 1024, 1024);

// Cleanup
compositor.destroy();
```

### Performance Considerations

The software compositor is significantly slower than canvas-based composition because:

1. Every pixel is processed in JavaScript
2. No GPU acceleration
3. ImageBitmap extraction requires a temporary canvas when available

This is a fallback path for browsers with very limited support. Modern browsers should use Scenarios A-E with canvas-based composition.

---

## Tests

Unit tests in `index.test.ts` cover:

1. **MasterCompositor**:
   - Context creation with correct dimensions
   - Context reuse for same dimensions
   - New context creation for different dimensions
   - Empty segment composition
   - Single and multiple segment composition
   - Layer ordering and sorting
   - Slave result aggregation
   - Bitmap cleanup

2. **RenderMaster Concepts**:
   - Color resolution (string, array, record)
   - Asset ID mapping (unique IDs, URL-to-ID and ID-to-URL)
   - Layer classification (standard vs text)
   - Round-robin layer distribution
   - Abort controller behavior
   - Capability detection scenarios

3. **Error Handling**:
   - AbortError creation and properties
   - WorkerError handling

Unit tests in `software-compositor.test.ts` cover:

1. **Pixel Buffer Operations**:
   - Buffer creation with correct dimensions
   - Initialization to transparent black
   - Float-to-byte conversion with clamping

2. **Blend Operations**:
   - Source-over (Porter-Duff)
   - Multiply, screen, overlay blend modes
   - Darken, lighten, lighter modes
   - Color-dodge, color-burn modes
   - Hard-light, soft-light modes
   - Difference, exclusion modes
   - Porter-Duff composites (source-in, destination-in, xor, etc.)

3. **SoftwareCompositor Class**:
   - Buffer reuse for same dimensions
   - Buffer recreation for different dimensions
   - Multi-segment composition
   - Resource cleanup

---

## Memory Management

The renderer implements careful memory management to prevent leaks, particularly for GPU-backed resources like `ImageBitmap` objects.

### ImageBitmap Lifecycle

ImageBitmaps are GPU-accelerated image objects that must be explicitly closed to release memory:

1. **Asset Manager**: Images are loaded as ImageBitmaps and transferred to slaves
2. **Render Slaves**: Close ImageBitmaps in `clearAssets()` using `bitmap.close()`
3. **Text Render Slaves**: Same pattern, with additional handling for font ArrayBuffers
4. **MasterCompositor**: Close segment bitmaps after composition with `closeSegments()`

### Resource Cleanup

The `RenderMaster.destroy()` method performs comprehensive cleanup:

```typescript
destroy(): void {
  // 1. Abort any pending render
  // 2. Terminate workers (standard + text slaves)
  // 3. Close all MessageChannel ports
  // 4. Destroy compositors
  // 5. Clean up WebGL resources (destroyWebGLBuddy())
  // 6. Clear asset mapping caches
}
```

### Worker Cleanup

Worker entry points (`render-slave.worker.ts`, `text-render-slave.worker.ts`) include cleanup handlers:

- Destroy RenderSlave/TextRenderSlave instances
- Close asset ports
- Handle `beforeunload` event (if supported)

### WebGL Resources

The effects module manages a singleton WebGLPostProcessor. Call `destroyWebGLBuddy()` when shutting down to release GPU resources.

---

## Performance Characteristics

### Architecture Performance Benefits

1. **Multi-threaded Rendering**: Layer rendering is parallelized across Web Workers
   - Standard slaves: Process image-based layers
   - Text slaves: Process text/effect layers
   - Asset Manager: Handles image loading in background

2. **Batch Segmentation**: Consecutive layers with combinable blend modes are merged
   - Combinable modes: `source-over`, `screen`, `lighten`, `lighter`
   - Reduces composition operations and data transfer

3. **Asset Caching**: URL-to-ID mapping prevents redundant asset loading
   - Images fetched once, distributed to all slaves via `MessagePort`
   - Uses `structuredClone` for efficient ImageBitmap transfer

### Hot Paths and Optimizations

| Hot Path          | Optimization Applied                                     |
| ----------------- | -------------------------------------------------------- |
| Layer rendering   | Pipeline context reuse (`createPipelineContext`)         |
| Batch composition | Segmentation context reuse (`createSegmentationContext`) |
| Asset transfer    | Transferable objects (no copy)                           |
| Text measurement  | Single temporary canvas per measurement                  |
| WebGL effects     | Shader program reuse (`hasProgram`/`useProgram`)         |
| Final composition | Canvas context reuse (`MasterCompositor`)                |

### Memory Efficiency

1. **Canvas Reuse**: Pipeline and segmentation contexts are created once per batch, not per layer
2. **ImageBitmap Transfer**: Uses `transfer` option to move ownership without copying
3. **Explicit Cleanup**: `ImageBitmap.close()` calls release GPU memory immediately
4. **Lazy WebGL Initialization**: WebGL context created only when effects are needed

### Recommended Usage Patterns

```typescript
// ✅ Good: Reuse RenderMaster across renders
const master = new RenderMaster();
await master.render(layers1);
await master.render(layers2);
master.destroy(); // Clean up when done

// ❌ Bad: Create new RenderMaster per render
const master1 = new RenderMaster();
await master1.render(layers1);
master1.destroy();
const master2 = new RenderMaster(); // Wasteful!
await master2.render(layers2);
master2.destroy();
```

### Performance Tuning

Configure RenderMaster options based on workload:

```typescript
const master = new RenderMaster({
  slaveCount: navigator.hardwareConcurrency, // Default: use all cores
  textSlaveCount: 2, // Default: 2 for text/effect layers
});
```

- **Many image layers**: Increase `slaveCount`
- **Many text/effect layers**: Increase `textSlaveCount`
- **Memory-constrained**: Reduce slave counts (fewer workers = less memory)

### Profiling Tips

1. Use browser DevTools Performance tab to analyze worker activity
2. Monitor memory with DevTools Memory tab - watch for ImageBitmap leaks
3. Check WebGL inspector for texture memory usage
4. Use `console.time()` around `render()` calls to measure end-to-end latency

### Benchmark Metrics

When profiling, consider these key metrics:

- **Asset Load Time**: Time to fetch and convert images to ImageBitmap
- **Layer Render Time**: Time for slaves to process their assigned layers
- **Composition Time**: Time for MasterCompositor to produce final output
- **Transfer Overhead**: Time spent transferring data between workers
- **Memory Peak**: Maximum memory usage during render (includes all ImageBitmaps)
