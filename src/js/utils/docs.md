# Utility Functions

This module provides shared utility functions for canvas operations and color manipulation used throughout the 2D renderer.

## Overview

The utils module is organized into two main categories:

1. **Color Utilities** (`color.ts`) - Color parsing, conversion, and manipulation
2. **Canvas Utilities** (`canvas.ts`) - Canvas creation, context management, and drawing helpers

## Color Utilities

### Types

```typescript
type RGBColor = [number, number, number]; // [R, G, B] values 0-255
type RGBAColor = [number, number, number, number]; // [R, G, B, A] with A 0-1
```

### Parsing Functions

#### `parseHexColor(hex: string): RGBColor | null`

Parse a hex color string to RGB values. Supports 3-digit (`#RGB`) and 6-digit (`#RRGGBB`) formats.

```typescript
parseHexColor('#ff0000'); // [255, 0, 0]
parseHexColor('#f00'); // [255, 0, 0]
parseHexColor('invalid'); // null
```

#### `parseHexColorWithAlpha(hex: string): RGBAColor | null`

Parse a hex color string including alpha channel. Supports 3, 4, 6, and 8-digit formats.

```typescript
parseHexColorWithAlpha('#ff0000'); // [255, 0, 0, 1]
parseHexColorWithAlpha('#ff000080'); // [255, 0, 0, 0.5]
parseHexColorWithAlpha('#f008'); // [255, 0, 0, ~0.53]
```

### Conversion Functions

#### `rgbToHex(r, g, b): string`

Convert RGB values to hex string. Clamps values to 0-255.

```typescript
rgbToHex(255, 0, 128); // '#ff0080'
```

#### `rgbaToHex(r, g, b, a): string`

Convert RGBA values to 8-digit hex string.

```typescript
rgbaToHex(255, 0, 0, 0.5); // '#ff000080'
```

### Brightness & Luminance

#### `relativeLuminance(r, g, b): number`

Calculate WCAG 2.0 relative luminance (0-1). Used for accessibility calculations.

#### `brightness(r, g, b): number`

Calculate perceived brightness using HSP color model (0-255). More perceptually accurate than simple averaging.

#### `isDarkColor(r, g, b, threshold?): boolean`

Determine if a color is "dark". Useful for choosing contrasting text colors.

```typescript
isDarkColor(0, 0, 0); // true
isDarkColor(255, 255, 255); // false
isDarkColor(128, 128, 128, 130); // true (custom threshold)
```

### Color Operations

#### `multiplyColor(base: RGBColor, multiply: RGBColor): RGBColor`

Per-channel color multiplication for tinting operations.

```typescript
multiplyColor([255, 255, 255], [128, 128, 128]); // [128, 128, 128]
```

#### `highlightSaturate(color: RGBColor, multiply: RGBColor): RGBColor`

Apply highlight saturation effect. Doubles color values, applies multiply, and redistributes overflow to other channels. Used for highlight effects in the intra-layer pipeline.

#### `alphaBlend(fg: RGBAColor, bg: RGBAColor): RGBAColor`

Standard alpha compositing of two colors.

#### `lerpColor(color1: RGBColor, color2: RGBColor, t: number): RGBColor`

Linear interpolation between two colors.

```typescript
lerpColor([255, 0, 0], [0, 255, 0], 0.5); // [128, 128, 0]
```

#### `clampColorValue(value, min?, max?): number`

Clamp and round a color component value to valid range.

## Canvas Utilities

### Types

```typescript
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
```

### Feature Detection

#### `isOffscreenCanvasSupported(): boolean`

Check if OffscreenCanvas is available in the current environment.

#### `isWebGL2Supported(): boolean`

Check if WebGL2 is available. Used to determine if shader effects can be applied.

### Canvas Creation

#### `createCanvas(width, height, preferOffscreen?): AnyCanvas`

Create a canvas element. Uses OffscreenCanvas when supported and preferred (default), falls back to HTMLCanvasElement.

```typescript
const canvas = createCanvas(800, 600);
const htmlCanvas = createCanvas(800, 600, false);
```

#### `getContext2D(canvas, options?): Canvas2DContext | null`

Get 2D context from a canvas with optional settings.

```typescript
const ctx = getContext2D(canvas, { willReadFrequently: true });
```

#### `createCanvasWithContext(width, height, options?): { canvas, ctx }`

Create a canvas with its 2D context already attached. Throws if context unavailable.

### Canvas Operations

#### `resetCanvasContext(ctx: Canvas2DContext): void`

Reset a canvas context to its default state. Clears content and resets all properties:

- Transformations
- Line styles
- Fill/stroke styles
- Global alpha and composite operation
- Text properties
- Shadow properties
- Image smoothing
- Filter

Based on the legacy `resetCanvasContext` function from `canvas-workers.ts`.

#### `clearCanvas(ctx: Canvas2DContext): void`

Clear canvas content while preserving context state.

#### `cloneCanvas(source: AnyCanvas): AnyCanvas`

Create a copy of a canvas with its content.

#### `resizeCanvas(canvas, newWidth, newHeight, preserveContent?): AnyCanvas`

Resize a canvas. When `preserveContent` is true (default), existing content is preserved.

### Drawing Helpers

#### `drawImageFit(ctx, image, x, y, maxWidth, maxHeight, fit): void`

Draw an image with aspect ratio handling:

- `'contain'` - Fit inside bounds, may leave transparent areas
- `'cover'` - Fill bounds completely, may crop
- `'fill'` - Stretch to fill (distorts aspect ratio)

#### `drawCover(ctx, source): void`

Convenience wrapper for `drawImageFit` with `'cover'` mode filling the entire canvas.

#### `drawContain(ctx, source): void`

Convenience wrapper for `drawImageFit` with `'contain'` mode fitting the entire canvas.

### Transform Helpers

#### `applyMatrix(ctx, matrix: DOMMatrix): void`

Apply a DOMMatrix transformation to a context.

#### `getTransformMatrix(ctx): DOMMatrix`

Get the current transformation matrix from a context.

### ImageBitmap Conversion

#### `imageDataToImageBitmap(imageData): Promise<ImageBitmap>`

Convert ImageData to ImageBitmap for efficient transfer between workers.

#### `canvasToImageBitmap(canvas): Promise<ImageBitmap>`

Convert a canvas to ImageBitmap.

## Usage in Renderer

### Intra-Layer Pipeline

The color utilities are used in the 5-step intra-layer rendering pipeline:

1. **Base image drawing** - Uses canvas utilities
2. **Color/texture application** - Uses `multiplyColor` for tinting
3. **Highlight 1** - Uses `highlightSaturate` for highlight effects
4. **Highlight 2** - Uses `highlightSaturate` for highlight effects
5. **Mask application** - Uses canvas composite operations

### Worker Communication

Canvas utilities support both main thread and worker contexts:

- `createCanvas` automatically uses OffscreenCanvas in workers
- `canvasToImageBitmap` enables efficient transfer via postMessage

## Testing

Unit tests are in `index.test.ts`. Color utilities are fully tested. Canvas utilities that require a real canvas implementation are tested in E2E tests since jsdom doesn't provide canvas context.

Run tests:

```bash
npm run test:unit -- --run src/js/utils/
```
