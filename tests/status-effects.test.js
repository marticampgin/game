import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createMatch, viewMatch } from '../src/game/index.js';
import { executeEffects, deal } from '../src/game/combat.js';
import { publicEvent } from '../src/game/recap.js';
import { STATUSES } from '../src/game/catalog.js';
import { statusCue, statusIcon, statusRow } from '../public/status-effects.js';

const roster = ['Ash','Rue','Flint'].map(id => ({ id, name: id, classId:'guardian' }));
function ready() {
  const s = createMatch({ seed:'stacks-by-author', players:roster });
  return applyCommand(s,s.activeId,{type:'pick',rewardId:s.offers[0]});
}
const apply = (s, owner, target, key, amount) => executeEffects(s,owner,target,[{kind:'status',key,amount}],{label:'Spell'});

test('every public status has a separate native icon, effect row and label', () => {
  const ids = Object.keys(STATUSES);
  assert.deepEqual(ids.map(statusRow), [0,1,2,3,4,5,6,7]);
  for (const id of ids) {
    assert.match(statusIcon(id), new RegExp('data-status-icon="' + id + '"'));
    assert.equal(statusCue({type:'damage',cause:id}).title, STATUSES[id].name);
    assert.equal(statusCue({type:'status',cause:id,amount:2}).change, id === 'freeze' ? 'frozen' : 'applied');
  }
  assert.equal(statusIcon('constructor'),'');
  assert.equal(statusCue({type:'status',cause:'widows-brew'}),null);
  assert.equal(statusCue({type:'status',text:'Applied 2 Poison.'}),null);
});

test('applications, conversions, cleanses, thaws and discharges project their actual stack totals', () => {
  let s = ready();
  const actor = s.players.find(p => p.id === s.activeId), source = s.players.find(p => p !== actor);
  apply(s,source,actor,'chill',4);
  let visible = viewMatch(s,source.id).log.slice(-2);
  assert.deepEqual(visible.map(e=>[e.cause,e.statusChange,e.statusRemaining,e.actorId]),
    [['chill','applied',4,source.id],['freeze','frozen',1,source.id]]);
  assert.equal(visible[1].chillRemaining,1);
  apply(s,source,actor,'poison',2);
  executeEffects(s,actor,actor,[{kind:'cleanse',keys:['poison']}]);
  const cleansed = publicEvent(s.log.at(-1));
  assert.deepEqual([cleansed.cause,cleansed.statusChange,cleansed.statusRemaining],['poison','cleansed',0]);
  apply(s,source,actor,'shock',2);
  deal(s,source,actor,12,'Direct hit',{direct:true});
  assert.equal(s.log.at(-1).statusChange,'discharged');
  s = applyCommand(s,actor.id,{type:'act',actionId:'defend'});
  const thaw = viewMatch(s,source.id).lastAction.events.find(e=>e.statusChange === 'thawed');
  assert.equal(statusCue(thaw).title,'Thawed');
  assert.equal(thaw.statusRemaining,0);
});

test('turn-start damage keeps each author and publishes the settled balance on its final packet', () => {
  let s = ready();
  const next = s.players.find(p => p.id === s.queue[0]);
  const others = s.players.filter(p => p !== next);
  for (const owner of others) apply(s,owner,next,'burn',3);
  apply(s,others[0],next,'poison',2);
  s = applyCommand(s,s.activeId,{type:'act',actionId:'defend'});
  const view = viewMatch(s,next.id);
  const ticks = view.lastAction.events.filter(e=>e.type === 'damage');
  assert.deepEqual(ticks.map(e=>[e.cause,e.actorId,e.statusRemaining]),[
    ['burn',others[0].id,undefined],['burn',others[1].id,5],['poison',others[0].id,2]]);
  assert.deepEqual(view.log.filter(e=>ticks.some(t=>t.id === e.id)).map(e=>e.statusRemaining),[undefined,5,2]);
  assert.ok(ticks.every(e=>e.timing === 'turn' && e.turnOwnerId === next.id));
});

test('only known public status changes and valid quantities survive projection', () => {
  const base = {id:5,type:'status',text:'An effect resolved.',round:2};
  assert.deepEqual(publicEvent({...base,cause:'emergency-ward',statusChange:'applied',statusRemaining:7,chillRemaining:1}),base);
  assert.deepEqual(publicEvent({...base,cause:'burn',statusChange:'red-tonic',statusRemaining:'hidden',chillRemaining:2}),{...base,cause:'burn'});
  assert.equal(publicEvent({...base,cause:'chill',statusChange:'applied',statusRemaining:-4}).statusRemaining,undefined);
});
