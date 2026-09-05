import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument, visit } from 'yaml';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { build } from 'esbuild';
import { selectedRoot, finish } from './files.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(await readFile(join(repository, 'skills/contract.schema.json'), 'utf8'));
const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const outputFields = [
  'status',
  'capabilityId',
  'changeId',
  'baseRevision',
  'baseHash',
  'sourceRevision',
  'sourceHash',
  'receiptDigest',
  'proposalId',
  'patchDigest',
  'diff',
  'readiness',
  'findings',
  'questions',
  'nextAction',
];
const validations = [
  'schema',
  'capability-fields',
  'source-identity',
  'references',
  'permissions',
  'readiness-report',
];
const stops = [
  'unsupported',
  'missing-authority',
  'stale-base',
  'invalid-input',
  'missing-facts',
  'indeterminate-receipt',
];
const sameSet = (a, b) => [...a].sort().join('\0') === [...b].sort().join('\0');
async function boundedFile(path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 128 * 1024)
    throw new Error('Expected a bounded regular Skill file, without links.');
  return readFile(path, 'utf8');
}
function frontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match || !text.slice(match[0].length).trim())
    throw new Error('SKILL.md needs frontmatter and instructions.');
  const document = parseDocument(match[1], { version: '1.2', strict: true, uniqueKeys: true });
  if (document.errors.length || document.warnings.length)
    throw new Error('Invalid or duplicate frontmatter fields.');
  visit(document, {
    Node(_key, node) {
      if (node.anchor || node.tag || node.type === 'ALIAS')
        throw new Error('Frontmatter must be data without aliases, anchors or tags.');
    },
  });
  return document.toJS({ maxAliasCount: 0 });
}
export async function loadSkillRegistry() {
  const contents = [
    `export {capabilities,skillNames} from './packages/spec/src/capabilities.ts';`,
    `export {fields} from './packages/spec/src/fields.ts';`,
    `export {commandRegistry,parseCommand} from './apps/cli/src/arguments.ts';`,
  ].join('\n');
  const result = await build({
    stdin: { contents, resolveDir: repository, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
export async function checkSkills(root, registry) {
  const errors = [],
    contracts = new Map();
  let entries;
  try {
    entries = await readdir(join(root, 'skills'), { withFileTypes: true });
  } catch {
    return ['skills/: the six required Skill directories are missing.'];
  }
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const name of registry.skillNames)
    if (!folders.includes(name)) errors.push(`${name}: missing Skill directory.`);
  for (const name of folders)
    if (!registry.skillNames.includes(name)) errors.push(`${name}: not a registered Skill.`);
  const commandNames = new Set(registry.commandRegistry.map((command) => command.name));
  const collections = new Set(registry.fields.map((field) => field.collection));
  for (const name of registry.skillNames) {
    if (!folders.includes(name)) continue;
    const prefix = `skills/${name}`;
    try {
      const metadata = frontmatter(await boundedFile(join(root, prefix, 'SKILL.md')));
      if (
        metadata?.name !== name ||
        typeof metadata.description !== 'string' ||
        !metadata.description.trim() ||
        metadata.description.length > 1024
      )
        errors.push(`${prefix}: invalid name or description frontmatter.`);
      if (metadata.license !== 'Apache-2.0') errors.push(`${prefix}: license must match Apache-2.0.`);
      if (
        !metadata.metadata ||
        Array.isArray(metadata.metadata) ||
        Object.values(metadata.metadata).some((value) => typeof value !== 'string') ||
        metadata.metadata['robopomelo:contract'] !== 'contract.json' ||
        metadata.metadata['robopomelo:capability'] !== name
      )
        errors.push(
          `${prefix}: namespaced string metadata must point to the local contract.json and capability.`,
        );
      const contract = JSON.parse(await boundedFile(join(root, prefix, 'contract.json')));
      if (!validate(contract)) {
        for (const error of validate.errors ?? [])
          errors.push(`${prefix}: ${error.instancePath || '/'} ${error.message}.`);
        continue;
      }
      contracts.set(name, contract);
      const capability = registry.capabilities.find((item) => item.id === name && item.kind === 'skill');
      if (!capability) {
        errors.push(`${prefix}: capability missing from implementation registry.`);
        continue;
      }
      if (
        contract.id !== name ||
        contract.kind !== (name === 'plan-amr-deployment' ? 'orchestrator' : 'narrow')
      )
        errors.push(`${prefix}: identity or Skill kind differs from registry.`);
      if (contract.specRange !== capability.specRange)
        errors.push(`${prefix}: specRange differs from registry.`);
      if (!sameSet(contract.fieldsWritten, capability.fieldsWritten))
        errors.push(`${prefix}: write set differs from registry.`);
      if (!sameSet(contract.fieldsRead, capability.fieldsRead))
        errors.push(`${prefix}: read set differs from registry.`);
      if (!sameSet(contract.dependencies, capability.dependencies))
        errors.push(`${prefix}: dependencies differ from registry.`);
      for (const field of contract.fieldsWritten) {
        const [collection, property, ...extra] = field.split('.');
        if (
          extra.length ||
          !collections.has(collection) ||
          (property !== '*' &&
            property !== 'extensions' &&
            !registry.fields.some((item) => item.collection === collection && item.path === property))
        )
          errors.push(`${prefix}: undeclared schema/workflow field ${field}.`);
      }
      if (
        !sameSet(
          contract.commands.map((item) => item.command),
          capability.commands,
        )
      )
        errors.push(`${prefix}: command set differs from capability registry.`);
      for (const item of contract.commands) {
        if (!commandNames.has(item.command)) errors.push(`${prefix}: unknown CLI command ${item.command}.`);
        if (
          item.args.some((arg) => arg === '--authorize' || arg.startsWith('--authorize=') || arg === '--yes')
        )
          errors.push(`${prefix}: command templates cannot supply authority or confirmation flags.`);
        try {
          registry.parseCommand([...item.command.split(' '), ...item.args]);
        } catch (error) {
          errors.push(`${prefix}: invalid command arguments: ${error.message}`);
        }
      }
      for (const field of outputFields)
        if (!contract.output.required.includes(field)) errors.push(`${prefix}: output must retain ${field}.`);
      for (const check of validations)
        if (!contract.validation.includes(check)) errors.push(`${prefix}: validation missing ${check}.`);
      for (const stop of stops)
        if (!contract.stopConditions.includes(stop))
          errors.push(`${prefix}: stop condition missing ${stop}.`);
      if (
        contract.orchestration &&
        contract.orchestration.order.join(',') !== registry.skillNames.slice(0, 5).join(',')
      )
        errors.push(`${prefix}: orchestration order differs from dependency order.`);
    } catch (error) {
      errors.push(`${prefix}: ${error.message}`);
    }
  }
  const active = new Set(),
    visited = new Set();
  function dependency(name) {
    if (active.has(name)) {
      errors.push(`${name}: dependency cycle.`);
      return;
    }
    if (visited.has(name)) return;
    active.add(name);
    for (const required of contracts.get(name)?.dependencies ?? []) {
      if (!contracts.has(required)) errors.push(`${name}: missing dependency ${required}.`);
      else dependency(required);
    }
    active.delete(name);
    visited.add(name);
  }
  for (const name of contracts.keys()) dependency(name);
  const orchestrator = contracts.get('plan-amr-deployment');
  if (orchestrator) {
    const union = new Set(
      registry.skillNames.slice(0, 5).flatMap((name) => contracts.get(name)?.fieldsWritten ?? []),
    );
    if (!sameSet(orchestrator.fieldsWritten, union))
      errors.push('plan-amr-deployment: write set must equal the five narrow Skill union.');
  }
  return errors;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  finish(
    await checkSkills(selectedRoot(), await loadSkillRegistry()),
    'Six Skill contracts match capabilities, fields and CLI commands.',
  );
}
