import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import type { ProjectSnapshot } from '@robopomelo/spec';
const fixturePath = join(mkdtempSync(join(tmpdir(), 'rp-frontend-fixture-')), 'reference.cjs');
buildSync({
  entryPoints: ['apps/web/test/reference.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: fixturePath,
});
const fixture = createRequire(import.meta.url)(fixturePath);
const snapshot: ProjectSnapshot = fixture.snapshot;
const deployment = snapshot.deployment;
test('eleven frontend screens remain readable and accessible at desktop and 320px with typed server fixtures', async ({
  page,
}) => {
  test.setTimeout(120000);
  let opened = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path === '/api/session')
      data = {
        credential: 'fixture-only',
        csrf: 'fixture-only',
        projectEpoch: '1',
        toolVersion: '1.0.0-rc.1',
        projectOpen: opened,
      };
    else if (path === '/api/projects/create') {
      opened = true;
      data = { projectEpoch: '2', toolVersion: '1.0.0-rc.1', projectOpen: true };
    } else if (path === '/api/project') data = { kind: 'readable', snapshot, externalEdit: false };
    else if (path === '/api/trust')
      data = {
        root: '/fixture/selected-project',
        grant: null,
        effectiveScopes: ['inspect', 'author', 'evidence', 'export', 'record-decisions', 'manage-settings'],
        mode: 'autonomous',
      };
    else if (path === '/api/project/review') data = fixture.document;
    else if (path === '/api/project/traceability') data = fixture.traceabilityRows;
    else if (path === '/api/evidence') data = { records: deployment.evidence, observations: [] };
    else if (path === '/api/history' || path === '/api/proposals') data = [];
    else if (path === '/api/updates')
      data = {
        mode: 'off',
        pin: null,
        offline: true,
        currentVersion: '1.0.0-rc.1',
        selectedVersion: '1.0.0-rc.1',
        pendingVersion: null,
        rollbackEligible: false,
        installEligible: false,
        compatibility: 'Current specification supported',
        lastOutcome: { status: 'offline' },
      };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
  await page.goto('http://127.0.0.1:5179/#secret=fixture');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Start with the work');
  await page.screenshot({ path: 'test-results/frontend-welcome.png', fullPage: true });
  await page.getByLabel('Absolute folder path').fill('/fixture/selected-project');
  await page.getByLabel('Project name', { exact: true }).fill('Fixture project');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Frame the deployment', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [nav, title] of [
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
    ]) {
      if (width < 960) await page.getByRole('button', { name: 'Project sections', exact: true }).click();
      await page
        .getByRole('navigation', { name: 'Project sections' })
        .getByRole('button', { name: nav!, exact: true })
        .click();
      await expect(page.getByRole('heading', { name: title!, level: 1, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          description: v.description,
          nodes: v.nodes.map((n) => n.target),
        })),
      ).toEqual([]);
      await page.screenshot({
        path: `test-results/frontend-${nav!.replaceAll(/[^a-z]/gi, '-')}-${width}.png`,
        fullPage: false,
      });
    }
  }
});
