import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMatch,sandboxEdit,viewMatch} from '../src/game/index.js';
import {executeEffects,grantReward} from '../src/game/combat.js';

const seats = [
  {id:'g',name:'Granite',classId:'guardian'},
  {id:'b',name:'Ember',classId:'berserker'},
  {id:'a',name:'Alder',classId:'alchemist'}
];
function opening(count=2,config={}) {
  for (let seed=0;seed<100;seed++) {
    const s=createMatch({seed,players:seats.slice(0,count),config});
    if (s.activeId==='g' && s.queue[0]==='b') return s;
  }
  throw Error('Initial order fixture unavailable');
}
const active = s => s.players.find(p=>p.id===s.activeId);
const choose = (s,rewardId) => {
  if (rewardId) s.offers=[rewardId,'astral-shard','fang-shard'];
  return applyCommand(s,s.activeId,{type:'pick',rewardId:s.offers[0],replaceIndex:0});
};
const use = (s,actionId,targetId) => applyCommand(s,s.activeId,{type:'act',actionId,targetId});
const recent = s => viewMatch(s,null).lastAction;

test('one ordered public recap captures damage, shield break, revival, hidden ward and retaliation',()=>{
  let s=opening();
  const [hero,rival]=s.players;
  rival.hp=1;rival.shield=4;
  for (const id of ['second-breath','emergency-ward','briar-crown','widows-brew']) grantReward(s,rival,id);
  s=use(choose(s,'iron-shard'),'bastion-bash',rival.id);
  const r=recent(s);
  assert.deepEqual([r.id,r.actorId,r.actionId,r.targetId,r.actorName,r.actionName,r.targetName],[1,hero.id,'bastion-bash',rival.id,'Granite','Bastion Bash','Ember']);
  assert.deepEqual(r.events.map(e=>e.type),['damage','revival','action','shield','synergy','damage']);
  const [hit,revive,reveal,shield,trigger,retaliation]=r.events;
  assert.deepEqual([hit.healthDamage,hit.shieldDamage,hit.shieldBroken],[1,4,true]);
  assert.equal(revive.amount,Math.ceil(rival.maxHp/4));assert.match(reveal.text,/Emergency Ward/);assert.equal(shield.amount,18);
  assert.match(trigger.text,/Briar Crown/);assert.equal(retaliation.healthDamage,3);
  assert.ok(r.events.every(e=>e.timing==='action'));
  assert.deepEqual(r.next,{activeId:'b',phase:'acquire',remainingActions:1,round:1,globalTurn:2,bonusDraft:false,winnerId:null});
  assert.equal(r.omitted,0);
  for (const viewer of ['g','b',null]) {
    const wire=viewMatch(s,viewer);
    assert.deepEqual(wire.lastAction,r);
    assert.doesNotMatch(JSON.stringify(wire.recentActions),/widows-brew|Widow’s Brew/);
    assert.deepEqual(wire.recentActions.at(-1),r);
  }
});

test('draft picks, rerolls and reconnects preserve the last resolved action; missed polls keep eight distinct recaps',()=>{
  let s=use(choose(opening(),'iron-shard'),'defend');
  const previous=recent(s);
  s=applyCommand(s,s.activeId,{type:'reroll'});
  s=choose(s,'red-tonic');
  assert.deepEqual(recent(s),previous);
  s=JSON.parse(JSON.stringify(s));
  assert.deepEqual(recent(s),previous);
  assert.equal(s.lastAction,undefined);
  for(let i=0;i<8;i++){
    if(s.phase==='acquire')s=choose(s,'iron-shard');
    s=use(s,'defend');
  }
  const view=viewMatch(s,'g');
  assert.deepEqual(view.recentActions.map(r=>r.id),[2,3,4,5,6,7,8,9]);
  assert.strictEqual(view.recentActions.at(-1),view.lastAction);
  view.lastAction.events.length=0;
  assert.ok(recent(s).events.length);
  assert.doesNotMatch(JSON.stringify(view.recentActions),/red-tonic|Red Tonic/);
});

test('Scavenge appends its public outcome to the same action, protecting all hidden draft details',()=>{
  let s=use(choose(opening(),'iron-shard'),'scavenge');
  const opened=recent(s);
  assert.equal(opened.id,1);assert.equal(opened.next.bonusDraft,true);
  assert.equal(opened.next.activeId,'g');
  s=applyCommand(s,s.activeId,{type:'reroll'});
  assert.deepEqual(recent(s),opened);
  s=choose(s,'second-breath');
  const resolved=recent(s);
  assert.equal(resolved.id,opened.id);
  assert.equal(s.recentActions.length,1);
  assert.equal(resolved.next.activeId,'b');
  assert.deepEqual(resolved.events.slice(0,opened.events.length),opened.events);
  assert.ok(resolved.events.some(e=>e.text.includes('concealed consumable')));
  assert.doesNotMatch(JSON.stringify(resolved),/second-breath|Second Breath|Astral Shard|Fang Shard|reroll/i);
});

