// Compare every lineup under the same starter-pool rules. Paired games reverse
// the seats while retaining the seed to counterbalance order and bot preferences.
import { botCommand, CLASSES, getActions, previewAction, simulateMatch, viewMatch } from '../src/game/index.js';
import { seedNumber, shuffled } from '../src/game/draft.js';
import { careerView, MATCH_QUESTS } from '../src/game/progression.js';

const [size='2', repetitions='1', prefix='roster', focus, policy='normal'] = process.argv.slice(2);
if (!['2','4','8'].includes(size) || !/^\d+$/.test(repetitions) || +repetitions < 1 || +repetitions > 100 ||
    (focus !== undefined && !Object.hasOwn(CLASSES,focus)) || !['normal','iron','armor','counter'].includes(policy) ||
    (policy !== 'normal' && focus !== 'guardian')) {
  console.error('Usage: node scripts/playtest-roster.js <2|4|8> <repetitions 1–100> <seed prefix> [class ID] [normal|iron|armor|counter]');
  process.exit(1);
}
const roles = Object.keys(CLASSES);
function lineups(remaining, needed) {
  if (!needed) return [[]];
  return remaining.flatMap((role,i) =>
    lineups(remaining.slice(i+1),needed-1).map(others => [role,...others]));
}
function median(values) {
  const sorted = [...values].sort((a,b) => a-b);
  return (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.floor(sorted.length/2)]) / 2;
}

const percent = value => Number((100*value).toFixed(1));
function pairedInterval(pairs) {
  if (!pairs.length) return null;
  const mean = pairs.reduce((sum,p) => sum+p,0)/pairs.length;
  // One seed contributes at most one independent observation. Treat its
  // two reversed seats as a pair even at zero wins or a clean sweep.
  const adjustment = 1.96**2 / pairs.length;
  const center = (mean + adjustment/2) / (1+adjustment);
  const margin = Math.sqrt(adjustment*(mean*(1-mean)+adjustment/4)) / (1+adjustment);
  return [percent(Math.max(0,center-margin)),percent(Math.min(1,center+margin))];
}

