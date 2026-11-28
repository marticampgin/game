import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, botCommand, CLASSES, createMatch, getActions, previewAction, replayMatch, REWARDS, sandboxEdit, simulateMatch, viewMatch } from '../src/game/index.js';
import { deal, executeEffects, grantReward, setStatus, tickStatus } from '../src/game/combat.js';
import { drawOffers, eligible, rarityWeights, resonance } from '../src/game/draft.js';

const seats = (n) => Array.from({length:n},(_,i) => ({id:'p'+i,name:'Seat '+i,classId:Object.keys(CLASSES)[i % 4]}));
const match = (n=3,config={}) => createMatch({seed:'mechanical-regression',players:seats(n),config});
const active = (s) => s.players.find(p => p.id === s.activeId);
const rival = (s) => s.players.find(p => p.id !== s.activeId && p.alive);
const choose = (s) => applyCommand(s,s.activeId,{type:'pick',rewardId:s.offers[0],replaceIndex:0});
const act = (s,id='defend',targetId) => applyCommand(s,s.activeId,{type:'act',actionId:id,targetId});
const grant = (s,id,p=active(s)) => grantReward(s,p,id,0);
const status = (s,source,target,key,amount) => executeEffects(s,source,target,[{kind:'status',key,amount}],{label:'Test'});
function until(s,predicate) {
  for (let i=0; i<100; i++) {
    if (predicate(s)) return s;
    if (s.phase === 'finished') break;
    s = s.phase === 'acquire' ? choose(s) : act(s);
  }
  throw Error('Expected state not reached.');
}

test('catalog definitions have usable mechanics, identifiers, semantic inputs and outputs',() => {
  const categories = new Set(), tiers = new Set();
  for (const [id,r] of Object.entries(REWARDS)) {
    assert.equal(id,r.id);
    assert.ok(r.name && r.icon && r.description);
    assert.ok(r.produces.length || r.consumes.length);
    if (r.exclusive) assert.ok(CLASSES[r.exclusive]);
    if (['ability','item','consumable','shard','chest'].includes(r.category)) assert.ok(Array.isArray(r.effects));
    categories.add(r.category); tiers.add(r.rarity);
  }
  assert.equal(categories.size,7);
  assert.equal(tiers.size,5);
  for (const c of Object.values(CLASSES)) assert.equal(REWARDS[c.ability].category,'ability');
});

test('2–8 unique contenders, seeded turn shuffling, exact deterministic replay and snapshot isolation',() => {
  assert.throws(() => match(1)); assert.throws(() => match(9));
  assert.throws(() => createMatch({players:[seats(2)[0],seats(2)[0]]}));
  assert.throws(() => createMatch({players:[seats(2)[0],{...seats(2)[1],classId:'constructor'}]}));
  const options = {seed:'sealed',players:seats(4)};
  let state = createMatch(options);
  const initial = structuredClone(state);
  const commands = [];
  for (let i=0;i<35;i++) {
    commands.push(botCommand(state));
    state = applyCommand(state,state.activeId,commands.at(-1));
  }
  assert.deepEqual(state,replayMatch(options,commands));
  assert.deepEqual(initial,createMatch(options));
  assert.notDeepEqual(createMatch({...options,seed:'other'}).rng,initial.rng);
  assert.equal(new Set(initial.order).size,4);
  for (let n=2;n<=8;n++) assert.equal(match(n).players.length,n);
});

