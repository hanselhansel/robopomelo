// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { App } from '../src/App.js';
import { api } from '../src/lib/api.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as Window & { robopomelo?: unknown }).robopomelo;
});
it('surfaces a pending setup import at startup instead of hiding it behind the open project', async () => {
  (window as Window & { robopomelo?: unknown }).robopomelo = { confirmSetup: vi.fn() };
  vi.spyOn(api, 'bootstrap').mockResolvedValue({ projectEpoch: 'new', projectOpen: true, toolVersion: '1' });
  const request = vi.spyOn(api, 'request').mockImplementation(async (path) => {
    if (path === '/api/intake/status')
      return { state: 'pending', revision: 'rev-9', projectEpoch: 'new', imported: 1, total: 2, error: 'Renderer reloaded' };
    throw new Error('Unexpected ' + path);
  });
  render(<App />);
  await screen.findByText(/1 of 2 planning inputs saved/);
  expect(request).toHaveBeenCalledWith('/api/intake/status', undefined, false);
  expect(request.mock.calls.some(([path]) => path === '/api/project')).toBe(false);
});