// Reproduce the reported armor-stacking playstyle through legal public
// commands. All rivals and all unspecified choices retain the normal policy.
const armorPicks = ['accelerate','molten-mail','amplify','stillwater-ring','iron-shard','fortress-oath','golden-shell'];
const ironPicks = ['iron-shard','stillwater-ring','fortress-oath'];
// In the counter test, both sides make a coherent build. The challenger
// prioritizes persistent Poison unless the Guardian publicly equips a cleanse.
function counterArmor(view,p,ordinary) {
  const target=view.players.find(other=>other.alive && other.classId==='guardian');
  if (!target) return ordinary;
  const poisonSafe=!target.abilities.some(a=>a.id==='reverse-polarity');
  const counters=[...(poisonSafe ? ['venom-flask'] : []),'grave-bell','hollow-needle'];
  if (view.phase==='acquire') {
    const priority=[...counters,'phoenix-heart','menders-bell','spring-seed','fang-shard','astral-shard'];
    const rewardId=priority.find(id=>view.offers.includes(id));
    if (rewardId) {
      const replaceIndex=Math.max(0,p.abilities.findIndex(a=>!counters.includes(a.id)));
      return {type:'pick',rewardId,replaceIndex};
    }
    if (p.rerolls) return {type:'reroll'};
  } else {
    const ready=getActions(view,p.id).filter(a=>!a.disabled);
    const answer=counters.find(id=>ready.some(a=>a.id===id));
    if (answer) return {type:'act',actionId:answer,targetId:target.id};
  }
  return ordinary;
}
function armorFirst(state) {
  const ordinary = botCommand(state);
  const view=viewMatch(state,state.activeId);
  const actor=view.players.find(p=>p.id===view.activeId);
  if (actor.classId !== 'guardian') return policy==='counter' ? counterArmor(view,actor,ordinary) : ordinary;
  if (view.phase === 'acquire') {
    const rewardId=(policy === 'iron' ? ironPicks : armorPicks).find(id=>view.offers.includes(id));
    if (rewardId) return {type:'pick',rewardId,replaceIndex:0};
    if (actor.rerolls) return {type:'reroll'};
    return ordinary;
  }
  const bash=getActions(view,actor.id).find(a=>a.id==='bastion-bash');
  if (bash && !bash.disabled) {
    const targets=view.players.filter(p=>p.alive && p.id!==actor.id).map(p=>({
      id:p.id, healthFraction:previewAction(view,actor.id,bash.id,p.id).healthDamage/p.hp
    })).sort((a,b)=>b.healthFraction-a.healthFraction);
    return {type:'act',actionId:bash.id,targetId:targets[0].id};
  }
  if (actor.artifacts.includes('stillwater-ring') || actor.artifacts.includes('fortress-oath'))
    return {type:'act',actionId:'defend',targetId:actor.id};
  return ordinary;
}
const stats = Object.fromEntries(roles.map(id => [id,{wins:0,damage:[],turns:[],armor:[],pairs:[],coins:[]}]));
const objectives=Object.fromEntries(MATCH_QUESTS.map(q=>[q.id,{assigned:0,completed:0}]));
const duels = {};
const rounds = [], firstDrops = [];
let draws = 0;
for (const table of lineups(roles,Number(size))) {
  if (focus && !table.includes(focus)) continue;
  for (let i=0; i<Number(repetitions); i++) {
    const seed = [prefix,...table,i].join('/');
    const order = shuffled({rng:seedNumber(seed)},table);
    const winners=[];
    for (const seating of [order,[...order].reverse()]) {
      const players = seating.map((classId,j) => ({id:'p' + (j+1),name:CLASSES[classId].name,classId,bot:true}));
      const career = {runId:seed,seats:Object.fromEntries(players.map(p => [p.id,[]]))};
      const {state,firstElimination} = simulateMatch({players,seed,career},20000,policy==='normal' ? botCommand : armorFirst);
      rounds.push(state.round);
      firstDrops.push(firstElimination ?? state.round);
      const winner = state.players.find(p => p.id === state.winnerId)?.classId ?? 'draws';
      winners.push(winner);
      if (winner === 'draws') draws++;
      if (Number(size) === 2) {
        const pair = duels[table.join('/')] ??= {[table[0]]:0,[table[1]]:0,draws:0};
        pair[winner]++;
      }
      for (const p of state.players) {
        const group = stats[p.classId];
        if (p.id === state.winnerId) group.wins++;
        const career=careerView(state,p.id);
        group.damage.push(career.metrics.damage);
        group.coins.push(career.earnedCoins);
        for (const quest of career.objectives) {
          objectives[quest.id].assigned++;
          if (quest.complete) objectives[quest.id].completed++;
        }
        group.turns.push(p.personalTurn);
        group.armor.push(p.armor);
      }
    }
    for (const role of table) stats[role].pairs.push(winners.filter(win=>win===role).length/2);
  }
}
const classes = Object.fromEntries(Object.entries(stats).map(([id,s]) => [id,{
  seats:s.damage.length,wins:s.wins,winRatePercent:percent(s.wins/s.damage.length),pairedWinRate95:pairedInterval(s.pairs),
  medianDamage:median(s.damage),medianTurns:median(s.turns),medianArmor:median(s.armor),medianObjectiveCoins:median(s.coins)
}]));
const coins=Object.values(stats).flatMap(s=>s.coins);
console.log(JSON.stringify({seed:prefix,policy,...(focus ? {focus} : {}),players:+size,matches:rounds.length,draws,medianRounds:median(rounds),
  medianFirstElimination:median(firstDrops),medianSeatDamage:median(Object.values(stats).flatMap(s => s.damage)),classes,objectives,
  medianObjectiveCoins:median(coins),seatsWithoutObjectiveCoins:coins.filter(n=>!n).length,
  ...(Number(size) === 2 ? {duels} : {})},null,2));
