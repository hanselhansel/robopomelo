import { expect, it } from 'vitest';
import { PreviewStore, attachmentPreviewRoutes } from '../../apps/desktop/src/preview-protocol.js';
import { startServer } from '@robopomelo/application';
const png = () =>
  new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
      'base64',
    ),
  );
it('binds opaque PNG previews to context and selection with revocation', () => {
  const store = new PreviewStore();
  const bytes = png();
  const [id] = store.put('selected', 'project-a', [bytes]);
  expect(id).toMatch(/^[a-f0-9-]{36}$/);
  expect(store.read(id!, 'project-a')).toEqual(bytes);
  expect(() => store.read(id!, 'project-b')).toThrow('PREVIEW_UNAVAILABLE');
  bytes[0] = 0;
  expect(store.read(id!, 'project-a')[0]).toBe(137);
  const copy = store.read(id!, 'project-a');
  copy[0] = 0;
  expect(store.read(id!, 'project-a')[0]).toBe(137);
  store.remove('selected');
  expect(() => store.read(id!, 'project-a')).toThrow('PREVIEW_UNAVAILABLE');
});

it('serves fixed PNG bytes only through the authenticated current project epoch', async () => {
  const store = new PreviewStore();
  const [id] = store.put('selected', '0', [png()]);
  const host = await startServer({ toolVersion: 'test', routes: attachmentPreviewRoutes(store) });
  const url = host.url + '/api/attachments/previews/' + id;
  try {
    expect((await fetch(url)).status).toBe(403);
    const session = await fetch(host.url + '/api/session', {
      method: 'POST',
      headers: { Origin: host.url, 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: new URL(host.bootstrapUrl).hash.slice(1) }),
    });
    const { data } = await session.json();
    const headers = {
      Origin: host.url,
      Authorization: 'Bearer ' + data.credential,
      'X-RP-Project-Epoch': '0',
    };
    const preview = await fetch(url, { headers });
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await preview.arrayBuffer())).toEqual(png());
    expect((await fetch(url, { headers: { ...headers, Origin: 'https://untrusted.invalid' } })).status).toBe(
      403,
    );
    host.setProjectStatus({ projectOpen: false, projectEpoch: '1' });
    expect((await fetch(url, { headers })).status).toBe(409);
    expect((await fetch(url, { headers: { ...headers, 'X-RP-Project-Epoch': '1' } })).status).toBe(404);
  } finally {
    await host.close();
  }
});
it('bounds previews and rejects active or malformed content', () => {
  const store = new PreviewStore();
  expect(() => store.put('s', 'p', [new TextEncoder().encode('<svg onload="alert(1)"/>')])).toThrow();
  expect(() => store.put('s', 'p', Array.from({ length: 4 }, png))).toThrow();
  for (let index = 0; index < 20; index++) store.put('s' + index, 'p', [png()]);
  expect(() => store.put('excess', 'p', [png()])).toThrow('PREVIEW_LIMIT');
  store.clear();
  expect(store.put('new', 'p', [png()])).toHaveLength(1);
});