test('rejects wrong actor, phase, stale draft, invalid target and full inventory without mutating state',() => {
  const s = match(2,{abilitySlots:1,consumableSlots:1});
  const other = rival(s);
  assert.throws(() => applyCommand(s,other.id,{type:'reroll'}));
  assert.throws(() => act(s,'attack',other.id));
  assert.throws(() => applyCommand(s,s.activeId,{type:'pick',rewardId:'ineligible'}));
  const a = choose(s), before = structuredClone(a);
  assert.throws(() => act(a,'attack',a.activeId));
  assert.throws(() => act(a,'attack','missing'));
  assert.throws(() => act(a,'unowned-spell',other.id));
  assert.throws(() => applyCommand(a,a.activeId,{type:'reroll'}));
  assert.deepEqual(before,a);
  const p = active(s), ability = Object.values(REWARDS).find(r => r.category === 'ability' && eligible(p,r));
  s.offers[0] = ability.id;
  assert.throws(() => applyCommand(s,s.activeId,{type:'pick',rewardId:ability.id}),/slot/);
  const replaced = applyCommand(s,s.activeId,{type:'pick',rewardId:ability.id,replaceIndex:0});
  assert.equal(active(replaced).abilities[0].id,ability.id);
  assert.equal(active(s).abilities.length,1);
});

test('public and spectator projections conceal rolls, seed, private inventory and unrevealed log details',() => {
  const s = match(), owner = active(s), enemy = rival(s);
  grant(s,'second-breath');
  grant(s,'widows-brew',enemy);
  for (const viewer of [null,enemy.id]) {
    const v = viewMatch(s,viewer), projected = v.players.find(p => p.id === owner.id);
    assert.deepEqual(v.offers,[]); assert.equal(projected.consumables,undefined);
    assert.equal(projected.consumableCount,1);
    assert.equal(v.rng,undefined); assert.equal(v.seed,undefined);
    assert.ok(!JSON.stringify(v).includes('second-breath'));
    assert.ok(!JSON.stringify(v.log).includes('Second Breath'));
  }
  const v = viewMatch(s,owner.id);
  assert.deepEqual(v.offers,s.offers);
  assert.deepEqual(v.players.find(p => p.id === owner.id).consumables,['second-breath']);
  v.offers.pop(); v.players[0].hp=2;
  assert.equal(s.offers.length,3); assert.ok(s.players[0].hp>2);
});

test('three distinct eligible offers, rarity interpolation, class preference, adaptive resonance and rerolls',() => {
  const s = match(), p = s.players.find(p => p.classId === 'guardian');
  assert.deepEqual(rarityWeights(s.config,1),[60,28,9,2.5,0.5]);
  assert.deepEqual(rarityWeights(s.config,80),[15,25,30,20,10]);
  assert.equal(rarityWeights(s.config,13)[0],44);
  assert.ok(resonance(p,REWARDS['molten-mail']) > resonance(p,REWARDS['fortune-chip']));
  assert.ok(!eligible(p,REWARDS['bastion-bash']));
  assert.ok(!eligible(p,REWARDS['red-wake']));
  p.abilities[0].modifiers.push('amplify');
  assert.ok(!eligible(p,REWARDS.amplify));
  for (let i=0;i<100;i++) {
    const offers = drawOffers(s,p);
    assert.equal(new Set(offers).size,3);
    assert.ok(offers.every(id => eligible(p,REWARDS[id])));
  }
  s.config.rarityCurve = [[1,0,0,0,1,0]];
  s.config.exclusiveChance = 1; s.config.favoredChance = 0;
  assert.ok(drawOffers(s,p).includes('fortress-oath'));
  s.config.rarityCurve = [[1,1,0,0,0,0]];
  s.config.exclusiveChance = 0; s.config.favoredChance = 1;
  assert.ok(drawOffers(s,p).includes('iron-shard'));
  const rerolled = applyCommand(s,s.activeId,{type:'reroll'});
  assert.equal(active(rerolled).rerolls,0);
  assert.throws(() => applyCommand(rerolled,rerolled.activeId,{type:'reroll'}));
});

test('combat preview matches armor then shield resolution with configurable rounding and no secret inspection',() => {
  const s = choose(match(3,{rounding:'floor'})), attacker = active(s), target = rival(s);
  attacker.attack = 29; target.armor = 50; target.shield = 7;
  grant(s,'second-breath',target);
  let v = viewMatch(s,attacker.id);
  const preview = previewAction(v,attacker.id,'attack',target.id);
  assert.deepEqual([preview.damage,preview.shieldDamage,preview.healthDamage],[19,7,12]);
  assert.doesNotMatch(preview.text,/breath|reviv/i);
  const after = act(s,'attack',target.id).players.find(p => p.id === target.id);
  assert.equal(after.hp,target.hp-12); assert.equal(after.shield,0);
  grant(s,'hollow-needle');
  v = viewMatch(s,attacker.id);
  assert.equal(previewAction(v,attacker.id,'hollow-needle',target.id).damage,33);
});

