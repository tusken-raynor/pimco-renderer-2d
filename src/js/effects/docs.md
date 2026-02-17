# Effects Module Documentation

## Overview

The effects module provides GPU-accelerated image processing effects using WebGL2 shaders, with Canvas 2D fallbacks for environments where WebGL2 is not available. It also includes high-level effect pipelines for text layer rendering.

## Architecture

```
src/
├── shaders/                     # GLSL shader source files
│   ├── passthrough.vert.glsl    # Default vertex shader
│   ├── alpha-erode.frag.glsl    # Alpha erosion/shrinking
│   ├── emboss.frag.glsl         # Emboss/deboss convolution
│   ├── fuzz.frag.glsl           # Embroidery fuzz effect
│   ├── normal-map.frag.glsl     # Normal map generation
│   └── color-scale.frag.glsl    # Color intensity adjustment
│
└── js/effects/
    ├── index.ts                 # Effects module entry point (primitives)
    ├── no-effect.ts             # No-effect pipeline implementation
    ├── shadow.ts                # Shadow effect pipeline implementation
    ├── engraving.ts             # Engraving effect pipeline implementation
    ├── hotstamp.ts              # Hotstamp effect pipeline implementation
    ├── embroidery.ts            # Embroidery effect pipeline implementation
    ├── metal.ts                 # Metal effect pipeline implementation
    ├── no-effect.test.ts        # Unit tests for no-effect
    ├── shadow.test.ts           # Unit tests for shadow effect
    ├── engraving.test.ts        # Unit tests for engraving effect
    ├── hotstamp.test.ts         # Unit tests for hotstamp effect
    ├── embroidery.test.ts       # Unit tests for embroidery effect
    ├── metal.test.ts            # Unit tests for metal effect
    └── docs.md                  # This documentation
```

## Dependencies

- **webgl-postprocessor**: External library (github:choc-sproc/webgl-postprocessor) that abstracts WebGL2 boilerplate:
  - Texture management
  - Uniform binding
  - Program compilation
  - Multi-pass rendering

The shaders themselves are **internal to this project** - the library executes them but does not provide them.

## WebGL Effects

### Usage Pattern

```typescript
import { myWebGLBuddy, alphaErode, emboss, fuzz } from '@/js/effects';

// Check WebGL2 availability
const buddy = myWebGLBuddy();
if (!buddy) {
  console.warn('WebGL2 not available, using fallbacks');
}

// Apply alpha erosion
alphaErode(2.0, sourceCanvas, targetCanvas);

// Apply emboss effect
emboss(sourceCanvas, targetCanvas, false); // false = standard, true = inverted

// Apply fuzz effect (in-place)
fuzz(canvasContext, 1.0);
```

### WebGL PostProcessor Pattern

The internal pattern for WebGL effects:

```typescript
// 1. Wake the WebGL buddy
const buddy = myWebGLBuddy()?.wake();

// 2. Create or reuse a program
if (buddy.hasProgram('effect_name')) {
  buddy.useProgram('effect_name');
} else {
  buddy.newProgram('effect_name', {
    fragmentSrc: shaderSource,
    fragmentKey: 'f_effect_name',
  });
}

// 3. Set resolution and uniforms, then render
buddy.setResolution(width, height);
buddy
  .setUniforms({
    uInput: { type: Uniforms.TEXTURE2D, value: inputCanvas },
    uParam: { type: Uniforms.FLOAT1, value: paramValue },
  })
  .to(target);

// 4. Clean up and sleep
buddy.unsetTextureUniforms('uInput').sleep();
```

## Shader Descriptions

### passthrough.vert.glsl

Default vertex shader that passes texture coordinates to fragment shaders. Used by all effects.

### alpha-erode.frag.glsl

Erodes (shrinks) the alpha channel by sampling a kernel of neighboring pixels and taking the minimum alpha. Used for:

- Emboss preprocessing
- Foil effect insets
- Mask shrinking

**Uniforms:**

- `uStart`: Start offset for kernel (negative for erosion)
- `uEnd`: End offset for kernel
- `uTexelSizeX/Y`: Pixel size in texture coordinates
- `uInput`: Source texture

