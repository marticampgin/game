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

// Condensed beats still carry each original packet. Group only the presentation,
// retaining the first-seen seat order and keeping gains and losses separate.
export function groupedTargets(events) {
  const bySeat = new Map();
  for (const event of events) {
    if (!bySeat.has(event.targetId)) bySeat.set(event.targetId, []);
    bySeat.get(event.targetId).push(event);
  }
  return Array.from(bySeat, ([id, packets]) => {
    const cues = new Map(), life = [];
    let hpLoss = 0, shieldLoss = 0, healing = 0, shielding = 0, broken = false;
    for (const event of packets) {
      const cue = statusCue(event);
      if (cue) {
        const old = cues.get(cue.id);
        if (cue.change === 'applied' && cue.id !== 'freeze' && (!old || old.change === 'applied')) {
          const amount = (old?.amount || 0) + (event.amount || 0);
          cues.set(cue.id, { ...cue, amount, title:amount ? '+' + amount + ' ' + cue.name : cue.name });
        } else if (old && old.change !== cue.change) {
          cues.set(cue.id, { ...cue, change:'mixed', title:cue.name });
        } else cues.set(cue.id, cue);
      }
      if (event.type === 'damage') {
        hpLoss += event.healthDamage ?? (event.shieldDamage ? 0 : event.amount ?? 0);
        shieldLoss += event.shieldDamage || 0;
        broken ||= !!event.shieldBroken;
      }
      if (event.type === 'heal') healing += event.amount;
      if (event.type === 'shield') shielding += event.amount;
      if (event.type === 'elimination' || event.type === 'revival') life.push(event);
    }
    const lead = life.at(-1) || packets.find(e => e.type === 'damage') ||
      packets.find(e => e.type === 'heal' || e.type === 'shield') || packets[0];
    const loss = [hpLoss && '−' + hpLoss + ' HP', shieldLoss && '−' + shieldLoss + ' shield', broken && 'Break'].filter(Boolean).join(' · ');
    const gain = [healing && '+' + healing + ' HP', shielding && '+' + shielding + ' shield'].filter(Boolean).join(' · ');
    const fate = life.slice(-2).map(e => e.type === 'elimination' ? 'Fallen' : 'Revived at ' + e.amount + ' HP').join(' → ');
    return { id, lead, cues:[...cues.values()], fate, values:[loss, gain].filter(Boolean) };
  });
}

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
    const grouped = !event && (beat.targets || groupedTargets(beat.events));
    const wave = grouped && grouped.length > 1 && grouped.length === beat.events.length && beat.events.every(e => e.type === 'status' &&
      e.cause === sample.cause && e.amount === sample.amount && e.statusChange === sample.statusChange) &&
      grouped[0].cues[0];
    const caption = wave ? wave.title : event ? (cue?.title || eventNames[event.type] || 'Effect') :
      grouped.length === 1 ? name(grouped[0].id) : grouped.length + ' contenders';
    const detail = wave ? grouped.length + ' contenders' : event ? [name(event.targetId), effectLabel(event)].filter(Boolean).join(' · ') :
      grouped.map(target => [grouped.length > 1 && name(target.id), ...target.cues.map(c => c.title),
        ...target.values, target.fate].filter(Boolean).join(' · ')).join(' / ');
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
    const icons = grouped ? [...new Set(grouped.flatMap(t => t.cues.map(c => c.id)))].slice(0, 3).map(statusIcon).join('') :
      cue ? statusIcon(cue.id) : '';
    chip.innerHTML = icons + '<strong>' + esc(caption) + '</strong><span>' + esc(detail) + '</span>';
    if (grouped) chip.title = wave ? grouped.map(t => name(t.id)).join(' · ') : detail;
    trail.append(chip);
    if (trail.children.length > 3) trail.firstElementChild.remove();
    root.querySelector('[role=status]').textContent = [timing, caption, detail].join('. ');
  };
}