test('each periodic status has its own clock and decay, with per-author kill attribution',() => {
  const s = match(), [a,b,t] = s.players;
  t.armor = 0;
  status(s,a,t,'burn',2); status(s,b,t,'burn',3); status(s,a,t,'poison',4);
  status(s,b,t,'bleed',3);
  const initial = t.hp;
  tickStatus(s,t,'burn'); tickStatus(s,t,'poison');
  assert.equal(t.hp,initial-9);
  assert.deepEqual(t.sources.burn,[{id:a.id,amount:1},{id:b.id,amount:3}]);
  assert.equal(t.statuses.poison,4); assert.equal(t.statuses.bleed,3);
  tickStatus(s,t,'bleed');
  assert.equal(t.statuses.bleed,2);
  t.hp=2; a.hp-=40;
  tickStatus(s,t,'burn');
  assert.ok(!t.alive);
  assert.equal(s.log.findLast(e => e.type === 'elimination').actorId,b.id);
  assert.equal(a.hp,a.maxHp-40);
});

test('Chill converts to Freeze, thaw permits noncombat actions and Shock is consumed by one direct hit',() => {
  const s = choose(match()), p = active(s), t = rival(s);
  status(s,t,p,'chill',4);
  assert.equal(p.statuses.chill,1); assert.equal(p.statuses.freeze,1);
  assert.ok(getActions(s,p.id).find(a => a.id === 'attack').disabled);
  assert.throws(() => act(s,'attack',t.id),/Frozen/);
  const next = act(s);
  assert.equal(next.players.find(r => r.id === p.id).statuses.freeze,undefined);
  status(s,p,t,'shock',2); t.armor=0;
  const hp=t.hp;
  deal(s,p,t,10,'Tick'); assert.equal(t.statuses.shock,2);
  deal(s,p,t,10,'Hit',{direct:true}); assert.equal(t.statuses.shock,undefined);
  assert.equal(t.hp,hp-25);
});

test('Doom keeps its first countdown and Curse adjusts healing before overheal triggers',() => {
  let s = choose(match());
  const p = active(s), t = rival(s), tid=t.id;
  status(s,p,t,'doom',4); status(s,p,t,'doom',6);
  t.hp -= 30; status(s,p,t,'curse',2);
  executeEffects(s,t,t,[{kind:'heal',amount:10}],{label:'Spring'});
  assert.equal(t.hp,t.maxHp-24);
  s = until(act(s),s => s.activeId === tid);
  assert.equal(active(s).doomClock,1);
  status(s,rival(s),active(s),'doom',3);
  assert.equal(active(s).doomClock,1);
  s = until(act(choose(s)),s => s.activeId === tid);
  assert.equal(active(s).statuses.doom,undefined);
  assert.ok(s.log.some(e => e.type === 'damage' && e.text.startsWith('Doom')));
});

test('cooldowns tick once per personal turn; delayed echoes trigger on the next global turn',() => {
  let s = choose(match()), p=active(s), t=rival(s);
  const id=p.id, ability=p.abilities[0].id;
  p.abilities[0].modifiers.push('echo');
  s.remainingActions=2;
  s = act(s,ability,t.id);
  assert.equal(s.phase,'action'); assert.equal(s.activeId,id);
  assert.equal(active(s).abilities[0].cooldown,REWARDS[ability].cooldown);
  assert.equal(s.delayed.length,1); assert.deepEqual(s.offers,[]);
  assert.throws(() => act(s,ability,t.id),/Ready in/);
  s = act(s);
  assert.equal(s.delayed.length,0); assert.ok(s.log.some(e => e.type === 'damage' && e.text.includes('echo')));
  s = until(s,s => s.activeId === id);
  assert.equal(active(s).abilities[0].cooldown,REWARDS[ability].cooldown-1);
});

