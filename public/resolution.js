import { actionIcon, esc, glyph, rewardIcon } from './art.js';

const eventIcons = {
  damage: 'sword', heal: 'heart', shield: 'shield', revival: 'feather', elimination: 'skull',
  victory: 'crown', synergy: 'ring', reward: 'chest', status: 'flask', stat: 'crystal',
  event: 'bolt', action: 'rune', cooldown: 'clock', timing: 'clock',
};

function route(action) {
  const target = action.targetId === action.actorId ? 'self' : action.targetName;
  return '<span class="recap-route"><span>' + esc(action.actorName) + '</span>' +
    (target ? glyph('right') + '<span>' + esc(target) + '</span>' : '') + '</span>';
}

function moveSentence(action) {
  const target = action.actorId !== action.targetId ? ' on <span>' + esc(action.targetName) + '</span>' : '';
  return '<span class="recap-route"><span>' + esc(action.actorName) + '</span> used <strong>' +
    esc(action.actionName) + '</strong>' + target + '.</span>';
}

function withNumbers(text) {
  return String(text).split(/(\d+(?:\.\d+)?%?)/g)
    .map((piece, i) => i % 2 ? '<b>' + piece + '</b>' : esc(piece)).join('');
}

function resultLine(action) {
  const direct = action.events.filter(e => e.timing === 'action');
  const hit = direct.find(e => e.type === 'damage' && e.targetId === action.targetId);
  const major = direct.findLast(e => e.type === 'elimination' || e.type === 'revival');
  if (!hit) return withNumbers((major || direct[0] || action.events[0])?.text || 'Action complete.');
  const parts = [];
  if (hit.healthDamage > 0) parts.push(hit.healthDamage + ' health lost');
  if (hit.shieldDamage > 0) parts.push(hit.shieldDamage + ' absorbed by shield');
  if (!parts.length) parts.push('0 damage');
  if (major) {
    const revivedTarget = major.type === 'revival' && major.targetId === action.targetId;
    parts.push(revivedTarget ? 'Revived at ' + major.amount + ' HP' : major.text);
  }
  return withNumbers(parts.join(' · '));
}

function handoff(view, after, action, viewerId, historical = false) {
  const find = id => view.players.find(p => p.id === id);
  const own = after.activeId === viewerId;
  if (after.phase === 'finished') {
    const winner = find(after.winnerId);
    return ['Match complete', winner ? (winner.id === viewerId ? 'You won' : winner.name + ' won') : 'Draw'];
  }
  const actor = find(after.activeId);
  if (!actor) return ['Turn order', 'Awaiting next turn'];
  const repeat = after.activeId === action.actorId;
  const extraAction = repeat && after.phase === 'action' && after.globalTurn === action.globalTurn;
  const extraTurn = repeat && after.globalTurn > action.globalTurn;
  const choosing = after.phase === 'acquire';
  const spectator = !historical && !find(viewerId)?.alive;
  let phase;
  if (after.bonusDraft && choosing) phase = own ? 'Choose bonus loot' : 'Choosing bonus loot';
  else if (choosing) phase = own ? 'Choose a reward' : 'Choosing a reward';
  else phase = own ? 'Choose an action' : 'Choosing an action';
  if (after.remainingActions > 1 && !choosing) phase += ' · ' + after.remainingActions + ' left';
  const turn = extraAction ? 'extra action' : extraTurn ? 'extra turn' : 'turn';
  const owner = own ? 'Your ' + turn : actor.name + '’s ' + turn;
  return [owner, spectator ? 'Spectating · ' + phase : phase];
}

function handoffHTML(parts, historical = false) {
  return '<div class="recap-handoff' + (historical ? ' was' : '') + '">' + rewardIcon({icon:'clock'}) + '<span>' +
    (historical ? 'Then' : 'Now') + '</span><div><strong>' + esc(parts[0]) + '</strong><small>' +
    esc(parts[1]) + '</small></div></div>';
}

function timingLabel(e, view) {
  if (e.timing === 'round') return 'Round ' + e.round + ' begins';
  if (e.timing === 'turn') {
    const owner = view.players.find(p => p.id === e.turnOwnerId);
    return owner ? 'Start of ' + owner.name + '’s turn' : 'Turn start';
  }
  return '';
}

/** Only projected log fields are accepted here; unidentified effects keep their public text. */
export function effectTextHTML(event, view, actingId) {
  const details = [];
  if (event.type === 'damage') {
    const excess = event.amount - event.healthDamage - event.shieldDamage;
    if (event.shieldBroken) details.push('Shield broken');
    if (event.shieldDamage || excess > 0) details.push(event.healthDamage + ' health lost');
    if (excess > 0) details.push(excess + ' overkill');
  }
  if (event.actorId && event.actorId !== actingId && ['damage','status'].includes(event.type)) {
    const source = view.players.find(p => p.id === event.actorId);
    if (source) details.push('Source ' + source.name);
  }
  return withNumbers(event.text) + (details.length ? '<small class="recap-split">' +
    withNumbers(details.join(' · ')) + '</small>' : '');
}

