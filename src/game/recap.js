// Keep a complete circuit of an eight-seat table between ordinary turns.
const historyLimit = 8;
const eventLimit = 32;
const recording = new WeakMap();
const outcomes = new Set(['action','damage','heal','shield','stat','status','synergy','elimination','revival','event','reward','victory','timing','cooldown']);

// A visual cause describes an already public effect. Item IDs and hidden triggers never pass this boundary.
const publicCauses = new Set(['poison','burn','bleed','doom','chill','freeze','shock','curse','echo','arena-fire','retaliation']);

export function publicEvent(event) {
  const {id,round,type,text} = event;
  const result = {id,round,type,text};
  if ((type === 'damage' || type === 'status') && publicCauses.has(event.cause)) result.cause = event.cause;
  for (const key of ['actorId','targetId','amount','shieldDamage','healthDamage','shieldBroken']) {
    if (event[key] !== undefined) result[key] = event[key];
  }
  return result;
}

export function beginRecap(state,actor,action,target) {
  // Old version-one saves start collecting on their next action. Do not guess
  // which past messages represented a command by parsing localized player text.
  state.recentActions ??= [];
  state.recentActions.push({
    id:state.globalAction,round:state.round,globalTurn:state.globalTurn,actorTurn:actor.personalTurn,
    actorId:actor.id,actorName:actor.name,actionId:action.id,actionName:action.name,
    targetId:target.id,targetName:target.name,events:[],omitted:0,next:null
  });
  if (state.recentActions.length > historyLimit) state.recentActions.shift();
  resumeRecap(state);
}

export function resumeRecap(state) {
  const recap = state.recentActions?.at(-1);
  if (recap) recording.set(state,{recap,timing:'action'});
}

export function markBoundary(state,timing,ownerId) {
  const current = recording.get(state);
  if (current) {
    current.timing = timing;
    current.turnOwnerId = ownerId;
  }
}

export function captureOutcome(state,event) {
  const current = recording.get(state);
  if (!current || !outcomes.has(event.type)) return;
  const {recap,timing,turnOwnerId} = current;
  const row = {...publicEvent(event),timing};
  if (turnOwnerId !== undefined) row.turnOwnerId = turnOwnerId;
  // Keep both ends of exceptionally long chains, even when the general log
  // wraps. Consumers can mark the single gap after the first half.
  if (recap.events.length === eventLimit) {
    recap.events.splice(eventLimit / 2,1);
    recap.omitted++;
  }
  recap.events.push(row);
}

export function finishRecap(state) {
  const current = recording.get(state);
  if (!current) return;
  const {activeId,phase,remainingActions,round,globalTurn,bonusDraft,winnerId} = state;
  current.recap.next = {activeId,phase,remainingActions,round,globalTurn,bonusDraft,winnerId};
  recording.delete(state);
}

export function publicRecap(recap) {
  const {id,round,globalTurn,actorTurn,actorId,actorName,actionId,actionName,targetId,targetName,omitted} = recap;
  const {activeId,phase,remainingActions,bonusDraft,winnerId} = recap.next;
  return {
    id,round,globalTurn,actorTurn,actorId,actorName,actionId,actionName,targetId,targetName,omitted,
    events:recap.events.map(event => ({
      ...publicEvent(event),timing:event.timing,
      ...(event.turnOwnerId !== undefined ? {turnOwnerId:event.turnOwnerId} : {})
    })),
    next:{activeId,phase,remainingActions,round:recap.next.round,globalTurn:recap.next.globalTurn,bonusDraft,winnerId}
  };
}
