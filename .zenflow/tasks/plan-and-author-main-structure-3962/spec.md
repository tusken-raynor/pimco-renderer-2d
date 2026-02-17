# Technical Specification: Multi-Threaded 2D Product Image Renderer

## Technical Context

### Language & Runtime
- **Language**: TypeScript (strict mode)
- **Runtime**: Browser (Chrome, Firefox, Safari, Edge)
- **Build Tool**: Vite
- **Test Framework**: Vitest (unit/integration), Playwright (E2E)

### Key Dependencies
```json
{
  "devDependencies": {
    "vite": "^5.x",
    "typescript": "^5.x",
    "@typescript-eslint/parser": "^6.x",
    "@typescript-eslint/eslint-plugin": "^6.x",
    "eslint": "^8.x",
    "prettier": "^3.x",
    "vitest": "^1.x",
    "@vitest/ui": "^1.x",
    "playwright": "^1.x"
  },
  "dependencies": {
    "gl-matrix": "^3.x",
    "webgl-postprocessor": "github:choc-sproc/webgl-postprocessor"
  }
}
```

### Browser APIs Used
- **Web Workers**: Multi-threaded rendering
- **OffscreenCanvas**: Worker-based canvas rendering
- **WebGL2**: Shader-based effects pipeline
- **MessagePort/MessageChannel**: Worker communication
- **ImageBitmap**: Efficient image transfer between threads
- **FontFace API**: Font loading for text rendering

---

## Implementation Approach

### Architecture Overview

The renderer follows a Master-Slave architecture with centralized asset management:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Thread                              │
│  ┌─────────────┐                                                 │
│  │   Dev App   │──────┐                                          │
│  └─────────────┘      │                                          │
│                       ▼                                          │
│  ┌─────────────────────────────────────┐                         │
│  │         RenderMaster                │                         │
│  │  - Layer classification             │                         │
│  │  - Asset ID mapping                 │                         │
│  │  - Work distribution                │                         │
│  │  - Final composition                │                         │
│  │  - Abort handling                   │                         │
│  └───────────┬─────────────────────────┘                         │
│              │ MessagePort                                       │
└──────────────┼───────────────────────────────────────────────────┘
               │
     ┌─────────┴─────────┬─────────────────┬─────────────────┐
     ▼                   ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Asset     │   │  Standard   │   │  Standard   │   │    Text     │
│  Manager    │   │   Slave 1   │   │   Slave N   │   │   Slave 1   │
│  (Worker)   │   │  (Worker)   │   │  (Worker)   │   │  (Worker)   │
└─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘
```

### Key Design Decisions

1. **Layer Classification**: Layers are classified at render time based on `mask` field type:
   - String URL → Standard Slave
   - Object (PimcoMaskSubstitutionCompiled) → Text Slave

2. **Asset ID Mapping**: URLs are mapped to numeric IDs by Master before distribution, enabling efficient worker communication without string passing.

3. **Batch Segmentation**: Slaves return segmented results grouped by combinable composite modes, reducing final composition overhead.

4. **Abort-on-Reentry**: When a new render is requested while one is in progress, the current render is aborted and slaves are signaled to discard their work.

5. **Fallback Scenarios**: Six discrete scenarios handle varying browser capabilities without conditional code scattered throughout.

---

## Source Code Structure Changes

### New Directory Structure
```
src/
├── js/
│   ├── renderer/
│   │   ├── index.ts              # RenderMaster class
│   │   ├── master-compositor.ts  # Final composition logic
│   │   ├── capability-probe.ts   # Browser feature detection
│   │   ├── layer-classifier.ts   # Standard vs text classification
│   │   ├── index.test.ts
│   │   └── docs.md
│   ├── render-slave/
│   │   ├── index.ts              # Standard render slave logic
│   │   ├── intra-layer-pipeline.ts
│   │   ├── batch-segmenter.ts
│   │   ├── index.test.ts
│   │   └── docs.md
│   ├── text-render-slave/
│   │   ├── index.ts              # Text render slave logic
│   │   ├── text-rasterizer.ts
│   │   ├── index.test.ts
│   │   └── docs.md
│   ├── asset-manager/
│   │   ├── index.ts              # Asset loading/caching/distribution
│   │   ├── image-loader.ts
│   │   ├── font-loader.ts
│   │   ├── index.test.ts
│   │   └── docs.md
│   ├── effects/
│   │   ├── index.ts              # Effect implementations
│   │   ├── embroidery.ts
│   │   ├── engraving.ts
│   │   ├── metal.ts
│   │   ├── foil.ts
│   │   ├── hotstamp.ts
│   │   ├── painted.ts
│   │   ├── normal.ts
│   │   ├── shadow.ts
│   │   ├── no-effect.ts
│   │   ├── index.test.ts
│   │   └── docs.md
│   ├── types/
│   │   ├── index.ts              # Shared type definitions
│   │   ├── messages.ts           # Worker message types
│   │   ├── pimco.ts              # ProductImageComponent types
│   │   └── docs.md
│   ├── errors/
│   │   ├── index.ts              # AppError classes
│   │   ├── index.test.ts
│   │   └── docs.md
│   └── utils/
│       ├── index.ts              # Shared utilities
│       ├── color.ts              # Color manipulation
│       ├── canvas.ts             # Canvas helpers
│       └── docs.md
├── shaders/
│   ├── alpha-erode.frag.glsl     # Alpha erosion for emboss preprocessing
│   ├── emboss.frag.glsl          # Emboss/deboss convolution effect
│   ├── fuzz.frag.glsl            # Fuzz/blur effect for embroidery
│   ├── normal-map.frag.glsl      # Normal map generation
│   ├── color-scale.frag.glsl     # Color scaling/tinting
│   └── passthrough.vert.glsl     # Default vertex shader
├── workers/
│   ├── render-slave.worker.ts
│   ├── text-render-slave.worker.ts
│   └── asset-manager.worker.ts
├── virtual-slaves.ts             # Main-thread fallback bundle
├── dev-app/
│   ├── index.html
│   ├── main.ts
│   └── styles.css
└── tests/
    ├── integration/
    │   └── docs.md
    └── e2e/
        └── docs.md
