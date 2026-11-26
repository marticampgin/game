import { CLASSES, REWARDS, STATUSES, currentAttack, getActions, previewAction } from '/src/game/index.js';
import { classArt, rewardIcon, glyph, esc } from './art.js';
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

function combatant(p, view, viewerId, selection, feedback) {
  const mine = p.id === viewerId;
  const active = p.id === view.activeId && view.phase !== 'finished';
  const targetable = !mine && p.alive && selection?.action?.target === 'enemy';
  const marked = selection?.target?.id === p.id;
  const state = !p.alive
    ? 'Out'
    : active
      ? mine
        ? 'Your turn'
        : 'Acting'
      : marked
        ? 'Target'
        : mine
          ? 'You'
          : '';
  const statuses = Object.entries(p.statuses).filter(([, count]) => count > 0);
  const firstStatus = statuses[0];
  const statusText = statuses.map(([id, n]) => (STATUSES[id]?.name || id) + ' ×' + n).join(', ');
  const hp = Math.max(0, Math.min(100, (100 * p.hp) / p.maxHp));
  const hit = feedback?.findLast(
    (e) => e.targetId === p.id && ['damage', 'revival', 'heal', 'shield', 'elimination'].includes(e.type),
  );
  const reaction = hit?.type === 'damage' && !hit.healthDamage && hit.shieldDamage ? 'absorbed' : hit?.type;
  const effect =
    reaction === 'elimination'
      ? 'Out'
      : reaction === 'revival'
        ? 'Revived'
        : reaction === 'absorbed'
          ? 'Blocked'
          : hit
            ? (hit.type === 'damage' ? '−' : '+') + (hit.healthDamage ?? hit.amount ?? '')
            : '';
  const action = targetable ? 'aim' : 'inspect';
  const caption = targetable ? 'Target ' : 'View ';
  return `<article class="combatant ${active ? 'acting' : ''} ${marked ? 'marked' : ''} ${p.alive ? '' : 'fallen'}" data-seat="${esc(p.id)}">
    <button class="fighter-main" data-${action}="${esc(p.id)}" aria-label="${caption}${esc(p.name)}" ${targetable ? 'aria-pressed="' + !!marked + '"' : ''}>
      <span class="fighter-art ${reaction ? 'effect-' + reaction : ''}"><img src="${classArt(p.classId)}" alt="" draggable="false">${effect ? '<b class="fighter-impact" aria-hidden="true">' + esc(effect) + '</b>' : ''}</span>
      <span class="fighter-panel"><span class="fighter-title">${esc(p.name)}</span><span class="fighter-detail">${esc(CLASSES[p.classId].name)}${mine ? ' · You' : ''}</span>
        <span class="vital-bar" aria-hidden="true"><i style="width:${hp}%"></i></span>
        <span class="fighter-hp">${p.alive ? p.hp + '/' + p.maxHp + ' HP' : 'Eliminated'}${p.shield ? ' <b>◆ ' + p.shield + '</b>' : ''}</span>
        ${firstStatus ? '<span class="fighter-status" title="' + esc(statusText) + '">' + esc(STATUSES[firstStatus[0]]?.name || firstStatus[0]) + ' ×' + firstStatus[1] + (statuses.length > 1 ? ' · +' + (statuses.length - 1) : '') + '</span>' : ''}
      </span>${state ? '<span class="fighter-state">' + state + '</span><span class="fighter-token" aria-hidden="true">' + (active ? '◆' : marked ? '◎' : mine ? 'You' : '×') + '</span>' : ''}
    </button>
    <button class="fighter-info" data-inspect="${esc(p.id)}" title="Inspect ${esc(p.name + (statusText ? ' · ' + statusText : ''))}" aria-label="Inspect ${esc(p.name)}">
      <span class="info-icon" aria-hidden="true">i</span>
    </button>
  </article>`;
}

