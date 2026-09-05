import { SettingsStore } from '../../../packages/project-fs/src/settings/store.js';
const store = new SettingsStore(process.argv[2]!);
process.on('message', async message => {
  if (message === 'hold') {
    await store.update(async draft => {
      draft.updates.offline = true;
      process.send?.({status:'held'});
      await new Promise(() => {});
    });
  }
});
process.send?.({status:'ready'});
