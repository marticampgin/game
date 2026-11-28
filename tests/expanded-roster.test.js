import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyCommand, botCommand, CLASSES, createMatch, eligible, getActions, previewAction, previewReward, REWARDS, viewMatch } from '../src/game/index.js';
import { deal, executeEffects, fittingCount, grantReward } from '../src/game/combat.js';
import { drawOffers } from '../src/game/draft.js';

const newcomers = ['gambler','necromancer','trickster','artificer'];
const seat = (id,classId) => ({id,name:id,classId,bot:true});
const slot = id => ({id,cooldown:0,modifiers:[]});
function draft(classId,rival='guardian',extra=[]) {
  const players = [seat('hero',classId),seat('rival',rival),...extra];
  for (let seed=0; ; seed++) {
    const state = createMatch({seed,players});
    if (state.activeId === 'hero') return state;
  }
}
const pick = s => applyCommand(s,s.activeId,{type:'pick',rewardId:s.offers[0]});
const use = (s,id,targetId='rival') => applyCommand(s,s.activeId,{type:'act',actionId:id,targetId});
function resolve(state,id,target=state.players[1]) {
  const p = state.players[0], ability=REWARDS[id];
  executeEffects(state,p,target,ability.effects,{label:ability.name,slot:p.abilities.find(a => a.id === id)});
}

test('every new class can draft, preview, cast, and publish its starting move through the ordinary turn loop',()=>{
  for (const role of newcomers) {
    const state = pick(draft(role,'berserker'));
    const id = CLASSES[role].ability, actor = state.players[0];
    const publicView = viewMatch(state,actor.id);
    assert.ok(getActions(publicView,actor.id).some(a => a.id === id && !a.disabled));
    assert.deepEqual(previewAction(state,actor.id,id,'rival'),previewAction(publicView,actor.id,id,'rival'));
    const result = use(state,id);
    const recap = viewMatch(result,null).lastAction;
    assert.equal(recap.actionId,id);
    assert.deepEqual([recap.actorId,recap.targetId,recap.next.activeId],['hero','rival',result.activeId]);
    assert.ok(recap.events.some(e => e.type === 'damage' && e.healthDamage > 0));
    assert.equal(result.players[0].abilities.find(a => a.id === id).cooldown,2);
    assert.equal(eligible(state.players[1],REWARDS[id]),false);
  }
});

test('a fair card advertises both real outcomes without forecasting or advancing the random stream',()=>{
  const state = pick(draft('gambler')), [p,t] = state.players;
  t.shield=12;
  const before=JSON.stringify(state);
  const preview=previewAction(viewMatch(state,p.id),p.id,'cut-the-deck',t.id);
  assert.match(preview.text,/even odds/);
  assert.ok(preview.high.healthDamage>preview.healthDamage);
  assert.equal(JSON.stringify(state),before);
  const results = new Set();
  for (let seed=1; seed<=16; seed++) {
    const copy=structuredClone(state);
    copy.rng=seed;
    resolve(copy,'cut-the-deck');
    const event=copy.log.findLast(e=>e.type==='damage');
    const estimate=event.text.includes('high card') ? preview.high : preview;
    assert.deepEqual([event.healthDamage,event.shieldDamage],[estimate.healthDamage,estimate.shieldDamage]);
    results.add(event.amount);
  }
  assert.deepEqual([...results].sort((a,b)=>a-b),[preview.damage,preview.high.damage]);
});

test('a reroll loads only the current Gambler turn, triggers Marked Deck, and a fourth turn grants another chip',()=>{
  let state=draft('gambler');
  grantReward(state,state.players[0],'marked-deck');
  state=applyCommand(state,'hero',{type:'reroll'});
  assert.equal(state.players[0].rerolls,0);
  assert.equal(state.players[0].shield,5);
  state=pick(state);
  const loaded=previewAction(viewMatch(state,'hero'),'hero','cut-the-deck','rival');
  assert.match(loaded.text,/guaranteed high card/);
  const rng=state.rng;
  resolve(state,'cut-the-deck');
  assert.equal(state.rng,rng);
  assert.match(state.log.findLast(e=>e.type==='damage').text,/high card/);
  state.players[0].personalTurn=3;
  state=use(state,'defend');
  while(state.activeId!=='hero') state=state.phase==='acquire' ? pick(state) : use(state,'defend');
  assert.equal(state.players[0].personalTurn,4);
  assert.equal(state.players[0].rerolls,1);
  assert.match(previewAction(viewMatch(state,'hero'),'hero','cut-the-deck','rival').text,/even odds/);
});

test('Last Rites checks prior Curse, applies actual healing limits, and witnesses a permanent death exactly once',()=>{
  const state=pick(draft('necromancer','guardian',[seat('third','necromancer')]));
  const [p,t,other]=state.players;
  p.hp-=35; p.statuses.curse=2;
  grantReward(state,p,'wake-candle');
  const before=previewAction(viewMatch(state,p.id),p.id,'soul-tithe',t.id);
  assert.match(before.text,/heal 3/);
  const hp=p.hp, baseSpell=p.spellPower;
  resolve(state,'soul-tithe');
  assert.deepEqual([p.hp,p.shield,t.statuses.curse],[hp+3,4,3]);
  const next=previewAction(viewMatch(state,p.id),p.id,'soul-tithe',t.id);
  assert.ok(next.damage>before.damage);
  assert.doesNotMatch(next.text,/· heal /);
  resolve(state,'soul-tithe');
  assert.equal(p.hp,hp+3);
  const otherSpell=other.spellPower;
  t.consumables.push('second-breath');
  deal(state,p,t,9999,'Trial',{trueDamage:true});
  assert.equal(t.alive,true);
  assert.equal(p.spellPower,baseSpell);
  deal(state,null,t,9999,'Arena',{trueDamage:true});
  assert.equal(t.alive,false);
  assert.deepEqual([p.spellPower,other.spellPower],[baseSpell+1,otherSpell+1]);
  deal(state,null,t,9999,'Arena',{trueDamage:true});
  assert.deepEqual([p.spellPower,other.spellPower],[baseSpell+1,otherSpell+1]);
});

