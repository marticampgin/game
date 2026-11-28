import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createMatch, sandboxEdit, viewMatch, REWARDS } from '../src/game/index.js';
import { deal, grantReward } from '../src/game/combat.js';
import { drawOffers } from '../src/game/draft.js';
import { SHOP, awardLifetimeQuests, buy, credit, equip, newProfile, MASTERY_TARGET, isDraftUnlocked } from '../src/game/progression.js';

const players = [{id:'a',name:'Moss',classId:'guardian'},{id:'b',name:'June',classId:'alchemist'}];
const tracked = (seats={a:[],b:[]}) => createMatch({seed:'ticket',players,career:{runId:'unique-run',seats}});

test('two private objectives for each seat survive reloads and consume no combat randomness', () => {
  const eight = Array.from({length:8},(_,i)=>({...players[i%2],id:'p'+i}));
  const args = {seed:11,players:eight,career:{runId:'one-ticket',seats:Object.fromEntries(eight.map(p=>[p.id,[]]))}};
  const game=createMatch(args), other=createMatch({...args,career:{...args.career,runId:'next-ticket'}});
  assert.deepEqual(game.offers, other.offers);
  assert.equal(game.rng, other.rng);
  const keys=eight.map(p=>viewMatch(game,p.id).career.objectives.map(o=>o.id).sort().join(','));
  assert.equal(new Set(keys).size,8);
  assert.equal(viewMatch(game).career,undefined);
  assert.equal(viewMatch(game,'p0').players.some(p=>'unlocks' in p || 'metrics' in p),false);
  const who=game.activeId;
  const after=applyCommand(JSON.parse(JSON.stringify(game)),who,{type:'pick',rewardId:game.offers[0]});
  assert.equal(viewMatch(after,who).career.metrics.drafts,1);
  const sandbox=sandboxEdit(game,{type:'stat',playerId:who,stat:'armor',value:30});
  assert.equal(viewMatch(sandbox,who).career,undefined);
  assert.equal(viewMatch({...game,careerUnavailable:true},who).career,undefined);
  assert.equal(viewMatch(game,'__proto__').career,undefined);
});

test('career health damage excludes shield, overkill, self damage and environmental damage', () => {
  const state=tracked(), [a,b]=state.players;
  b.hp=10; b.shield=3;
  deal(state,a,b,6,'Hit',{trueDamage:true});
  deal(state,null,b,1,'Terrain',{trueDamage:true});
  deal(state,a,a,8,'Self',{trueDamage:true});
  deal(state,a,b,1000,'Hit',{trueDamage:true});
  assert.equal(viewMatch(state,'a').career.metrics.damage,9);
  assert.equal(viewMatch(state,'b').career.metrics.damage,0);
});

test('iron shard objectives count real shards without treating armor buffs as pickups', () => {
  const state=tracked(), p=state.players[0];
  grantReward(state,p,'iron-shard');
  grantReward(state,p,'stillwater-ring');
  for(let i=0;i<15;i++) grantReward(state,p,'pilgrim-cache');
  assert.ok(viewMatch(state,p.id).career.metrics.ironShards>1);
});

test('locked rewards are absent from all draft slots, and one seat can unlock them independently', () => {
  const gated=SHOP.filter(i=>i.kind==='reward').map(i=>i.rewardId);
  const state=tracked({a:[], b:gated}), seen=new Set();
  state.round=40;
  for(let i=0;i<800;i++){
    assert.ok(drawOffers(state,state.players[0]).every(id=>isDraftUnlocked(id,[])));
    drawOffers(state,state.players[1]).forEach(id=>seen.add(id));
  }
  assert.ok(gated.every(id=>seen.has(id)));
  assert.equal(Object.keys(REWARDS).filter(id=>isDraftUnlocked(id,[])).length,Object.keys(REWARDS).length-gated.length);
});

test('repeated/out-of-order receipts pay once, lifetime and class awards grant once and purchases are atomic', () => {
  const profile=newProfile(), receipt={}, state=tracked();
  const a=state.players[0]; a.personalTurn=1;
  const older=structuredClone(state);
  state.career.seats.a.metrics.damage=100000;
  state.career.seats.a.metrics.defends=8;
  state.phase='finished'; state.winnerId='a';
  assert.ok(credit(profile,receipt,state,'a'));
  const exact=structuredClone(profile);
  assert.equal(credit(profile,receipt,state,'a'),false);
  assert.equal(credit(profile,receipt,older,'a'),false);
  assert.deepEqual(profile,exact);
  assert.ok(profile.claimed.includes('century'));
  assert.throws(()=>equip(profile,'guardian','harbor-warden'));
  const purchase=SHOP.find(i=>i.id==='harbor-warden');
  const before=profile.coins;
  assert.ok(buy(profile,purchase.id)); assert.equal(buy(profile,purchase.id),false);
  assert.equal(profile.coins,before-purchase.price);
  equip(profile,'guardian','harbor-warden');
  assert.equal(profile.equipped.guardian,'harbor-warden');
  state.career.seats.a.metrics.damage=0;
  for(let i=1;i<MASTERY_TARGET;i++) credit(profile,{},state,'a');
  assert.equal(profile.classes.guardian.matches,MASTERY_TARGET);
  assert.ok(profile.unlocks.includes('sunspire-paladin'));
  assert.equal(profile.unlocks.includes('glass-oracle'),false);
  const fresh=newProfile(); assert.throws(()=>buy(fresh,'echo-rune'),/more coins/);
  assert.deepEqual(fresh,newProfile());
});

test('end-of-match settlement includes lifetime coins earned earlier in the same match and a new mastery outfit', () => {
  const p=newProfile(), receipt={}, game=tracked();
  p.classes.guardian={matches:MASTERY_TARGET-1,damage:995,wins:0};
  p.totals={...p.classes.guardian};
  p.claimed=['first-steps'];
  game.players[0].personalTurn=1;
  game.career.seats.a.metrics.damage=7;
  credit(p,receipt,game,'a');
  assert.equal(p.lastSettlement,undefined);
  assert.equal(receipt.lifetimeCoins,75);
  game.phase='finished';
  credit(p,receipt,game,'a');
  assert.deepEqual(p.lastSettlement,{runId:'unique-run',classId:'guardian',lifetimeCoins:75,objectiveCoins:0,masterySkinId:'sunspire-paladin'});
});

test('a veteran profile crosses the recalibrated milestone once and keeps any old award', () => {
  const profile = newProfile();
  profile.totals.damage = 11999;
  profile.claimed.push('blood-and-iron');
  assert.equal(awardLifetimeQuests(profile),0);
  profile.totals.damage++;
  assert.equal(awardLifetimeQuests(profile),140);
  assert.equal(awardLifetimeQuests(profile),0);
  profile.coins = 1000;
  assert.equal(awardLifetimeQuests(profile),0);
  assert.equal(profile.coins,1000);
});