test('Scavenge, an additional full turn and forced extra actions keep distinct acquisition and round boundaries',() => {
  let s=choose(match(2)), p=active(s);
  const id=p.id, personal=p.personalTurn;
  grant(s,'pocket-eclipse'); grant(s,'pocket-eclipse');
  s = act(s,'pocket-eclipse');
  assert.equal(s.phase,'acquire'); assert.equal(s.activeId,id);
  assert.equal(active(s).personalTurn,personal+1); assert.equal(s.round,1);
  s = choose(s);
  assert.throws(() => act(s,'pocket-eclipse'),/round/);
  s = act(s,'scavenge');
  assert.equal(s.bonusDraft,true); assert.equal(s.activeId,id); assert.equal(s.offers.length,3);
  s = choose(s);
  assert.notEqual(s.activeId,id); assert.equal(s.round,1);
});

test('armor → Burn → healing and Burn consumption → one extra action compose across classes',() => {
  let s=choose(match()), p=active(s), t=rival(s);
  if (!p.abilities.some(a => a.id === 'bastion-bash')) grant(s,'bastion-bash');
  for (const id of ['molten-mail','phoenix-heart','phoenix-feather','combustion','borrowed-time']) grant(s,id);
  p.hp-=25;
  s.remainingActions=2;
  s=act(s,'bastion-bash',t.id); p=active(s); t=s.players.find(x => x.id === t.id);
  assert.equal(t.statuses.burn,4);
  tickStatus(s,t,'burn'); assert.equal(p.hp,p.maxHp-21); assert.equal(t.statuses.burn,3);
  s=act(s,'combustion',t.id);
  assert.equal(s.phase,'action'); assert.equal(s.remainingActions,1);
  assert.equal(s.players.find(x => x.id === t.id).statuses.burn,undefined);
  status(s,active(s),active(s),'poison',4);
  grant(s,'reverse-polarity');
  s=act(s,'reverse-polarity');
  assert.notEqual(s.activeId,p.id);
  assert.equal(s.players.find(x => x.id === p.id).regen,p.regen+4);
});

test('modifiers apply to the indicated compatible slot; temporary defenses and true damage are previewed consistently',() => {
  const s=choose(match()),p=active(s),t=rival(s), a=p.abilities[0];
  t.armor=0;
  const base=previewAction(s,p.id,a.id,t.id).damage;
  grant(s,'amplify');
  assert.equal(previewAction(s,p.id,a.id,t.id).damage,Math.round(base*1.4));
  grant(s,'accelerate'); s.remainingActions=2;
  const after=act(s,a.id,t.id);
  assert.equal(active(after).abilities[0].cooldown,Math.max(1,REWARDS[a.id].cooldown-1));
});

test('lethal survival, elimination healing, threshold shield and alchemist consumable triggers',() => {
  const s=match(), a=s.players[0], t=s.players[1];
  grant(s,'emergency-ward',t); grant(s,'second-breath',t);
  t.hp=20; t.armor=0;
  deal(s,a,t,1,'Needle',{direct:true});
  assert.equal(t.shield,18); assert.deepEqual(t.consumables,['second-breath']);
  deal(s,a,t,9999,'Needle',{direct:true});
  assert.ok(t.alive); assert.equal(t.hp,Math.ceil(t.maxHp/4)); assert.equal(t.consumables.length,0);
  a.hp=20; deal(s,a,t,9999,'Needle',{direct:true});
  assert.equal(t.alive,false); assert.equal(a.hp,20+Math.ceil(a.maxHp*0.1));
  assert.equal(s.log.filter(e => e.type==='revival').length,1);
  const full=match(4), alchemist=full.players[3];
  grant(full,'emergency-ward',alchemist); grant(full,'herbalists-legacy',alchemist);
  alchemist.hp=50; const spell=alchemist.spellPower;
  deal(full,full.players[0],alchemist,1,'Poke',{trueDamage:true});
  assert.ok(alchemist.spellPower>=spell+1);
  assert.ok(full.log.some(e=>e.text.includes('Distillation')));
});

