import { test, expect } from '@playwright/test';
import { localApp } from './local-app.js';
test('A4 and Letter print render the complete review with source identity and findings', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'Chromium produces the PDF artifacts; native print is a separate manual gate.',
  );
  test.setTimeout(60000);
  const app = await localApp();
  try {
    await page.goto(app.url);
    await page.getByRole('button', { name: 'Explore the example' }).click();
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Fictional print review');
    await page.getByRole('button', { name: 'Create example project' }).click();
    await page.getByRole('button', { name: 'Choose editing scopes' }).click();
    await page.getByLabel('Edit planning records', { exact: true }).check();
    await page.getByRole('button', { name: 'Authorize selected scopes' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Selected project authority updated.' }),
    ).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Project sections' });
    await nav.getByRole('button', { name: 'Frame', exact: true }).click();
    await page
      .getByLabel('Problem to solve value', { exact: true })
      .fill(
        'Fictional long print fixture. ' +
          Array.from(
            { length: 20 },
            (_, index) =>
              `Observation ${index + 1}: receiving queues hide incomplete handoffs; engineers must identify missing constraints and collect evidence before selecting an approach.`,
          ).join(' '),
      );
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await nav.getByRole('button', { name: 'Review & export', exact: true }).click();
    await expect(page.locator('.review-document')).toBeVisible();
    // A screen search must not silently suppress printed findings.
    await page.getByLabel('Search findings').fill('no matching visible finding');
    for (const format of ['A4', 'Letter'] as const) {
      await page.pdf({
        path: testInfo.outputPath(`review-${format}.pdf`),
        format,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center">RoboPomelo · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      });
      await expect(page.getByLabel('Search findings')).toHaveValue('no matching visible finding');
    }
  } finally {
    await app.close();
  }
});
