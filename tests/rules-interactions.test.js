import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommand, botCommand, createMatch, eligible, getActions, REWARDS, replayMatch, resonance, sandboxEdit, viewMatch } from '../src/game/index.js';
import { deal, executeEffects, grantReward } from '../src/game/combat.js';
import { drawOffers } from '../src/game/draft.js';

const players = ['guardian','alchemist','chronomancer'].map((classId,i) => ({id:'p'+i,name:classId,classId}));
const options = {seed:'persistence',players};
const draft = s => applyCommand(s,s.activeId,{type:'pick',rewardId:s.offers[0],replaceIndex:0});
const act = (s,id='defend',targetId) => applyCommand(s,s.activeId,{type:'act',actionId:id,targetId});
const actor = s => s.players.find(p=>p.id===s.activeId);
const opponent = s => s.players.find(p=>p.id!==s.activeId && p.alive);

test('sampled seeded drafts increase class and interaction frequencies while preserving unrelated discoveries',() => {
  function distribution(tier,score,settings) {
    const rarityCurve = [[1,...Array.from({length:5},(_,i)=>Number(i===tier))]];
    const state = createMatch({...options,config:{rarityCurve,adaptiveSlots:0,favoredChance:0,exclusiveChance:0,...settings}});
    const p = state.players[0];
    const seen = new Set();
    let total = 0;
    for (let i=0;i<300;i++) {
      for (const id of drawOffers(state,p)) {
        seen.add(id);
        total += score(p,REWARDS[id]);
      }
    }
    return {total,seen};
  }
  const base = distribution(2,resonance,{});
  const linked = distribution(2,resonance,{adaptiveSlots:3,resonanceWeight:5});
  assert.ok(linked.total > base.total*1.65);
  assert.deepEqual(linked.seen,base.seen);
  const iron = (_,r) => Number(r.id==='iron-shard');
  const plain = distribution(0,iron,{});
  const favored = distribution(0,iron,{favoredChance:0.6});
  assert.ok(favored.total>plain.total*1.7);
  assert.deepEqual(favored.seen,plain.seen);
});

test('an exhausted exclusive or rarity pool falls back to three different eligible rewards',() => {
  const s=createMatch({...options,config:{rarityCurve:[[1,0,0,0,1,0]],exclusiveChance:1,favoredChance:0}});
  const p=s.players[0];
  grantReward(s,p,'fortress-oath');
  const noExclusive=drawOffers(s,p);
  assert.ok(noExclusive.every(id=>REWARDS[id].rarity==='epic' && !REWARDS[id].exclusive));
  for (const r of Object.values(REWARDS)) {
    if (r.rarity==='epic' && eligible(p,r)) grantReward(s,p,r.id);
  }
  const otherTiers=drawOffers(s,p);
  assert.equal(new Set(otherTiers).size,3);
  assert.ok(otherTiers.every(id=>REWARDS[id].rarity!=='epic' && eligible(p,REWARDS[id])));
});

test('JSON checkpoint and action transcript recreate the exact terminal state including arena effects',() => {
  const original = {...options,config:{ages:[1,2,3,4],chaosBase:20,chaosStep:20}};
  let live=createMatch(original), checkpoint, resume;
  const commands=[];
  while (live.phase!=='finished') {
    const command=botCommand(live);
    commands.push(command);
    live=applyCommand(live,live.activeId,command);
    if (live.round===4 && !checkpoint) {
      checkpoint=JSON.stringify(live);
      resume=JSON.parse(checkpoint);
    } else if (resume) resume=applyCommand(resume,resume.activeId,command);
  }
  assert.ok(checkpoint);
  assert.deepEqual(resume,live);
  assert.deepEqual(replayMatch(original,commands),live);
  assert.throws(()=>replayMatch({players},commands),/seed/);
});

test('private build data and internal event bookkeeping stay outside spectator, player and postgame views',() => {
  const s=createMatch(options), p=actor(s);
  p.hiddenForecast='secret forecast'; p.abilities[0].debugRoll='secret roll';
  s.delayed.push({source:p.id,target:opponent(s).id,raw:20,due:99,label:'secret future'});
  s.log.at(-1).debugRoll='secret trace';
  p.usedBorrowedTime=true; p.extraTurnRound=17;
  grantReward(s,p,'second-breath');
  for (const viewer of [null,p.id,opponent(s).id]) {
    const v=viewMatch(s,viewer), wire=JSON.stringify(v), seat=v.players.find(q=>q.id===p.id);
    assert.doesNotMatch(wire,/secret (forecast|roll|future|trace)/);
    assert.ok(!('sources' in seat) && !('usedBorrowedTime' in seat));
    assert.equal('consumables' in seat,viewer===p.id);
    assert.equal('extraTurnRound' in seat,viewer===p.id);
  }
  s.phase='finished'; s.winnerId=p.id;s.activeId=null;s.offers=[];
  const ended=viewMatch(s,null);
  assert.deepEqual(ended.upcoming,[]);
  assert.doesNotMatch(JSON.stringify(ended),/second-breath|secret forecast/);
});

