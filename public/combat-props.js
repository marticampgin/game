import { fighterAnchors } from './fighter-kit.js';

export const useExposures = [0, 1, 2, 3, 3, 4, 4, 4, 4, 3, 2, 0];

// The right-facing cel has a 120px footprint beginning at (44,24).
function localPoint([x, y], box, dir) {
  return { x: box.w * (.5 + dir * (x - 104) / 120), y: box.h * (y - 24) / 120 };
}

function prop(parent, kind, x, y, width, height, icon) {
  const element = document.createElement('span');
  element.className = 'arena-fx-prop';
  element.dataset.prop = kind;
  Object.assign(element.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px' });
  if (icon) element.style.backgroundImage = 'url(/assets/i-' + icon + '.png)';
  parent.append(element);
  return element;
}

function scavenge({ scene, box, dir, duration, frames, at, tween }, { ground, hand }) {
  const base = localPoint(ground, box, dir);
  const x = box.x + base.x, y = box.y + base.y;
  const size = box.h * .27;
  const cache = prop(scene, 'cache', x - size / 2, y - size, size, size, 'chest');
  tween(cache, [
    { opacity: 0, transform: 'translateY(3px) scale(.94)' },
    { opacity: 1, transform: 'none', offset: .14 },
    { opacity: 1, transform: 'none', offset: .82 },
    { opacity: 0, transform: 'translateY(2px) scale(.96)' },
  ], duration);
  const stow = localPoint(hand, box, dir);
  const dx = stow.x - base.x, dy = stow.y - base.y + size * .57;
  for (const [index, delay] of [0, 68, 132].entries()) {
    at(frames[6] + delay, () => {
      const diameter = box.h * (.072 + index * .006);
      const coin = prop(scene, 'coin', x - diameter / 2, y - size * .57 - diameter / 2, diameter, diameter, 'coin');
      const travel = Math.min(310, duration - frames[6] - delay);
      tween(coin, [
        { opacity: 0, transform: 'translate(0,0) scale(.5)' },
        { opacity: 1, transform: 'translate(0,-4px) scale(.95)', offset: .14 },
        { opacity: 1, transform: 'translate(' + dx * .36 + 'px,' + (dy * .62 - box.h * .11) + 'px)', offset: .54 },
        { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)' },
      ], travel);
      at(travel, () => coin.remove());
    });
  }
  at(duration, () => cache.remove());
}

function carried({ ghost, box, frames, duration, score, dir, at, tween }, { hand, mouth }, icon) {
  const drinking = score.gesture === 'drink';
  const grip = localPoint(hand, box, dir);
  const handheld = drinking || score.gesture === 'use';
  const raised = handheld ? mouth : score.track === 'bash' ? [145, 86] : [139, 68];
  const lip = localPoint(raised, box, dir);
  const size = box.h * (drinking ? .147 : .215);
  const width = drinking ? size * 11 / 17 : size;
  const item = prop(ghost, drinking ? 'bottle' : 'held', grip.x - width / 2, grip.y - (drinking ? size * .43 : size * .5), width, size, drinking ? null : icon);
  item.dataset.icon = icon;
  // The top of the uncorked neck touches the lips. Keep the base outside
  // the silhouette so the face, hand, and tilted glass can all be read.
  const dx = lip.x - grip.x, dy = lip.y - grip.y + (drinking ? size * .43 : 0);
  const reaching = [0, 0, 0, .25, .5, .75, 1, 1, 1, .5, 0, 0];
  tween(item, frames.map((time, i) => {
    const reach = reaching[score.gesture === 'use' ? useExposures[i] : i];
    const angle = dir * (drinking ? -104 * reach : -14 * reach);
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
