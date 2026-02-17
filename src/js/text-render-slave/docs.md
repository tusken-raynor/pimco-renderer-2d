# Text Render Slave Module

## Purpose

The Text Render Slave module is responsible for processing text/effect layers in the multi-threaded 2D renderer. While Standard Render Slaves handle conventional image layers (where `mask` is a URL string), Text Render Slaves handle layers where `mask` is a `PimcoMaskSubstitutionCompiled` object containing text content and typography settings.

This module provides:
- **Text Rasterization**: Converting text content to canvas using font metrics
- **Typography Support**: Font family, weight, size, letter spacing, text transforms
- **Asset Management**: Storing images and fonts received from the Asset Manager
- **Post-Mask Application**: Applying optional masks after rendering

Note: Effect application (embroidery, engraving, etc.) and 2D transforms are implemented in separate modules and integrated in later phases.

## How It Works

### Text Rasterization Flow

1. **Typography Parsing**: Convert `PimcoMaskSubstitutionTypeDefinition` to normalized `TypographyConfig`
2. **Text Transform**: Apply uppercase/lowercase/capitalize transforms
3. **Text Measurement**: Measure text dimensions with proper font settings
4. **Scale Calculation**: If text exceeds `maxwidth`, calculate scale factor
5. **Canvas Creation**: Create canvas with computed dimensions
6. **Text Rendering**: Draw text with correct alignment and baseline

### Key Constants (from legacy renderer)

```typescript
const DEFAULT_LINE_HEIGHT = 0.08;  // Font size = workWidth * lineHeight
const DEFAULT_MAX_WIDTH = 0.85;    // Max text width = workWidth * maxWidth
const OVERSCALE_FACTOR = 1.5;      // Canvas height multiplier for descenders
```

### Typography Configuration

The module supports these typography settings:

| Property | Default | Description |
|----------|---------|-------------|
| `fontfamily` | `'sans-serif'` | CSS font family |
| `fontweight` | `'400'` | Font weight (100-900 or 'bold') |
| `lineheight` | `0.08` | Ratio of workWidth for font size |
| `letterspacing` | `''` | CSS letter-spacing value |
| `texttransform` | `'none'` | Text case transformation |
| `alignment` | `'center'` | Horizontal alignment |
| `maxwidth` | `0.85` | Max width as ratio of workWidth |
| `widthscale` | `1` | Width multiplier |
| `heightscale` | `1` | Height multiplier |

## Interface

### TextRasterizer Functions

```typescript
// Apply text transformation
function applyTextTransform(
  text: string,
  transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none'
): string;

// Parse typography definition to normalized config
function parseTypography(
  type: PimcoMaskSubstitutionTypeDefinition | undefined,
  workWidth: number
): TypographyConfig;

// Build CSS font string
function buildFontString(typography: TypographyConfig): string;

// Measure text dimensions
function measureText(
  content: string,
  type: PimcoMaskSubstitutionTypeDefinition | undefined,
  workWidth: number
): TextMeasurement;

// Rasterize text to canvas
function rasterizeText(options: TextRasterizerOptions): RasterizedText;
```

### TextRasterizer Class

```typescript
class TextRasterizer {
  measure(content: string, type: PimcoMaskSubstitutionTypeDefinition | undefined, workWidth: number): TextMeasurement;
  rasterize(options: TextRasterizerOptions): RasterizedText;
  transform(text: string, transform: 'uppercase' | 'lowercase' | 'capitalize' | 'none'): string;
  destroy(): void;
}

function createTextRasterizer(): TextRasterizer;
```

### TextRenderSlave Class

```typescript
class TextRenderSlave {
  // Asset management
  registerAsset(id: number, asset: ImageBitmap): void;
  registerFont(id: number, family: string, data: ArrayBuffer): void;
  hasAsset(id: number): boolean;
  getAsset(id: number): TextSlaveAsset | undefined;
  hasFont(id: number): boolean;
  getFont(id: number): FontCacheEntry | undefined;
  clearAssets(): void;

  // Font loading
  loadFont(id: number): Promise<void>;

  // Abort handling
  abort(): void;
  resetAbort(): void;
  isAborted(): boolean;

  // Rendering
  rasterizeText(maskData: PimcoMaskSubstitutionCompiled, width: number, height: number): RasterizedText;
  renderLayer(layer: TextLayerDescriptor, width: number, height: number, index: number): Promise<TextLayerResult | null>;
  renderBatch(layers: TextLayerDescriptor[], width: number, height: number): Promise<TextLayerResult[]>;

  // Cleanup
  destroy(): void;
}

function createTextRenderSlave(): TextRenderSlave;
function textResultsToSegments(results: TextLayerResult[]): RenderSegment[];
```

### Types

