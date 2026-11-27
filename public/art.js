import { CLASSES, REWARDS } from '../src/game/catalog.js';

const genericIcons = new Set([
  'shield', 'axe', 'clock', 'flask', 'crystal', 'fire', 'sword', 'heart', 'ring', 'chest',
  'frost', 'bolt', 'leaf', 'dagger', 'skull', 'feather', 'crown', 'lantern', 'rune', 'coin',
]);
export const classArt = id => '/assets/' + (Object.hasOwn(CLASSES, id) ? id : 'guardian') + '.png';
export function rewardIcon(reward) {
  const src = Object.hasOwn(REWARDS, reward?.id)
    ? '/assets/rewards/' + reward.id + '.png'
    : '/assets/i-' + (genericIcons.has(reward?.icon) ? reward.icon : 'crystal') + '.png';
  return '<img class="reward-art" src="' + src + '" alt="" draggable="false">';
}

// The seat stays fixed when initiative, health and turn order change.
export function seatCrest(seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= 8) return '';
  return '<span aria-hidden="true" class="seat-crest" data-crest="' + seat + '" style="--crest:' + seat + '"></span>';
}

const basicActions = new Set(['attack', 'defend', 'scavenge']);

export function actionIcon(id) {
  if (basicActions.has(id)) {
    return '<img class="reward-art" src="/assets/commands/' + id + '.png" alt="" draggable="false">';
  }
  return rewardIcon(REWARDS[id] || { icon: 'rune' });
}

const paths = {
  right:'<path d="m9 5 7 7-7 7"/>', back:'<path d="m15 5-7 7 7 7"/>',
  sound:'<path d="M3 9h4l5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="M3 9h4l5-5v16l-5-5H3zM16 9l6 6m0-6-6 6"/>',
  settings:'<path d="m9 3 1-2h4l1 2 3 2 2 0 2 4-1 2v3l1 2-2 4-2-1-3 2-1 2h-4l-1-2-3-2-2 1-2-4 1-2v-3L2 9l2-4h2z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="3" fill="#171223" stroke="none"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>', book:'<path d="M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2zM12 6v14"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M2 20v-3c0-5 14-5 14 0v3zm14-14c5-2 7 6 1 6m2 3c2 0 3 1 3 4"/>',
  dice:'<path d="m3 6 9-4 9 4v12l-9 4-9-4zM3 6l9 4 9-4m-9 4v12"/><path d="M7 12v2m9-1v2"/>',
  cycle:'<path d="M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6m-5 7a8 8 0 0 0 14 2l3-3m0 6v-6h-6"/>',
  scroll:'<path d="M5 3h14v14H7a3 3 0 1 0 3 3h8M5 3a2 2 0 0 0-2 2v3h4V5a2 2 0 0 0-2-2zm2 4v12m3-11h6m-6 4h5"/>',
  swords:'<path d="m4 2 4 2 11 13-2 2L4 6zM2 16l5 5m-3 1 4-5m13-15-4 2-5 6 2 2 7-6zM9 14l-3 3 2 2 3-3m5 5 5-5m0 6-4-5"/>',
  check:'<path d="m4 12 5 5L21 5"/>',copy:'<rect x="8" y="7" width="12" height="14"/><path d="M16 4V2H4v15h2"/>'
};
export function glyph(name) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">'+(paths[name]||'')+'</svg>';
}
export const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