function turnRail(view, viewerId) {
  const end = view.phase === 'finished';
  const order = end ? view.order : view.upcoming.slice(0, view.players.filter((p) => p.alive).length);
  return `<section class="turn-rail" aria-label="${end ? 'Final roster' : 'Turn order'}"><h2>${end ? 'Roster' : 'Turn order'}</h2>
    <ol>${order
      .map((id, i) => {
        const p = view.players.find((p) => p.id === id);
        const when = end ? '' : i === 0 ? 'Acting' : i === 1 ? 'Up next' : 'Turn ' + (i + 1);
        return `<li><button data-inspect="${esc(id)}" aria-label="${esc([when, p.name].filter(Boolean).join(' · '))}" title="${esc([when, p.name].filter(Boolean).join(' · '))}">
        <img src="${classArt(p.classId)}" alt=""><span>${id === viewerId ? 'You' : esc(p.name)}</span></button></li>`;
      })
      .join(
        '',
      )}</ol>${view.nextEvent && !end ? `<button class="event-chip" data-ui="event" aria-label="Round ${view.nextEvent.round} event · ${esc(view.nextEvent.name)}" title="${esc(view.nextEvent.description)}"><img src="/assets/i-rune.png" alt=""><span>Round ${view.nextEvent.round} event<strong>${esc(view.nextEvent.name)}</strong></span></button>` : ''}</section>`;
}

function actionDock(view, player, selection, page) {
  const { actions, action, rivals, target } = selection;
  if (!action) return '<h2>No action available</h2>';
  const pages = Math.ceil(actions.length / 6);
  const shownPage = Math.min(page || 0, pages - 1);
  const signature = player.abilities[0]?.id;
  const quick = ['attack', signature, 'defend', 'scavenge'];
  const ordered =
    pages === 1
      ? actions
      : [
          ...quick.map((id) => actions.find((a) => a.id === id)).filter(Boolean),
          ...actions.filter((a) => !quick.includes(a.id)),
        ];
  const visible = ordered.slice(shownPage * 6, (shownPage + 1) * 6);
  const preview = target
    ? previewAction(view, player.id, action.id, target.id).text
    : 'Choose a living rival to preview this action.';
  return `<div class="dock-heading"><div><small>Your turn${view.remainingActions > 1 ? ' · ' + view.remainingActions + ' actions left' : ''}</small><h2>Choose an action</h2></div>
    <img class="command-emblem" src="/assets/i-sword.png" alt=""></div>
    <div class="action-grid" role="group" aria-label="Available actions">${visible
      .map(
        (a) =>
          `<button class="action-choice" data-action="${esc(a.id)}" aria-pressed="${a.id === action.id}" ${a.disabled ? 'disabled' : ''} title="${esc(a.reason || a.description)}">
        ${REWARDS[a.id] ? rewardIcon(REWARDS[a.id]) : '<img src="/assets/i-' + { attack: 'sword', defend: 'shield', scavenge: 'chest' }[a.id] + '.png" alt="">'}
        <span>${esc(a.name)}${a.disabled ? '<small>' + esc(a.cooldown ? 'Cooldown · ' + a.cooldown : a.reason) + '</small>' : ''}</span></button>`,
      )
      .join('')}</div>
    ${
      pages > 1
        ? `<nav class="action-pages" aria-label="Action pages"><span>Actions ${shownPage * 6 + 1}–${Math.min((shownPage + 1) * 6, actions.length)} of ${actions.length}</span>
      <button aria-label="Previous actions" data-action-page="${shownPage - 1}" ${shownPage === 0 ? 'disabled' : ''}>${glyph('back')}</button>
      <button aria-label="More actions" data-action-page="${shownPage + 1}" ${shownPage === pages - 1 ? 'disabled' : ''}>${glyph('right')}</button></nav>`
        : ''
    }
    <div class="target-panel"><div class="aim-line">${
      action.target === 'enemy'
        ? `<label for="target-select">Target</label><select id="target-select">${target ? '' : '<option value="" selected>Choose a rival</option>'}${rivals.map((p) => '<option value="' + esc(p.id) + '" ' + (p.id === target?.id ? 'selected' : '') + '>' + esc(p.name) + '</option>').join('')}</select>`
        : '<span>Target</span><strong>Yourself</strong>'
    }</div>
      ${target && preview !== action.description ? '<p class="action-description">' + esc(action.description) + '</p>' : ''}
      <p class="preview" aria-live="polite">${esc(preview)}</p>
      <button class="primary confirm-action" data-execute="${esc(action.id)}" data-target="${esc(target?.id)}" ${target ? '' : 'disabled'}>Use ${esc(action.name)} ${glyph('right')}</button>
    </div>`;
}

