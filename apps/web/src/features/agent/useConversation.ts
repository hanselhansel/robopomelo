import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent, DesktopBridge, SourceBase } from '@robopomelo/spec';
import { api, errorMessage } from '../../lib/api.js';
import type { AgentState, MessageResult, ModelInventory, Selection, TurnResult } from './types.js';
export interface ConversationOptions {
  base: SourceBase;
  bridge?: DesktopBridge;
  onProposalsChanged?: () => void;
  /** Event polling interval while a run is reserved or running. */
  pollMs?: number;
}
export interface ConversationApi {
  state: AgentState | null;
  inventory: ModelInventory[];
  busy: boolean;
  error: string | null;
  /** Settled outcome for the single live region. Never updated per token or progress event. */
  status: string;
  events: AgentEvent[];
  send(text: string, attachmentIds: string[]): Promise<boolean>;
  answer(choiceId: string | null, text: string): Promise<boolean>;
  cancel(): Promise<void>;
  extend(turns: number): Promise<void>;
  select(connectionId: string, modelId: string, effort: string | null): Promise<boolean>;
  refresh(): Promise<void>;
  refreshInventory(): Promise<void>;
  connect(route: 'openrouter'): Promise<void>;
  disconnect(connectionId: string): Promise<void>;
}
const ACTIVE = new Set(['reserved', 'running']);
const settledText = (turn: TurnResult | null): string => {
  switch (turn?.kind) {
    case 'question':
      return 'Question ready';
    case 'summary':
      return 'Summary ready';
    case 'cancelled':
      return 'Turn cancelled';
    case 'paused':
      return 'Budget reached';
    case 'error':
      return 'Turn failed';
    default:
      return 'Message saved';
  }
};
/** Client side of the one-question discovery loop. Every message carries the
 * source base it was read against; answers name the question active at click
 * time so an old button can never answer a newer question. */
export function useConversation({ base, bridge, onProposalsChanged, pollMs = 700 }: ConversationOptions): ConversationApi {
  const [state, setState] = useState<AgentState | null>(null);
  const [inventory, setInventory] = useState<ModelInventory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const stateRef = useRef<AgentState | null>(null);
  const eventsRef = useRef<{ runId: string; last: number; stopped: boolean }>({ runId: '', last: 0, stopped: false });
  const commit = useCallback((next: AgentState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const refresh = useCallback(async () => {
    try {
      commit(await api.request<AgentState>('/api/agent/state'));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, [commit]);
  const refreshInventory = useCallback(async () => {
    try {
      setInventory(await api.request<ModelInventory[]>('/api/agent/models', undefined, false));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);
  useEffect(() => {
    void refresh();
    void refreshInventory();
  }, [refresh, refreshInventory]);
  const run = state?.run ?? null;
  const polling = busy || (run !== null && ACTIVE.has(run.state));
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    // A run keeps its id across turns; each new turn may emit again after a 'stopped'.
    eventsRef.current.stopped = false;
    const tick = async () => {
      const current = stateRef.current?.run ?? null;
      if (!current || !ACTIVE.has(current.state)) {
        if (busy) await refresh();
        return;
      }
      const cursor = eventsRef.current;
      if (cursor.runId !== current.runId) {
        eventsRef.current = { runId: current.runId, last: 0, stopped: false };
        setEvents([]);
      }
      if (eventsRef.current.stopped) return;
      try {
        const batch = await api.request<AgentEvent[]>(`/api/agent/runs/${encodeURIComponent(current.runId)}/events?after=${eventsRef.current.last}`);
        if (cancelled || !batch.length) return;
        const fresh = batch.filter((event) => event.runId === current.runId && event.sequence > eventsRef.current.last);
        if (!fresh.length) return;
        eventsRef.current.last = fresh.at(-1)!.sequence;
        setEvents((previous) => [...previous, ...fresh]);
        if (fresh.some((event) => event.kind === 'stopped')) {
          eventsRef.current.stopped = true;
          await refresh();
        }
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [polling, busy, pollMs, refresh]);
  const post = useCallback(
    async (questionId: string, choiceId: string | null, text: string, attachmentIds: string[]): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      try {
        const result = await api.request<MessageResult>('/api/agent/messages', {
          sourceRevision: base.sourceRevision,
          sourceHash: base.sourceHash,
          questionId,
          choiceId,
          text,
          attachmentIds,
        });
        if (result.turn?.kind === 'error') setError(`${result.turn.code}: ${result.turn.message}`);
        setStatus(settledText(result.turn));
        onProposalsChanged?.();
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
        await refresh();
      }
    },
    [base.sourceHash, base.sourceRevision, busy, onProposalsChanged, refresh],
  );
  const send = useCallback((text: string, attachmentIds: string[]) => post('', null, text, attachmentIds), [post]);
  const answer = useCallback(
    async (choiceId: string | null, text: string) => {
      const current = stateRef.current?.conversation.active;
      if (!current) {
        setError('There is no open question to answer. Read the conversation and send a fresh message instead.');
        return false;
      }
      if (current.stale) {
        setError('That question was superseded. Read the current question and answer it again.');
        return false;
      }
      return post(current.question.id, choiceId, text, []);
    },
    [post],
  );
  const cancel = useCallback(async () => {
    const current = stateRef.current?.run;
    if (!current) return;
    try {
      await api.request(`/api/agent/runs/${encodeURIComponent(current.runId)}/cancel`, { generation: current.generation });
      setStatus('Turn cancelled');
    } catch (cause) {
      setError(errorMessage(cause));
    }
    await refresh();
  }, [refresh]);
  const extend = useCallback(
    async (turns: number) => {
      try {
        commit(await api.request<AgentState>('/api/agent/budget', { modelTurns: turns }));
        setStatus(`Budget extended by ${turns} turns`);
      } catch (cause) {
        setError(errorMessage(cause));
      }
    },
    [commit],
  );
  const select = useCallback(
    async (connectionId: string, modelId: string, effort: string | null) => {
      setError(null);
      try {
        await api.request<Selection>('/api/agent/selection', { connectionId, modelId, effort }, true, 'PUT');
        await refresh();
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      }
    },
    [refresh],
  );
  const connect = useCallback(
    async (route: 'openrouter') => {
      if (!bridge) return;
      setError(null);
      try {
        await bridge.connectProvider(route);
      } catch (cause) {
        setError(errorMessage(cause));
      }
      await refreshInventory();
    },
    [bridge, refreshInventory],
  );
  const disconnect = useCallback(
    async (connectionId: string) => {
      if (!bridge) return;
      setError(null);
      try {
        await bridge.disconnect(connectionId);
      } catch (cause) {
        setError(errorMessage(cause));
      }
      await refreshInventory();
      await refresh();
    },
    [bridge, refresh, refreshInventory],
  );
  return { state, inventory, busy, error, status, events, send, answer, cancel, extend, select, refresh, refreshInventory, connect, disconnect };
}
