import type { Json, Mutation } from '@robopomelo/spec';
import { canonicalJson } from './canonical.js';
import { sha256 } from './hash.js';
export function mutationDigest(mutation: Mutation, supersedesProposalId?: string): string {
  const input = supersedesProposalId ? { mutation, supersedesProposalId } : mutation;
  return sha256(canonicalJson(input as unknown as Json));
}
