import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, botCommand, CLASSES, createMatch, viewMatch } from '../src/game/index.js';
import { deal, grantReward, record } from '../src/game/combat.js';

const seats = Object.keys(CLASSES).map((classId,i) => ({id:'p'+i,classId,name:CLASSES[classId].name}));

test('permanent knockouts survive the rolling log throughout a full eight-seat match', () => {
  let state = createMatch({seed:'history-jury',players:seats,config:{logLimit:10}});
  while (state.phase !== 'finished') state = applyCommand(state,state.activeId,botCommand(state));
  const {log,milestones} = viewMatch(state,seats[0].id);
  assert.equal(log.length,10);
  assert.equal(milestones.complete,true);
  assert.ok(milestones.eliminations.some(fall => fall.id < log[0].id));
  assert.deepEqual(milestones.eliminations.map(fall => fall.targetId).sort(),state.players.filter(p => !p.alive).map(p => p.id).sort());
  assert.equal(milestones.eliminations[0].place,8);
  assert.ok(milestones.eliminations.every(fall => fall.place >= 1 && fall.place <= 8));
  assert.deepEqual(viewMatch(JSON.parse(JSON.stringify(state))).milestones,milestones);

  // Old saves can only retain public deaths they still know about.
  const legacy = structuredClone(state);
  delete legacy.matchMilestones;
  const partial = viewMatch(legacy).milestones;
  assert.equal(partial.complete,false);
  assert.deepEqual(partial.eliminations.map(fall => fall.id),log.filter(e => e.type === 'elimination').map(e => e.id));
  for (let i=0;i<20;i++) record(legacy,'timing','Later turn.');
  assert.deepEqual(viewMatch(legacy).milestones,partial);
});

test('a simultaneous arena fire assigns a shared finish to every contender it removes', () => {
  let state = createMatch({seed:'history-draw',players:seats,config:{ages:[1,2,3,4],chaosBase:10000,eventInterval:200,logLimit:10}});
  while (state.phase !== 'finished') {
    const command = state.phase === 'acquire' ? {type:'pick',rewardId:state.offers[0],replaceIndex:0} : {type:'act',actionId:'defend'};
    state = applyCommand(state,state.activeId,command);
  }
  assert.equal(state.winnerId,null);
  assert.equal(viewMatch(state).milestones.eliminations.length,8);
  assert.ok(viewMatch(state).milestones.eliminations.every(fall => fall.place === 1 && fall.tied));
});

test('repeatedly surviving lethal hits retains two public records and a count per seat', () => {
  const state = createMatch({seed:'history-revivals',players:seats.slice(0,2),config:{logLimit:10}});
  const [attacker,rival] = state.players;
  for (let i=0;i<80;i++) {
    grantReward(state,rival,'second-breath');
    deal(state,attacker,rival,10000,'Basic Attack',{trueDamage:true,bypassShield:true});
  }
  state.matchMilestones.revivals[0].last.privateItem = 'concealed item';
  const {milestones,log} = viewMatch(state,attacker.id);
  assert.equal(milestones.eliminations.length,0);
  assert.equal(milestones.revivals.length,1);
  const [survival] = milestones.revivals;
  assert.deepEqual(Object.keys(survival).sort(),['count','first','last']);
  assert.equal(survival.count,80);
  assert.ok(survival.first.id < log[0].id);
  assert.ok(survival.last.id >= log[0].id);
  assert.equal(survival.last.privateItem,undefined);
  assert.ok(JSON.stringify(milestones).length < 700);
});