test('a lethal hit can reveal Second Breath then Emergency Ward before retaliation resolves',() => {
  const s=createMatch(options), a=s.players[0];
  // Choose a non-Alchemist target so that random shard procs do not affect the numbers under test.
  const target=s.players[2];
  grantReward(s,target,'second-breath');grantReward(s,target,'emergency-ward');grantReward(s,target,'briar-crown');
  const original=a.hp;
  deal(s,a,target,9999,'Strike',{trueDamage:true,direct:true});
  assert.ok(target.alive);
  assert.equal(target.hp,Math.ceil(target.maxHp/4));
  assert.equal(target.shield,18);
  assert.deepEqual(target.consumables,[]);
  assert.equal(a.hp,original-3);
  const sequence=s.log.filter(e=>e.type==='revival' || e.text.includes('revealed Emergency Ward') || e.text.includes('triggered Briar Crown'));
  assert.equal(sequence[0].type,'revival');
  assert.match(sequence[1].text,/revealed Emergency Ward/);
  assert.match(sequence[2].text,/triggered Briar Crown/);
});

test('Bleed or retaliation can eliminate an actor with actions remaining without granting a dead seat another phase',() => {
  for (const cause of ['bleed','retaliation']) {
    const s=draft(createMatch(options)), p=actor(s),t=opponent(s);
    p.hp=1; p.shield=0;p.armor=0;s.remainingActions=2;
    if (cause==='bleed') executeEffects(s,t,p,[{kind:'status',key:'bleed',amount:3}],{label:'Bleed setup'});
    else grantReward(s,t,'briar-crown');
    const result=act(s,'attack',t.id);
    assert.equal(result.players.find(other=>other.id===p.id).alive,false);
    assert.notEqual(result.activeId,p.id);
    assert.equal(result.phase,'acquire');
    assert.ok(!viewMatch(result,null).upcoming.includes(p.id));
    assert.equal(result.log.some(e=>e.type==='damage' && e.text.startsWith('Basic Attack')),cause==='retaliation');
    assert.equal(result.log.filter(e=>e.type==='elimination').length,1);
  }
});

test('scavenging with two actions grants only its bonus draft; an extra full turn at the end of the queue stays in the same round',() => {
  let s=draft(createMatch(options)), id=s.activeId, global=s.globalTurn;
  s.remainingActions=2;
  s=act(s,'scavenge'); assert.ok(s.bonusDraft);
  s=draft(s); assert.equal(s.phase,'action');assert.equal(s.activeId,id);
  assert.equal(s.remainingActions,1);assert.equal(s.globalTurn,global);
  assert.deepEqual(s.offers,[]);assert.equal(s.bonusDraft,false);
  s=act(s);
  while (s.queue.length) s=act(draft(s));
  s=draft(s);
  id=s.activeId; global=s.globalTurn;
  grantReward(s,actor(s),'pocket-eclipse');
  s=act(s,'pocket-eclipse');
  assert.equal(s.round,1);assert.equal(s.activeId,id);assert.equal(s.globalTurn,global+1);
  assert.equal(s.phase,'acquire');assert.equal(s.offers.length,3);
  s=act(draft(s)); assert.equal(s.round,2);assert.equal(s.activeId,s.order[0]);
});

test('all scheduled echoes at a global boundary settle before declaring the sole survivor',() => {
  const s=draft(createMatch(options)), [a,b,c]=s.players;
  for (const [source,target] of [[a,b],[b,a]]) s.delayed.push({source:source.id,target:target.id,raw:9999,due:s.globalTurn+1,label:'Echo',trueDamage:true});
  const end=act(s);
  assert.equal(end.winnerId,c.id);
  assert.equal(end.phase,'finished');
  assert.deepEqual(end.log.filter(e=>e.type==='elimination').map(e=>e.targetId),[b.id,a.id]);
  assert.equal(end.log.filter(e=>e.type==='victory').length,1);
});

test('ordinary sandbox changes preserve an existing draft; granting a selected unique reward repairs the draft',() => {
  const s=createMatch(options);
  const adjusted=sandboxEdit(s,{type:'stat',playerId:s.activeId,stat:'armor',value:40});
  assert.deepEqual(adjusted.offers,s.offers);assert.equal(adjusted.rng,s.rng);
  adjusted.offers[1]='molten-mail';
  const granted=sandboxEdit(adjusted,{type:'grant',playerId:s.activeId,rewardId:'molten-mail'});
  assert.ok(!granted.offers.includes('molten-mail'));
  assert.equal(granted.offers.length,3);
  const frozen=sandboxEdit(granted,{type:'status',playerId:s.activeId,status:'freeze',value:6});
  assert.equal(actor(frozen).statuses.freeze,1);
  const next=draft(frozen);
  assert.deepEqual(getActions(next,next.activeId).filter(a=>!a.disabled).map(a=>a.id),['defend','scavenge']);
});
