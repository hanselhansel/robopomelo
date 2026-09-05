import { createHash } from 'node:crypto';
import { canonicalJson } from '@robopomelo/core';
import type { Json } from '@robopomelo/spec';
import type { CommitInput } from '../contracts.js';
export const byteHash = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');
export const digestValue = (value: unknown): string => byteHash(canonicalJson(value as Json));
export function mutationDigest(input: CommitInput): string {
  if (!input.supersedesProposalId && !input.operation) return digestValue(input.mutation);
  return digestValue({
    mutation: input.mutation,
    ...(input.supersedesProposalId ? { supersedesProposalId: input.supersedesProposalId } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
  });
}
