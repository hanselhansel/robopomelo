// Regression: ISSUE-005, reverse Tab left the specified modal focus cycle.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { test, expect } from '@playwright/test';
import { localApp } from './local-app.js';
test('native dialogs cycle focus in both directions and restore the invoking control', async ({ page }) => {
  const app = await localApp();
  try {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Fictional dialog audit');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    const trust = page.getByRole('dialog', { name: 'Inspect or authorize this folder' });
    await expect(trust).toBeVisible();
    await trust.getByRole('button', { name: 'Continue inspection only' }).click();
    const trigger = page.getByRole('button', { name: 'Project sections', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Project sections', exact: true });
    await expect(dialog.getByRole('heading', { name: 'Project sections' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Switch project' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally {
    await app.close();
  }
});
