import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyCommand, botCommand, CLASSES, createMatch, eligible, getActions, previewAction, previewReward, REWARDS, simulateMatch, viewMatch } from '../src/game/index.js';
import { deal, executeEffects, fittingCount, grantReward } from '../src/game/combat.js';
import { drawOffers } from '../src/game/draft.js';
import { talentState } from '../src/game/talent-state.js';

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
  assert.match(previewAction(viewMatch(state,p.id),p.id,'mirror-feint',t.id).text,/gain 7 shield/);
  resolve(state,'mirror-feint');
  assert.equal(p.shield,11);
  t.armor=120;
  assert.match(previewAction(viewMatch(state,p.id),p.id,'mirror-feint',t.id).text,/gain 15 shield/);
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

function replayFingerprint(old) {
  const hash=createHash('sha256');
  let commands=0;
  while(old.phase!=='finished') {
    const command=botCommand(old);
    hash.update(JSON.stringify([old.activeId,old.offers,command]));
    old=applyCommand(old,old.activeId,command);
    assert.ok(++commands<2000);
  }
  return [commands,hash.digest('hex')];
}

test('legacy four-seat and opening-night eight-seat tickets retain every historical offer and bot command',()=>{
  const fixtures=[
    {edition:1,roles:['guardian','berserker','chronomancer','alchemist'],seed:'before-the-expanded-roster',slots:2,ticket:'old-ticket',commands:305,hash:'737f2699eec04b0414ba32ce4420bedc67a273875b13ecd3e521daa0aca09f66'},
    {edition:2,roles:Object.keys(CLASSES),seed:'opening-night',slots:3,ticket:'early-eight',commands:611,hash:'6bdba62ddb0a7faa8e493aa27cf4193469136b141f2e1cc17c5ba24019885c11'}
  ];
  for (const f of fixtures) {
    const players=f.roles.map((classId,i)=>({id:'p'+(i+1),name:'Seat '+i,classId,bot:true}));
    const old=createMatch({seed:f.seed,players,config:{abilitySlots:f.slots,rulesEdition:f.edition},career:{runId:f.ticket,seats:{p1:[]}}});
    delete old.config.rulesEdition;
    assert.equal(viewMatch(old,old.activeId).config.rulesEdition,f.edition);
    assert.deepEqual(replayFingerprint(old),[f.commands,f.hash]);
  }
});

test('new tickets freeze their draw pool and the rules edition used by combat and draft forecasts',()=>{
  const fresh=draft('artificer');
  assert.deepEqual(fresh.rewardPool,Object.keys(REWARDS));
  fresh.rewardPool=['fang-shard','heartwood','iron-shard'];
  for (let i=0; i<24; i++) assert.deepEqual(drawOffers(fresh,fresh.players[0]).sort(),[...fresh.rewardPool].sort());
});

test('a public talent inspection follows the same live state for the owner, rivals and spectators',()=>{
  function observe(state,id) {
    const rows=[id,'rival',null].map(who=>{
      const view=viewMatch(state,who), p=view.players.find(p=>p.id===id);
      return talentState(view,p);
    });
    assert.equal(new Set(rows).size,1);
    return rows[0];
  }
  let game=draft('gambler');
  assert.match(observe(game,'hero'),/Even odds.*turn 4/);
  game=applyCommand(game,'hero',{type:'reroll'});
  assert.match(observe(game,'hero'),/High card loaded/);
  game=use(pick(game),'defend');
  assert.match(observe(game,'hero'),/Even odds/);
  const guard=draft('guardian','trickster');
  guard.players[1].shield=8;
  assert.match(observe(guard,'rival'),/ready/);
  deal(guard,guard.players[0],guard.players[1],3,'Contact',{direct:true});
  assert.match(observe(guard,'rival'),/returns on personal turn/);
  const forge=draft('artificer');
  grantReward(forge,forge.players[0],'ward-lantern');
  assert.match(observe(forge,'hero'),/1\/4 fittings · \+3/);
  const healer=draft('necromancer');
  healer.players[0].consumables.push('second-breath');
  healer.players[0].statuses.curse=2;
  assert.match(observe(healer,'hero'),/heal up to 3/);
  resolve(healer,'soul-tithe');
  assert.match(observe(healer,'hero'),/returns on personal turn/);
  assert.equal(JSON.stringify(viewMatch(healer,'rival')).includes('second-breath'),false);
});

test('current Bash reaches its offensive cap at 30 armor while old saves keep their original scaling',()=>{
  for (const [edition,expected] of [[1,125],[2,125],[3,20]]) {
    const state=createMatch({seed:'historical-bash',config:{rulesEdition:edition},players:[seat('hero','guardian'),seat('rival','berserker')]});
    const [p,t]=state.players;
    p.armor=100; t.armor=0;
    const projection=viewMatch(state,p.id);
    const preview=previewAction(projection,p.id,'bastion-bash',t.id);
    assert.equal(preview.damage,expected);
    assert.match(getActions(projection,p.id).find(a=>a.id==='bastion-bash').description,
      edition === 3 ? /up to 30 armor/ : /120%/);
  }
});

