// @vitest-environment jsdom
// Regression: ISSUE-003, the runtime summary ignored nested authoritative identities.
// Found by /qa on 2026-09-05. Report: .gstack/qa-reports/qa-report-robopomelo-2026-09-05.md
import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { Settings } from '../src/screens/Settings.js';
import { api } from '../src/lib/api.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows distinct running, selected and pending versions and the saved offline preference', async () => {
  const values: Record<string, unknown> = {
    '/api/trust': {
      root: '/fictional-project',
      grant: null,
      effectiveScopes: ['inspect'],
      mode: 'autonomous',
    },
    '/api/updates': {
      mode: 'auto',
      pin: null,
      offline: true,
      configuredOffline: false,
      offlineForced: true,
      versions: {
        launcherVersion: '1.0.0',
        bundledRuntimeVersion: '1.0.0',
        selectedRuntimeVersion: '1.1.0',
        currentRuntimeVersion: '1.0.0',
      },
      pendingVersion: '1.1.0',
      availableVersion: '1.2.0',
      rollbackEligible: true,
      installEligible: false,
      compatibility: 'Selected runtime passed compatibility checks.',
      lastOutcome: null,
    },
  };
  vi.spyOn(api, 'request').mockImplementation(async <T,>(path: string): Promise<T> => values[path] as T);
  render(<Settings onTrustChange={async () => {}} />);
  await waitFor(() =>
    expect(screen.getByText('Current session runtime').nextElementSibling?.textContent).toBe('1.0.0'),
  );
  expect(screen.getByText('Installed runtime').nextElementSibling?.textContent).toBe('1.1.0');
  expect(screen.getByText('Pending runtime').nextElementSibling?.textContent).toBe('1.1.0');
  expect((screen.getByLabelText('Offline mode') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText(/This launch remains offline/)).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Install eligible update' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