### emboss.frag.glsl

Applies a 3x3 convolution kernel for emboss/deboss effects. Used in:

- Engraving effect
- Hotstamp effect
- Metal effect
- Painted effect

**Uniforms:**

- `uMatrix[9]`: Convolution matrix values
- `uTexelSizeX/Y`: Pixel size in texture coordinates
- `uInput`: Source texture

**Preset Matrices:**

- Standard emboss: `[0, -1, -1, 0, -1, 1, 1, 1, 0]`
- Inverted (deboss): `[0, 1, 1, 1, -1, 0, -1, -1, 0]`

### fuzz.frag.glsl

Creates a stitched/fuzzy appearance for embroidery effect by applying per-row random horizontal offsets.

**Uniforms:**

- `uFuzzScale`: Intensity of the fuzz (default: 1.0)
- `uSeedOffset`: Random seed for variation
- `uTexelSizeX`: Pixel width in texture coordinates
- `uInput`: Source texture

### normal-map.frag.glsl

Generates a normal map from a grayscale height map using the Sobel operator. Used in the 'normal' effect for directional lighting.

**Uniforms:**

- `uIntensity`: Normal strength multiplier
- `uDirection`: Light direction index (0-7 for N, NE, E, SE, S, SW, W, NW)
- `uTexelSizeX/Y`: Pixel size in texture coordinates
- `uInput`: Source texture (grayscale height map)

### color-scale.frag.glsl

Adjusts color intensity around neutral gray (128). Used for contrast adjustments and lighting effects.

**Uniforms:**

- `uIntensity`: Scale factor (1.0 = no change, >1 = more contrast)
- `uInput`: Source texture

## Canvas 2D Fallbacks

For environments without WebGL2 support, CPU-based fallbacks are provided:

| WebGL Effect   | Canvas 2D Fallback |
| -------------- | ------------------ |
| `emboss()`     | `emboss2D()`       |
| `colorScale()` | `colorScale2D()`   |

Additional Canvas 2D-only effects:

- `invert()`: RGB inversion
- `blackToAlpha()`: Grayscale to alpha mask
- `whiteToAlpha()`: Inverse grayscale to alpha mask
- `colorBurn()`: Color saturation with multiply
- `tile()`: Pattern tiling

## Implemented Effect Pipelines

Each text layer effect type uses a combination of primitives. The following pipelines are implemented:

### No-Effect (`no-effect.ts`)

The simplest effect pipeline for text layers with no special effects.

**Pipeline:**

1. Tile texture (if provided)
2. Color multiply with blend mode
3. Apply mask (destination-in composite)

**Usage:**

```typescript
import { applyNoEffect, extractDefaultColorCode } from '@/js/effects/no-effect';

// Apply no-effect pipeline
const result = applyNoEffect({
  width: 1024,
  height: 1024,
  color: '#ff0000',
  alpha: 1.0,
  blend: 'normal',
  texture: textureImageBitmap, // optional
  mask: maskCanvas,
});

// Result contains { canvas, ctx }
```

**Key Functions:**

- `applyNoEffect(params)`: Main pipeline function
- `processNoEffectLayer(layer, width, height, mask, texture?)`: Convenience wrapper for TextLayerDescriptor
- `extractDefaultColorCode(color, backup?)`: Extract color from various formats (string, array, object)
- `blendModeToCompositeOp(blend)`: Convert BlendMode to GlobalCompositeOperation
- `applyColorAndMask(ctx, color, alpha, blend, mask)`: Apply color and mask to existing canvas

### Shadow (`shadow.ts`)

Creates a drop shadow effect for text layers.

**Pipeline:**

1. Create mask canvas with white background
2. Apply spread (blur + brightness/contrast expansion)
3. Convert white to alpha
4. Fill with shadow color (source-in composite)
5. Apply blur
6. Draw with multi-pass alpha for intensity control

**Effect Parameters (from `maskData.effectparams`):**

- `ShadowSpread`: Spread radius in pixels (scaled to canvas size)
- `ShadowBlur`: Blur radius in pixels (scaled to canvas size)

