import { publicEvent } from './recap.js';

// A real elimination is permanent. A lethal reaction is a survival, so a seat
// can have many of those. Keep its first and latest along with the count.
function remember(history, event, sharedFall) {
  if (event.type === 'elimination') {
    const row = publicEvent(event);
    if (sharedFall) row.sharedFall = true;
    history.eliminations.push(row);
  } else if (event.type === 'revival') {
    const row = publicEvent(event);
    const prior = history.revivals.find(item => item.first.targetId === row.targetId);
    if (prior) { prior.count++; prior.last = row; }
    else history.revivals.push({count:1,first:row});
  }
}

function recover(log) {
  const history = {complete:!log.length || log[0].id === 1,eliminations:[],revivals:[]};
  const lastHit = new Map();
  for (const event of log) {
    if (event.type === 'damage') lastHit.set(event.targetId,event);
    const hit = lastHit.get(event.targetId);
    // Legacy events already expose arena fire as a structured damage cause.
    // An old save lacking the start of this death cannot establish its rank.
    remember(history,event,event.sharedFall || (hit && hit.round === event.round && hit.cause === 'arena-fire'));
    if (event.type === 'elimination' && !history.complete && !hit) history.eliminations.at(-1).unknownPlace = true;
  }
  return history;
}

export function retainMatchEvent(state, event) {
  if (!state.players) return; // An isolated support forecast has no match history.
  if (state.matchMilestones) remember(state.matchMilestones,event,event.sharedFall);
  else state.matchMilestones = recover(state.log);
}

export function matchMilestones(state) {
  const history = state.matchMilestones ?? recover(state.log);
  const eliminations = history.eliminations.map(event => publicEvent(event));
  let placed = state.players.filter(player => player.alive).length;
  for (let end = eliminations.length; end > 0;) {
    let start = end - 1;
    const last = history.eliminations[start];
    while (last.sharedFall && start > 0 && history.eliminations[start - 1].sharedFall &&
      history.eliminations[start - 1].round === last.round) start--;
    for (let i = start; i < end; i++) {
      if (!history.eliminations[i].unknownPlace) eliminations[i].place = placed + 1;
      if (end - start > 1) eliminations[i].tied = true;
    }
    placed += end - start;
    end = start;
  }
  return {complete:history.complete,eliminations,revivals:history.revivals.map(item => ({
    count:item.count,first:publicEvent(item.first),...(item.last ? {last:publicEvent(item.last)} : {}),
  }))};
}
