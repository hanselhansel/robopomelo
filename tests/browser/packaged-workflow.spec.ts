import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localApp } from './local-app.js';
test('real packaged application creates and edits a project and renders every screen offline', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const app = await localApp(),
    errors: string[] = [],
    outbound: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith(new URL(app.url).origin) && !request.url().startsWith('data:'))
      outbound.push(request.url());
  });
  try {
    await page.goto(app.url);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Start with the work');
    await page.getByRole('button', { name: 'Explore the example' }).click();
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Fictional receiving review');
    await page.getByRole('button', { name: 'Create example project', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Frame the deployment', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue inspection only', exact: true }).click();
    const sections = [
      ['Frame', 'Frame the deployment'],
      ['Material flow', 'Specify material flow'],
      ['Success', 'Define success'],
      ['Requirements', 'Specify requirements'],
      ['Acceptance', 'Plan acceptance'],
      ['Review & export', 'Review & export'],
      ['Changes', 'Changes'],
      ['Evidence', 'Evidence'],
      ['History', 'History'],
      ['Settings & updates', 'Settings & updates'],
    ];
    for (const [navigation, heading] of sections) {
      await page
        .getByRole('navigation', { name: 'Project sections' })
        .getByRole('button', { name: navigation!, exact: true })
        .click();
      await expect(page.getByRole('heading', { level: 1, name: heading!, exact: true })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
    await page.getByLabel('Edit planning records', { exact: true }).check();
    await page.getByRole('button', { name: 'Authorize selected scopes', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Selected project authority updated.' }),
    ).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Project sections' })
      .getByRole('button', { name: 'Frame', exact: true })
      .click();
    await page.getByLabel('Project name', { exact: true }).fill('Fictional receiving revised');
    await page.getByLabel('Project name', { exact: true }).blur();
    await expect
      .poll(() => readFile(join(app.project, 'deployment.yaml'), 'utf8'))
      .toContain('Fictional receiving revised');
    await page.screenshot({ path: testInfo.outputPath('frame-real.png'), fullPage: true });
    await page.reload();
    await expect(page.getByLabel('Project name', { exact: true })).toHaveValue('Fictional receiving revised');
    expect(errors).toEqual([]);
    expect(outbound).toEqual([]);
  } finally {
    await app.close();
  }
});
