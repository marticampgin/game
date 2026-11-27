import { STATUSES } from '../src/game/catalog.js';

// The row indexes address both the 16-cel effect sheet and the icon strip.
// Anchors are fractions of the receiving fighter's box measured from the top.
const looks = {
  burn:   { row: 0, ink: '#ffd28a', anchor: 0.65, scale: 0.95, sound: 'fire' },
  poison: { row: 1, ink: '#c8e989', anchor: 0.59, scale: 0.90, sound: 'miasma' },
  bleed:  { row: 2, ink: '#ffaca0', anchor: 0.57, scale: 0.76, sound: 'bleed' },
  shock:  { row: 3, ink: '#ffe483', anchor: 0.54, scale: 0.96, sound: 'shock' },
  chill:  { row: 4, ink: '#b3eaff', anchor: 0.55, scale: 0.94, sound: 'frost' },
  freeze: { row: 5, ink: '#d2f6ff', anchor: 0.74, scale: 0.92, sound: 'frost' },
  curse:  { row: 6, ink: '#f2afff', anchor: 0.55, scale: 0.90, sound: 'eclipse' },
  doom:   { row: 7, ink: '#f2aed2', anchor: 0.48, scale: 0.92, sound: 'doom' },
};
export const statusRow = id => Object.hasOwn(looks, id) ? looks[id].row : -1;
export function statusIcon(id) {
  if (!Object.hasOwn(looks, id)) return '';
  return '<span class="status-icon" data-status-icon="' + id + '" style="--status-row:' + looks[id].row + '" aria-hidden="true"></span>';
}

export function statusCue(event) {
  const id = event.cause;
  if ((event.type !== 'status' && event.type !== 'damage') || !Object.hasOwn(looks, id)) return null;
  const name = STATUSES[id].name;
  // Previous saves already carried public causes for applications and damage.
  const change = event.type === 'damage' ? 'tick' : event.statusChange || (id === 'freeze' ? 'frozen' : 'applied');
  const quantity = Number.isSafeInteger(event.amount) ? event.amount : 0;
  let title = name;
  switch (change) {
    case 'applied': title = id === 'freeze' ? 'Frozen' : quantity ? '+' + quantity + ' ' + name : name; break;
    case 'frozen': title = 'Frozen'; break;
    case 'thawed': title = 'Thawed'; break;
    case 'cleansed': title = name + ' cleansed'; break;
    case 'consumed': title = name + ' consumed'; break;
    case 'discharged': title = 'Shock discharged'; break;
    case 'decayed': title = event.statusRemaining ? '−1 ' + name : name + ' faded'; break;
  }
  return { ...looks[id], id, name, effect: id, change, title, remaining: event.statusRemaining };
}
