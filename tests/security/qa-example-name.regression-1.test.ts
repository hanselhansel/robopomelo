// Regression: ISSUE-001, entered example project names were ignored.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { it, expect } from 'vitest';
import { join } from 'node:path';
import { appFixture } from './helpers/app.js';
import { createInboundExample } from '@robopomelo/core';
it('preserves an explicit example name through real HTTP creation and disk readback', async () => {
  const app = await appFixture();
  try {
    const created = await app.call('/api/projects/create', {
      path: join(app.temp, 'named-example'),
      name: 'Fictional receiving audit',
      example: 'inbound-pallet',
    });
    expect(created.status).toBe(200);
    const read = await app.call('/api/project');
    expect(read.body.data.snapshot.deployment.project.name).toBe('Fictional receiving audit');
    expect(read.body.data.snapshot.deployment.extensions['robopomelo.example']).toEqual({ fictional: true });
  } finally {
    await app.close();
  }
});
it('retains the canonical fictional title when no example name was supplied', () => {
  expect(
    createInboundExample({ id: 'example', revision: 'r1', timestamp: '2026-09-05T00:00:00Z' }).project.name,
  ).toBe('Inbound pallet transfer (fictional example)');
});
it('keeps the CLI example default when init has no name option', async () => {
  const { fixture } = await import('../../apps/cli/test/helpers/commands.js');
  const { parseCommand } = await import('../../apps/cli/src/arguments.js');
  const { executeCommand } = await import('../../apps/cli/src/dispatch.js');
  const host = await fixture();
  try {
    await executeCommand(
      parseCommand(['init', 'default-example', '--example', 'inbound-pallet', '--authorize', 'author']),
      host.context,
    );
    expect((await host.project.snapshot()).deployment.project.name).toBe(
      'Inbound pallet transfer (fictional example)',
    );
  } finally {
    await host.close();
  }
});
