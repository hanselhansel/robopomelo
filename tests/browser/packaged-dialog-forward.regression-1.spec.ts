// Regression: ISSUE-005, native Safari may not advance button focus through its default Tab behavior.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { test, expect } from '@playwright/test';
import { localApp } from './local-app.js';
test('dialog keyboard progression does not depend on browser default button tabbing', async ({ page }) => {
  const app = await localApp();
  try {
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Fictional focus progression');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Inspect or authorize this folder' });
    await expect(dialog.getByRole('heading')).toBeFocused();
    await page.evaluate(() => {
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key === 'Tab') event.preventDefault();
        },
        true,
      );
    });
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Continue inspection only' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Choose editing scopes' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  } finally {
    await app.close();
  }
});
