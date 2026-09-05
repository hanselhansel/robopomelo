import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localApp } from './local-app.js';

test('notices an external edit, refreshes explicitly and opens malformed source inspection', async ({
  page,
}) => {
  const app = await localApp();
  try {
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Original source name');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('button', { name: 'Continue inspection only', exact: true }).click();
    const source = join(app.project, 'deployment.yaml');
    const original = await readFile(source, 'utf8');
    await writeFile(source, original.replace('Original source name', 'External source name'));
    const notice = page.getByRole('status', { name: 'External source update' });
    await expect(notice).toBeVisible();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Original source name');
    await notice.getByRole('button', { name: 'Recheck source', exact: true }).click();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('External source name');
    await expect(notice).toHaveCount(0);
    await writeFile(source, 'malformed: [');
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: 'Recheck source', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Source needs inspection', exact: true })).toBeVisible();
    await expect(page.getByText(/Last readable revision:/)).toBeVisible();
    expect(await readFile(source, 'utf8')).toBe('malformed: [');
  } finally {
    await app.close();
  }
});

test('external notice preserves pending local input and directs explicit conflict comparison', async ({
  page,
}) => {
  const app = await localApp();
  try {
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Original source name');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('button', { name: 'Continue inspection only', exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill('My retained local input');
    await expect(page.getByText('Save failed', { exact: true })).toBeVisible();
    const source = join(app.project, 'deployment.yaml');
    const external = (await readFile(source, 'utf8')).replace('Original source name', 'External source name');
    await writeFile(source, external);
    const notice = page.getByRole('status', { name: 'External source update' });
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('button', { name: 'Recheck source', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('My retained local input');
    expect(await readFile(source, 'utf8')).toBe(external);
    await notice.getByRole('button', { name: 'Compare external source', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Resolve changes against the current source', exact: true }),
    ).toBeVisible();
    expect(await readFile(source, 'utf8')).toBe(external);
  } finally {
    await app.close();
  }
});
