# E2E Tests

## Purpose

End-to-end tests verify complete user journeys through the dev app using Playwright. These tests ensure that the rendering pipeline works correctly from the user interface level.

## Test Files

### dev-app-render.spec.ts

Tests the core rendering workflow:

- **Initial state**: Verifies app title, disabled render button, and empty JSON preview
- **Example loading**: Tests loading JSON from the dropdown selector
- **File upload**: Tests uploading valid JSON files via file input
- **Canvas dimensions**: Tests updating canvas width/height
- **Render workflow**: Tests full upload → render → display flow
- **Clear functionality**: Tests clearing the canvas
- **Layer count display**: Verifies layer count is shown correctly
- **Input clearing**: Verifies file input clears example selection

### dev-app-errors.spec.ts

Tests error handling scenarios:

- **Invalid JSON syntax**: Tests handling of malformed JSON
- **Non-array JSON**: Tests handling when JSON is not an array
- **Invalid layer format**: Tests handling of non-object layers
- **Empty array**: Tests graceful handling of empty layer arrays
- **Error recovery**: Tests error hiding after loading valid JSON
- **Non-existent files**: Tests handling of missing example files
- **Asset loading errors**: Tests handling when asset URLs fail to load
- **Console warnings**: Verifies warnings for missing optional fields
- **Edge cases**: Tests forced render with no layers

### dev-app-timing.spec.ts

Tests timing display functionality:

- **Default value**: Verifies timing shows "--" on initial load
- **Timing update**: Verifies timing updates after successful render
- **Timing reset**: Verifies timing resets when clear is clicked
- **Status message**: Verifies timing is shown in status after render
- **Console logging**: Verifies timing is logged to console
- **Loading state**: Tests "Rendering..." status during render
- **Timing preservation**: Verifies timing persists when loading new JSON

## Running Tests

### Run all E2E tests

```bash
npm run test:e2e
```

### Run specific test file

```bash
npx playwright test dev-app-render.spec.ts
```

### Run with UI mode (interactive debugging)

```bash
npx playwright test --ui
```

### Run headed (see browser)

```bash
npx playwright test --headed
```

### Debug a specific test

```bash
npx playwright test --debug "should display the app title"
```

## Configuration

Test configuration is in `playwright.config.ts`:

- **Test directory**: `./src/tests/e2e`
- **Base URL**: `http://localhost:3000`
- **Browser**: Chromium (Desktop Chrome)
- **Web server**: Auto-starts via `npm run dev`

## Test Data

Tests use inline JSON data with data URLs for images to avoid external dependencies:

```typescript
const layerJson = JSON.stringify([
  {
    id: 'test-layer',
    name: 'Test Layer',
    mode: 'color',
    alpha: 1,
    blend: 'normal',
    color: 'rgb(255, 0, 0)',
    mask: 'data:image/png;base64,iVBORw0KGgo...',
    image: 'data:image/png;base64,iVBORw0KGgo...',
  },
]);
```

## Test Patterns

### Waiting for async operations

Tests use explicit waits for state changes:

```typescript
await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });
```

### File uploads

Tests create in-memory file buffers:

```typescript
await page.locator('#json-upload').setInputFiles({
  name: 'test-layers.json',
  mimeType: 'application/json',
  buffer: Buffer.from(layerJson),
});
```

### Console log verification

Tests collect console messages for verification:

```typescript
const logs: string[] = [];
page.on('console', (msg) => {
  if (msg.type() === 'log') {
    logs.push(msg.text());
  }
});
```

## Timeouts

- Default timeout: 30 seconds for render operations
- Load timeout: 5 seconds for JSON loading
- Fast operations: 100ms for catching transient states

## Known Considerations

1. **Render timing**: Renders may be too fast to catch "Rendering..." state
2. **External assets**: Tests use data URLs to avoid network dependency
3. **Error messages**: Error text matching is lenient to accommodate variations
4. **Worker availability**: Tests run in Chromium which supports workers
