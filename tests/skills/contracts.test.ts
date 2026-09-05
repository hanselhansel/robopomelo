import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { checkSkills, loadSkillRegistry } from '../../scripts/check-skills.mjs';
it('bundles all six compatible Skills with the actual capability and CLI registries', async () => {
  expect(
    await checkSkills(fileURLToPath(new URL('../../', import.meta.url)), await loadSkillRegistry()),
  ).toEqual([]);
});
