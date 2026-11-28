import { strict as assert } from 'node:assert';
import test from 'node:test';
import { makeExperiment } from '../public/sandbox.js';
import { applyCommand, botCommand, CLASSES, previewAction, sandboxEdit, viewMatch } from '../src/game/index.js';

test('every sandbox preset creates a reproducible playable match', () => {
  for (const id of ['fresh','molten','flame','venom','deck','rites','mirror','forge']) {
    const state = makeExperiment(id, 'fixed-stars');
    assert.deepEqual(state, makeExperiment(id, 'fixed-stars'));
    const view = viewMatch(state, 'experimenter');
    assert.equal(view.players.filter(player => !player.bot).length, 1);
    assert.equal(view.phase, 'acquire');
    let afterDraft = applyCommand(state, state.activeId, botCommand(state));
    if (afterDraft.phase === 'acquire') afterDraft = applyCommand(afterDraft,afterDraft.activeId,botCommand(afterDraft));
    assert.equal(afterDraft.phase, 'action');
    assert.doesNotThrow(() => applyCommand(afterDraft, afterDraft.activeId, botCommand(afterDraft)));
  }
});

test('the new starting builds exercise their signature and accept a costume brought from another class',()=>{
  for (const [preset,signature,expected] of [
    ['deck','cut-the-deck',/even odds/],['rites','soul-tithe',/cursed rival.*heal/],
    ['mirror','mirror-feint',/2 Poison/],['forge','rivet-drive',/3\/4 fittings/]
  ]) {
    const game=makeExperiment(preset,'ready-to-rehearse',8);
    const view=viewMatch(game,'experimenter');
    assert.match(previewAction(view,'experimenter',signature,'rival').text,expected);
    assert.equal(new Set(game.players.map(p=>p.classId)).size,8);
    const fitted=makeExperiment(preset,'fitting',8,{classId:'guardian',skinId:'harbor-warden',tier:'critical'});
    assert.equal(fitted.players[0].skinId,'harbor-warden');
    assert.equal(fitted.players[0].classId,'guardian');
    assert.equal(fitted.career,undefined);
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
