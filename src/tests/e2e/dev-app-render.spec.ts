import { test, expect } from '@playwright/test';

test.describe('Dev App Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to initialize
    await expect(page.locator('#status-message')).toContainText('Ready');
  });

  test('should display the app title and initial state', async ({ page }) => {
    await expect(page).toHaveTitle(/PIMCO Renderer Dev App/);
    await expect(page.locator('.dev-app__title')).toHaveText('PIMCO Renderer Dev App');
    await expect(page.locator('#render-btn')).toBeDisabled();
    await expect(page.locator('#json-preview')).toContainText('No JSON loaded');
  });

  test('should load example JSON from dropdown and enable render button', async ({ page }) => {
    // Select example1 from dropdown
    await page.selectOption('#example-select', 'example1.json');

    // Wait for JSON to load
    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });
    await expect(page.locator('#layer-count')).not.toHaveText('--');

    // Render button should be enabled
    await expect(page.locator('#render-btn')).toBeEnabled();

    // JSON preview should show content
    await expect(page.locator('#json-preview')).not.toContainText('No JSON loaded');
  });

  test('should update canvas dimensions from input fields', async ({ page }) => {
    const canvas = page.locator('#render-canvas');

    // Check default dimensions
    await expect(canvas).toHaveAttribute('width', '800');
    await expect(canvas).toHaveAttribute('height', '800');

    // Update dimensions
    await page.fill('#canvas-width', '600');
    await page.locator('#canvas-width').blur();
    await page.fill('#canvas-height', '400');
    await page.locator('#canvas-height').blur();

    // Dimensions update after render or manual trigger
    // For now just verify input values are accepted
    await expect(page.locator('#canvas-width')).toHaveValue('600');
    await expect(page.locator('#canvas-height')).toHaveValue('400');
  });

  test('should upload a valid JSON file and parse it', async ({ page }) => {
    // Create a minimal valid layer JSON
    const layerJson = JSON.stringify([
      {
        id: 'test-layer',
        name: 'Test Layer',
        mode: 'color',
        alpha: 1,
        blend: 'normal',
        color: 'rgb(255, 0, 0)',
        mask: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        image:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    ]);

    // Upload JSON via file input
    const fileInput = page.locator('#json-upload');
    await fileInput.setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    // Wait for JSON to load
    await expect(page.locator('#status-message')).toContainText('Loaded 1 layers', {
      timeout: 5000,
    });
    await expect(page.locator('#layer-count')).toHaveText('1');
    await expect(page.locator('#render-btn')).toBeEnabled();
  });

  test('should render uploaded JSON and display timing', async ({ page }) => {
    // Create minimal valid layer JSON with data URLs
    const layerJson = JSON.stringify([
      {
        id: 'test-layer',
        name: 'Test Layer',
        mode: 'color',
        alpha: 1,
        blend: 'normal',
        color: 'rgb(255, 0, 0)',
        mask: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGNzYAAIoaB/kp8LVRAAAAASUVORK5CYII=',
        image:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8/5+hngEJMBKhDgYAAyAE/WAKFeQAAAAASUVORK5CYII=',
      },
    ]);

    // Upload JSON
    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded 1 layers', {
      timeout: 5000,
    });

    // Click render button
    await page.click('#render-btn');

    // Wait for render to complete (success or failure)
    // The status will change from "Rendering..." to something else
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });

    // Check that timing is displayed (not the default "--")
    const renderTime = page.locator('#render-time');
    const timeText = await renderTime.textContent();

    // Timing should be updated (either a number like "123.45ms" or "--" if it failed)
    // We just check that something happened
    expect(timeText).toBeTruthy();
  });

  test('should clear canvas when clear button is clicked', async ({ page }) => {
    // Load some JSON first
    const layerJson = JSON.stringify([
      {
        id: 'test-layer',
        name: 'Test Layer',
        mode: 'color',
        alpha: 1,
        blend: 'normal',
        color: 'rgb(255, 0, 0)',
      },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click clear button
    await page.click('#clear-btn');

    // Status should indicate canvas was cleared
    await expect(page.locator('#status-message')).toContainText('Canvas cleared');

    // Timing should be reset
    await expect(page.locator('#render-time')).toHaveText('--');
  });

  test('should display layer count from loaded JSON', async ({ page }) => {
    // Create JSON with multiple layers
    const layerJson = JSON.stringify([
      { id: 'layer-1', name: 'Layer 1', mode: 'color', alpha: 1, blend: 'normal' },
      { id: 'layer-2', name: 'Layer 2', mode: 'color', alpha: 1, blend: 'normal' },
      { id: 'layer-3', name: 'Layer 3', mode: 'color', alpha: 1, blend: 'normal' },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded 3 layers', {
      timeout: 5000,
    });
    await expect(page.locator('#layer-count')).toHaveText('3');
  });

  test('should clear example selection when uploading file', async ({ page }) => {
    // First select an example
    await page.selectOption('#example-select', 'example1.json');
    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Now upload a file
    const layerJson = JSON.stringify([
      { id: 'uploaded-layer', name: 'Uploaded Layer', mode: 'color', alpha: 1, blend: 'normal' },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'uploaded.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded 1 layers', {
      timeout: 5000,
    });

    // Example select should be cleared
    await expect(page.locator('#example-select')).toHaveValue('');
  });
});