```

---

## Data Model / API / Interface Changes

### Type Updates

```typescript
// src/js/types/pimco.ts

// Add compositealpha to ProductImageComponent
export interface ProductImageComponent {
  id: string;
  name: string;
  mode: 'color' | 'image';
  color?: string | string[] | Record<string, string>;
  texture?: string;
  alpha: number;
  blend: BlendMode;
  mask: string | PimcoMaskSubstitutionCompiled;
  image: string;
  order?: number;
  hlimage1?: string;
  hlalpha1?: number;
  hlblend1?: BlendMode;
  hlimage2?: string;
  hlalpha2?: number;
  hlblend2?: BlendMode;
  compositemode?: CanvasCompositeOperation;
  compositealpha?: number;  // NEW: Inter-layer composite opacity
  placement?: ImagePlacementDefinition;
}

// Add shadow to effect types
export type PimcoMaskSubstitutionEffect =
  | 'embroidery'
  | 'engraving'
  | 'metal'
  | 'painted'
  | 'hotstamp'
  | 'foil'
  | 'normal'
  | 'shadow';  // NEW
```

### Message Protocol Types

```typescript
// src/js/types/messages.ts

// Master → Slave
export interface InitMessage {
  type: 'init';
}

export interface BatchMessage {
  type: 'batch';
  layers: LayerDescriptor[];
  width: number;
  height: number;
}

export interface AbortMessage {
  type: 'abort';
}

// Slave → Master
export interface ReadyMessage {
  type: 'ready';
}

export interface CapabilitiesMessage {
  type: 'capabilities';
  offscreenCanvas: boolean;
  webgl2: boolean;
}

export interface ResultMessage {
  type: 'result';
  segments: RenderSegment[];
}

export interface ErrorMessage {
  type: 'error';
  message: string;
}

export interface RenderSegment {
  bitmap: ImageBitmap;
  compositemode: CanvasCompositeOperation;
  compositealpha: number;
}

// Master → Asset Manager
export interface FetchMessage {
  type: 'fetch';
  assets: AssetRequest[];
}

export interface DistributeMessage {
  type: 'distribute';
  deliveries: AssetDelivery[];
}

export interface PreloadMessage {
  type: 'preload';
  assets: AssetRequest[];
}

export interface RegisterSlaveMessage {
  type: 'register-slave';
  slaveId: number;
  port: MessagePort;
}

// Asset Manager → Master
export interface FetchCompleteMessage {
  type: 'fetch-complete';
  failed: number[];
}

export interface DistributeCompleteMessage {
  type: 'distribute-complete';
}

// Supporting types
export interface AssetRequest {
  id: number;
  url: string;
  assetType: 'image' | 'font' | 'mesh';
}

export interface AssetDelivery {
  slaveId: number;
  assetIds: number[];
}