function effectList(action, view) {
  if (!action.events.length) return '<p class="recap-empty">' +
    (action.actionId === 'scavenge' ? 'The bonus draft follows this action.' : 'This action had no additional effects.') + '</p>';
  let previousTiming = '';
  let rows = '';
  action.events.forEach((e, i) => {
    const timing = timingLabel(e, view);
    if (action.omitted && i === 16) {
      rows += '<li class="recap-gap">' + esc(action.omitted) + ' intervening effects omitted</li>';
      previousTiming = '';
    }
    const step = 1 + i + (i >= 16 ? action.omitted || 0 : 0);
    const icon = eventIcons[e.type] || 'rune';
    rows += '<li class="recap-event" data-event-type="' + esc(e.type) + '" value="' + step + '">' +
      (timing && timing !== previousTiming ? '<small class="recap-timing">' + esc(timing) + '</small>' : '') +
      '<div><span class="recap-step" aria-hidden="true">' + step + '</span>' + rewardIcon({icon}) +
      '<span>' + effectTextHTML(e, view, action.actorId) + '</span></div></li>';
    previousTiming = timing;
  });
  return '<ol class="recap-events" aria-label="Effects in resolution order"' +
    (action.events.length > 6 ? ' tabindex="0"' : '') + '>' + rows + '</ol>';
}

function historyButton(action, direction) {
  return '<button type="button" class="recap-history-btn" aria-label="' +
    (direction === 'back' ? 'Previous action' : 'Next action') + '" ' +
    (action ? 'data-recap-id="' + esc(action.id) + '"' : 'disabled') + '>' + glyph(direction) + '</button>';
}

function history(view, viewerId, actions, requestedId) {
  const latest = actions.at(-1);
  const index = requestedId == null ? actions.length - 1 : Math.max(0, actions.findIndex(a => String(a.id) === String(requestedId)));
  const action = actions[index];
  const older = action.id !== latest.id;
  return '<div class="recap-details" id="recap-effects" data-shown-action-id="' + esc(action.id) +
    '"><div class="recap-detail-head"><div>' +
    '<small>Round ' + esc(action.round) + ' · ' + (older ? 'Earlier action' : 'Latest action') + '</small>' +
    '<h3>' + esc(action.actionName) + '</h3>' + route(action) + '</div><nav aria-label="Recent actions">' +
    historyButton(actions[index - 1], 'back') + '<span>' + (index + 1) + ' / ' + actions.length + '</span>' +
    historyButton(actions[index + 1], 'right') + '</nav></div>' +
    (older && actions[index + 1].id > action.id + 1 ? '<p class="recap-gap">This action is pinned. Newer history resumes at action ' +
      esc(actions[index + 1].id) + '.</p>' : '') + effectList(action, view) +
    (older && action.next ? handoffHTML(handoff(view, action.next, action, viewerId, true), true) : '') + '</div>';
}

/** Reads the same public outcome records sent to each seat, including spectators. */
export function resolutionHTML(view, viewerId, { expanded = false, actionId, pinnedAction } = {}) {
  const latest = view.lastAction;
  if (!latest) {
    const active = view.players.find(p => p.id === view.activeId);
    const next = view.players.find(p => p.id === view.upcoming?.[1]);
    if (!active) return '';
    return '<section class="turn-recap opening-turn" aria-label="Opening turn"><div class="recap-strip">' +
      '<div class="recap-action-art">' + rewardIcon({icon:'sword'}) + '</div>' +
      '<div class="recap-who"><span class="recap-label">First move</span> <span class="recap-route"><span>' +
      esc(active.name) + '</span></span></div>' +
      (next ? '<div class="recap-handoff">' + rewardIcon({icon:'clock'}) +
        '<span>On deck</span><strong>' + esc(next.name) + '</strong></div>' : '') + '</div></section>';
  }
  let actions = view.recentActions?.length ? view.recentActions : [latest];
  if (expanded && pinnedAction && !actions.some(a => a.id === pinnedAction.id)) actions = [pinnedAction, ...actions];
  const icon = actionIcon(latest.actionId);
  return '<section class="turn-recap" aria-label="Last action"><div class="recap-strip">' +
    '<div class="recap-action-art">' + icon + '</div><div class="recap-outcome">' +
    '<div class="recap-who"><span class="recap-label">Last action</span> ' + moveSentence(latest) + '</div>' +
    '<p>' + resultLine(latest) + '</p></div>' +
    handoffHTML(handoff(view, view, latest, viewerId)) +
    '<button type="button" class="recap-toggle" data-ui="toggle-recap" aria-expanded="' + expanded +
    '"' + (expanded ? ' aria-controls="recap-effects"' : '') + '>' +
    'Effects' + glyph('right') + '</button></div>' +
    (expanded ? history(view, viewerId, actions, actionId) : '') + '</section>';
}