test('stacked armor keeps mitigating damage while Defend and Molten Mail match each edition’s displayed benefit',()=>{
  for (const [edition,shield,burn] of [[1,56,6],[2,56,6],[3,18,4]]) {
    const seed=draft('guardian','berserker').seed;
    let state=createMatch({seed,config:{rulesEdition:edition},players:[seat('hero','guardian'),seat('rival','berserker')]});
    state=pick(state);
    const [p,t]=state.players;
    p.armor=100; p.shield=7; p.artifacts=['molten-mail','phoenix-feather'];
    state.remainingActions=3;
    const view=viewMatch(state,p.id);
    assert.equal(previewAction(view,p.id,'defend').shieldGain,shield);
    assert.equal(getActions(view,p.id).find(a=>a.id==='defend').description.includes('up to 18'),edition===3);
    assert.ok(previewAction(view,p.id,'bastion-bash',t.id).text.includes(burn+' Burn'));
    state=use(state,'defend',p.id);
    assert.equal(state.players[0].shield,7+shield);
    state=use(state,'bastion-bash',t.id);
    assert.equal(state.players[1].statuses.burn,burn);
    const armored=state.players[0];
    armored.shield=0; const hp=armored.hp;
    deal(state,state.players[1],armored,60,'Strike',{direct:true});
    assert.equal(hp-armored.hp,30);
  }
});

test('the exclusive slot offers each role its own artifact and retires it after acquisition',()=>{
  for (const [role,id] of Object.entries({gambler:'marked-deck',necromancer:'wake-candle',trickster:'silver-backing',artificer:'ratchet-spring'})) {
    const s=draft(role), [p,other]=s.players;
    s.config.rarityCurve=[[1,0,0,0,1,0]];
    s.config.exclusiveChance=1; s.config.favoredChance=0;
    assert.ok(drawOffers(s,p).includes(id));
    assert.equal(drawOffers(s,other).includes(id),false);
    grantReward(s,p,id);
    assert.equal(drawOffers(s,p).includes(id),false);
    assert.throws(()=>grantReward(s,other,id),/ineligible/);
  }
});

test('the heavy cleave leaves recovery time even with Haste while legacy matches keep their original bleed',()=>{
  for (const [edition,stacks,cooldown] of [[2,3,1],[3,2,2]]) {
    const roles=['berserker','guardian'];
    let s;
    for(let seed=0;s?.activeId!=='hero';seed++) s=createMatch({seed,config:{rulesEdition:edition},players:roles.map((id,i)=>seat(i?'rival':'hero',id))});
    s.offers=['accelerate','heartwood','fang-shard'];
    s=applyCommand(s,'hero',{type:'pick',rewardId:'accelerate'});
    const before=previewAction(viewMatch(s,'hero'),'hero','blood-cleave','rival');
    assert.ok(before.text.includes(stacks+' Bleed'));
    s=use(s,'blood-cleave');
    assert.equal(s.players[0].abilities[0].cooldown,cooldown);
    assert.equal(s.players[1].statuses.bleed,stacks);
  }
});

test('drafting cards forecasts both rolls and replacing a fitted slot forecasts the gauntlet actually carried',()=>{
  const cards=draft('gambler'), owner=cards.players[0];
  cards.offers=['fang-shard','echo-rune','heartwood'];
  const ownerView=viewMatch(cards,owner.id);
  assert.match(previewReward(ownerView,owner.id,'fang-shard').text,/Cut the Deck 12–23 → 14–25 base damage/);
  assert.match(previewReward(ownerView,owner.id,'echo-rune').text,/5–9 base damage as an echo/);
  const shop=draft('artificer'), [builder]=shop.players;
  shop.config.abilitySlots=2;
  builder.abilities=[{...slot('time-bolt'),modifiers:['amplify']},slot('grave-bell')];
  shop.offers=['rivet-drive','heartwood','iron-shard'];
  const v=viewMatch(shop,builder.id);
  assert.match(previewReward(v,builder.id,'rivet-drive').text,/12–15 base damage/);
  for (const [replace,damage] of [[0,12],[1,15]]) {
    assert.match(previewReward(v,builder.id,'rivet-drive',replace).text,new RegExp(damage+' base damage'));
    const now=applyCommand(shop,builder.id,{type:'pick',rewardId:'rivet-drive',replaceIndex:replace});
    now.players[1].armor=0;
    assert.equal(previewAction(viewMatch(now,builder.id),builder.id,'rivet-drive','rival').damage,damage);
  }
});

test('duplicate-class duels and full tables keep separate talents and finish through normal bot commands',()=>{
  for (const classId of newcomers) {
    for (const count of [2,8]) {
      const players=Array.from({length:count},(_,i)=>seat('p'+i,classId));
      const options={seed:'mirror-table-'+classId+'-'+count,players,config:{ages:[1,4,7,10],chaosBase:15,chaosStep:8}};
      const {state,commands}=simulateMatch(options);
      assert.equal(state.phase,'finished');
      assert.ok(commands>count && commands<1000);
      assert.ok(state.players.every(p=>Number.isSafeInteger(p.hp) && p.hp>=0 && p.hp<=p.maxHp));
      assert.ok(state.players.every(p=>p.abilities.every(s=>s.cooldown>=0)));
      assert.equal(state.players.filter(p=>p.alive).length,Number(state.winnerId!==null));
      assert.ok(viewMatch(state,null).players.every(p=>p.consumables===undefined));
    }
  }
});
