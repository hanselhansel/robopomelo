import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { assertPromotion } from './promotion-policy.mjs';
import { npm } from './distribution-process.mjs';
const { values } = parseArgs({
  options: { version: { type: 'string' }, commit: { type: 'string' }, proof: { type: 'string' } },
});
if (!values.version || !values.commit || !values.proof)
  throw new Error('Supply exact --version, --commit and --proof.');
const proof = JSON.parse(await readFile(values.proof, 'utf8'));
const metadata = JSON.parse(npm(['view', `robopomelo@${values.version}`, '--json']));
const tags = JSON.parse(npm(['view', 'robopomelo', 'dist-tags', '--json']));
assertPromotion({ version: values.version, commit: values.commit, proof, metadata, latest: tags.latest });
if (tags.latest !== values.version) npm(['dist-tag', 'add', `robopomelo@${values.version}`, 'latest']);
const actual = JSON.parse(npm(['view', 'robopomelo', 'dist-tags', '--json']));
if (actual.latest !== values.version)
  throw new Error('Registry latest readback does not match promoted version.');
process.stdout.write(
  JSON.stringify({ version: values.version, latest: actual.latest, integrity: metadata.dist.integrity }) +
    '\n',
);
