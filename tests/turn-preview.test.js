import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMatch,previewAction,viewMatch} from '../src/game/index.js';
import {grantReward} from '../src/game/combat.js';

function encounter(rewardId,classId='guardian') {
  let state=createMatch({seed:'turn-support',players:['Pine','Wren'].map(id=>({id,name:id,classId}))});
  state.offers=['iron-shard','fang-shard','astral-shard'];
  state=applyCommand(state,state.activeId,{type:'pick',rewardId:'fang-shard'});
  const p=state.players.find(row=>row.id===state.activeId);
  if (rewardId!=='defend') grantReward(state,p,rewardId);
  // Keep the following personal turn and any arena pulse outside these measurements.
  state.remainingActions=2;
  return {state,p};
}

function compare(state,id) {
  const p=state.players.find(candidate=>candidate.id===state.activeId);
  const projection=viewMatch(state,p.id);
  const serialized=JSON.stringify(projection);
  const preview=previewAction(projection,p.id,id);
  assert.equal(JSON.stringify(projection),serialized);
  const result=applyCommand(state,p.id,{type:'act',actionId:id});
  const after=result.players.find(candidate=>candidate.id===p.id);
  assert.equal(after.shield-p.shield,preview.shieldGain);
  return {preview,after,result};
}

test('Ward Lantern previews accumulated shield and keeps the familiar 12 shield wording',()=>{
  const {state,p}=encounter('ward-lantern');
  p.shield=9;
  const {preview,after}=compare(state,'ward-lantern');
  assert.match(preview.text,/Gain 12 shield \(21 total\)/);
  assert.equal(after.shield,21);
  assert.equal(p.shield,9);
});

test('Red Tonic shows healing lost to the health cap and predicts a qualifying overheal trigger',()=>{
  const {state,p}=encounter('red-tonic');
  grantReward(state,p,'glass-orchard');
  const full=compare(state,'red-tonic');
  assert.match(full.preview.text,/Recover 0 health \(already at full health\)/);
  assert.match(full.preview.text,/Glass Orchard grants 1 attack/);
  assert.equal(full.after.attack,p.attack+1);
  p.hp=p.maxHp-20;
  const near=compare(state,'red-tonic');
  assert.equal(near.preview.healing,near.after.hp-p.hp);
  assert.equal(near.preview.healing,20);
  assert.doesNotMatch(near.preview.text,/Glass Orchard/);
});

test('Mender’s Bell accounts for spell power, Curse rounding, and current missing health',()=>{
  const {state,p}=encounter('menders-bell');
  p.spellPower=15;
  p.statuses.curse=2;
  for (const [missing,expected] of [[100,14],[5,5],[0,0]]) {
    p.hp=p.maxHp-missing;
    const {preview,after}=compare(state,'menders-bell');
    assert.equal(preview.healing,after.hp-p.hp);
    assert.equal(preview.healing,expected);
    assert.match(preview.text,new RegExp('Recover '+expected+' health'));
  }
});

test('Moon Antidote lists only current cleansed stacks and removes Curse before computing its heal',()=>{
  const {state,p}=encounter('antidote');
  p.hp-=20;
  p.statuses={curse:4,poison:3,burn:2,shock:2};
  const {preview,after}=compare(state,'antidote');
  assert.deepEqual(preview.cleansed,{curse:4,poison:3,burn:2});
  assert.deepEqual(after.statuses,{shock:2});
  assert.match(preview.text,/4 Curse/);assert.match(preview.text,/3 Poison/);
  assert.doesNotMatch(preview.text,/Shock|Bleed/);
  assert.equal(preview.healing,after.hp-p.hp);
  assert.equal(preview.healing,8);
});

test('Alchemist preview lists the real Distillation alternatives without exposing or advancing the random draw',()=>{
  const {state,p}=encounter('antidote','alchemist');
  p.statuses.curse=2;
  const before=JSON.stringify(state);
  const own=previewAction(viewMatch(state,p.id),p.id,'antidote');
  assert.deepEqual(own.possibleHealing,[0,5]);
  assert.equal(own.healing,undefined);
  assert.match(own.text,/Recover 0 or 5 health/);
  assert.match(own.text,/Distillation draws a stat shard first/);
  assert.equal(JSON.stringify(state),before);
  assert.equal(previewAction(viewMatch(state,null),p.id,'antidote').text,'Action unavailable.');
  const observed=new Set();
  for(let i=0;i<128;i++){
    const trial={...state,rng:i};
    const resolved=applyCommand(trial,p.id,{type:'act',actionId:'antidote'});
    const direct=resolved.recentActions.at(-1).events.find(e=>e.type==='heal' && e.text.includes('Moon Antidote'));
    observed.add(direct?.amount || 0);
  }
  assert.deepEqual([...observed].sort((a,b)=>a-b),own.possibleHealing);
});

test('Reverse Polarity and Defend use the actual ordered status conversion and passive effects',()=>{
  const {state,p}=encounter('reverse-polarity');
  p.hp-=50;p.statuses={curse:2,poison:3};
  const converted=compare(state,'reverse-polarity');
  assert.deepEqual(converted.preview.cleansed,{poison:3});
  assert.equal(converted.preview.healing,converted.after.hp-p.hp);
  assert.equal(converted.after.regen-p.regen,3);
  assert.match(converted.preview.text,/Recover 9 health.*Gain 3 regeneration/);
  grantReward(state,p,'stillwater-ring');grantReward(state,p,'fortress-oath');
  p.armor=20;
  const defended=compare(state,'defend');
  assert.equal(defended.preview.shieldGain,16);
  assert.equal(defended.preview.healing,defended.after.hp-p.hp);
  assert.equal(defended.preview.healing,4); // Ring grants armor before Oath computes healing.
});
