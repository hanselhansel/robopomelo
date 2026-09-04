import type { SessionOptions } from '../contracts.js';
import { allProposals } from './store.js';
import { mutationStatus } from '../transactions/receipts.js';
export async function listProposals(options: SessionOptions) {
  const proposals = await allProposals(options);
  return Promise.all(
    proposals.map(async (proposal) => {
      const supersededBy =
        proposals.findLast((item) => item.supersedes === proposal.proposalId)?.proposalId ?? null;
      const receipt = await mutationStatus(options, proposal.proposalId, proposal.requestDigest);
      return {
        ...proposal,
        supersededBy,
        status:
          receipt.status === 'committed'
            ? ('applied' as const)
            : receipt.status === 'retired'
              ? ('retired' as const)
              : supersededBy
                ? ('superseded' as const)
                : ('pending' as const),
      };
    }),
  );
}
