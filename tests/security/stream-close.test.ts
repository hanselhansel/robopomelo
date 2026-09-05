import { it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { waitForDrain } from '../../apps/cli/src/server/stream.js';
it('stops waiting when a downloading client closes and removes listeners', async () => {
  const response = Object.assign(new EventEmitter(), { destroyed: false });
  const waiting = waitForDrain(response as never);
  response.emit('close');
  await expect(waiting).rejects.toThrow(/closed/i);
  expect(response.listenerCount('drain')).toBe(0);
  expect(response.listenerCount('close')).toBe(0);
});