**Usage:**

```typescript
import { applyShadowEffect, extractShadowParams } from '@/js/effects/shadow';

// Apply shadow effect pipeline
const result = applyShadowEffect({
  width: 1024,
  height: 1024,
  color: '#000000',
  alpha: 1.5, // > 1.0 for multiple passes
  spread: 10,
  blur: 5,
  mask: textMask,
});

// Result contains { canvas, ctx }
```

**Key Functions:**

- `applyShadowEffect(params)`: Main pipeline function
- `processShadowEffectLayer(layer, width, height, mask)`: Convenience wrapper for TextLayerDescriptor
- `extractShadowParams(maskData)`: Extract ShadowSpread/ShadowBlur from effectparams
- `scaleToResolution(value, targetWidth)`: Scale parameters from base resolution (2048px)
- `applySpread(ctx, spread)`: Expand shape using blur + brightness/contrast
- `applyColorFill(ctx, color)`: Fill opaque pixels with color
- `applyBlur(source, blur)`: Apply Gaussian blur
- `applyMultiPassAlpha(targetCtx, source, alpha, offsetX?, offsetY?)`: Draw with multiple passes for intensity
- `createShadow(mask, color, spread, blur, alpha)`: Create standalone shadow

### Engraving (`engraving.ts`)

Creates an engraved/carved appearance for text layers, simulating etched text.

**Pipeline:**

1. Calculate color-distance-based opacity (bezier curve formula from color distance to white)
2. Fill with engraving color (brown/orange tint based on distance)
3. Create emboss shadow canvas (inverted emboss matrix) - only for text height > 43.5px
4. Apply emboss highlight with blur (subtle raised effect)
5. Apply mask (destination-in composite)

**Effect Parameters:**

- `eindex`: Optional pre-computed opacity value (overrides color-based calculation)

**Color-Distance Formula:**

```typescript
// Calculate distance from white (0-1)
dist = sqrt((r2 - r1) ^ (2 + (g2 - g1)) ^ (2 + (b2 - b1)) ^ 2) / 441.67;

// Bezier curve for opacity
eindex = ((pow(dist * 2.4422495703 - 1, 3) + 1) / 4) * 0.382 + 0.051;

// Engraving fill color (68, 34, 0 base tinted by distance)
fillColor = rgba(68 * (1 - dist), 34 * (1 - dist), 0, eindex);
```

**Usage:**

```typescript
import { applyEngravingEffect, colorDistance, calculateEindex } from '@/js/effects/engraving';

// Apply engraving effect pipeline
const result = applyEngravingEffect({
  width: 1024,
  height: 1024,
  color: '#333333',
  alpha: 1.0,
  mask: textMask,
  textHeight: 50, // Height of text for emboss threshold
  eindex: 0.25, // Optional: override calculated opacity
});

// Result contains { canvas, ctx }
```

**Key Functions:**

- `applyEngravingEffect(params)`: Main pipeline function
- `processEngravingEffectLayer(layer, width, height, mask, textHeight)`: Convenience wrapper for TextLayerDescriptor
- `colorDistance(color1, color2)`: Calculate normalized distance between two RGB colors
- `calculateEindex(distFromWhite)`: Calculate opacity from color distance using bezier curve
- `distanceFromEindex(eindex)`: Inverse calculation (approximate)
- `createEngravingEmboss(mask, width, height)`: Create emboss canvas for engraving
- `extractEngravingParams(maskData)`: Extract eindex from effectparams
- `getEngravingFillColor(color, eindex?)`: Get computed fill color for debugging/preview

### Hotstamp (`hotstamp.ts`)

Creates a hot-stamped/foil-pressed appearance for text layers. Similar to engraving but with dual emboss (both raised and pressed effects) for a more pronounced 3D appearance.

**Pipeline:**

1. Calculate color-distance-based opacity (same bezier curve as engraving)
2. Fill with hotstamp color (warmer orange/brown tint than engraving)
3. Create dual emboss canvases (highlight + shadow) - only for text height > 43.5px
4. Apply highlight emboss (inverted matrix, creates raised highlight)
5. Apply shadow emboss (standard matrix, lighter blend mode)
6. Apply mask (destination-in composite)