export interface LayerDescriptor {
  id: string;
  assetIds: {
    image: number;
    mask?: number;
    texture?: number;
    hlimage1?: number;
    hlimage2?: number;
  };
  mode: 'color' | 'image';
  color?: string;
  alpha: number;
  blend: BlendMode;
  hlalpha1?: number;
  hlblend1?: BlendMode;
  hlalpha2?: number;
  hlblend2?: BlendMode;
  compositemode: CanvasCompositeOperation;
  compositealpha: number;
  placement?: ImagePlacementDefinition;
  // For text layers only
  maskData?: PimcoMaskSubstitutionCompiled;
}
```

### RenderMaster Public API

```typescript
// src/js/renderer/index.ts

export interface RenderMasterOptions {
  width?: number;
  height?: number;
  slaveCount?: number;
  textSlaveCount?: number;
  mainThreadPort?: MessagePort;
}

export class RenderMaster {
  constructor(options?: RenderMasterOptions);

  /**
   * Render layers to produce a composited ImageBitmap
   * Automatically aborts any in-progress render
   */
  render(
    layers: ProductImageComponent[],
    width: number,
    height: number
  ): Promise<ImageBitmap>;

  /**
   * Preload assets for faster subsequent renders
   */
  preload(urls: string[]): Promise<void>;

