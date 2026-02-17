# Effects Module Documentation

## Overview

The effects module provides GPU-accelerated image processing effects using WebGL2 shaders, with Canvas 2D fallbacks for environments where WebGL2 is not available.

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
    └── index.ts                 # Effects module entry point
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

| WebGL Effect | Canvas 2D Fallback |
|--------------|-------------------|
| `emboss()` | `emboss2D()` |
| `colorScale()` | `colorScale2D()` |

Additional Canvas 2D-only effects:
- `invert()`: RGB inversion
- `blackToAlpha()`: Grayscale to alpha mask
- `whiteToAlpha()`: Inverse grayscale to alpha mask
- `colorBurn()`: Color saturation with multiply
- `tile()`: Pattern tiling

## Effect Pipelines (Future Implementation)

Each text layer effect type uses a combination of these primitives:

### No-Effect
1. Tile texture
2. Color multiply
3. Apply mask

### Shadow
1. Spread
2. White-to-alpha
3. Color fill
4. Blur
5. Multi-pass alpha

### Engraving
1. Emboss (shadow)
2. Color-distance opacity
3. Multiply
4. Apply mask

### Hotstamp
1. Dual emboss
2. Color-distance opacity
3. Multiply
4. Apply mask

### Embroidery
1. Alpha erode
2. Tile texture
3. Color multiply
4. Emboss
5. Fuzz
6. Apply mask
7. Shadow

### Metal
1. Dual emboss
2. Tile texture
3. Color multiply
4. Apply mask

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

Unit tests should verify:
1. WebGL effects produce expected output when WebGL2 is available
2. Canvas 2D fallbacks produce equivalent results
3. Effect parameters are handled correctly
4. Memory cleanup occurs after each effect

## References

- Old implementation: `old-src-ref/src/effects/index.ts`
- Old shaders: `old-src-ref/src/shaders/`
- Spec: `.zenflow/tasks/*/spec.md` (WebGL Post-Processor section)
