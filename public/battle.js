import { CLASSES, REWARDS, STATUSES, currentAttack, getActions } from '/src/game/index.js';
import { fighterModel, fighterPortrait } from './fighter-kit.js';
import { rewardIcon, seatCrest, glyph, esc } from './art.js';
import { actionDock } from './command.js';
import { fighterSpriteHTML } from './animation.js';
import { statusBankHTML } from './effect-strip.js';
import { draftHTML } from './draft.js';
import { resolutionHTML } from './resolution.js';

const tool = (id, label, icon) =>
  `<button class="tool-btn" data-ui="${id}" title="${label}" aria-label="${label}">${glyph(icon)}<span>${label}</span></button>`;

function actionSelection(view, player, actionId, targetId) {
  const actions = getActions(view, player.id);
  const action = actions.find((a) => a.id === actionId && !a.disabled) || actions.find((a) => !a.disabled);
  const rivals = view.players.filter((p) => p.alive && p.id !== player.id);
  const target =
    action?.target === 'enemy'
      ? rivals.find((p) => p.id === targetId) || (rivals.length === 1 ? rivals[0] : null)
      : player;
  return { actions, action, rivals, target };
}

// Coordinates describe the fighters' feet on the floor, in painter's order by depth.
// All clients use roster order, including after a contender is knocked out.
const ringSeats = {
  2: [[24,76],[76,53]],
  3: [[30,80],[47,41],[80,66]],
  4: [[31,82],[15,55],[60,41],[83,71]],
  5: [[32,82],[12,60],[41,41],[72,43],[85,73]],
  6: [[28,83],[11,59],[39,40],[62,40],[88,59],[73,83]],
  7: [[30,83],[11,64],[24,44],[48,40],[72,42],[88,63],[65,84]],
  8: [[31,84],[11,64],[24,45],[44,40],[63,40],[82,47],[90,67],[70,85]],
};

function combatant(p, index, view, viewerId, selection, intent) {
  const [x, y] = ringSeats[view.players.length][index];
  const active = p.id === view.activeId && view.phase !== 'finished';
  const mine = p.id === viewerId;
  const targetable = !mine && p.alive && selection?.action?.target === 'enemy';
  const marked = selection?.target?.id === p.id;
  const incoming = intent?.targetId === p.id && intent.actorId !== p.id;
  const hp = Math.max(0, Math.min(100, (100 * p.hp) / p.maxHp));
  const statuses = Object.entries(p.statuses)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => (STATUSES[id]?.name || id) + ' ×' + count)
    .join(', ');
  const details = [CLASSES[p.classId].name, mine && 'You', active && 'Acting', marked && 'Target', statuses]
    .filter(Boolean)
    .join(' · ');
  return `<article class="combatant ${active ? 'acting' : ''} ${marked ? 'marked' : ''} ${incoming ? 'incoming' : ''} ${p.alive ? '' : 'fallen'}"
    data-seat="${esc(p.id)}" data-facing="${x > 50 ? 'left' : 'right'}" style="--x:${x.toFixed(2)}%;--y:${y.toFixed(2)}%;--depth:${Math.round(y)};--scale:${(0.76 + (y - 35) * 0.0073).toFixed(3)}">
    <button type="button" class="fighter-main" data-${targetable ? 'aim' : 'inspect'}="${esc(p.id)}" aria-label="${targetable ? 'Target' : 'View'} ${esc(p.name)}" aria-describedby="vitals-${esc(p.id)}" ${targetable ? 'aria-pressed="' + !!marked + '"' : ''}>
      <span class="foot-ring" aria-hidden="true"></span><span class="fighter-art">${fighterSpriteHTML(p)}</span>
      <span class="fighter-panel" id="vitals-${esc(p.id)}"><strong class="fighter-title">${seatCrest(index)}${esc(p.name)}</strong>
        <span class="vital-bar" aria-hidden="true"><i style="width:${hp}%"></i></span>
        <span class="fighter-hp">${p.alive ? p.hp + ' / ' + p.maxHp : 'Out'}</span>
        <span class="seat-conditions" aria-hidden="true">${statusBankHTML(p.statuses)}</span>
        <span class="sr-turn">${esc(details)}${p.shield ? ' · ' + p.shield + ' shield' : ''}</span>
      </span>
    </button><button type="button" class="fighter-info" data-inspect="${esc(p.id)}" aria-label="Inspect ${esc(p.name)}" title="${esc(p.name + ' · ' + details)}"><span aria-hidden="true">i</span></button>
  </article>`;
}

