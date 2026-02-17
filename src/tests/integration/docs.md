# Integration Tests

## Purpose

Integration tests verify that multiple modules work together correctly. These tests focus on complete workflows from entry point to output.

## Test Goals

- Test complete workflows from entry point to output
- Test success AND failure paths
- Verify side effects (bitmap creation, worker spawning)
- Mock external dependencies appropriately

## Planned Tests

- **render-pipeline.test.ts**: Full render from JSON to ImageBitmap
- **asset-loading.test.ts**: Asset Manager fetch/distribute cycle
- **worker-communication.test.ts**: Message protocol compliance
- **fallback-scenarios.test.ts**: All 6 fallback scenarios

## Running Tests

```bash
npm run test:integration
```
