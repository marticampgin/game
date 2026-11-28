// One visible belt hook per fighter. Slots nearer the end of the equipped rack
// take priority. Only public gear is eligible, so rival packs stay private.
const gear = {
  'ward-lantern': {image:'/assets/skins/held-lantern.png', width:17},
  'menders-bell': {image:'/assets/skins/held-bell.png', width:19},
  'vial-sash': {image:'/assets/skins/worn-vial-sash.png', width:20},
};
const waists = {guardian:[101,72], berserker:[105,73], chronomancer:[110,73], alchemist:[108,76]};
const bends = {
  attack:[[-6,2],[7,5]], signature:[[-8,3],[9,8]], cast:[[-3,2],[3,-2]],
  utility:[[-1,12],[5,30]], brace:[[-3,4],[-2,7]], hurt:[[-3,-2],[-7,3]],
  consume:[[-2,1],[0,2]],
};

export function wornGear(player) {
  return player.abilities?.map(slot => slot.id).findLast(id => Object.hasOwn(gear, id))
    ?? player.artifacts?.findLast(id => Object.hasOwn(gear, id));
}
export function beltPoint(role, band, track, column = 0, override) {
  const resting = waists[role] || waists.guardian;
  const [x,y] = override || [resting[0], resting[1] + ({wounded:6,critical:17}[band] || 0)];
  const [chamber, release] = bends[track] || [[0,0],[0,0]];
  const keys = [[0,0],chamber,release,[0,0]];
  const times = [0,4,7,11];
  const i = column <= 4 ? 0 : column <= 7 ? 1 : 2;
  const t = Math.max(0,Math.min(1,(column-times[i])/(times[i+1]-times[i])));
  return [x,y].map((value, axis) => value + Math.round(keys[i][axis]*(1-t) + keys[i+1][axis]*t));
}
export function beltHTML(player, band, anchors) {
  const id = wornGear(player);
  if (!id || player.alive === false || player.hp === 0) return '';
  const [x,y] = beltPoint(player.classId, band, 'idle', 0, anchors?.[band]?.belt ?? anchors?.belt);
  const item = gear[id];
  return '<span class="belt-layer" data-worn="' + id + '" data-x="' + x + '" data-y="' + y +
    '" style="--belt-x:' + x/208*100 + '%;--belt-y:' + y/166*100 + '%;--belt-width:' + item.width/208*100 +
    '%"><img alt="" src="' + item.image + '"></span>';
}
export function trackBelt(element, track = 'idle', column = 0) {
  const layer = element.querySelector('.belt-layer');
  if (!layer) return;
  const [x,y] = beltPoint(element.dataset.class, element.dataset.tier, track, column, [+layer.dataset.x,+layer.dataset.y]);
  layer.style.setProperty('--belt-x', x/208*100 + '%');
  layer.style.setProperty('--belt-y', y/166*100 + '%');
}
