import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localApp } from './local-app.js';
test('review mode preserves cumulative edits and applies only the exact inspected proposal', async ({
  page,
}) => {
  test.setTimeout(60000);
  const app = await localApp();
  try {
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Fictional original');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('button', { name: 'Choose editing scopes', exact: true }).click();
    await page.getByLabel('Edit planning records', { exact: true }).check();
    await page.getByLabel('Change mode').selectOption('review-each-change');
    await page.getByRole('button', { name: 'Authorize selected scopes' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Selected project authority updated.' }),
    ).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Project sections' });
    await nav.getByRole('button', { name: 'Frame', exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill('Fictional first proposal');
    await expect(page.getByText('Proposed', { exact: true })).toBeVisible();
    const first = await readFile(join(app.project, 'deployment.yaml'), 'utf8');
    expect(first).toContain('Fictional original');
    expect(first).not.toContain('Fictional first proposal');
    await page.getByLabel('Project name', { exact: true }).fill('Fictional final proposal');
    await expect(page.getByText('Proposed', { exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Changes', exact: true }).click();
    await page
      .locator('details.record summary')
      .filter({ hasText: 'Edit deployment planning document' })
      .click();
    await expect(
      page.getByLabel('Changed fields').getByText('Fictional final proposal', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Apply exact proposal' }).click();
    await expect
      .poll(() => readFile(join(app.project, 'deployment.yaml'), 'utf8'))
      .toContain('Fictional final proposal');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await nav.getByRole('button', { name: 'Frame', exact: true }).click();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Fictional final proposal');
  } finally {
    await app.close();
  }
});
