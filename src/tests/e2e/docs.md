# E2E Tests

## Purpose

End-to-end tests verify complete user journeys through the dev app using Playwright.

## Test Goals

- Test complete user journeys through dev app
- Test JSON upload → render → display workflow
- Test error scenarios (invalid JSON, missing assets)

## Planned Tests

- **dev-app-render.spec.ts**: Upload JSON → render → verify canvas has content
- **dev-app-errors.spec.ts**: Invalid JSON handling, missing asset handling
- **dev-app-timing.spec.ts**: Render timing display verification

## Running Tests

```bash
npm run test:e2e
```

## Configuration

See `playwright.config.ts` in the project root for test configuration.
