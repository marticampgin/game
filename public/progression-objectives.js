import { esc, glyph } from './art.js';

export const number = value => Number(value || 0).toLocaleString('en-US');
export const coin = () => '<img class="pg-coin" src="/assets/i-coin.png" alt="">';

export function objectiveRows(objectives) {
  return '<ul class="pg-objectives">' + objectives.map(quest => {
    const done = quest.complete || quest.value >= quest.target;
    const progress = Math.min(quest.value || 0, quest.target);
    return `<li class="pg-objective${done ? ' is-complete' : ''}">
      <div class="pg-objective-head"><strong>${esc(quest.name)}</strong><span class="pg-coin-label" aria-label="${number(quest.coins)} coins">${coin()}${number(quest.coins)}</span></div>
      <p>${esc(quest.description)}</p>
      <div class="pg-meter-row"><progress aria-label="${esc(quest.name)} progress" value="${progress}" max="${quest.target}"></progress>
      <span>${done ? glyph('check') + ' Complete' : number(progress) + ' / ' + number(quest.target)}</span></div>
    </li>`;
  }).join('') + '</ul>';
}