  /**
   * Destroy all workers and release resources
   */
  destroy(): void;
}
```

---

## Delivery Phases

### Phase 1: Foundation & Dev App

**Goal**: Establish project infrastructure and basic rendering capability.

**Deliverables**:
1. Project setup with Vite, TypeScript strict mode, ESLint, Prettier, Vitest
2. Type definitions (`src/js/types/`)
3. Error handling infrastructure (`src/js/errors/`)
4. Utility functions (`src/js/utils/`)
5. Dev app with canvas display and JSON upload (`src/dev-app/`)
6. Capability detection (`capability-probe.ts`)
7. Asset Manager worker with image loading only

**Verification**:
- `npm run lint` passes
- `npm run type-check` passes
- Dev app displays uploaded JSON
- Unit tests for types and utilities

### Phase 2: Standard Render Slave

**Goal**: Implement standard layer rendering (URL-based masks).

**Deliverables**:
1. Standard Render Slave worker entry point
2. Intra-layer pipeline (5 steps):
   - Draw base image with placement transforms
   - Apply color/texture with blend mode and alpha
   - Apply highlight 1
   - Apply highlight 2
   - Apply mask (destination-in)
3. Batch segmentation logic
4. RenderMaster coordination for standard layers only
5. Final composition on main thread

**Verification**:
- Renders example1.json correctly
- Unit tests for pipeline steps
- Integration test: JSON → rendered output

### Phase 3: Text Render Slave with Effects

**Goal**: Implement full text layer rendering with all effects (excluding 3D projection).

The `webgl-postprocessor` external dependency (github:choc-sproc/webgl-postprocessor) abstracts WebGL2 boilerplate while this project provides internal GLSL shaders (`src/shaders/`) that implement the effect algorithms. This phase implements the complete text rendering pipeline.

**Deliverables**:
1. Text Render Slave worker entry point
2. Text rasterization with font metrics
3. 2D transform application (translation, rotation, scale)
4. Post-mask application
5. Font loading in Asset Manager
6. RenderMaster text layer routing
7. All effect implementations using webgl-postprocessor:
   - No-effect (tile texture + color multiply + mask)
   - Shadow effect
   - Engraving effect
   - Hotstamp effect
   - Embroidery effect
   - Metal effect
   - Foil effect
   - Painted effect
   - Normal effect (normal map generation)

**Verification**:
- Renders text layers with all effects
- Font loading works
- Each effect matches legacy renderer output
- Unit tests for text rasterization
- Unit tests for effect parameter handling
- Visual comparison tests

### Phase 4: Fallback & Polish

**Goal**: Implement all fallback scenarios and finalize.

**Deliverables**:
1. Virtual slave class (main-thread MessagePort interface)
2. Virtual slave bundle (`virtual-slaves.ts`)
3. Scenarios A-F implementation
4. Software compositor for Scenario F
5. Memory leak audit
6. Performance profiling
7. E2E tests via dev app

**Verification**:
- All 6 scenarios work correctly
- No memory leaks (heap snapshots)
- Performance improvement over single-threaded
- E2E tests pass

### Phase 5: 3D Mesh Projection (Deferred)

**Goal**: Implement 3D mesh projection for text layers.

**Note**: This phase is deferred to a future task and not part of the current scope.

**Deliverables** (future):
1. Mesh loading in Asset Manager (.obj parser)
2. WebGL mesh projection pipeline
3. UV mapping with auto-mode support
4. Perspective and orthographic projection

**Verification** (future):
- Projected text matches legacy output
- Unit tests for mesh parsing
- Integration test with projection layers

---

## Verification Approach

### Unit Tests (Vitest)

Each module folder contains `index.test.ts`:

- **types**: Type guard functions, validation
- **utils**: Color manipulation, canvas helpers
- **errors**: Error class instantiation, context
- **capability-probe**: Mock browser APIs, scenario detection
- **layer-classifier**: Classification logic
- **intra-layer-pipeline**: Each pipeline step
- **batch-segmenter**: Segmentation by composite mode
- **text-rasterizer**: Font metrics, text measurement
- **effects**: Each effect's parameter handling, shader configuration, webgl-postprocessor integration

### Integration Tests

Located in `src/tests/integration/`:

- **render-pipeline.test.ts**: Full render from JSON to ImageBitmap
- **asset-loading.test.ts**: Asset Manager fetch/distribute cycle
- **worker-communication.test.ts**: Message protocol compliance
- **fallback-scenarios.test.ts**: All 6 scenarios

### E2E Tests (Playwright)

Located in `src/tests/e2e/`:

- **dev-app-render.spec.ts**: Upload JSON → render → verify canvas
- **dev-app-errors.spec.ts**: Invalid JSON handling
- **dev-app-timing.spec.ts**: Render timing display

### Lint & Type Check Commands

```json
{
  "scripts": {
    "test": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:unit": "vitest run src/js/**/*.test.ts",
    "test:integration": "vitest run src/tests/integration",
    "test:e2e": "playwright test src/tests/e2e",
    "test:coverage": "vitest run --coverage src/js/**/*.test.ts",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css,md}\"",
    "type-check": "tsc --noEmit",
    "validate": "npm run format && npm run lint && npm run type-check && npm run test"
  }
}
```

### Visual Regression (Manual)

For effect verification:
1. Render with legacy renderer
2. Render with new renderer
3. Visual comparison / pixel diff

---

## Key Implementation Notes

### From Legacy Code Analysis

1. **Canvas Worker Pool Pattern** (`canvas-workers.ts`):
   - Reusable OffscreenCanvas pool with borrowing/release
   - Auto-release timer prevents memory leaks
   - Context reset between uses
   - Will inform our OffscreenCanvas management in workers

2. **Effect Implementation Patterns** (`renderer/index.ts`):
   - All effects follow similar structure: preEffect → draw mask → apply effect → mask result
   - Effects use multiple temporary canvases
   - Emboss effect uses convolution matrix
   - Text height threshold (43.5px) controls emboss application
   - Color brightness affects shadow intensity

3. **WebGL Post-Processor** (external: `github:choc-sproc/webgl-postprocessor`):
   - External dependency abstracts WebGL2 boilerplate (texture management, uniform binding, program compilation, multi-pass rendering)
   - **Shaders are internal to this project** (`src/shaders/*.glsl`) - the library executes them, it does not provide them
   - Usage pattern: Create `WebGLPostProcessor`, upload textures via `setUniforms()`, provide shader source via `fragmentSrc`, render via `to()` or `toFramebuffer()`
   - Multi-pass rendering: `toFramebuffer()` returns `GPUTextureHandle` for chaining passes
   - Programs are created once via `newProgram()` and switched via `useProgram()`
   - `sleep()`/`wake()` pattern for GPU resource management
   - Texture uniforms must be unset via `unsetTextureUniforms()` to free GPU memory
   - Effects module wraps webgl-postprocessor with layer-specific configuration and internal shader sources

4. **3D Projection** (deferred to future task):
   - Uses gl-matrix for matrix operations
   - Mesh data stored as interleaved Float32Array
   - Program caching by identifier
   - UV auto-mode for dynamic texture mapping
   - Not included in current scope

### Combinable Composite Modes

The following modes can be batched together in a single segment:
- `source-over`
- `screen`
- `lighten`
- `lighter`

All other modes require standalone segments to preserve correct visual output.

### Abort Handling

When `render()` is called while a render is in progress:
1. Set abort flag on Master
2. Send `abort` message to all active slaves
3. Slaves check abort flag between layer renders
4. Discard partial results
5. Start new render immediately
