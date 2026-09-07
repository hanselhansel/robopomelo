// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Preview } from '../src/features/intake/Preview.js';
import { api } from '../src/lib/api.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('uses the authenticated local API and releases the normalized bitmap after painting', async () => {
  const drawImage = vi.fn();
  const close = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 80, height: 120, close }));
  const raw = vi
    .spyOn(api, 'raw')
    .mockResolvedValue(new Response('png', { headers: { 'content-type': 'image/png' } }));
  render(<Preview id="opaque-id" name="layout.pdf" />);
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(raw).toHaveBeenCalledWith(
    '/api/attachments/previews/opaque-id',
    undefined,
    true,
    undefined,
    expect.any(AbortSignal),
  );
  expect(drawImage).toHaveBeenCalledOnce();
  expect(screen.getByRole('img', { name: 'Local preview of layout.pdf' })).toHaveProperty('width', 80);
});
it('does not decode an unauthorized response and keeps a useful retained-file explanation', async () => {
  const decode = vi.fn();
  vi.stubGlobal('createImageBitmap', decode);
  vi.spyOn(api, 'raw').mockResolvedValue(
    new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
  );
  render(<Preview id="expired" name="layout.pdf" />);
  await screen.findByText('Preview unavailable. The selected file is retained.');
  expect(decode).not.toHaveBeenCalled();
});
