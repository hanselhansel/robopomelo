import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localApp } from './local-app.js';

test('retains a failed save behind the navigation guard and retries it before continuing', async ({
  page,
}) => {
  const app = await localApp();
  try {
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Original source name');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('button', { name: 'Choose editing scopes', exact: true }).click();
    await page.getByLabel('Edit planning records', { exact: true }).check();
    await page.getByRole('button', { name: 'Authorize selected scopes', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Selected project authority updated.' }),
    ).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Project sections' });
    await nav.getByRole('button', { name: 'Frame', exact: true }).click();
    await page.route('**/api/patch/apply', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: { code: 'SCOPE_REQUIRED', message: 'Temporary save denial.' },
        }),
      }),
    );
    await page.getByLabel('Project name', { exact: true }).fill('Retained local change');
    await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Material flow', exact: true }).click();
    const guard = page.getByRole('dialog', { name: 'Keep your unsaved work', exact: true });
    await expect(guard).toBeVisible();
    const source = await readFile(join(app.project, 'deployment.yaml'), 'utf8');
    expect(source).toContain('Original source name');
    expect(source).not.toContain('Retained local change');
    await guard.getByRole('button', { name: 'Stay here', exact: true }).click();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Retained local change');
    await nav.getByRole('button', { name: 'Material flow', exact: true }).click();
    await expect(guard).toBeVisible();
    await page.unroute('**/api/patch/apply');
    await guard.getByRole('button', { name: 'Retry and continue', exact: true }).click();
    await expect(guard).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Specify material flow', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => readFile(join(app.project, 'deployment.yaml'), 'utf8'))
      .toContain('Retained local change');
    await nav.getByRole('button', { name: 'Frame', exact: true }).click();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Retained local change');
  } finally {
    await app.close();
  }
});