function waiting(view, player, active) {
  return `<div class="watch"><small>${player.alive ? 'Rival turn' : 'Spectating'}</small><img src="${classArt(active.classId)}" alt="">
    <h2>${esc(active.name)} is ${view.phase === 'acquire' ? 'choosing a reward' : 'taking action'}</h2>
    <p>${player.alive ? 'Inspect any contender while you wait.' : 'You have been eliminated. Follow the remaining contenders here.'}</p></div>`;
}

function result(view, viewerId) {
  const winner = view.players.find((p) => p.id === view.winnerId);
  return `<div class="result"><small>Match complete · Round ${view.round}</small><img src="/assets/i-crown.png" alt="">
    <h2>${winner ? (winner.id === viewerId ? 'Victory is yours' : esc(winner.name) + ' wins') : 'The arena claims everyone'}</h2>
    <button class="primary" data-ui="replay">Play again ${glyph('right')}</button>${tool('history', 'Battle log', 'scroll')}</div>`;
}

export function battleHTML(view, viewerId, ui) {
  const player = view.players.find((p) => p.id === viewerId);
  const active = view.players.find((p) => p.id === view.activeId);
  const mine = view.activeId === viewerId;
  const end = view.phase === 'finished';
  const selection =
    mine && view.phase === 'action' ? actionSelection(view, player, ui.action, ui.target) : null;
  const players = [player, ...view.players.filter((p) => p.id !== viewerId)];
  const dock = end
    ? result(view, viewerId)
    : !mine
      ? waiting(view, player, active)
      : view.phase === 'acquire'
        ? draftHTML(view, player, ui.selectedDraft)
        : actionDock(view, player, selection, ui.actionPage);
  const living = players.filter((p) => p.alive).length;
  return `<div class="battle-shell"><header class="battle-heading"><div><small>Round ${view.round} <span>◆</span> ${esc(view.age)}</small><h1>The Shattered Ring</h1></div>
      <nav class="battle-tools" aria-label="Match tools">${tool('build', 'Your inventory', 'book')}${tool('history', 'Battle log', 'scroll')}${tool('atlas', 'Atlas', 'dice')}</nav></header>
    ${turnRail(view, viewerId)}
    <div class="turn-layout"><div class="turn-field"><section class="turn-board ${players.length > 2 ? 'compact-seats' : ''} ${players.length > 4 ? 'many-seats' : ''}" aria-label="Battlefield">
      <div class="arena-label"><span>${glyph('swords')} Battlefield</span><small>${living} / ${players.length} standing</small></div>
      <div class="seat-grid" style="--columns:${Math.min(players.length, 4)}">${players.map((p) => combatant(p, view, viewerId, selection, ui.feedback)).join('')}</div>
      </section></div>
      <section class="turn-controls" aria-label="Turn controls">${dock}</section>
      <div class="turn-resolution">${resolutionHTML(view, viewerId, ui.recap)}</div>
    </div><footer class="battle-bottom">${tool('leave', end ? 'Main menu' : 'Leave match', 'back')}</footer></div>`;
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
  return `<div class="inspect-top"><img src="${classArt(p.classId)}" alt=""><div><small>${esc(CLASSES[p.classId].name)}</small><h2>${esc(p.name)}</h2><p>${esc(CLASSES[p.classId].innate)}</p></div></div>
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
export function historyHTML(v, soloSeed) {
  return (
    '<h2>Battle log</h2>' +
    (soloSeed === undefined ? '' : '<p>Solo seed · ' + esc(soloSeed) + '</p>') +
    '<ol class="history">' +
    v.log
      .slice()
      .reverse()
      .map(
        (e) =>
          '<li class="' +
          esc(e.type) +
          '"><small>R' +
          e.round +
          ' · ' +
          esc(e.type) +
          '</small><span>' +
          esc(e.text) +
          '</span></li>',
      )
      .join('') +
    '</ol>'
  );
}