**Effect Parameters:**

- `eindex`: Optional pre-computed opacity value (overrides color-based calculation)

**Hotstamp vs Engraving:**
| Aspect | Engraving | Hotstamp |
|--------|-----------|----------|
| Fill Color | `rgba(68*f, 34*f, 0, ...)` | `rgba(35*f, 22*f, 0, ...)` |
| Emboss | Single (inverted) | Dual (both matrices) |
| Highlight Alpha | 0.07 | 0.2 |
| Shadow Alpha | N/A | 0.2 |
| Blur | 1px | None |

**Usage:**

```typescript
import { applyHotstampEffect, createHotstampEmboss } from '@/js/effects/hotstamp';

// Apply hotstamp effect pipeline
const result = applyHotstampEffect({
  width: 1024,
  height: 1024,
  color: '#333333',
  alpha: 1.0,
  mask: textMask,
  textHeight: 50, // Height of text for emboss threshold
  eindex: 0.25, // Optional: override calculated opacity
});

// Result contains { canvas, ctx }
```

**Key Functions:**

- `applyHotstampEffect(params)`: Main pipeline function
- `processHotstampEffectLayer(layer, width, height, mask, textHeight)`: Convenience wrapper for TextLayerDescriptor
- `createHotstampEmboss(mask, width, height)`: Create dual emboss result with highlight and shadow canvases
- `extractHotstampParams(maskData)`: Extract eindex from effectparams
- `getHotstampFillColor(color, eindex?)`: Get computed fill color for debugging/preview
- Also re-exports: `colorDistance`, `calculateEindex`, `distanceFromEindex` from engraving

### Embroidery (`embroidery.ts`)

Creates an embroidered/stitched appearance for text layers, simulating thread-based text with optional fuzz for a more realistic stitch look.

**Pipeline:**

1. Apply alpha erosion (optional, based on AlphaErosionRadius param)
2. Tile texture pattern (embroidery thread texture)
3. Apply color multiply (thread color)
4. Create dual emboss canvases - only for text height > 43.5px
5. Apply emboss highlights (standard matrix for raised thread look)
6. Apply emboss shadow (inverted matrix, lighter blend, based on color brightness)
7. Apply fuzz effect to mask (creates stitch appearance) - requires WebGL2
8. Apply mask (destination-in composite)
9. Add drop shadow - only for text height > 43.5px (shadow intensity based on brightness)

**Effect Parameters (from `maskData.effectparams`):**

- `AlphaErosionRadius`: Erosion radius for alpha channel (default: 0)
- `EmbroideryFuzziness`: Fuzz intensity for stitch effect (default: 1.0)

**Embroidery vs Other Effects:**
| Aspect | Embroidery | Metal | Engraving |
|--------|------------|-------|-----------|
| Texture | Yes (thread) | Yes (brushed) | No |
| Fuzz | Yes | No | No |
| Shadow | Yes (drop) | No | No |
| Emboss Type | Standard + Inverted | Custom + Inverted | Inverted only |
| Color Base | Brightness-based | Multiply only | Distance-based |

**Usage:**

```typescript
import { applyEmbroideryEffect, extractEmbroideryParams } from '@/js/effects/embroidery';

// Apply embroidery effect pipeline
const result = applyEmbroideryEffect({
  width: 1024,
  height: 1024,
  color: '#ff0000',
  alpha: 1.0,
  alphaErosionRadius: 0,
  fuzziness: 1.0,
  mask: textMask,
  texture: threadTexture, // Optional embroidery texture
  textHeight: 50, // Height of text for emboss/shadow threshold
  enableFuzz: true, // Whether to enable fuzz effect (requires WebGL2)
});

// Result contains { canvas, ctx }
```

**Key Functions:**