export function turnRail(view, viewerId) {
  const end = view.phase === 'finished';
  const order = end ? view.order : view.upcoming.slice(0, view.players.filter((p) => p.alive).length);
  // Use the original seats to keep a contender's nameplate stable as turn order changes.
  const plates = view.players.map(({ name }) => {
    const words = name.normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
    const first = [...(words[0] || '')];
    const last = [...(words.at(-1) || '')];
    const short = (length) => {
      const letters = words.length > 1 ? first.slice(0, 1).concat(last.slice(0, length - 1)) : first.slice(0, length);
      return letters.join('').toUpperCase();
    };
    const names = [first.slice(0, 7).join('')];
    if (words.length > 1 && /\p{L}/u.test(words.at(-1))) names.push(last.slice(0, 7).join(''));
    return { names, codes: [short(2), short(3)] };
  });
  const uniqueLabel = (seat, key) => plates[seat][key].find(candidate =>
    candidate && plates.every((other, index) => index === seat ||
      !other[key].some(value => candidate.toUpperCase() === value.toUpperCase()))
  );
  return `<nav class="turn-rail" aria-label="${end ? 'Final roster' : 'Turn order'}"><span>${end ? 'Roster' : 'Upcoming'}</span>
    <ol>${order
      .map((id, i) => {
        const seat = view.players.findIndex(p => p.id === id);
        const p = view.players[seat];
        const code = uniqueLabel(seat, 'codes') || '#' + (seat + 1);
        const shortName = uniqueLabel(seat, 'names') || code;
        const seatHint = code.startsWith('#') ? ' · Seat ' + (seat + 1) : '';
        const label =
          (end ? '' : i === 0 ? 'Acting · ' : i === 1 ? 'Up next · ' : 'Turn ' + (i + 1) + ' · ') + p.name + seatHint;
        return `<li><button data-inspect="${esc(id)}" aria-label="${esc(label)}" title="${esc(label + (id === viewerId ? ' · You' : ''))}" ${!end && i === 0 ? 'aria-current="step"' : ''}>
          <img src="${fighterPortrait(p)}" alt="">${seatCrest(seat)}<span class="rail-name" aria-hidden="true">${esc(shortName)}</span><span class="rail-code" aria-hidden="true">${esc(code)}</span>
        </button></li>`;
      })
      .join('')}</ol></nav>`;
}

function waiting(view, player, active, intent) {
  const target = view.players.find((p) => p.id === intent?.targetId);
  const preparing = intent?.actionName
    ? 'Preparing ' +
      esc(intent.actionName) +
      (target && target !== active ? ' against ' + esc(target.name) : '')
    : view.phase === 'acquire'
      ? 'Choosing a reward'
      : 'Choosing an action';
  return `<div class="watch"><img src="${fighterPortrait(active)}" alt="">
    <div><small>${player.alive ? 'Rival turn' : 'Spectating'}</small><h2>${esc(active.name)}</h2></div><p>${preparing}</p></div>`;
}

function result(view, viewerId) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  return `<div class="result"><img src="/assets/i-crown.png" alt=""><div><small>Match complete · Round ${view.round}</small><h2>${winner ? (winner.id === viewerId ? 'Victory is yours' : esc(winner.name) + ' wins') : 'The arena claims everyone'}</h2></div>
    ${tool('history', 'Battle log', 'scroll')}<button class="primary" data-ui="replay">Play again ${glyph('right')}</button></div>`;
}

