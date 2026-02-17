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

| Mask Type                        | Layer Type | Renderer            | Description                              |
| -------------------------------- | ---------- | ------------------- | ---------------------------------------- |
| String (URL)                     | Standard   | Standard Slave      | Uses image mask for compositing          |
| Object (PimcoMaskSubstitutionCompiled) | Text       | Text Render Slave   | Uses effect pipeline with text rasterization |

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
  index: number;                              // Original index in layer array
  layer: ProductImageComponent;               // Reference to original layer
  effect?: PimcoMaskSubstitutionEffect;      // For text layers only
  maskData?: PimcoMaskSubstitutionCompiled;  // For text layers only
  maskUrl?: string;                           // For standard layers only
}

interface ClassificationResult {
  all: LayerClassification[];      // All classifications in order
  standard: LayerClassification[]; // Standard layers only
  text: LayerClassification[];     // Text layers only
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
