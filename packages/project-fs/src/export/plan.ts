import type { SafeRoot } from '../fs/safe-fs.js';
import type { SourceIdentity } from '../contracts.js';
import { projectRelativePath, portableNameKey } from '../fs/paths.js';
import { ProjectFsError } from '../errors.js';
import { byteHash } from '../transactions/digest.js';
import { assertMetadata, closed, isHash, validIdentity } from '../transactions/metadata.js';
import { deploymentBytes } from '../transactions/snapshot.js';
import { verifyFile } from '../transactions/evidence.js';
import { ATTACHMENT_LIMIT } from '../evidence/selection.js';
import { EXPORT_LIMIT, type ExportPlan, type FrozenExport, type FrozenMember } from './contracts.js';
function invalid(): never {
  throw new ProjectFsError(
    'EXPORT_INVALID',
    'Export plan or manifest is inconsistent with the selected source.',
  );
}
function json(bytes: Uint8Array): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return invalid();
  }
  assertMetadata(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function names(members: FrozenMember[]): void {
  const files = new Set<string>(),
    directories = new Map<string, string>();
  for (const member of members) {
    projectRelativePath(member.path);
    if (member.path.startsWith('.robopomelo/') || member.path.startsWith('exports/')) invalid();
    const pieces = member.path.split('/');
    const key = portableNameKey(member.path);
    if (files.has(key) || directories.has(key))
      throw new ProjectFsError('PATH_COLLISION', 'Export member names collide on a supported platform.');
    for (let i = 1; i < pieces.length; i++) {
      const prefix = pieces.slice(0, i).join('/'),
        folded = portableNameKey(prefix);
      if (files.has(folded) || (directories.has(folded) && directories.get(folded) !== prefix))
        throw new ProjectFsError('PATH_COLLISION', 'Export member ancestry has a portable collision.');
      directories.set(folded, prefix);
    }
    files.add(key);
  }
}
export async function freezePlan(
  root: SafeRoot,
  projectId: string,
  plan: ExportPlan,
  expected: SourceIdentity,
): Promise<FrozenExport> {
  if (
    !validIdentity(expected) ||
    !plan ||
    !Array.isArray(plan.members) ||
    !Array.isArray(plan.attachments) ||
    plan.members.length + plan.attachments.length > 10_000
  )
    invalid();
  let payloadBytes = 0;
  const members: FrozenMember[] = [];
  for (const item of plan.members) {
    if (
      !item ||
      !(item.bytes instanceof Uint8Array) ||
      typeof item.path !== 'string' ||
      typeof item.mediaType !== 'string'
    )
      invalid();
    payloadBytes += item.bytes.byteLength;
    members.push({
      kind: 'bytes',
      path: item.path,
      mediaType: item.mediaType,
      bytes: Buffer.from(item.bytes),
      size: item.bytes.byteLength,
      sha256: byteHash(item.bytes),
    });
  }
  for (const item of plan.attachments) {
    if (
      !item ||
      !Number.isSafeInteger(item.size) ||
      item.size < 0 ||
      item.size > ATTACHMENT_LIMIT ||
      !isHash(item.sha256) ||
      typeof item.path !== 'string' ||
      typeof item.sourcePath !== 'string'
    )
      invalid();
    payloadBytes += item.size;
    members.push({ kind: 'attachment', ...item });
  }
  if (payloadBytes > EXPORT_LIMIT)
    throw new ProjectFsError('LIMIT_EXCEEDED', 'Selected export payload exceeds 2 GiB.');
  names(members);
  const source = members.find((member) => member.path === 'deployment.yaml');
  if (!source || source.kind !== 'bytes' || source.sha256 !== expected.sourceHash) invalid();
  const deployment = deploymentBytes(source.bytes, projectId).deployment;
  if (deployment.meta.revisionId !== expected.sourceRevision) invalid();
  const selected = new Set<string>();
  for (const member of members)
    if (member.kind === 'attachment') {
      const e = deployment.evidence.find((item) => item.id === member.evidenceId);
      if (
        selected.has(member.evidenceId) ||
        !e ||
        e.location.kind !== 'attachment' ||
        !member.sourcePath.startsWith('evidence/') ||
        member.sourcePath !== e.location.path ||
        member.path !== e.location.path ||
        member.sha256 !== e.location.sha256 ||
        member.size !== e.location.size
      )
        invalid();
      selected.add(member.evidenceId);
    }
  const manifestMember = members.find((member) => member.path === 'manifest.json'),
    reportMember = members.find((member) => member.path === 'validation-report.json');
  if (!manifestMember || manifestMember.kind !== 'bytes' || !reportMember || reportMember.kind !== 'bytes')
    invalid();
  const manifest = json(manifestMember.bytes),
    report = json(reportMember.bytes);
  if (
    manifest.sourceHash !== expected.sourceHash ||
    manifest.sourceRevision !== expected.sourceRevision ||
    manifest.manifestHashExcluded !== true ||
    report.sourceHash !== expected.sourceHash ||
    report.sourceRevision !== expected.sourceRevision ||
    !Array.isArray(manifest.members) ||
    manifest.members.length !== members.length - 1
  )
    invalid();
  const listed = new Set<string>();
  for (const row of manifest.members) {
    if (
      !closed(row, ['path', 'mediaType', 'size', 'sha256']) ||
      typeof row.path !== 'string' ||
      listed.has(row.path)
    )
      invalid();
    const actual = members.find((member) => member.path === row.path);
    if (
      !actual ||
      actual === manifestMember ||
      actual.sha256 !== row.sha256 ||
      actual.size !== row.size ||
      actual.mediaType !== row.mediaType
    )
      invalid();
    listed.add(row.path);
  }
  const frozen = {
    expected: { ...expected },
    members: members.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    payloadBytes,
  };
  await verifyFrozen(root, frozen);
  return frozen;
}
export async function verifyFrozen(root: SafeRoot, plan: FrozenExport): Promise<void> {
  if (byteHash(await root.readFile('deployment.yaml')) !== plan.expected.sourceHash)
    throw new ProjectFsError('STALE_BASE', 'Project source changed since export preview.');
  for (const member of plan.members)
    if (member.kind === 'attachment') await verifyFile(root, member.sourcePath, member.sha256, member.size);
}
