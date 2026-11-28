import { fighterAnchors } from './fighter-kit.js';
import { beltPoint } from './worn-gear.js';

export const scenePropImages = ['field-coffer','field-parcel','held-bottles','held-bell','held-lantern','held-shield','held-clock']
  .map(name => '/assets/skins/' + name + '.png');

export const useExposures = [0, 1, 2, 3, 3, 4, 4, 4, 4, 3, 2, 0];

// Right-facing cel with a 120 × 120 footprint at (44,24).
function localPoint([x, y], box, dir) {
  return { x: box.w * (.5 + dir * (x - 104) / 120), y: box.h * (y - 24) / 120 };
}

function prop(parent, kind, x, y, width, height) {
  const element = document.createElement('span');
  element.className = 'arena-fx-prop';
  element.dataset.prop = kind;
  Object.assign(element.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
  parent.append(element);
  return element;
}

function scavenge({ scene, box, dir, duration, frames, at, tween, role, tier, anchors }, { ground, hand }) {
  const unit = box.h / 120;
  const base = localPoint(ground, box, dir);
  const width = 48 * unit, height = width * 40 / 52;
  const x = box.x + base.x, y = box.y + base.y;
  // The hinge is towards the far wall. Only the painting mirrors, keeping
  // the near rim aligned to the glove for contenders on either side.
  const cache = prop(scene, 'cache', x - width / 2, y - height * .86, width, height);
  cache.style.setProperty('--coffer-facing', dir);
  cache.dataset.lid = '0';
  function lidAt(time, cell) {
    at(time, () => { cache.dataset.lid = String(cell); cache.style.backgroundPositionX = cell * 20 + '%'; });
  }
  [3,4,5,6,7].forEach((beat, index) => lidAt(frames[beat], index + 1));
  [4,3,2,1,0].forEach((cell, index) => lidAt(frames[9] + (frames[10]-frames[9]) * index / 4, cell));
  tween(cache, [
    { opacity: 0 }, { opacity: 1, offset: .10 },
    { opacity: 1, offset: .89 }, { opacity: 0 },
  ], duration);

  // The object sits inside the opening until the reaching hand collects it.
  // It follows that hand back to the belt as the fighter straightens up.
  const grasp = localPoint([ground[0] - 5, ground[1] - 12], box, dir);
  const belt = localPoint(beltPoint(role, tier, 'idle', 0, anchors?.[tier]?.belt ?? anchors?.belt), box, dir);
  const restingHand = localPoint(hand, box, dir);
  at(frames[5], () => {
    const size = unit * 11;
    const find = prop(scene,'parcel',box.x+grasp.x-size/2,box.y+grasp.y-size*.55,size,size*13/15);
    const travel = duration - frames[5];
    const offset = frame => (frames[frame]-frames[5]) / travel;
    const carried = (px, py, tilt) => 'translate(' + (px - grasp.x) + 'px,' + (py - grasp.y) + 'px) rotate(' + dir*tilt + 'deg)';
    const midX = grasp.x*.6 + restingHand.x*.4, midY = grasp.y*.6 + restingHand.y*.4;
    tween(find, [
      { opacity:0, transform:'none' },
      { opacity:1, transform:'none', offset:offset(6) },
      { opacity:1, transform:'none', offset:offset(8) },
      { opacity:1, transform:carried(midX,midY,-12), offset:offset(9) },
      { opacity:1, transform:carried(restingHand.x,restingHand.y,-22), offset:offset(10) },
      { opacity:0, transform:carried(belt.x,belt.y,-12), offset:.97 },
      { opacity:0, transform:carried(belt.x,belt.y,-12) },
    ],travel);
    at(travel, () => find.remove());
  });
  at(duration, () => cache.remove());
}

// Grip offsets are measured in the world sprite. A bell and lantern hang below
// the fingers, while the arm sits behind the center of a raised buckler.
const tools = {
  bell:    {w:19,h:24,pivot:[.52,.12]},
  lantern: {w:18,h:23,pivot:[.50,.11]},
  clock:   {w:16,h:19,pivot:[.54,.17]},
  shield:  {w:26,h:29,pivot:[.46,.60]},
};

function carried({ ghost, box, frames, duration, score, dir, at, tween }, { hand, mouth }, icon) {
  const drinking = score.gesture === 'drink';
  const tool = drinking ? {w:11,h:17,pivot:[.5,.12]} : tools[icon];
  if (!tool) return;
  const grip = localPoint(hand, box, dir);
  const support = drinking || score.gesture === 'use';
  const release = localPoint(support ? mouth : score.track === 'bash' ? [145, 86] : [139, 68], box, dir);
  const width = box.h * tool.w / 120, height = box.h * tool.h / 120;
  const [u,v] = tool.pivot;
  const item = prop(ghost, drinking ? 'bottle' : 'held', grip.x - width*u, grip.y - height*v, width, height);
  item.dataset.icon = icon;
  item.style.transformOrigin = (u*100) + '% ' + (v*100) + '%';
  const dx = release.x - grip.x, dy = release.y - grip.y;
  const reaching = [0, 0, 0, .25, .5, .75, 1, 1, 1, .5, 0, 0];
  tween(item, frames.map((time, i) => {
    const reach = reaching[score.gesture === 'use' ? useExposures[i] : i];
    const ring = icon === 'bell' ? [0,0,-3,-4,-5,-3,4,12,-9,4,-2,0][i] : 0;
    const angle = dir * ((drinking ? -104 : -10) * reach + ring);
    return {
      offset: time / duration, opacity: i === 0 || i === 11 ? 0 : i === 1 ? .55 : 1,
      transform: 'translate(' + dx * reach + 'px,' + dy * reach + 'px) rotate(' + angle + 'deg)',
    };
  }), duration);
  at(duration, () => item.remove());
}

export function stageCombatProps(context) {
  const { score, anchors, role, tier, clip } = context;
  const points = fighterAnchors(role, tier, anchors);
  if (score.gesture === 'scavenge') return scavenge(context, points);
  const icon = score.prop ?? (score.track === 'bash' && clip !== 'signature' ? 'shield' : undefined);
  if (icon) carried(context, points, icon);
}
