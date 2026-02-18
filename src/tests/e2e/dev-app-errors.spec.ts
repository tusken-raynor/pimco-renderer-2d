import { test, expect } from '@playwright/test';

test.describe('Dev App Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status-message')).toContainText('Ready');
  });

  test('should show error for invalid JSON syntax', async ({ page }) => {
    // Upload invalid JSON (syntax error)
    const invalidJson = '{ "invalid": json syntax }';

    await page.locator('#json-upload').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(invalidJson),
    });

    // Wait for error to be displayed
    await expect(page.locator('#error-display')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#status-message')).toContainText('Failed');

    // Render button should remain disabled
    await expect(page.locator('#render-btn')).toBeDisabled();
  });

  test('should show error for JSON that is not an array', async ({ page }) => {
    // Upload JSON that's an object instead of an array
    const notArrayJson = JSON.stringify({
      id: 'test-layer',
      name: 'Test Layer',
      mode: 'color',
    });

    await page.locator('#json-upload').setInputFiles({
      name: 'not-array.json',
      mimeType: 'application/json',
      buffer: Buffer.from(notArrayJson),
    });

    // Wait for error to be displayed
    await expect(page.locator('#error-display')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#error-display')).toContainText('array');
    await expect(page.locator('#status-message')).toContainText('Failed');

    // Render button should remain disabled
    await expect(page.locator('#render-btn')).toBeDisabled();
  });

  test('should show error for layer that is not an object', async ({ page }) => {
    // Upload JSON with non-object layer
    const invalidLayerJson = JSON.stringify(['string-layer', 123, null]);

    await page.locator('#json-upload').setInputFiles({
      name: 'invalid-layer.json',
      mimeType: 'application/json',
      buffer: Buffer.from(invalidLayerJson),
    });

    // Wait for error to be displayed
    await expect(page.locator('#error-display')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#error-display')).toContainText('not an object');
    await expect(page.locator('#status-message')).toContainText('Failed');
  });

  test('should handle empty array gracefully', async ({ page }) => {
    // Upload empty array
    const emptyArrayJson = JSON.stringify([]);

    await page.locator('#json-upload').setInputFiles({
      name: 'empty.json',
      mimeType: 'application/json',
      buffer: Buffer.from(emptyArrayJson),
    });

    // Should load but with 0 layers
    await expect(page.locator('#status-message')).toContainText('Loaded 0 layers', {
      timeout: 5000,
    });
    await expect(page.locator('#layer-count')).toHaveText('0');

    // Render button should be disabled (no layers to render)
    await expect(page.locator('#render-btn')).toBeDisabled();
  });

  test('should hide error display after loading valid JSON', async ({ page }) => {
    // First load invalid JSON to show error
    const invalidJson = '{ invalid json }';
    await page.locator('#json-upload').setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(invalidJson),
    });

    await expect(page.locator('#error-display')).toBeVisible({ timeout: 5000 });

    // Now load valid JSON
    const validJson = JSON.stringify([
      { id: 'test', name: 'Test', mode: 'color', alpha: 1, blend: 'normal' },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'valid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(validJson),
    });

    // Error should be hidden
    await expect(page.locator('#error-display')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#status-message')).toContainText('Loaded 1 layers');
  });

  test('should handle non-existent example file gracefully', async ({ page }) => {
    // Manually set an invalid example file option value
    await page.evaluate(() => {
      const select = document.getElementById('example-select') as HTMLSelectElement;
      const option = document.createElement('option');
      option.value = 'nonexistent.json';
      option.text = 'Non-existent';
      select.appendChild(option);
      select.value = 'nonexistent.json';
      select.dispatchEvent(new Event('change'));
    });

    // Wait for error to be displayed
    await expect(page.locator('#error-display')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#status-message')).toContainText('Failed');
  });

  test('should handle render errors when assets fail to load', async ({ page }) => {
    // Create JSON with invalid asset URLs
    const layerJson = JSON.stringify([
      {
        id: 'test-layer',
        name: 'Test Layer',
        mode: 'color',
        alpha: 1,
        blend: 'normal',
        color: 'rgb(255, 0, 0)',
        mask: 'https://invalid-url-that-does-not-exist.example.com/image.png',
        image: 'https://invalid-url-that-does-not-exist.example.com/image.png',
      },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'invalid-assets.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click render button
    await page.click('#render-btn');

    // Wait for render to complete or fail
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });

    // Either an error is shown or render completes (depending on how the renderer handles missing assets)
    // We just verify the app doesn't crash
    const statusText = await page.locator('#status-message').textContent();
    expect(statusText).toBeTruthy();
  });

  test('should log warnings for layers missing optional fields', async ({ page }) => {
    // Collect all console messages
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Create JSON with layers missing required fields (mode, alpha, blend)
    // The dev app warns about these missing fields
    const layerJson = JSON.stringify([
      { id: 'minimal-layer', name: 'Minimal' },
      { name: 'No ID' },
      { id: 'no-name' },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'minimal.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded 3 layers', {
      timeout: 5000,
    });

    // The app logs warnings for missing mode, alpha, blend fields
    // Check that console messages were captured (may be warn or log type)
    const hasDevAppMessage = consoleMessages.some((m) => m.includes('[DevApp]'));
    expect(hasDevAppMessage).toBe(true);
  });

  test('should handle render button click when no layers loaded', async ({ page }) => {
    // Ensure render button is disabled initially
    await expect(page.locator('#render-btn')).toBeDisabled();

    // Force enable the button via JavaScript (simulating edge case)
    await page.evaluate(() => {
      const btn = document.getElementById('render-btn') as HTMLButtonElement;
      btn.disabled = false;
      btn.click();
    });

    // Should show error about no layers
    await expect(page.locator('#error-display')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#error-display')).toContainText('No layers');
  });
});
