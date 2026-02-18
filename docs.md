# PIMCO Renderer 2D

Multi-threaded 2D compositing renderer for product image components.

## Overview

This module processes an ordered array of `ProductImageComponent` objects (PIMCOs) and produces a single composited `ImageBitmap`. It leverages Web Workers, OffscreenCanvas, and WebGL2 to parallelize rendering across multiple CPU cores.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Main Thread                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                          RenderMaster                               ││
│  │  - Layer classification (standard vs text)                         ││
│  │  - Asset ID mapping (URL → numeric ID)                             ││
│  │  - Work distribution (round-robin to slaves)                       ││
│  │  - Final composition (MasterCompositor)                            ││
│  │  - Abort-on-reentry handling                                       ││
│  └────────────────────────────┬────────────────────────────────────────┘│
│                               │                                          │
└───────────────────────────────┼──────────────────────────────────────────┘
                                │ MessagePort
     ┌──────────────────────────┼───────────────────────────┐
     │                          │                           │
     ▼                          ▼                           ▼
┌─────────────┐        ┌─────────────┐             ┌─────────────┐
│   Asset     │        │  Standard   │             │    Text     │
│  Manager    │───────▶│   Slaves    │             │   Slaves    │
│  (Worker)   │        │ (Workers)   │             │  (Workers)  │
└─────────────┘        └─────────────┘             └─────────────┘
      │                       │                           │
      │ fetch/cache           │ 5-step                    │ text raster
      │ distribute            │ pipeline                  │ + effects
      │                       │                           │
      └───────────────────────┴───────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  MasterCompositor│
                    │  (Final Output)  │
                    └─────────────────┘
```

## Technology Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript (strict mode) |
| Build Tool | Vite |
| Test Framework | Vitest (unit/integration), Playwright (E2E) |
| Linting | ESLint with TypeScript rules |
| Formatting | Prettier |
| WebGL Library | webgl-postprocessor (external) |
| Math Library | gl-matrix |

### Browser APIs Used

- **Web Workers**: Multi-threaded layer rendering
- **OffscreenCanvas**: Worker-based canvas operations
- **WebGL2**: GPU-accelerated shader effects
- **MessagePort/MessageChannel**: Worker communication
- **ImageBitmap**: Efficient image transfer between threads
- **FontFace API**: Custom font loading for text layers

## Key Modules

### Core Rendering

| Module | Location | Description |
|--------|----------|-------------|
| **RenderMaster** | `src/js/renderer/` | Orchestrates the multi-threaded pipeline |
| **Render Slave** | `src/js/render-slave/` | Standard layer rendering (5-step pipeline) |
| **Text Render Slave** | `src/js/text-render-slave/` | Text layers with typography and effects |
| **Asset Manager** | `src/js/asset-manager/` | Centralized asset loading and caching |

### Effects & Processing

| Module | Location | Description |
|--------|----------|-------------|
| **Effects** | `src/js/effects/` | 9 effect pipelines (embroidery, engraving, metal, foil, etc.) |
| **Virtual Slaves** | `src/js/virtual-slaves/` | Main-thread fallbacks for limited browsers |

### Infrastructure

| Module | Location | Description |
|--------|----------|-------------|
| **Types** | `src/js/types/` | TypeScript type definitions and guards |
| **Errors** | `src/js/errors/` | Standardized error classes |
| **Utils** | `src/js/utils/` | Color and canvas utilities |
| **Shaders** | `src/shaders/` | GLSL shader source files |
| **Workers** | `src/workers/` | Web Worker entry points |

## Layer Types

Layers are classified based on the `mask` field type:

| Mask Type | Layer Type | Renderer | Description |
|-----------|------------|----------|-------------|
| String (URL) | Standard | Render Slave | Image-based mask compositing |
| Object (PimcoMaskSubstitutionCompiled) | Text | Text Render Slave | Text with typography and effects |

## Fallback Scenarios

Six fallback scenarios handle varying browser capabilities:

| Scenario | Master | OffscreenCanvas | WebGL2 | Standard Slaves | Text Slaves | Compositor |
|----------|--------|-----------------|--------|-----------------|-------------|------------|
| A | main | Yes | Yes | workers | workers | Canvas |
| B | main | Yes | No | workers | virtual | Canvas |
| C | main | No | - | virtual | virtual | Canvas |
| D | worker | Yes | Yes | workers | workers | OffscreenCanvas |
| E | worker | Yes | No | workers | virtual | OffscreenCanvas |
| F | worker | No | - | virtual | virtual | Software (ImageData) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Modern browser with Web Worker support

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the dev app at `http://localhost:3000` for testing the renderer with JSON layer data.

### Build

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm run validate

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

### Linting & Formatting

```bash
npm run lint          # Check for issues
npm run lint:fix      # Auto-fix issues
npm run format        # Format code
npm run type-check    # TypeScript validation
```

## Usage

### Basic Rendering

```typescript
import { RenderMaster } from './js/renderer';

// Create render master
const master = new RenderMaster({
  width: 1024,
  height: 1024,
  slaveCount: 4,      // Standard render slaves
  textSlaveCount: 2,  // Text render slaves
});

// Render layers
const layers: ProductImageComponent[] = [
  {
    id: 'background',
    mode: 'color',
    alpha: 1,
    blend: 'normal',
    mask: '/masks/bg.png',
    image: '/images/bg.png',
    color: '#ffffff',
  },
  {
    id: 'logo',
    mode: 'image',
    alpha: 0.8,
    blend: 'multiply',
    mask: '/masks/logo.png',
    image: '/images/logo.png',
  },
];

const bitmap = await master.render(layers);

// Draw to canvas
const canvas = document.getElementById('output') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
ctx.drawImage(bitmap, 0, 0);

// Cleanup when done
master.destroy();
```

