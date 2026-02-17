# Product Requirements Document: Multi-Threaded 2D Product Image Renderer

## Overview

Build a multi-threaded 2D compositing renderer module that processes an ordered array of `ProductImageComponent` objects ("pimcos") and produces a single composited `ImageBitmap`. The renderer runs in the browser using Web Workers, OffscreenCanvas, and WebGL2, replacing a legacy single-threaded renderer.

Additionally, build a lightweight dev app to facilitate testing the renderer with uploaded JSON configuration files.

---

## Goals

1. **Performance**: Leverage multi-threading via Web Workers to parallelize rendering of independent layers
2. **Compatibility**: Graceful fallback for browsers lacking OffscreenCanvas or WebGL2 support
3. **Modularity**: Clean separation between orchestration (Master), standard layer rendering (Slaves), text/effect rendering (Text Slaves), and asset management
4. **Testability**: A simple dev app for manually testing rendering with JSON input

---

## Non-Goals

- No WASM dependencies (pure JavaScript/TypeScript and WebGL)
- No framework for the dev app (vanilla JS/TS only)
- No pixel displacement feature (mask.displace is ignored)
- No SVG path-based text rendering (mask.type.path is scrapped)

---

## System Components

### 1. Render Master

The orchestrator that coordinates the rendering pipeline.

**Responsibilities:**
- Spawn and manage Web Workers (Asset Manager, Standard Slaves, Text Slaves)
- Perform capability detection (OffscreenCanvas, WebGL2 availability)
- Maintain URL-to-numeric-ID asset mapping
- Classify layers (standard vs text)
- Distribute work to slaves
- Collect and compose final output
- Handle abort-on-reentry (cancel in-progress render when new render requested)

**API:**
```ts
class RenderMaster {
  constructor(options: {
    width?: number;
    height?: number;
    slaveCount?: number;
    textSlaveCount?: number;
    mainThreadPort?: MessagePort;
  });
  render(layers: ProductImageComponent[], width: number, height: number): Promise<ImageBitmap>;
  preload(urls: string[]): Promise<void>;
  destroy(): void;
}
```

### 2. Standard Render Slaves

Process conventional image layers (where `mask` is a URL string).

**Intra-Layer Pipeline:**
1. Draw base image with optional placement transforms
2. Apply color/texture with blend mode and alpha
3. Apply highlight 1 (if defined)
4. Apply highlight 2 (if defined)
5. Apply mask (destination-in composite)

**Output:**
- Segmented `ImageBitmap` results with composite mode and alpha metadata
- Combinable modes (source-over, screen, lighten, lighter) are batched together
- Non-combinable modes produce standalone bitmaps

### 3. Text Render Slaves

Process text/effect layers (where `mask` is a `PimcoMaskSubstitutionCompiled` object).

**Pipeline:**
1. **Text Rasterization**: Render text to canvas using font properties
2. **Effect Application**: Apply shader-based effects via WebGLPostProcessor
3. **Transform/Projection**: Apply 2D transform OR 3D mesh projection
4. **Post-Mask**: Apply optional postmask (destination-in)

**Supported Effects:**
| Effect | Description |
|--------|-------------|
| embroidery | Alpha erode, tile texture, color multiply, emboss, fuzz, mask, shadow |
| engraving | Emboss shadow, color-distance opacity, multiply, mask |
| metal | Dual emboss, tile texture, color multiply, mask |
| foil | Alpha erode, tile texture, color blend, dual emboss, shrink mask, shadow |
| hotstamp | Dual emboss, color-distance opacity, multiply, mask |
| painted | Edge expand, dual emboss, inset shrink, tile texture, color blend, mask |
| normal | Roundness blur, color scale, normal map, directional lighting |
| shadow | Spread, white-to-alpha, color fill, blur, multi-pass alpha |
| (none) | Tile texture, color multiply, mask |

### 4. Asset Manager

Centralized asset loading, caching, and distribution. Always runs in its own Web Worker.

**Asset Types:**
| Type | Loading | Cache Format | Distribution |
|------|---------|--------------|--------------|
| Images | fetch → createImageBitmap | ImageBitmap | GPU Mode or Pool Mode |
| Fonts | fetch → ArrayBuffer | ArrayBuffer | Sent once per text slave |
| Meshes | fetch → parse .obj | ArrayBuffer | Sent once per text slave |

**Distribution Modes:**
- **GPU Mode**: Copy ImageBitmap handle (nearly free)
- **Pool Mode**: Create transferable clones with TTL

---

## Input Data

The renderer accepts `ProductImageComponent[]` sorted by `order` field (ascending = back to front).

**Key Fields:**
- `id`, `name`: Identification
- `mode`: "color" | "image"
- `color`, `texture`: Color or texture URL
- `alpha`, `blend`: Intra-layer blend settings
- `mask`: URL string (standard layer) OR PimcoMaskSubstitutionCompiled object (text layer)
- `image`: Base image URL
- `hlimage1`, `hlalpha1`, `hlblend1`: Highlight layer 1
- `hlimage2`, `hlalpha2`, `hlblend2`: Highlight layer 2
- `compositemode`: Inter-layer composite operation (default: source-over)
- `compositealpha`: Inter-layer composite opacity (default: 1.0) — **NEW FIELD**
- `placement`: Optional placement/transform definition

**Type Updates Required:**
- Add `compositealpha?: number` to `ProductImageComponent`
- Add `"shadow"` to `PimcoMaskSubstitutionEffect` union type

---

## Fallback Scenarios

Six discrete scenarios based on Master location and browser capabilities:

