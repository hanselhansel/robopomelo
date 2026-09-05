import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { localApp } from './local-app.js';
if (process.env.ROBOPOMELO_BENCHMARK_REPORT)
  test('10,000-record editor responds within 200ms on the recorded reference machine', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    const source = JSON.parse(await readFile(process.env.ROBOPOMELO_BENCHMARK_REPORT!, 'utf8'));
    const app = await localApp(source.projectDirectory);
    try {
      const start = performance.now();
      await page.goto(app.url);
      await expect(page.getByRole('heading', { name: 'Frame the deployment', exact: true })).toBeVisible({
        timeout: 60000,
      });
      await page.getByRole('button', { name: 'Choose editing scopes', exact: true }).click();
      await page.getByLabel('Edit planning records', { exact: true }).check();
      await page.getByRole('button', { name: 'Authorize selected scopes', exact: true }).click();
      await expect(
        page.getByRole('status').filter({ hasText: 'Selected project authority updated.' }),
      ).toBeVisible();
      await page
        .getByRole('navigation', { name: 'Project sections' })
        .getByRole('button', { name: 'Frame', exact: true })
        .click();
      const input = page.getByLabel('Project name', { exact: true });
      await input.focus();
      await page.evaluate(() => {
        const input =
          document.querySelector<HTMLInputElement>('input[id="project-name"]') ??
          Array.from(document.querySelectorAll('input')).find((input) =>
            input.value.startsWith('Fictional 10,000'),
          )!;
        input.addEventListener(
          'input',
          () => {
            const began = performance.now();
            requestAnimationFrame(() =>
              requestAnimationFrame(() => (input.dataset.responseMs = String(performance.now() - began))),
            );
          },
          { once: true },
        );
      });
      await input.press('End');
      await input.press('x');
      await expect(input).toHaveAttribute('data-response-ms', /.+/);
      const responseMs = Number(await input.getAttribute('data-response-ms'));
      await page.screenshot({ path: testInfo.outputPath('large-project.png'), fullPage: false });
      await writeFile(
        testInfo.outputPath('performance.json'),
        JSON.stringify(
          {
            responseMs,
            openAndAuthorizeMs: performance.now() - start,
            reference: source.hardware,
            records: source.records,
          },
          null,
          2,
        ),
      );
      expect(responseMs).toBeLessThanOrEqual(200);
      await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 60000 });
    } finally {
      await app.close();
    }
  });
