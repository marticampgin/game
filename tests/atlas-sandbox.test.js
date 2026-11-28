import { strict as assert } from 'node:assert';
import test from 'node:test';
import { makeExperiment } from '../public/sandbox.js';
import { applyCommand, botCommand, CLASSES, sandboxEdit, viewMatch } from '../src/game/index.js';

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

test('a practice wardrobe and pilot can travel with any seat independently of a career', () => {
  const original = makeExperiment('fresh','all-contenders',8);
  assert.equal(original.players.length,8);
  for (const role of Object.keys(CLASSES)) {
    const seat = original.players.at(-1).id;
    let state = sandboxEdit(original,{type:'class',playerId:seat,classId:role});
    state = sandboxEdit(state,{type:'skin',playerId:seat,skinId:'test-costume'});
    state = sandboxEdit(state,{type:'pilot',playerId:seat});
    const fighter = viewMatch(state,seat).players.find(p => p.id === seat);
    assert.equal(fighter.skinId,'test-costume');
    assert.equal(fighter.classId,role);
    assert.equal(fighter.abilities[0].id,CLASSES[role].ability);
    assert.deepEqual(state.players.filter(p => !p.bot).map(p => p.id),[seat]);
    assert.equal(state.career,undefined);
    const reset = sandboxEdit(state,{type:'skin',playerId:seat,skinId:'founder'});
    assert.equal(reset.players.at(-1).skinId,undefined);
  }
  assert.equal(original.players.at(-1).skinId,undefined);
});
