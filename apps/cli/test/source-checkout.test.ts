import { it, expect } from 'vitest';
import { fixture } from './helpers/commands.js';
import { updaterFixture } from './helpers/updater.js';
it('keeps a source-checkout update command off the release network and rejects runtime rollback', async () => {
  const f = await fixture();
  try {
    const runtime = await updaterFixture(f.root, f.project);
    f.context.updater = runtime.updater;
    f.context.bundledRuntimeVersion = '0.0.0';
    const result = await f.run(['update', 'check']);
    expect(result.data).toMatchObject({ status: 'not-checked' });
    expect(runtime.requests).toEqual([]);
    await expect(
      runtime.updater.rollback({ sourceCheckout: true }, { scopes: ['manage-settings'] }),
    ).rejects.toMatchObject({ code: 'RUNTIME_UNMANAGED' });
  } finally {
    await f.close();
  }
});