| Scenario | Master | OffscreenCanvas | WebGL2 | Std Slaves | Text Slaves | Composition |
|----------|--------|-----------------|--------|------------|-------------|-------------|
| A | main thread | ✅ | ✅ | workers | workers | Canvas |
| B | main thread | ✅ | ❌ | workers | virtual | Canvas |
| C | main thread | ❌ | — | virtual | virtual | Canvas |
| D | worker | ✅ | ✅ | workers | workers | OffscreenCanvas |
| E | worker | ✅ | ❌ | workers | virtual | OffscreenCanvas |
| F | worker | ❌ | — | virtual | virtual | Software (ImageData) |

**Virtual Slaves:**
- Use HTMLCanvasElement instead of OffscreenCanvas
- Same MessagePort interface as real workers
- Built as separate entry point (virtual-slaves.ts)

---

## Dev App Requirements

A lightweight, framework-free application for testing the renderer.

### Features

1. **Canvas Display**
   - HTML canvas element in bitmap rendering mode
   - Configurable dimensions (match render output size)

2. **JSON Upload**
   - File input to upload JSON containing pimco layer data
   - Support for example1.json, example2.json, example3.json formats

3. **Manual Editing**
   - JSON can be edited externally before rendering
   - No in-app editor required (use external text editor)

4. **Render Controls**
   - Button to trigger render with current JSON
   - Display rendered ImageBitmap on canvas

5. **Debug Output**
   - Console logging for render timing
   - Error display for failed renders

### Technology

- Vanilla HTML/CSS/TypeScript
- No frameworks (React, Vue, etc.)
- Vite for development server and bundling
- Minimal UI — exists only to facilitate renderer testing

### File Structure

```
src/
  dev-app/
    index.html
    main.ts
    styles.css
```

---

## Message Protocol

All inter-component communication uses typed messages with a `type` field.

### Master ↔ Slave Messages

```ts
// Master → Slave
{ type: "init" }
{ type: "batch", layers: LayerDescriptor[], width: number, height: number }
{ type: "abort" }

// Slave → Master
{ type: "ready" }
{ type: "capabilities", offscreenCanvas: boolean, webgl2: boolean }
{ type: "result", segments: Array<{ bitmap: ImageBitmap, compositemode: string, compositealpha: number }> }
{ type: "error", message: string }
```

### Master ↔ Asset Manager Messages

```ts
// Master → AssetManager
{ type: "fetch", assets: Array<{ id: number, url: string, assetType: string }> }
{ type: "distribute", deliveries: Array<{ slaveId: number, assetIds: number[] }> }
{ type: "preload", assets: Array<{ id: number, url: string }> }
{ type: "register-slave", slaveId: number, port: MessagePort }

// AssetManager → Master
{ type: "fetch-complete", failed: number[] }
{ type: "distribute-complete" }
```

---

## Build Configuration

Multiple entry points for the bundler:

**Worker Entry Points:**
- `render-slave.worker.ts` — Standard Render Slave
- `text-render-slave.worker.ts` — Text Render Slave
- `asset-manager.worker.ts` — Asset Manager

**Virtual Slave Bundle:**
- `virtual-slaves.ts` — Isolated entry for main-thread fallback

**Dev App:**
- `dev-app/index.html` — Dev app entry point

---

## Implementation Phases

### Phase 1: Foundation
- Type definitions (update ProductImageComponent, add message types)
- Asset Manager worker
- Render Master class (spawning, probing, asset ID mapping, abort logic)
- Environment detection

### Phase 2: Standard Render Slave
- Capability probe
- Intra-layer pipeline (5 steps)
- Batch segmentation
- Asset reception sync
- Worker entry point

### Phase 3: Text Render Slave
- Text rasterization with font metrics
- 2D transform path
- 3D mesh projection (deferred if needed)
- Post-mask application
- No-effect fallback path

### Phase 4: Effect Shaders
- WebGLPostProcessor integration
- Shader chains for each effect (order by complexity):
  1. no-effect
  2. shadow
  3. engraving
  4. hotstamp
  5. embroidery
  6. metal
  7. foil
  8. painted
  9. normal

### Phase 5: Fallback & Polish
- Virtual slave class
- Virtual slave bundle
- Scenarios A-F implementation
- Software compositor (Scenario F)
- Performance tuning
- Memory leak audit

### Dev App (Parallel Track)
- Can be built alongside Phase 1-2
- Canvas setup with JSON upload
- Render button integration

---

## Success Criteria

1. **Functional**: Renderer produces identical output to legacy renderer for test JSON files
2. **Performance**: Multi-threaded path shows measurable improvement over single-threaded fallback
3. **Compatibility**: All 6 fallback scenarios work correctly
4. **Testable**: Dev app successfully renders example JSON files
5. **Type-Safe**: Full TypeScript coverage with strict mode, no `any` types

---

## Reference Files

From the legacy codebase (`old-src-ref/`):

- `types.ts` — Type definitions
- `renderer/index.ts` — Legacy rendering pipeline, effect functions, transforms, projection
- `renderer/canvas-workers.ts` — Canvas pool pattern (inform OffscreenCanvas management)
- `effects/index.ts` — Effect utilities (emboss, tile, color manipulation)
- `example1.json`, `example2.json`, `example3.json` — Test data

---

## Assumptions

1. Modern browsers are the primary target (Chrome, Firefox, Safari, Edge)
2. WebGL2 is preferred but not required (fallback to CPU for text effects)
3. Asset URLs are valid and accessible (CORS configured appropriately)
4. Font files are available in formats supported by FontFace API
5. Mesh files are valid .obj format with positions, normals, and UVs
