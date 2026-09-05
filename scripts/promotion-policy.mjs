import semver from 'semver';
export function assertPromotion({ version, commit, proof, metadata, latest, now = Date.now() }) {
  if (!semver.valid(version) || semver.prerelease(version))
    throw new Error('Promotion requires an exact stable version.');
  if (
    proof?.formatVersion !== 1 ||
    proof.status !== 'passed' ||
    proof.version !== version ||
    proof.sourceCommit !== commit ||
    !proof.checks?.includes('packaged HTTP launch')
  )
    throw new Error('Exact passing published-artifact proof is required.');
  const age = now - Date.parse(proof.verifiedAt);
  if (!Number.isFinite(age) || age < 0 || age > 3600000)
    throw new Error('Published-artifact proof must be less than one hour old.');
  if (metadata?.version !== version || metadata.dist?.integrity !== proof.integrity)
    throw new Error('Registry artifact differs from the verified proof.');
  if (latest && latest !== version && (!semver.valid(latest) || semver.gte(latest, version)))
    throw new Error('Promotion cannot replace an equal/newer or invalid latest version.');
}
