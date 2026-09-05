import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { localApp } from './local-app.js';
import { authorFiveSteps, knowledge, navigate, operator } from './acceptance/author.js';
import { cli, validate, zipMembers } from './acceptance/artifacts.js';

test('blank browser project completes five steps, supplied review, stale approval and exact portable export', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const app = await localApp();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  try {
    await page.goto(app.url);
    await page.getByLabel('Absolute folder path').fill(app.project);
    await page.getByLabel('Project name', { exact: true }).fill('Fictional small AMR acceptance journey');
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('button', { name: 'Choose editing scopes', exact: true }).click();
    for (const scope of [
      'Edit planning records',
      'Add and manage evidence',
      'Export handoff packages',
      'Record supplied decisions and protected obligations',
    ])
      await page.getByLabel(scope, { exact: true }).check();
    await page.getByRole('button', { name: 'Authorize selected scopes', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Selected project authority updated.' }),
    ).toBeVisible();
    await navigate(page, 'Frame');
    const blank = await cli('show', app.project);
    expect(blank.deployment.workflows).toHaveLength(0);
    expect(blank.deployment.acceptanceTests).toHaveLength(0);
    await authorFiveSteps(page);
    const authored = await cli('show', app.project);
    expect(authored.validation.counts.blockers, JSON.stringify(authored.validation.findings)).toBe(0);
    expect(authored.validation.readiness).toBe('warnings');
    expect(authored.deployment.challengeAnswers).toHaveLength(16);
    for (const collection of [
      'stakeholders',
      'needs',
      'workflows',
      'kpis',
      'requirements',
      'acceptanceTests',
    ] as const)
      expect(authored.deployment[collection]).toHaveLength(1);
    expect(authored.deployment.kpis[0]!.baseline).toMatchObject({
      state: 'unknown',
      nextAction: expect.any(String),
    });
    expect(authored.deployment.acceptanceTests[0]!.criterion).toEqual({
      state: 'provided',
      value: { kind: 'boolean', expected: false },
    });
    await page.reload();
    await navigate(page, 'Review & export');
    await page.getByRole('button', { name: 'Traceability', exact: true }).click();
    await expect(page.getByRole('table')).toContainText('Predictable pallet movement');
    await expect(page.getByRole('table')).toContainText('Transfer capability');
    await navigate(page, 'Evidence');
    await page.getByRole('button', { name: 'Add evidence', exact: true }).click();
    const evidence = page.getByRole('dialog', { name: 'Add evidence' });
    const evidenceBytes = Buffer.from(
      'Fictional planning observation. No AMR execution or human approval is asserted.\n',
    );
    await evidence.getByLabel('Evidence title').fill('Fictional cell notes');
    await evidence
      .getByLabel('Local file')
      .setInputFiles({ name: 'cell-notes.txt', mimeType: 'text/plain', buffer: evidenceBytes });
    await evidence.getByRole('button', { name: 'Add evidence', exact: true }).click();
    await expect(evidence).toHaveCount(0);
    await navigate(page, 'Review & export');
    await page.getByRole('button', { name: 'Record operator decision', exact: true }).click();
    const decision = page.getByRole('dialog', { name: 'Record a supplied operator decision' });
    const reviewer = await decision
      .getByLabel('Supplied reviewer')
      .locator('option')
      .filter({ hasText: operator })
      .getAttribute('value');
    await decision.getByLabel('Supplied reviewer').selectOption(reviewer!);
    await decision.getByLabel('Recorded by', { exact: true }).fill(operator);
    await decision
      .getByLabel('Source of supplied decision')
      .fill('Fictional test script: Ada supplies approval of this planning fixture only');
    await decision.getByLabel('Supplied decision date and time (ISO 8601)').fill('2026-09-05T09:00:00Z');
    const warnings = decision.getByRole('group', { name: 'Unacknowledged warnings' });
    expect(await warnings.getByRole('checkbox').count()).toBeGreaterThan(0);
    await expect(
      decision.getByRole('button', { name: 'Record supplied decision', exact: true }),
    ).toBeDisabled();
    for (const check of await warnings.getByRole('checkbox').all()) await check.check();
    await decision
      .getByLabel('Supplied acknowledgment reason')
      .fill(
        'Fictional Ada accepts the documented baseline uncertainty for planning; measurement is required before implementation',
      );
    await decision.getByRole('button', { name: 'Record selected warning acknowledgments' }).click();
    await expect(
      decision.getByRole('button', { name: 'Record supplied decision', exact: true }),
    ).toBeEnabled();
    await decision.getByRole('button', { name: 'Record supplied decision', exact: true }).click();
    await expect(decision).toHaveCount(0);
    const approved = await cli('show', app.project);
    expect(approved.approvalStatus).toBe('current');
    expect(approved.deployment.review.acknowledgments.length).toBeGreaterThan(0);
    const originalScope = authored.deployment.project.scope;
    expect(originalScope?.state).toBe('provided');
    await navigate(page, 'Frame');
    const framing = page.getByRole('region', { name: 'Project framing' });
    await knowledge(framing, 'scope', 'Material change: receiving to a second staging location');
    await navigate(page, 'Review & export');
    expect((await cli('show', app.project)).approvalStatus).toBe('stale');
    await navigate(page, 'Frame');
    await knowledge(framing, 'scope', (originalScope as { value: string }).value);
    await navigate(page, 'Review & export');
    const current = await cli('show', app.project);
    expect(current.planningHash).toBe(approved.planningHash);
    expect(current.approvalStatus).toBe('stale');
    expect(current.deployment.review.approvals).toHaveLength(1);
    await page.getByRole('button', { name: 'Download handoff package', exact: true }).click();
    const handoff = page.getByRole('dialog', { name: 'Prepare the handoff package' });
    await handoff.getByLabel('Fictional cell notes', { exact: true }).check();
    await handoff.getByRole('button', { name: 'Preview package files' }).click();
    await expect(handoff.getByText('deployment.yaml', { exact: true })).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await handoff.getByRole('button', { name: 'Download ZIP', exact: true }).click();
    const zipPath = testInfo.outputPath('acceptance-handoff.zip');
    await (await downloaded).saveAs(zipPath);
    const members = zipMembers(await readFile(zipPath));
    const source = await readFile(join(app.project, 'deployment.yaml'));
    expect(members.get('deployment.yaml')).toEqual(source);
    expect(parse(source.toString())).toEqual(current.deployment);
    const manifest = JSON.parse(members.get('manifest.json')!.toString());
    expect(manifest).toMatchObject({
      sourceHash: digest(source),
      sourceRevision: current.sourceRevision,
      planningHash: current.planningHash,
      readiness: current.validation.readiness,
      approvalStatus: 'stale',
    });
    expect(manifest.sourceHash).toBe(current.sourceHash);
    expect([...members.keys()].sort()).toEqual(
      [...manifest.members.map((m: { path: string }) => m.path), 'manifest.json'].sort(),
    );
    for (const member of manifest.members) {
      expect(members.get(member.path)?.length).toBe(member.size);
      expect(digest(members.get(member.path)!)).toBe(member.sha256);
    }
    const attachment = current.deployment.evidence.find((e) => e.location.kind === 'attachment')!;
    expect(manifest.evidence).toContainEqual({
      id: attachment.id,
      purpose: attachment.purpose,
      disposition: 'selected',
    });
    expect(manifest.evidence).toContainEqual({
      id: current.deployment.evidence.find((e) => e.location.kind === 'future')!.id,
      purpose: 'acceptance-requirement',
      disposition: 'future',
    });
    expect(members.get((attachment.location as { path: string }).path)).toEqual(evidenceBytes);
    const report = JSON.parse(members.get('validation-report.json')!.toString());
    const cliReport = await validate(app.project);
    expect(report).toMatchObject({
      sourceHash: cliReport.sourceHash,
      sourceRevision: cliReport.sourceRevision,
      readiness: cliReport.readiness,
      counts: cliReport.counts,
    });
    expect(errors).toEqual([]);
    await testInfo.attach('acceptance-runtime-and-source', {
      body: JSON.stringify(
        {
          browser: testInfo.project.name,
          version: browser.version(),
          sourceRevision: current.sourceRevision,
          sourceHash: current.sourceHash,
          manifest,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    await app.close();
  }
});
