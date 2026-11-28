import { previewAction } from '/src/game/index.js';
import { fighterPortrait } from './fighter-kit.js';
import { actionIcon, seatCrest, esc, glyph } from './art.js';

const PAGE_SIZE = 6;

function portrait(player, view) {
  return `<img src="${fighterPortrait(player)}" alt="" draggable="false">${seatCrest(view.players.findIndex(p => p.id === player.id))}`;
}

function playerStation(player, view) {
  const percent = Math.max(0, Math.min(100, player.hp * 100 / player.maxHp));
  return `<button type="button" class="command-player" data-ui="build" aria-label="Inspect ${esc(player.name)}'s build">
    <span class="command-portrait">${portrait(player, view)}</span>
    <span class="command-player-info"><strong>${esc(player.name)}</strong>
    <span class="command-hp">HP <b>${player.hp} / ${player.maxHp}</b></span>
    <span class="command-health" aria-hidden="true"><i style="width:${percent}%"></i></span></span></button>`;
}

function actionButton(option, chosenId) {
  const reason = option.cooldown ? 'Cooldown · ' + option.cooldown : option.reason;
  return `<button type="button" class="action-choice" data-action="${esc(option.id)}"
      aria-pressed="${option.id === chosenId}" ${option.disabled ? 'disabled' : ''} title="${esc(option.reason || option.description)}">
    <span class="command-icon">${actionIcon(option.id)}</span><span class="command-name">${esc(option.name)}
    ${option.disabled ? `<small>${esc(reason)}</small>` : ''}</span></button>`;
}

function pageNav(page, total) {
  if (total <= PAGE_SIZE) return '';
  const first = page * PAGE_SIZE + 1;
  const last = Math.min(first + PAGE_SIZE - 1, total);
  return `<nav class="action-pages" aria-label="Action pages"><span>Actions ${first}–${last} of ${total}</span>
    <button type="button" aria-label="Previous actions" data-action-page="${page - 1}" ${page === 0 ? 'disabled' : ''}>${glyph('back')}</button>
    <button type="button" aria-label="More actions" data-action-page="${page + 1}" ${last === total ? 'disabled' : ''}>${glyph('right')}</button></nav>`;
}

export function actionDock(view, player, selection, { actionPage = 0, acquiredReward } = {}) {
  const { actions, action, rivals, target } = selection;
  if (!action) return '<h2>No action available</h2>';
  const lastPage = Math.ceil(actions.length / PAGE_SIZE) - 1;
  const page = Math.min(Math.max(0, actionPage), lastPage);
  // Keep the signature and three basic moves together when carrying a full loadout.
  const quick = ['attack', player.abilities[0]?.id, 'defend', 'scavenge'];
  const ordered = lastPage === 0 ? actions : [
    ...quick.map(id => actions.find(option => option.id === id)).filter(Boolean),
    ...actions.filter(option => !quick.includes(option.id)),
  ];
  const visible = ordered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const preview = target ? previewAction(view, player.id, action.id, target.id).text
    : 'Choose a living rival to preview this action.';
  const note = [acquiredReward ? 'Took ' + acquiredReward : '', view.remainingActions > 1 ? view.remainingActions + ' actions left' : ''].filter(Boolean).join(' · ');
  return `<section class="command-deck" aria-label="Action command deck">
    ${playerStation(player, view)}<div class="command-hand"><header class="dock-heading command-heading"><div>
      <h2>Choose an action</h2>${note ? `<small>${esc(note)}</small>` : ''}</div>${pageNav(page, actions.length)}</header>
      <div class="action-grid" role="group" aria-label="Available actions" style="--command-count:${visible.length};--phone-columns:${visible.length > 4 ? 3 : visible.length}">
        ${visible.map(option => actionButton(option, action.id)).join('')}</div>
    </div><div class="target-panel"><div class="aim-line">${action.target === 'enemy'
      ? `<span class="target-caption"><label for="target-select">Target</label>${target ? `<small aria-hidden="true">${target.hp} / ${target.maxHp} HP</small>` : ''}</span>
        <span class="command-target target-picker">
          ${target ? `<span class="command-target-art">${portrait(target, view)}</span>` : ''}
          <span class="target-name" aria-hidden="true">${target ? esc(target.name) : 'Choose a rival'}</span>${glyph('right')}
          <select id="target-select" title="${target ? esc(target.name + ' (' + target.hp + ' / ' + target.maxHp + ')') : 'Choose a rival'}">
            ${target ? '' : '<option value="" selected>Choose a rival</option>'}${rivals.map(p => `<option value="${esc(p.id)}" ${p.id === target?.id ? 'selected' : ''}>${esc(p.name)} (${p.hp} / ${p.maxHp})</option>`).join('')}
          </select>
        </span>`
      : `<span>Target</span><span class="command-target"><span class="command-target-art">${portrait(player, view)}</span><strong>Yourself</strong></span>`}</div>
      <div class="command-estimate">${preview !== action.description ? `<p class="action-description">${esc(action.summary || action.description)}</p>` : ''}
      <p class="preview" aria-live="polite">${esc(preview)}</p></div>
      <button type="button" class="primary confirm-action" data-execute="${esc(action.id)}" data-target="${esc(target?.id)}" ${target ? '' : 'disabled'}>Use ${esc(action.name)} ${glyph('right')}</button>
    </div></section>`;
}
