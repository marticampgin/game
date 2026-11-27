import { STATUSES } from '../src/game/catalog.js';
import { esc, glyph } from './art.js';
import { statusCue, statusIcon } from './status-effects.js';

export function statusBankHTML(stacks = {}) {
  const active = Object.keys(STATUSES).filter(id => stacks[id] > 0);
  if (!active.length) return '';
  const title = active.map(id => STATUSES[id].name + ' ×' + stacks[id]).join(' · ');
  return '<span class="condition-chips" title="' + esc(title) + '">' + active.slice(0, 3).map(id =>
    '<span class="condition-chip" data-condition="' + id + '">' + statusIcon(id) + '<b>' +
    (stacks[id] > 99 ? '99+' : stacks[id]) + '</b></span>').join('') +
    (active.length > 3 ? '<small>+' + (active.length - 3) + '</small>' : '') + '</span>';
}

export function recapStatusHTML(action) {
  const ids = [...new Set((action.events ?? []).map(e => statusCue(e)?.id).filter(Boolean))];
  if (!ids.length) return '';
  return '<span class="recap-conditions" aria-hidden="true" title="' +
    esc(ids.map(id => STATUSES[id].name).join(' · ')) + '">' + ids.slice(0, 3).map(statusIcon).join('') +
    (ids.length > 3 ? '<small>+' + (ids.length - 3) + '</small>' : '') + '</span>';
}

const eventNames = {damage:'Hit', shield:'Shield', heal:'Heal', elimination:'Fallen', revival:'Revived', status:'Status'};

function effectLabel(event) {
  const hp = event.healthDamage ?? event.amount ?? 0;
  if (event.type === 'damage') {
    const changes = [];
    if (hp || !event.shieldDamage) changes.push('−' + hp + ' HP');
    if (event.shieldDamage) changes.push('−' + event.shieldDamage + ' shield');
    return changes.join(' · ');
  }
  if (event.type === 'shield') return '+' + event.amount + ' shield';
  if (event.type === 'heal' || event.type === 'revival') return '+' + event.amount + ' HP';
  return '';
}

export function mountEffectStrip(container, action, players) {
  const name = id => players.find(p => p.id === id)?.name || '';
  const root = document.createElement('div');
  root.className = 'live-effects';
  root.setAttribute('aria-label', 'Resolving effects');
  root.innerHTML = '<div class="live-phase"><strong></strong><small></small></div>' +
    '<ol class="effect-trail" aria-label="Latest effects"></ol><span class="sr-turn" role="status"></span>' +
    '<button type="button" class="recap-toggle" data-ui="skip-effects">Skip effects ' + glyph('right') + '</button>';
  container.replaceChildren(root);
  const title = root.querySelector('strong'), phase = root.querySelector('small');
  title.textContent = action.actionName;
  phase.textContent = action.actorName;
  const trail = root.querySelector('ol');
  return (beat, index, total) => {
    const event = beat.event, sample = event || beat.events[0];
    const cue = event && statusCue(event);
    const caption = event ? (cue?.title || eventNames[event.type] || 'Effect') : beat.events.length + ' effects';
    const detail = event ? [name(event.targetId), effectLabel(event)].filter(Boolean).join(' · ') :
      [...new Set(beat.events.map(e => statusCue(e)?.name || eventNames[e.type]))].join(' · ');
    const timing = sample.timing === 'turn' ? 'Turn start' : sample.timing === 'round' ? 'Round start' : action.actionName;
    title.textContent = timing;
    const owner = sample.timing === 'turn' ? name(sample.turnOwnerId || sample.targetId) :
      sample.timing === 'round' ? '' : action.actorName;
    phase.textContent = [owner, (index + 1) + ' / ' + total].filter(Boolean).join(' · ');
    const chip = document.createElement('li');
    chip.className = 'effect-receipt';
    if (cue) {
      chip.style.setProperty('--effect-ink', cue.ink);
      chip.dataset.receipt = cue.id;
    }
    chip.innerHTML = (cue ? statusIcon(cue.id) : '') + '<strong>' + esc(caption) + '</strong><span>' + esc(detail) + '</span>';
    trail.append(chip);
    if (trail.children.length > 3) trail.firstElementChild.remove();
    root.querySelector('[role=status]').textContent = [timing, caption, detail].join('. ');
  };
}