```typescript
interface TypographyConfig {
  fontFamily: string;
  fontWeight: string | number;
  fontSize: number;
  letterSpacing: string;
  textTransform: 'uppercase' | 'lowercase' | 'capitalize' | 'none';
  alignment: 'left' | 'center' | 'right';
  widthScale: number;
  heightScale: number;
}

interface TextMeasurement {
  width: number;
  height: number;
  scale: number;
  text: string;
  typography: TypographyConfig;
}

interface RasterizedText {
  canvas: AnyCanvas;
  width: number;
  height: number;
  measurement: TextMeasurement;
}

interface TextRasterizerOptions {
  workWidth: number;
  workHeight: number;
  type?: PimcoMaskSubstitutionTypeDefinition;
  content: string;
}

interface TextLayerResult {
  bitmap: ImageBitmap;
  index: number;
  compositemode: CanvasCompositeOperation;
  compositealpha: number;
}

interface FontCacheEntry {
  family: string;
  data: ArrayBuffer;
  loaded: boolean;
}
```

## Usage Examples

### Basic Text Rasterization

```typescript
import { rasterizeText } from './text-rasterizer';

const result = rasterizeText({
  workWidth: 1000,
  workHeight: 800,
  content: 'Hello World',
  type: {
    fontfamily: 'Arial',
    fontweight: 700,
    lineheight: 0.1,
    texttransform: 'uppercase',
    alignment: 'center',
  },
});

console.log(`Canvas: ${result.width}x${result.height}`);
console.log(`Text: ${result.measurement.text}`); // "HELLO WORLD"
```

### Using TextRenderSlave

```typescript
import { createTextRenderSlave } from './index';
import type { TextLayerDescriptor } from '../types/messages';

const slave = createTextRenderSlave();

// Register assets
slave.registerAsset(1, baseImage);
slave.registerFont(1, 'CustomFont', fontData);
await slave.loadFont(1);

// Render layers
const layers: TextLayerDescriptor[] = [
  {
    id: 'text-1',
    assetIds: { image: 1 },
    mode: 'color',
    color: '#ff0000',
    alpha: 1,
    blend: 'normal',
    compositemode: 'source-over',
    compositealpha: 1,
    maskData: {
      content: 'Hello',
      type: { fontfamily: 'CustomFont' },
    },
  },
];

const results = await slave.renderBatch(layers, 1000, 800);

// Convert to segments for transfer
const segments = textResultsToSegments(results);

// Cleanup
slave.destroy();
```

### Text Measurement for Layout

```typescript
import { measureText } from './text-rasterizer';

const measurement = measureText('Sample Text', {
  fontfamily: 'Arial',
  lineheight: 0.08,
  maxwidth: 0.9,
}, 1000);

console.log(`Dimensions: ${measurement.width}x${measurement.height}`);
console.log(`Scale applied: ${measurement.scale}`);
console.log(`Transformed text: ${measurement.text}`);
```

## Tests

### text-rasterizer.test.ts

- **applyTextTransform**: Tests for uppercase, lowercase, capitalize, none, empty strings, special characters
- **parseTypography**: Default values, custom values, partial definitions, font size calculations
- **buildFontString**: CSS font string generation with various weights and families
- **measureText**: Empty content, default typography, text transforms, scaling, width/height scales
- **rasterizeText**: Empty text, typography settings, dimension matching, alignment handling
- **TextRasterizer class**: Factory function, measure, rasterize, transform, reusability
- **Edge cases**: Very small/large workWidth, unicode, newlines, long text, whitespace, zero lineheight, negative scales

### index.test.ts

- **Constructor**: Instance creation, empty stores, abort flag initialization
- **Asset management**: Register, retrieve, multiple assets, overwriting, clearing
- **Font management**: Register, retrieve, multiple fonts, clearing
- **Abort handling**: Initial state, setting, resetting
- **rasterizeText**: Mask data processing, empty content, typography
- **renderLayer**: Aborted state, missing maskData, successful render, post-mask, layer index, composite settings
- **renderBatch**: Empty batch, single/multiple layers, abort reset, abort mid-render, skip failed layers
- **textResultsToSegments**: Empty results, conversion, bitmap references, index exclusion

## Architecture Notes

### Worker Context

The TextRenderSlave is designed to run in a Web Worker context using OffscreenCanvas. Key considerations:

1. **Canvas API**: Uses `createCanvas()` which prefers OffscreenCanvas when available
2. **Font Loading**: Uses FontFace API which works in both main thread and workers
3. **Asset Transfer**: Assets are received via MessagePort from Asset Manager as ImageBitmaps

### Future Integration

This module is part of Phase 3 implementation. Future steps will add:

1. **2D Transform Application**: Translation, rotation, scale via DOMMatrix
2. **Effect Pipeline**: Integration with WebGL postprocessor for effects (embroidery, engraving, etc.)
3. **Text Render Slave Worker**: Worker entry point (`text-render-slave.worker.ts`)

### Reference Files

- **Legacy code**: `old-src-ref/src/renderer/index.ts` (preEffect, drawSubstitutionMask functions)
- **Types**: `src/js/types/pimco.ts`, `src/js/types/messages.ts`
- **Canvas utils**: `src/js/utils/canvas.ts`
