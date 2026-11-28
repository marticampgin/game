// Compare every lineup under the same starter-pool rules. Paired games reverse
// the seats while retaining the seed to counterbalance order and bot preferences.
import { CLASSES, simulateMatch } from '../src/game/index.js';
import { seedNumber, shuffled } from '../src/game/draft.js';

const [size='2', repetitions='1', prefix='roster'] = process.argv.slice(2);
if (!['2','4','8'].includes(size) || !/^\d+$/.test(repetitions) || +repetitions < 1 || +repetitions > 100) {
  console.error('Usage: node scripts/playtest-roster.js <2|4|8> <repetitions 1–100> <seed prefix>');
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

const stats = Object.fromEntries(roles.map(id => [id,{wins:0,damage:[],turns:[]}]));
const duels = {};
const rounds = [], firstDrops = [];
let draws = 0;
for (const table of lineups(roles,Number(size))) {
  for (let i=0; i<Number(repetitions); i++) {
    const seed = [prefix,...table,i].join('/');
    const order = shuffled({rng:seedNumber(seed)},table);
    for (const seating of [order,[...order].reverse()]) {
      const players = seating.map((classId,j) => ({id:'p' + (j+1),name:CLASSES[classId].name,classId,bot:true}));
      const career = {runId:seed,seats:Object.fromEntries(players.map(p => [p.id,[]]))};
      const {state,firstElimination} = simulateMatch({players,seed,career});
      rounds.push(state.round);
      firstDrops.push(firstElimination ?? state.round);
      if (!state.winnerId) draws++;
      if (Number(size) === 2) {
        const pair = duels[table.join('/')] ??= {[table[0]]:0,[table[1]]:0,draws:0};
        const winner = state.players.find(p => p.id === state.winnerId);
        pair[winner?.classId ?? 'draws']++;
      }
      for (const p of state.players) {
        const group = stats[p.classId];
        if (p.id === state.winnerId) group.wins++;
        group.damage.push(state.career.seats[p.id].metrics.damage);
        group.turns.push(p.personalTurn);
      }
    }
  }
}
const classes = Object.fromEntries(Object.entries(stats).map(([id,s]) => [id,{
  seats:s.damage.length,wins:s.wins,winRatePercent:Number((100*s.wins/s.damage.length).toFixed(1)),
  medianDamage:median(s.damage),medianTurns:median(s.turns)
}]));
console.log(JSON.stringify({seed:prefix,players:+size,matches:rounds.length,draws,medianRounds:median(rounds),
  medianFirstElimination:median(firstDrops),medianSeatDamage:median(Object.values(stats).flatMap(s => s.damage)),classes,
  ...(Number(size) === 2 ? {duels} : {})},null,2));
