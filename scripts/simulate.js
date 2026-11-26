import { CLASSES, simulateMatch } from '../src/game/index.js';

const [matches='20', seats='4', seed='riftbound'] = process.argv.slice(2);
if (![matches,seats].every(v=>/^\d+$/.test(v)) || +matches<1 || +matches>10000 || +seats<2 || +seats>8) {
  console.error('Usage: npm run simulate -- <matches: 1–10000> <seats: 2–8> <seed prefix>');
  process.exit(1);
}
const classes=Object.keys(CLASSES);
const durations=[], firstEliminations=[], wins=Object.fromEntries(classes.map(c=>[c,0]));
let draws=0;
for(let i=0;i<Number(matches);i++){
  const players=Array.from({length:+seats},(_,j)=>({id:'p'+j,name:'Contender '+(j+1),classId:classes[(i+j)%classes.length],bot:true}));
  const result=simulateMatch({seed:seed+'-'+i,players});
  durations.push(result.state.round);firstEliminations.push(result.firstElimination??result.state.round);
  const winner=players.find(p=>p.id===result.state.winnerId);
  if(winner)wins[winner.classId]++;else draws++;
}
function summary(values){
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return {min:sorted[0],median:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,max:sorted.at(-1)};
}
console.log(JSON.stringify({seed,matches:+matches,seats:+seats,rounds:summary(durations),firstElimination:summary(firstEliminations),wins,draws},null,2));
