# Integration Tests

## Purpose

Integration tests verify that multiple modules work together correctly. These tests focus on complete workflows from entry point to output.

## Test Goals

- Test complete workflows from entry point to output
- Test success AND failure paths
- Verify side effects (bitmap creation, worker spawning)
- Mock external dependencies appropriately

## Implemented Tests

### render-pipeline.test.ts

Tests the rendering workflow from JSON layers to final ImageBitmap, including both standard and text layer rendering.

**Test Coverage:**

#### Standard Rendering Pipeline Integration

1. **Layer Classification**
   - Standard layers (string mask) correctly identified
   - Text layers (object mask) correctly identified
   - Original layer indices preserved through classification

2. **Asset URL Extraction**
   - All unique asset URLs extracted from layers
   - Text layer mask URLs not extracted (they're objects, not URLs)

3. **Layer Distribution**
   - Round-robin distribution to slaves
   - Handles more slaves than layers gracefully

4. **Segment Composition**
   - Multiple segments composed into final bitmap
   - Ordered layers from multiple slaves composed correctly
   - Empty layer list handled gracefully

5. **Compositor Context Reuse**
   - Context reused for same dimensions (performance optimization)
   - Context recreated when dimensions change

6. **Error Handling Integration**
   - Abort controller pattern supported
   - Abort checked before async operations
   - Invalid layers (missing id) handled gracefully
   - Empty layers array handled

7. **Dev App Workflow Integration**
   - JSON parsing and validation
   - ImageBitmap to canvas drawing
   - Timing measurement

#### Text Rendering Pipeline Integration

1. **Mixed Layer Classification**
   - Standard and text layers correctly separated
   - Original indices preserved for text layers
   - Effect type extracted from text layers
   - Mask data (content, transforms, etc.) extracted

2. **Text Layer Asset Extraction**
   - Image URLs extracted from text layers
   - Postmask URLs extracted when present
   - Texture URLs extracted for effects
   - Mask object not treated as URL

3. **Text Layer Distribution**
   - Round-robin distribution to text slaves
   - Handles case with no text slaves (fallback scenario)

4. **Text Layer Composition**
   - Mixed standard and text segments composed correctly
   - Layers composed in correct original order across slave types
   - Text layers with different composite modes handled
   - Text-only renders (no standard layers) work correctly

5. **Text Effect Parameters**
   - Embroidery, engraving, metal, painted, hotstamp, foil, normal effects supported
   - Transform parameters (rotation, translation, scale) extracted
   - Effect-less text layers handled (no-effect)

6. **Text Typography Settings**
   - Font family, weight, size extracted
   - Letter spacing, line height handled
   - Text transform (uppercase, lowercase, capitalize) supported
   - Alignment (left, center, right) supported

## Planned Tests

- **asset-loading.test.ts**: Asset Manager fetch/distribute cycle
- **worker-communication.test.ts**: Message protocol compliance
- **fallback-scenarios.test.ts**: All 6 fallback scenarios

## Running Tests

```bash
npm run test:integration
```

## Test Patterns

### Mocking Workers

Since jsdom cannot run real Web Workers, we mock worker-dependent code:

```typescript
vi.mock('../../js/utils/canvas', () => ({
  createCanvasWithContext: vi.fn().mockImplementation(...),
  canvasToImageBitmap: vi.fn().mockImplementation(...),
}));
```

### Creating Test Layers

Test layers should mirror real-world example JSON structure:

```typescript
function createTestLayers(): ProductImageComponent[] {
  return [
    {
      id: 'layer1',
      mode: 'color',
      alpha: 1,
      blend: 'multiply',
      image: '/images/base.png',
      mask: '/images/mask.png',
      // ... other properties
    },
  ];
}
```

### Abort Handling Tests

```typescript
const abortController = new AbortController();
abortController.signal.addEventListener('abort', () => {
  // Handle abort
});
abortController.abort();
```