test('turn-start effects, skipped seats and final outcomes carry their own timing and original source',()=>{
  let s=opening(3);
  const [g,b,a]=s.players;
  b.hp=1;
  executeEffects(s,a,b,[{kind:'status',key:'poison',amount:2}],{label:'Fixture'});
  s=use(choose(s,'iron-shard'),'defend');
  const r=recent(s);
  const poison=r.events.find(e=>e.type==='damage');
  assert.deepEqual([poison.timing,poison.turnOwnerId,poison.actorId,poison.targetId],['turn','b','a','b']);
  assert.ok(r.events.some(e=>e.type==='elimination' && e.timing==='turn'));
  assert.equal(r.next.activeId,'a');
  s=choose(s,'iron-shard');
  const target=s.players.find(p=>p.id===g.id);
  target.shield=0;target.hp=1;
  s=use(s,'attack',g.id);
  const end=recent(s);
  assert.equal(end.next.phase,'finished');assert.equal(end.next.winnerId,'a');assert.equal(end.next.activeId,null);
  assert.equal(end.events.at(-1).type,'victory');
});

test('lethal Bleed interrupting an unspent consumable reveals neither its identity nor a successful hit',()=>{
  let s=choose(opening(),'spark-bottle');
  const [g,b]=s.players;
  g.hp=1;g.armor=0;
  executeEffects(s,b,g,[{kind:'status',key:'bleed',amount:2}],{label:'Fixture'});
  s=use(s,'spark-bottle','b');
  const v=viewMatch(s,'b');
  assert.equal(v.lastAction.actionId,'interrupted');
  assert.match(v.lastAction.events.find(e=>e.type==='timing').text,/interrupted/);
  assert.doesNotMatch(JSON.stringify(v),/spark-bottle|Spark Bottle/);
  assert.equal(s.players[0].consumables.includes('spark-bottle'),true);
});

test('bounded recaps preserve first and final outcomes even when the underlying public log already wrapped',()=>{
  let s=opening(2,{logLimit:10});
  s=choose(s,'iron-shard');
  const delayedCount=48;
  s.players[1].hp=3000;s.players[1].maxHp=3000;
  for(let i=0;i<delayedCount;i++)s.delayed.push({source:'g',target:'b',due:s.globalTurn+1,raw:1,label:'Echo '+i,trueDamage:true});
  s=use(s,'defend');
  const r=recent(s);
  assert.equal(s.log.length,10);
  assert.equal(r.events.length,32);
  assert.equal(r.omitted,17);
  assert.equal(r.events[0].type,'shield');
  assert.ok(r.events.slice(1).every(e=>e.timing==='turn' && e.turnOwnerId==='b'));
  assert.match(r.events.at(-1).text,/Echo 47/);
  assert.deepEqual(r.events.map(e=>e.id),r.events.map(e=>e.id).sort((a,b)=>a-b));
});

test('legacy saves, extra actions, rounds and arbitrary debug fields project a stable public contract',()=>{
  let s=opening(2,{eventInterval:2});
  delete s.recentActions;
  assert.deepEqual(viewMatch(s,'g').recentActions,[]);
  assert.equal(viewMatch(s,'g').lastAction,null);
  s=choose(s,'iron-shard');s.remainingActions=2;
  s=use(s,'defend');
  assert.equal(recent(s).next.phase,'action');assert.equal(recent(s).next.activeId,'g');
  s=use(s,'defend');
  s=choose(s,'iron-shard');s=use(s,'defend');
  assert.equal(recent(s).next.round,2);
  assert.ok(recent(s).events.some(e=>e.type==='event' && e.timing==='round'));
  s.recentActions[0].debug='private probe';
  s.recentActions[0].events[0].offers=['private probe'];
  s.recentActions[0].next.rng='private probe';
  assert.doesNotMatch(JSON.stringify(viewMatch(s,null)),/private probe/);
  const withSandbox=sandboxEdit(s,{type:'stat',playerId:'b',stat:'armor',value:41});
  assert.deepEqual(recent(withSandbox),recent(s));
});
