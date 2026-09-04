import { planningHash, reviewDocument, sha256 } from '@robopomelo/core';
import type { ArtifactInput, ArtifactMember, ArtifactPlan, AttachmentMember } from './contracts.js';
import { brief, acceptance, handoff } from './documents/markdown.js';
import { renderHtml } from './html.js';
export type { ArtifactInput, ArtifactMember, ArtifactPlan, AttachmentMember } from './contracts.js';
export { printStyles } from './styles.js';
const encode = (path: string, mediaType: string, text: string): ArtifactMember => ({
  path,
  mediaType,
  bytes: new TextEncoder().encode(text),
});
export function generateArtifacts({ source, snapshot: s, selectedEvidenceIds }: ArtifactInput): ArtifactPlan {
  if (
    sha256(source) !== s.sourceHash ||
    s.validation.sourceHash !== s.sourceHash ||
    s.validation.sourceRevision !== s.sourceRevision ||
    s.deployment.meta.revisionId !== s.sourceRevision ||
    planningHash(s.deployment) !== s.planningHash
  )
    throw new Error('Export source identity is stale or inconsistent.');
  const selected = new Set(selectedEvidenceIds);
  const attachments: AttachmentMember[] = [];
  const paths = new Set<string>();
  for (const id of selected) {
    const evidence = s.deployment.evidence.find((item) => item.id === id);
    const observation = s.evidenceObservations.find((item) => item.evidenceId === id);
    if (
      !evidence ||
      evidence.location.kind !== 'attachment' ||
      observation?.state !== 'present' ||
      observation.sha256 !== evidence.location.sha256 ||
      observation.size !== evidence.location.size
    )
      throw new Error(`Selected evidence is unavailable or changed: ${id}`);
    const path = evidence.location.path;
    const segments = path.split('/');
    const unsafe = segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[\\:\u0000-\u001f]/.test(segment) ||
        /[. ]$/.test(segment) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    );
    const key = path.normalize('NFC').toLowerCase();
    if (!path.startsWith('evidence/') || unsafe || paths.has(key))
      throw new Error(`Unsafe or duplicate evidence export path: ${path}`);
    paths.add(key);
    attachments.push({
      path: evidence.location.path,
      sourcePath: evidence.location.path,
      evidenceId: id,
      mediaType: 'application/octet-stream',
      size: evidence.location.size,
      sha256: evidence.location.sha256,
    });
  }
  attachments.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const doc = reviewDocument(s.deployment, s.validation);
  const members = [
    encode('deployment.yaml', 'application/yaml', source),
    encode('deployment-brief.md', 'text/markdown', brief(doc, s)),
    encode('acceptance-plan.md', 'text/markdown', acceptance(doc, s)),
    encode('validation-report.json', 'application/json', JSON.stringify(s.validation, null, 2) + '\n'),
    encode('review.html', 'text/html', renderHtml(doc, s)),
    encode('engineering-handoff.md', 'text/markdown', handoff(doc, s)),
  ];
  const manifest = {
    formatVersion: '1.0.0',
    sourceRevision: s.sourceRevision,
    sourceHash: s.sourceHash,
    planningHash: s.planningHash,
    toolVersion: s.validation.toolVersion,
    specVersion: s.deployment.specVersion,
    ruleSetVersion: s.validation.ruleSetVersion,
    readiness: s.validation.readiness,
    approvalStatus: s.approvalStatus,
    manifestHashExcluded: true,
    members: [
      ...members.map((member) => ({
        path: member.path,
        mediaType: member.mediaType,
        size: member.bytes.byteLength,
        sha256: sha256(member.bytes),
      })),
      ...attachments.map(({ path, mediaType, size, sha256 }) => ({ path, mediaType, size, sha256 })),
    ],
    evidence: s.deployment.evidence.map((e) => ({
      id: e.id,
      purpose: e.purpose,
      disposition:
        e.location.kind === 'attachment'
          ? selected.has(e.id)
            ? 'selected'
            : s.evidenceObservations.find((o) => o.evidenceId === e.id)?.state === 'present'
              ? 'omitted'
              : 'unavailable'
          : e.location.kind,
    })),
  };
  members.push(encode('manifest.json', 'application/json', JSON.stringify(manifest, null, 2) + '\n'));
  return { members, attachments };
}
