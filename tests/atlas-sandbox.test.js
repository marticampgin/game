import { strict as assert } from 'node:assert';
import test from 'node:test';
import { makeExperiment } from '../public/sandbox.js';
import { applyCommand, botCommand, viewMatch } from '../src/game/index.js';

test('every sandbox preset creates a reproducible playable match', () => {
  for (const id of ['fresh', 'molten', 'flame', 'venom']) {
    const state = makeExperiment(id, 'fixed-stars');
    assert.deepEqual(state, makeExperiment(id, 'fixed-stars'));
    const view = viewMatch(state, 'experimenter');
    assert.equal(view.players.filter(player => !player.bot).length, 1);
    assert.equal(view.phase, 'acquire');
    const afterDraft = applyCommand(state, state.activeId, botCommand(state));
    assert.equal(afterDraft.phase, 'action');
    assert.doesNotThrow(() => applyCommand(afterDraft, afterDraft.activeId, botCommand(afterDraft)));
  }
});