### Text Layer with Effect

```typescript
const textLayer: ProductImageComponent = {
  id: 'title',
  mode: 'color',
  alpha: 1,
  blend: 'normal',
  mask: {
    content: 'HELLO WORLD',
    type: {
      fontfamily: 'Arial',
      fontweight: 700,
      lineheight: 0.1,
      texttransform: 'uppercase',
      alignment: 'center',
    },
    effect: 'embroidery',
    effectparams: {
      EmbroideryFuzziness: 1.0,
    },
  },
  image: '/images/base.png',
  color: '#ff0000',
};
```

### Preloading Assets

```typescript
// Preload assets for faster subsequent renders
await master.preload([
  '/images/texture1.png',
  '/images/texture2.png',
  '/fonts/custom.woff2',
]);
```

## Project Structure

```
src/
├── js/
│   ├── renderer/              # RenderMaster, MasterCompositor, capability detection
│   ├── render-slave/          # Standard layer rendering (5-step pipeline)
│   ├── text-render-slave/     # Text rasterization, transforms
│   ├── asset-manager/         # Asset loading, caching, distribution
│   ├── effects/               # Effect pipelines (9 effects)
│   ├── virtual-slaves/        # Main-thread fallback implementations
│   ├── types/                 # TypeScript type definitions
│   ├── errors/                # Standardized error classes
│   └── utils/                 # Color and canvas utilities
├── shaders/                   # GLSL shader source files
│   ├── passthrough.vert.glsl
│   ├── alpha-erode.frag.glsl
│   ├── emboss.frag.glsl
│   ├── fuzz.frag.glsl
│   ├── normal-map.frag.glsl
│   └── color-scale.frag.glsl
├── workers/                   # Web Worker entry points
│   ├── render-slave.worker.ts
│   ├── text-render-slave.worker.ts
│   └── asset-manager.worker.ts
├── dev-app/                   # Development testing application
│   ├── index.html
│   ├── main.ts
│   └── styles.css
└── tests/
    ├── integration/           # Multi-module workflow tests
    └── e2e/                   # End-to-end Playwright tests
```

## Supported Effects

| Effect | Description | WebGL2 Required |
|--------|-------------|-----------------|
| none | Basic texture/color with mask | No |
| shadow | Drop shadow with spread and blur | No |
| engraving | Carved/etched appearance | No |
| hotstamp | Hot-stamped foil press appearance | No |
| metal | Metallic/brushed metal appearance | No |
| painted | Painted/printed with beveled edges | No |
| embroidery | Stitched/embroidered with fuzz | Yes |
| foil | Shiny metallic foil | Yes |
| normal | Normal-mapped 3D lighting | Yes |

## Performance Characteristics

### Optimizations Applied

| Area | Optimization |
|------|-------------|
| Layer rendering | Pipeline context reuse |
| Batch composition | Segment batching for combinable modes |
| Asset transfer | Transferable objects (zero-copy) |
| Text measurement | Single temporary canvas per measurement |
| WebGL effects | Shader program reuse |
| Final composition | Canvas context reuse |

### Combinable Composite Modes

Consecutive layers with these modes are batched together to reduce composition operations:

- `source-over`
- `screen`
- `lighten`
- `lighter`

### Memory Management

- **ImageBitmap**: Explicit `.close()` calls release GPU memory
- **Canvas reuse**: Pipeline and segmentation contexts created once per batch
- **Lazy WebGL**: Context created only when effects are needed
- **Worker cleanup**: `destroy()` terminates workers and releases resources

## Module Documentation

Each module has its own `docs.md` with detailed documentation:

- [Renderer](src/js/renderer/docs.md) - RenderMaster, MasterCompositor, capability detection
- [Render Slave](src/js/render-slave/docs.md) - 5-step intra-layer pipeline, batch segmentation
- [Text Render Slave](src/js/text-render-slave/docs.md) - Text rasterization, transforms, effects
- [Asset Manager](src/js/asset-manager/docs.md) - Asset loading, caching, distribution
- [Effects](src/js/effects/docs.md) - WebGL shaders and effect pipelines
- [Virtual Slaves](src/js/virtual-slaves/docs.md) - Fallback implementations
- [Types](src/js/types/docs.md) - Type definitions and guards
- [Errors](src/js/errors/docs.md) - Error classes and handling patterns
- [Utils](src/js/utils/docs.md) - Color and canvas utilities
- [Integration Tests](src/tests/integration/docs.md) - Multi-module workflow tests
- [E2E Tests](src/tests/e2e/docs.md) - End-to-end test documentation

## Dev App

The dev app (`src/dev-app/`) provides a simple interface for testing the renderer:

- Upload JSON layer configuration files
- Configure canvas dimensions
- Render and display results
- View timing information
- Debug error messages

Access at `http://localhost:3000` when running `npm run dev`.

## Browser Compatibility

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 69+ | Full support |
| Firefox | 105+ | Full support |
| Safari | 14.1+ | Full support |
| Edge | 79+ | Full support |

Older browsers fall back to virtual slaves and Canvas-based composition.
