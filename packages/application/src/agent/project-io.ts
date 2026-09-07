import type { Actor, FieldDiff } from '@robopomelo/spec';
import { applyConversationEvent, emptyConversation, type ConversationEvent, type ConversationState, type SourceExcerpt } from '@robopomelo/agent';
import type { ConversationStore } from '@robopomelo/project-fs';
import type { ProjectService, SelectedProject } from '../services/project.js';
export interface ProposalSummary {
  proposalId: string;
  actor: Actor;
  purpose: string;
  status: 'pending' | 'applied' | 'retired' | 'superseded';
  patchDigest: string;
  diff: FieldDiff[];
  supersedes: string | null;
}
const isState = (value: unknown): value is ConversationState =>
  !!value && typeof value === 'object' && (value as ConversationState).formatVersion === '1.0.0' && Array.isArray((value as ConversationState).history);
/** Rebuild from the last valid checkpoint plus complete events. A damaged tail
 * is reported by the store and simply not replayed. */
export async function loadConversation(store: ConversationStore): Promise<ConversationState> {
  const loaded = await store.load();
  let state = loaded.checkpoint && isState(loaded.checkpoint.state) ? loaded.checkpoint.state : emptyConversation(store.conversationId);
  if (loaded.checkpoint && !isState(loaded.checkpoint.state)) {
    // Fall back to a full replay when the checkpoint payload is not a conversation state.
    const full = await store.load();
    state = emptyConversation(store.conversationId);
    for (const event of full.events) state = applyConversationEvent(state, event as ConversationEvent);
    return state;
  }
  for (const event of loaded.events) state = applyConversationEvent(state, event as ConversationEvent);
  return state;
}
const TEXT_LIMIT = 64 * 1024;
/** Planning evidence the agent may cite: small local text attachments only. */
export async function planningExcerpts(selected: SelectedProject): Promise<SourceExcerpt[]> {
  if (!selected.session) return [];
  const read = await selected.session.open();
  if (read.kind !== 'readable') return [];
  const excerpts: SourceExcerpt[] = [];
  for (const record of read.snapshot.deployment.evidence) {
    if (record.purpose !== 'planning' || record.location.kind !== 'attachment' || record.location.size > TEXT_LIMIT) continue;
    if (!/\.(txt|md|csv)$/i.test(record.location.path)) continue;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await selected.root.readFile(record.location.path, TEXT_LIMIT));
      excerpts.push({ sourceId: record.id, title: record.title, text });
    } catch { /* Unreadable or non-text evidence is simply not cited. */ }
    if (excerpts.length >= 12) break;
  }
  return excerpts;
}
export async function projectProposals(project: ProjectService, selected: SelectedProject): Promise<ProposalSummary[]> {
  if (!selected.session) return [];
  const proposals = await project.requireSession(selected).proposalList();
  return proposals.map((proposal) => {
    const command = proposal.request.mutation.kind === 'patch' ? proposal.request.mutation.patch : proposal.request.mutation.review;
    return {
      proposalId: proposal.proposalId,
      actor: proposal.request.actor,
      purpose: command.purpose,
      status: proposal.status,
      patchDigest: proposal.digest,
      diff: proposal.diff,
      supersedes: proposal.supersedes,
    };
  });
}
