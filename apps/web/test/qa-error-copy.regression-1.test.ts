// @vitest-environment jsdom
// Regression: ISSUE-002, identical error/action text appeared twice.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { it, expect, vi, afterEach } from 'vitest';
import { LocalApi } from '../src/lib/api.js';
afterEach(() => vi.unstubAllGlobals());
it('keeps one error sentence when the server action repeats it', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      {
        ok: false,
        error: { code: 'SCOPE_REQUIRED', message: 'Grant author scope.', action: 'Grant author scope.' },
      },
      { status: 403 },
    ),
  );
  await expect(new LocalApi().request('/api/project')).rejects.toHaveProperty(
    'message',
    'Grant author scope.',
  );
});
it('retains a distinct actionable recovery sentence', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      {
        ok: false,
        error: { code: 'STALE_BASE', message: 'The source changed.', action: 'Compare the retained draft.' },
      },
      { status: 409 },
    ),
  );
  await expect(new LocalApi().request('/api/project')).rejects.toHaveProperty(
    'message',
    'The source changed. Compare the retained draft.',
  );
});
