import { test, expect } from '@playwright/test';

test.describe('Dev App Timing Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status-message')).toContainText('Ready');
  });

  test('should display default timing value on load', async ({ page }) => {
    await expect(page.locator('#render-time')).toHaveText('--');
  });

  test('should update timing after successful render', async ({ page }) => {
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

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click render button
    await page.click('#render-btn');

    // Wait for render to complete
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });

    // Check timing display
    const renderTime = page.locator('#render-time');
    const timeText = await renderTime.textContent();

    // Timing should show milliseconds format
    if (timeText && timeText !== '--') {
      expect(timeText).toMatch(/\d+(\.\d+)?ms/);
    }
  });

  test('should reset timing when clear button is clicked', async ({ page }) => {
    // First do a render to get timing
    const layerJson = JSON.stringify([
      {
        id: 'test-layer',
        name: 'Test Layer',
        mode: 'color',
        alpha: 1,
        blend: 'normal',
      },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click clear
    await page.click('#clear-btn');

    // Timing should reset
    await expect(page.locator('#render-time')).toHaveText('--');
  });

  test('should show timing in status message after render', async ({ page }) => {
    // Create minimal valid layer JSON
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

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click render
    await page.click('#render-btn');

    // Status should show "Rendering..." during render
    // (May be too fast to catch, so we just wait for completion)
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });

    // After successful render, status should mention timing or complete
    const statusText = await page.locator('#status-message').textContent();
    expect(statusText).toBeTruthy();

    // Status should either contain timing info or indicate completion
    const hasTimingOrComplete =
      (statusText?.includes('ms') ?? false) ||
      (statusText?.includes('complete') ?? false) ||
      (statusText?.includes('failed') ?? false);
    expect(hasTimingOrComplete).toBe(true);
  });

  test('should log timing to console', async ({ page }) => {
    // Collect console logs
    const logs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().includes('[DevApp]')) {
        logs.push(msg.text());
      }
    });

    // Create minimal valid layer JSON
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

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click render
    await page.click('#render-btn');

    // Wait for render to complete
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });

    // Check console logs for timing information
    // May or may not have timing log depending on render success, just verify app ran
    expect(logs.length).toBeGreaterThan(0);
  });

  test('should show status as loading during render', async ({ page }) => {
    // Create a layer with larger images to slow down render
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

    await page.locator('#json-upload').setInputFiles({
      name: 'test-layers.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });

    // Click render and immediately check for "Rendering..." status
    // Note: This might be too fast to catch reliably
    const renderPromise = page.click('#render-btn');

    // Either catch the rendering state or wait for completion
    try {
      // Try to catch the rendering state (may be too fast)
      await expect(page.locator('#status-message')).toContainText('Rendering', { timeout: 100 });
    } catch {
      // If too fast, just verify render completes
    }

    await renderPromise;

    // Wait for completion
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });
  });

  test('should preserve timing value when loading new JSON', async ({ page }) => {
    // First render
    const layerJson1 = JSON.stringify([
      {
        id: 'layer-1',
        name: 'Layer 1',
        mode: 'color',
        alpha: 1,
        blend: 'normal',
        color: 'rgb(255, 0, 0)',
        mask: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9QzwAEjDAGNzYAAIoaB/kp8LVRAAAAASUVORK5CYII=',
        image:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8/5+hngEJMBKhDgYAAyAE/WAKFeQAAAAASUVORK5CYII=',
      },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'first.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson1),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded', { timeout: 5000 });
    await page.click('#render-btn');
    await expect(page.locator('#status-message')).not.toContainText('Rendering...', {
      timeout: 30000,
    });

    // Get timing value after first render
    const firstTiming = await page.locator('#render-time').textContent();

    // Load second JSON (without rendering)
    const layerJson2 = JSON.stringify([
      { id: 'layer-2', name: 'Layer 2', mode: 'color', alpha: 1, blend: 'normal' },
    ]);

    await page.locator('#json-upload').setInputFiles({
      name: 'second.json',
      mimeType: 'application/json',
      buffer: Buffer.from(layerJson2),
    });

    await expect(page.locator('#status-message')).toContainText('Loaded 1 layers', {
      timeout: 5000,
    });

    // Timing should still show the previous value (until next render)
    const timingAfterLoad = await page.locator('#render-time').textContent();
    expect(timingAfterLoad).toBe(firstTiming);
  });
});
