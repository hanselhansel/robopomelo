import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, symlink, link, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRelativePath } from '../../packages/project-fs/src/fs/paths.js';
import { SafeRoot } from '../../packages/project-fs/src/fs/safe-fs.js';

const cleanups: (() => Promise<unknown>)[] = [];
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'robopomelo-fs-'));
  const root = join(base, 'project');
  const outside = join(base, 'outside');
  await mkdir(root); await mkdir(outside);
  const fs = await SafeRoot.open(root);
  cleanups.push(async () => { await fs.close(); await rm(base,{recursive:true,force:true}); });
  return {base, root, outside, fs};
}
afterEach(async () => {for (const cleanup of cleanups.splice(0).reverse()) await cleanup();});

describe('portable confined file operations', () => {
  it.each(['', '../secret','/etc/passwd','C:\\secret','C:secret','\\\\host\\share','x/../y','x\\..\\y','file:stream','CON','aux.txt','COM1.log','LPT9','x.','x ','x//y','x/./y','x\0y','x?y','x\\y'])('rejects unsafe path %s', value => {
    expect(() => projectRelativePath(value)).toThrow();
  });
  it('creates bounded readable files and exposes no raw path on handles', async () => {
    const {fs} = await fixture();
    await fs.mkdir('evidence');
    const handle = await fs.createExclusive('evidence/new.txt');
    expect(handle).not.toHaveProperty('path');
    await handle.write(Buffer.from('hello')); await handle.sync(); await handle.close();
    expect((await fs.readFile('evidence/new.txt',5)).toString()).toBe('hello');
    await expect(fs.readFile('evidence/new.txt',4)).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});
    expect(await fs.list('evidence')).toEqual(['new.txt']);
    expect((await fs.stat('evidence/new.txt')).size).toBe(5);
    await fs.fsyncDirectory('evidence');
    await fs.close();
    await expect(fs.readFile('evidence/new.txt')).rejects.toMatchObject({code:'ROOT_CLOSED'});
  });
  it('rejects ancestors replaced with escaping links before use', async () => {
    const {fs,root,outside} = await fixture();
    await fs.mkdir('evidence'); await writeFile(join(outside,'secret'),'secret');
    await rename(join(root,'evidence'),join(root,'saved'));
    await symlink(outside,join(root,'evidence'),process.platform === 'win32' ? 'junction' : 'dir');
    await expect(fs.readFile('evidence/secret')).rejects.toMatchObject({code:'PATH_ESCAPE'});
    await expect(fs.createExclusive('evidence/written')).rejects.toMatchObject({code:'PATH_ESCAPE'});
  });
  it('rejects final symlinks and managed links that stay inside root', async () => {
    const {fs,root} = await fixture();
    await writeFile(join(root,'real'),'value'); await mkdir(join(root,'dir'));
    await symlink(join(root,'real'),join(root,'alias'),'file');
    await symlink(join(root,'dir'),join(root,'dir-link'),process.platform === 'win32' ? 'junction' : 'dir');
    await expect(fs.openRead('alias')).rejects.toMatchObject({code:'PATH_ESCAPE'});
    await expect(fs.list('dir-link')).rejects.toMatchObject({code:'PATH_ESCAPE'});
    await expect(fs.stat('alias')).rejects.toMatchObject({code:'PATH_ESCAPE'});
  });
  it('rejects replacement of the pinned project root', async () => {
    const {fs,root,base} = await fixture();
    await rename(root,join(base,'original')); await mkdir(root); await writeFile(join(root,'source'),'replacement');
    await expect(fs.readFile('source')).rejects.toMatchObject({code:'ROOT_CHANGED'});
  });
  it('rejects portable case collisions and never truncates a hardlinked destination', async () => {
    const {fs,root,outside} = await fixture();
    await writeFile(join(root,'Report'),'old');
    await expect(fs.createExclusive('report')).rejects.toMatchObject({code:'PATH_COLLISION'});
    await writeFile(join(outside,'important'),'original'); await link(join(outside,'important'),join(root,'destination'));
    await expect(fs.createExclusive('destination')).rejects.toThrow();
    const stage = await fs.createExclusive('staged'); await stage.write(Buffer.from('new')); await stage.close();
    await fs.renameReplace('staged','destination');
    expect(await readFile(join(outside,'important'),'utf8')).toBe('original');
    expect((await fs.readFile('destination')).toString()).toBe('new');
  });
  it('no-replace rename retains existing bytes and can publish a new file', async () => {
    const {fs,root} = await fixture();
    await writeFile(join(root,'from'),'new'); await writeFile(join(root,'to'),'old');
    await expect(fs.renameNoReplace('from','to')).rejects.toThrow();
    expect((await fs.readFile('to')).toString()).toBe('old');
    await fs.renameNoReplace('from','new');
    expect((await fs.readFile('new')).toString()).toBe('new');
    await expect(fs.stat('from')).rejects.toMatchObject({code:'ENOENT'});
  });
  it('keeps an already opened read bound to its inode after a final filename replacement', async () => {
    const {fs,root} = await fixture();
    await writeFile(join(root,'source'),'original');
    const handle = await fs.openRead('source');
    await rename(join(root,'source'),join(root,'saved'));
    await writeFile(join(root,'source'),'replacement');
    expect((await handle.readFile()).toString()).toBe('original');
    await handle.close();
    expect((await fs.readFile('source')).toString()).toBe('replacement');
  });
  it('does not expose directory rename and rejects duplicate portable names while listing', async () => {
    const {fs,root} = await fixture();
    await mkdir(join(root,'dir'));
    await expect(fs.renameNoReplace('dir','other')).rejects.toMatchObject({code:'UNSUPPORTED_OPERATION'});
    await expect(fs.renameReplace('dir','other')).rejects.toMatchObject({code:'UNSUPPORTED_FILE'});
    await writeFile(join(root,'e\u0301'),'value');
    await expect(fs.list()).rejects.toMatchObject({code:'INVALID_PATH'});
  });
  it.runIf(process.platform === 'win32')('rejects native Windows junction escape', async () => {
    const {fs,root,outside} = await fixture();
    await symlink(outside,join(root,'junction'),'junction');
    await expect(fs.mkdir('junction/new')).rejects.toMatchObject({code:'PATH_ESCAPE'});
  });
});
