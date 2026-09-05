import { SafeRoot } from '../../../packages/project-fs/src/fs/safe-fs.js';
import { acquireLock } from '../../../packages/project-fs/src/fs/lock.js';
const root = await SafeRoot.open(process.argv[2]!);
let lease: Awaited<ReturnType<typeof acquireLock>>|undefined;
process.on('message', async message => {
  try {
    if (message === 'acquire') {lease = await acquireLock(root); process.send?.({status:'acquired'});}
    if (message === 'release') {await lease?.release(); process.send?.({status:'released'});}
    if (message === 'exit') {await root.close(); process.exit(0);}
  } catch (error) {process.send?.({status:'error',code:(error as {code?:string}).code});}
});
process.send?.({status:'ready'});
