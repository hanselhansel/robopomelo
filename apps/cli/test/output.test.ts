import { it, expect } from 'vitest';
import { DomainError } from '@robopomelo/core';
import { errorEnvelope, successEnvelope, exitForError } from '../src/output.js';
it('distinguishes blocked validation from successful saved drafts', () => {
  const saved = successEnvelope(
    'patch apply',
    { status: 'applied', readiness: 'blocked' },
    { toolVersion: '1.0.0-rc.1' },
  );
  expect(saved.ok).toBe(true);
  expect(saved.sourceHash).toBeNull();
  expect(saved.formatVersion).toBe('1.0.0');
  const failure = errorEnvelope(
    'review approve',
    new DomainError('SPECIFICATION_BLOCKED', 'Resolve blockers.'),
    '1.0.0-rc.1',
  );
  expect(failure.ok).toBe(false);
  expect(exitForError(new DomainError('SPECIFICATION_BLOCKED', 'Blocked'))).toBe(3);
  expect(JSON.stringify(failure)).not.toContain('stack');
});
it('maps stale authority unsupported and I/O errors to documented exits', () => {
  for (const [code, expected] of [
    ['STALE_BASE', 4],
    ['SCOPE_REQUIRED', 5],
    ['UNSUPPORTED_CAPABILITY', 7],
    ['ENOENT', 6],
    ['RELEASE_UNVERIFIED', 8],
  ] as const)
    expect(exitForError({ code })).toBe(expected);
});
it('keeps declared write-boundary and missing runtime failures distinct', () => {
  expect(exitForError({ code: 'FIELD_NOT_ALLOWED' })).toBe(5);
  expect(exitForError({ code: 'RUNTIME_UNAVAILABLE' })).toBe(7);
});
it('retains migration recovery details and classifies storage failures', () => {
  const error = {
    code: 'MIGRATION_COMMITTED',
    message: 'Source changed; finalize bookkeeping.',
    backupManifest: '.robopomelo/migration-backups/backup/manifest.json',
    sourceHash: 'a'.repeat(64),
  };
  expect(exitForError(error)).toBe(6);
  expect(errorEnvelope('migrate', error, '1.0.0').errors[0]!.details).toMatchObject({
    backupManifest: error.backupManifest,
    sourceHash: error.sourceHash,
  });
  for (const code of ['EVIDENCE_CHANGED', 'UPLOAD_BUSY', 'EXPORT_CHANGED', 'CACHE_CORRUPT'])
    expect(exitForError({ code })).toBe(6);
});