test('Mirror Feint reads printed, equipped enemy techniques in order and never inspects hidden supplies',()=>{
  const state=pick(draft('trickster')), [p,t]=state.players;
  grantReward(state,p,'silver-backing');
  t.abilities=[slot('ward-lantern'),slot('reverse-polarity'),slot('blood-cleave'),slot('cinder-orb')];
  t.consumables=['spark-bottle'];
  const view=viewMatch(state,p.id);
  assert.equal(view.players[1].consumables,undefined);
  const anticipated=previewAction(view,p.id,'mirror-feint',t.id);
  assert.match(anticipated.text,/2 Bleed/);
  assert.deepEqual(anticipated,previewAction(state,p.id,'mirror-feint',t.id));
  resolve(state,'mirror-feint');
  assert.deepEqual([t.statuses.bleed,t.statuses.burn,p.shield],[2,undefined,4]);
  t.abilities=[slot('mirror-feint')];
  assert.match(previewAction(viewMatch(state,p.id),p.id,'mirror-feint',t.id).text,/gain 6 shield/);
  resolve(state,'mirror-feint');
  assert.equal(p.shield,10);
  assert.deepEqual(t.consumables,['spark-bottle']);
});

test('False Guard responds once to direct shield contact even if that hit broke the shield',()=>{
  const state=draft('guardian','trickster'), [p,t]=state.players;
  t.shield=3;
  deal(state,p,t,4,'Poison',{trueDamage:true});
  assert.equal(t.shield,0);
  t.shield=3;
  deal(state,p,t,4,'Strike',{direct:true,trueDamage:true});
  assert.equal(t.shield,5);
  deal(state,p,t,2,'Strike',{direct:true,trueDamage:true});
  assert.equal(t.shield,3);
  t.personalTurn++;
  deal(state,p,t,2,'Strike',{direct:true,trueDamage:true});
  assert.equal(t.shield,6);
});

test('Workshop counts installed equipment, caps the drive, and previews a rune with its own fitting',()=>{
  const state=draft('artificer'), [p,t]=state.players;
  assert.equal(fittingCount(p),0);
  grantReward(state,p,'ratchet-spring');
  assert.equal(p.armor,CLASSES.artificer.stats.armor+1);
  grantReward(state,p,'ward-lantern');
  grantReward(state,p,'hollow-needle');
  assert.equal(fittingCount(p),2);
  state.offers=['amplify'];
  const forecast=previewReward(viewMatch(state,p.id),p.id,'amplify');
  assert.match(forecast.text,/Rivet Drive fittings 2 → 3/);
  grantReward(state,p,'amplify');
  assert.equal(p.shield,18);
  assert.equal(p.armor,CLASSES.artificer.stats.armor+3);
  t.armor=0;
  const estimate=previewAction(viewMatch(state,p.id),p.id,'rivet-drive',t.id);
  assert.match(forecast.text,new RegExp('Rivet Drive \\d+ → ' + estimate.damage + ' base damage'));
  resolve(state,'rivet-drive');
  assert.equal(state.log.findLast(e=>e.type==='damage').amount,estimate.damage);
  grantReward(state,p,'vial-sash');
  const capped=previewAction(viewMatch(state,p.id),p.id,'rivet-drive',t.id);
  grantReward(state,p,'golden-shell');
  assert.deepEqual(previewAction(viewMatch(state,p.id),p.id,'rivet-drive',t.id),capped);
  assert.match(capped.text,/4\/4 fittings/);
});

test('legacy saved tickets retain the exact original 305-command replay and a fresh match snapshots its draw pool',()=>{
  const players=['guardian','berserker','chronomancer','alchemist'].map((classId,i)=>({id:'p'+(i+1),name:'Seat '+i,classId,bot:true}));
  const options={seed:'before-the-expanded-roster',players,config:{abilitySlots:2},career:{runId:'old-ticket',seats:{p1:[]}}};
  let old=createMatch(options);
  delete old.rewardPool;
  const hash=createHash('sha256');
  let commands=0;
  while(old.phase!=='finished') {
    const command=botCommand(old);
    hash.update(JSON.stringify([old.activeId,old.offers,command]));
    old=applyCommand(old,old.activeId,command);
    assert.ok(++commands<500);
  }
  assert.equal(commands,305);
  // Generated from the pre-expansion engine with the same seed and two slots.
  assert.equal(hash.digest('hex'),'737f2699eec04b0414ba32ce4420bedc67a273875b13ecd3e521daa0aca09f66');
  const fresh=draft('artificer');
  assert.deepEqual(fresh.rewardPool,Object.keys(REWARDS));
  fresh.rewardPool=['fang-shard','heartwood','iron-shard'];
  for (let i=0; i<24; i++) assert.deepEqual(drawOffers(fresh,fresh.players[0]).sort(),[...fresh.rewardPool].sort());
});
