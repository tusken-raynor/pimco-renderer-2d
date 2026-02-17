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

Tests the standard rendering workflow from JSON layers to final ImageBitmap.

**Test Coverage:**

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