export function battleHTML(view, viewerId, ui) {
  const player = view.players.find((p) => p.id === viewerId);
  const active = view.players.find((p) => p.id === view.activeId);
  const mine = view.activeId === viewerId;
  const end = view.phase === 'finished';
  const drafting = mine && view.phase === 'acquire';
  const selection =
    mine && view.phase === 'action' ? actionSelection(view, player, ui.action, ui.target) : null;
  const intent = ui.botIntent;
  const dock = end
    ? result(view, viewerId)
    : !mine
      ? waiting(view, player, active, intent)
      : selection
        ? actionDock(view, player, selection, ui)
        : '';
  return `<div class="battle-shell"><header class="battle-heading metal-edge">
    <button class="arena-brand" data-ui="leave" aria-label="Riftbound main menu"><img src="/assets/ring-emblem.webp" alt="">Riftbound</button>
    <h1>The Shattered Ring</h1><nav class="battle-tools" aria-label="Match tools">${tool('history', 'Battle log', 'scroll')}
      <button class="tool-btn" data-ui="build" aria-label="Your inventory" title="Your inventory">${glyph('book')}<span>Inventory</span></button></nav>
    <div class="round-meta">Round ${view.round}<i>◆</i>${esc(view.age)}</div></header>
    <section class="turn-board ${drafting ? 'drafting' : ''} ${ui.draftHidden ? 'shop-hidden' : ''}" aria-label="Battlefield">
      <div class="arena-world" data-count="${view.players.length}"><span class="torch-embers west" aria-hidden="true"></span><span class="torch-embers east" aria-hidden="true"></span>${view.players.map((p, i) => combatant(p, i, view, viewerId, selection, intent)).join('')}</div>
      ${turnRail(view, viewerId)}
      ${
        drafting
          ? `<button class="draft-handle tool-btn" data-ui="toggle-draft" aria-expanded="${!ui.draftHidden}">${glyph(ui.draftHidden ? 'dice' : 'back')}${ui.draftHidden ? 'Show rewards' : 'View arena'}</button>
        ${ui.draftHidden ? '' : '<section class="draft-stage" aria-label="Turn controls">' + draftHTML(view, player, ui.selectedDraft) + '</section>'}`
          : ''
      }
    </section>
    ${dock ? '<section class="turn-controls metal-edge" aria-label="Turn controls">' + dock + '</section>' : ''}
    <div class="turn-resolution">${resolutionHTML(view, viewerId, ui.recap)}</div>
    <footer class="battle-bottom"><div>${view.nextEvent && !end ? tool('event', 'Next event · Round ' + view.nextEvent.round + ' · ' + view.nextEvent.name, 'cycle') : ''}</div>
      <nav aria-label="Arena tools">${tool('atlas', 'Atlas', 'book')}${tool('battle-sound', ui.sound ? 'Mute sound' : 'Enable sound', ui.sound ? 'sound' : 'mute')}${tool('battle-settings', 'Settings and rules', 'settings')}${tool('leave', end ? 'Main menu' : 'Leave match', 'back')}</nav></footer>
  </div>`;
}

export function buildHTML(p, own) {
  const skills = p.abilities.map((a) => [
    a.id,
    a.cooldown ? 'Cooldown ' + a.cooldown : 'Ready',
    ...(a.modifiers || []).map((m) => REWARDS[m]?.name || m),
  ]);
  const list = (items, empty) =>
    items.length
      ? '<ul class="item-list">' +
        items
          .map(
            ([id, ...info]) =>
              '<li>' +
              rewardIcon(REWARDS[id]) +
              '<span><strong>' +
              esc(REWARDS[id]?.name || id) +
              '</strong><small>' +
              esc(REWARDS[id]?.description) +
              '</small></span>' +
              (info.length ? '<em>' + esc(info.join(' · ')) + '</em>' : '') +
              '</li>',
          )
          .join('') +
        '</ul>'
      : '<p class="muted">' + empty + '</p>';
  const stats = Object.entries(p.statuses).filter(([, v]) => v);
  return `<div class="inspect-top"><img src="${fighterModel(p)}" alt=""><div><small>${esc(CLASSES[p.classId].name)}</small><h2>${esc(p.name)}</h2><p>${esc(CLASSES[p.classId].innate)}</p></div></div>
  <dl class="stats-row">${[
    ['Health', p.hp + '/' + p.maxHp],
    ['Shield', p.shield],
    ['Attack', currentAttack(p)],
    ['Armor', p.armor],
    ['Spell power', p.spellPower],
    ['Regen', p.regen || 0],
  ]
    .map(([k, n]) => '<div><dt>' + k + '</dt><dd>' + n + '</dd></div>')
    .join('')}</dl>
  ${stats.length ? '<h3>Status effects</h3>' + stats.map(([k, n]) => '<p><strong>' + esc(STATUSES[k]?.name) + ' ×' + n + '</strong> · ' + esc(STATUSES[k]?.description) + '</p>').join('') : ''}
  <h3>Abilities &amp; equipment</h3>${list(skills, 'No equipped abilities.')}
  <h3>Passive artifacts</h3>${list(
    p.artifacts.map((id) => [id]),
    'No artifacts acquired yet.',
  )}
  <h3>Consumables · ${p.consumableCount}</h3>${
    own
      ? list(
          (p.consumables || []).map((id) => [id]),
          'No consumables carried.',
        )
      : '<p>Only the owner can see these items.</p>'
  }`;
}