test('chests, capacity and cooldown manipulation use the same primitives as direct grants',() => {
  const s=match(2,{consumableSlots:1}), p=active(s);
  grant(s,'vial-sash');
  grant(s,'red-tonic'); grant(s,'emergency-ward');
  assert.equal(viewMatch(s,p.id).players.find(x=>x.id===p.id).consumableCapacity,2);
  assert.throws(() => grantReward(s,p,'red-tonic'),/replace/);
  grantReward(s,p,'second-breath',1); assert.deepEqual(p.consumables,['red-tonic','second-breath']);
  grant(s,'starfall-cache'); assert.equal(p.rerolls,3);
  assert.equal(s.log.filter(e=>e.type==='stat' && e.text.includes('Starfall Cache /')).length,4);
  grant(s,'quicksilver-lung'); p.abilities[0].cooldown=3;
  status(s,rival(s),p,'poison',2); tickStatus(s,p,'poison');
  assert.equal(p.abilities[0].cooldown,2);
});

test('arena events announce their round, Chaos resolves simultaneous eliminations, and finished matches reject commands',() => {
  let s=match(2,{eventInterval:2,ages:[1,2,3,4]});
  const announced=s.nextEvent;
  assert.equal(announced.round,2);
  s=until(s,s=>s.round===2);
  assert.equal(s.age,'Age of Conflict');
  assert.ok(s.log.some(e=>e.type==='event' && e.text.includes(announced.name)));
  s=until(s,s=>s.round===3 && s.queue.length===0);
  s=choose(s);
  for (const p of s.players) {p.hp=1; p.shield=9999; p.consumables=[];}
  // Silence an independently rolled growth event so this fixture isolates the pulse.
  s.nextEvent.id='temporal-tide';
  s=act(s);
  assert.equal(s.phase,'finished');assert.equal(s.winnerId,null);
  assert.ok(s.players.every(p=>!p.alive));assert.equal(s.log.at(-1).type,'victory');
  assert.throws(()=>botCommand(s));assert.throws(()=>applyCommand(s,'p0',{type:'reroll'}));
});

test('sandbox drives real rules, validates malformed state edits and never mutates input',() => {
  const base=match(), id=base.activeId;
  let s=sandboxEdit(base,{type:'stat',playerId:id,stat:'armor',value:41});
  assert.notEqual(active(base).armor,41);
  s=sandboxEdit(s,{type:'status',playerId:id,status:'poison',value:3});
  s=sandboxEdit(s,{type:'cooldown',playerId:id,abilityId:active(s).abilities[0].id,value:4});
  s=sandboxEdit(s,{type:'event',eventId:'temporal-tide'});
  assert.equal(active(s).abilities[0].cooldown,2);
  s=sandboxEdit(s,{type:'round',value:31}); assert.equal(s.age,'Age of Chaos');
  assert.throws(()=>sandboxEdit(s,{type:'stat',playerId:id,stat:'__proto__',value:3}));
  assert.throws(()=>sandboxEdit(s,{type:'status',playerId:id,status:'constructor',value:1}));
});

test('all seat counts complete headless games without stalls and eliminate or declare a single winner',() => {
  for (let n=2;n<=8;n++) {
    for (const seed of ['embers','veil','rift']) {
      const {state,commands,firstElimination}=simulateMatch({seed,players:seats(n)});
      assert.ok(commands>1 && commands<4000);
      assert.ok(firstElimination<=state.round);
      assert.equal(state.phase,'finished');
      assert.deepEqual(state.players.filter(p=>p.alive).map(p=>p.id),state.winnerId?[state.winnerId]:[]);
      assert.ok(state.players.every(p=>p.hp>=0 && p.hp<=p.maxHp && p.shield>=0));
      assert.ok(state.log.length<=state.config.logLimit);
    }
  }
});
