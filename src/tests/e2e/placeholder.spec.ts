import { test, expect } from '@playwright/test';

test('placeholder test', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/pimco-renderer-2d/);
});