- `applyEmbroideryEffect(params)`: Main pipeline function
- `processEmbroideryEffectLayer(layer, width, height, mask, textHeight, texture?, enableFuzz?)`: Convenience wrapper for TextLayerDescriptor
- `createEmbroideryEmboss(mask, width, height)`: Create dual emboss result with highlight and shadow canvases
- `extractEmbroideryParams(maskData)`: Extract AlphaErosionRadius and EmbroideryFuzziness from effectparams
- `getEmbroideryColorBrightness(color)`: Get brightness value and RGB for debugging/preview

### Metal (`metal.ts`)

Creates a metallic/brushed metal appearance for text layers, with a pronounced 3D bevel effect.

**Pipeline:**

1. Tile texture pattern (brushed metal texture)
2. Apply color multiply (metal tint color)
3. Create dual emboss canvases (custom metal matrix + inverted) - only for text height > 43.5px
4. Apply highlight emboss (custom metal matrix for sharp highlight)
5. Apply shadow emboss (inverted matrix, lighter blend)
6. Apply mask (destination-in composite)

**Custom Metal Emboss Matrix:**

```
[[-1, -1, -1],
 [-1, -1,  1],
 [ 1,  1,  1]]
```

This matrix creates a more pronounced 3D bevel compared to standard emboss, ideal for metallic surfaces.

**Usage:**

```typescript
import { applyMetalEffect, getMetalEmbossMatrix } from '@/js/effects/metal';

// Apply metal effect pipeline
const result = applyMetalEffect({
  width: 1024,
  height: 1024,
  color: '#cccccc', // Silver tint
  alpha: 1.0,
  mask: textMask,
  texture: brushedMetalTexture, // Optional brushed metal texture
  textHeight: 50, // Height of text for emboss threshold
});

// Result contains { canvas, ctx }

// Get the metal emboss matrix for reference
const matrix = getMetalEmbossMatrix(); // Returns [[-1,-1,-1],[-1,-1,1],[1,1,1]]
```

**Key Functions:**

- `applyMetalEffect(params)`: Main pipeline function
- `processMetalEffectLayer(layer, width, height, mask, textHeight, texture?)`: Convenience wrapper for TextLayerDescriptor
- `createMetalEmboss(mask, width, height)`: Create dual emboss result with highlight and shadow canvases
- `getMetalEmbossMatrix()`: Get a copy of the custom metal emboss matrix

## Future Effect Pipelines

The following pipelines are planned for future implementation:

### Foil

1. Alpha erode
2. Tile texture
3. Color blend
4. Dual emboss
5. Shrink mask
6. Shadow

### Painted

1. Edge expand
2. Dual emboss
3. Inset shrink
4. Tile texture
5. Color blend
6. Apply mask

### Normal

1. Roundness blur
2. Color scale
3. Normal map generation
4. Directional lighting

## Memory Management

- WebGL textures are automatically unset via `unsetTextureUniforms()` to free GPU memory
- The `sleep()`/`wake()` pattern manages GPU resource lifecycle
- The WebGL buddy is a singleton to avoid creating multiple GL contexts

## Testing

Unit tests for effect pipelines are located alongside the modules:

- `no-effect.test.ts`: Tests for no-effect pipeline
- `shadow.test.ts`: Tests for shadow effect pipeline
- `engraving.test.ts`: Tests for engraving effect pipeline
- `hotstamp.test.ts`: Tests for hotstamp effect pipeline
- `embroidery.test.ts`: Tests for embroidery effect pipeline
- `metal.test.ts`: Tests for metal effect pipeline

Tests are structured in two categories:

1. **Pure function tests** - Test parameter extraction, scaling, and helper functions (run in Node.js)
2. **Canvas-dependent tests** - Test actual canvas operations (skipped in Node.js, run in browser/E2E)

Unit tests verify:

1. Effect parameters are extracted correctly from various input formats
2. Resolution scaling works correctly for different canvas sizes
3. Canvas operations produce expected state changes
4. WebGL effects produce expected output when WebGL2 is available
5. Canvas 2D fallbacks produce equivalent results
6. Memory cleanup occurs after each effect

## References

- Old implementation: `old-src-ref/src/effects/index.ts`
- Old shaders: `old-src-ref/src/shaders/`
- Spec: `.zenflow/tasks/*/spec.md` (WebGL Post-Processor section)
