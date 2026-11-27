import { statusCue } from './status-effects.js';

const visibleTypes = new Set(['damage', 'shield', 'heal', 'revival', 'elimination', 'status']);
const setupChanges = new Set(['thawed', 'consumed', 'cleansed', 'discharged', 'decayed']);
const vital = event => event.type === 'revival' || event.type === 'elimination';
const maxBeats = 8;

export function directOutcome(event, recap) {
  return event.targetId === recap.targetId && event.timing !== 'turn' && event.timing !== 'round' &&
    (!event.actorId || event.actorId === recap.actorId);
}

function sameTick(a, b) {
  return a.type === 'damage' && b.type === 'damage' && a.cause === b.cause && !!statusCue(a) &&
    a.targetId === b.targetId && a.timing === b.timing && a.turnOwnerId === b.turnOwnerId;
}

function sameRoundApplication(a, b) {
  return a.timing === 'round' && b.timing === 'round' && a.type === 'status' && b.type === 'status' &&
    a.statusChange === 'applied' && b.statusChange === a.statusChange && !!statusCue(a) &&
    a.cause === b.cause && a.round === b.round && a.amount === b.amount &&
    (a.actorId === b.actorId || (a.actorId === a.targetId && b.actorId === b.targetId));
}

function beatFor(events) {
  const first = events[0];
  if (events.length === 1) return { events, event: first };
  if (!events.every(event => sameTick(first, event))) return { events, event: null };
  const sources = [...new Set(events.map(e => e.actorId).filter(Boolean))];
  const event = { ...events.at(-1), actorId: sources.length === 1 ? sources[0] : undefined, statusSources: sources };
  for (const field of ['amount', 'healthDamage', 'shieldDamage']) {
    event[field] = events.reduce((total, e) => total + (e[field] ?? 0), 0);
  }
  event.shieldBroken = events.some(e => e.shieldBroken);
  return { events, event };
}

function orderedBeats(events, primary) {
  const groups = [];
  for (const event of events) {
    const last = groups.at(-1);
    const joins = last && (sameTick(last[0], event) ||
      (sameRoundApplication(last[0], event) && !last.some(e => e.targetId === event.targetId)));
    if (joins && event !== primary && !last.includes(primary)) last.push(event);
    else groups.push([event]);
  }
  // For an exceptional cascade, combine adjacent minor results first. Never
  // move an event across contact. Each group keeps every original HP/stack update.
  while (groups.length > maxBeats) {
    let best = -1, bestCost = Infinity;
    for (let i = 1; i < groups.length; i++) {
      const left = groups[i - 1], right = groups[i];
      if (left.includes(primary) || right.includes(primary)) continue;
      const a = left.at(-1), b = right[0];
      const cost = left.length + right.length + (a.targetId === b.targetId ? 0 : 8) +
        (a.timing === b.timing && a.turnOwnerId === b.turnOwnerId ? 0 : 24) +
        (left.some(vital) || right.some(vital) ? 80 : 0);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    groups[best - 1].push(...groups[best]);
    groups.splice(best, 1);
  }
  return groups.map(beatFor);
}

const hasStatus = beat => beat.events.some(e => statusCue(e));

// Collecting Scavenge loot extends the original recap without spending a second
// action. Its new turn-start events must play once, after the loot is taken.
export function bonusDraftContinuation(before, after) {
  const previous = before?.lastAction, next = after.lastAction;
  if (!before?.bonusDraft || !previous || next?.actionId !== 'scavenge' || previous.id !== next.id)
    return null;
  const through = previous.events.at(-1)?.id ?? -1;
  const events = next.events.filter(event => event.id > through);
  return events.some(event => event.targetId && visibleTypes.has(event.type)) ? { ...next, events } : null;
}

export function combatTiming(recap, lead, reduced, effectsOnly = false) {
  const all = (recap.events ?? []).filter(e => e.targetId && visibleTypes.has(e.type));
  const direct = all.filter(e => directOutcome(e, recap) && !(e.type === 'damage' && statusCue(e)) &&
    !setupChanges.has(e.statusChange));
  const primary = effectsOnly ? undefined : recap.actionId === 'interrupted' ? all[0] : direct[0];
  const beats = orderedBeats(all, primary);
  const primaryIndex = beats.findIndex(b => primary && b.event === primary);
  const boundary = beats.findIndex(b => b.events.some(e => e.timing === 'turn' || e.timing === 'round'));
  const before = effectsOnly ? 0 : primaryIndex >= 0 ? primaryIndex : boundary < 0 ? beats.length : boundary;
  function interval(a, b) {
    if ((a && !a.event) || (b && !b.event)) return 790;
    if ((a && hasStatus(a)) || (b && hasStatus(b))) return reduced ? 610 : 680;
    return reduced ? 70 : 260;
  }
  let previousTime = 0, next = beats[primaryIndex];
  for (let i = before - 1; i >= 0; i--) {
    previousTime -= interval(beats[i], next);
    beats[i].time = previousTime;
    next = beats[i];
  }
  const contact = effectsOnly ? 0 : Math.max(lead, -previousTime + (reduced ? 12 : 35));
  let time = 0;
  for (let i = before; i < beats.length; i++) {
    if (i !== primaryIndex && !(effectsOnly && i === 0)) time += interval(i > before ? beats[i - 1] : beats[primaryIndex], beats[i]);
    beats[i].time = time;
  }
  for (const beat of beats) beat.time += contact;
  const last = Math.max(contact, beats.at(-1)?.time ?? 0);
  const tail = beats.length && (!beats.at(-1).event || hasStatus(beats.at(-1))) ? 740 : reduced ? 275 : 555;
  return { primary, beats, contact, windup: contact - lead, last, tail };
}
