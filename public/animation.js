import { stageCombatProps, useExposures } from './combat-props.js';
import { statusCue, statusIcon } from './status-effects.js';
import { combatTiming, directOutcome } from './combat-timing.js';
import { fighterLayout, healthBand, resolveFighterSkin } from './fighter-kit.js';
import { actorClip, effectRows, impactCauses, missiles, motionScore } from './combat-motion.js';
export { healthBand, registerFighterSkin, resolveFighterSkin } from './fighter-kit.js';

const readySheets = new Set();
const standing = fighterLayout.layers.sheet;
const motionSheet = fighterLayout.layers.motions;
const standingRows = standing.poses.length / standing.columns * fighterLayout.health.length;
function pose(element, name) {
  delete element.dataset.track;
  element.style.removeProperty('--clip-row');
  element.querySelector('.arena-cel').style.removeProperty('background-position-x');
  const index = standing.poses.indexOf(name);
  element.dataset.pose = name;
  element.style.setProperty('--pose-x', (index % standing.columns) * 100 / (standing.columns - 1) + '%');
  element.style.setProperty('--pose-y', Math.floor(index / standing.columns) * 100 / (standingRows - 1) + '%');
}
export function fighterSpriteHTML(player, { skinId = player.skinId, reducedMotion = false } = {}) {
  const skin = resolveFighterSkin(player.classId, skinId);
  const band = healthBand(player);
  const fallen = player.alive === false || player.hp === 0;
  const seed = Array.from(String(player.id ?? skin.classId)).reduce(
    (n, c) => (31 * n + c.charCodeAt(0)) >>> 0,
    0,
  );
  const checkSeed = Math.imul(seed, 0x9e3779b1) >>> 0;
  const ambient = skin.ambient
    ? ' data-ambient-src="' +
      skin.ambient +
      '"' +
      (readySheets.has(skin.ambient) ? ' data-ambient-ready' : '')
    : '';
  const consume = skin.consume
    ? ' data-consume-src="' + skin.consume + '"' + (readySheets.has(skin.consume) ? ' data-consume-ready' : '')
    : '';
  const steps = skin.footwork ? ' data-footwork-src="' + skin.footwork + '"' : '';
  const motion = skin.motions
    ? ' data-motion-src="' + skin.motions + '"' + (readySheets.has(skin.motions) ? ' data-motion-ready' : '')
    : '';
  const style =
    '--skin:url(' +
    skin.sheet +
    ');' +
    (skin.motions ? '--motion-skin:url(' + skin.motions + ');' : '') +
    (skin.consume ? '--consume-skin:url(' + skin.consume + ');' : '') +
    (skin.footwork ? '--footwork-skin:url(' + skin.footwork + ');' : '') +
    (skin.ambient
      ? '--check-skin:url(' +
        skin.ambient +
        ');--check-time:' +
        (9600 + (checkSeed % 4700)) +
        'ms;--check-delay:-' +
        (checkSeed % 8700) +
        'ms;'
      : '') +
    '--idle-delay:-' +
    (seed % 5300) +
    'ms;' +
    '--pose-x:' +
    (fallen ? '66.666667%' : '0%') +
    ';--pose-y:' +
    (fallen ? '25%' : '0%');
  return (
    '<span aria-hidden="true" class="arena-sprite" data-class="' +
    skin.classId +
    '" data-skin="' +
    skin.id +
    '" data-tier="' +
    band +
    '" data-pose="' +
    (fallen ? 'fallen' : 'idle') +
    '"' +
    (reducedMotion ? ' data-still' : '') +
    motion +
    consume +
    steps +
    ambient +
    ' style="' +
    style +
    '"><span class="arena-cel"></span>' +
    (skin.ambient ? '<span class="arena-check-cel"></span>' : '') +
    '</span>'
  );
}
const fxSheet = '/assets/skins/arena-effects.png';
const missileSheet = '/assets/skins/arena-projectiles.png';
const images = new Map();
export function preloadArenaSkins(players = []) {
  if (typeof Image === 'undefined') return Promise.resolve([]);
  const urls = new Set([
    fxSheet,
    missileSheet,
    '/assets/skins/status-effects.png',
    '/assets/skins/status-icons.png',
    '/assets/skins/held-bottles.png',
    ...players.flatMap((p) => {
      const skin = resolveFighterSkin(p.classId, p.skinId);
      return Object.keys(fighterLayout.layers).map(layer => skin[layer]).filter(Boolean);
    }),
  ]);
  return Promise.all(
    Array.from(urls, (url) => {
      if (!images.has(url)) {
        const image = new Image();
        images.set(
          url,
          new Promise((resolve) => {
            image.onload = async () => {
              try {
                await image.decode?.();
              } catch {
                images.delete(url);
                resolve(false);
                return;
              }
              readySheets.add(url);
              for (const layer of ['motion', 'ambient', 'consume']) {
                document.querySelectorAll('[data-' + layer + '-src="' + url + '"]')
                  .forEach(el => el.setAttribute('data-' + layer + '-ready', ''));
              }
              resolve(true);
            };
            image.onerror = () => {
              images.delete(url);
              resolve(false);
            };
            image.src = url;
          }),
        );
      }
      return images.get(url);
    }),
  );
}

export function actionVisual(actionId, classId, self = false) {
  const score = motionScore(actionId, classId, self);
  return { motion: score.family, effect: score.effect };
}
function effectFor(event, profile, primary) {
  if (event.type === 'damage') {
    if (event.shieldBroken) return 'fracture';
    if (event.shieldDamage && !event.healthDamage) return 'guard';
    return impactCauses[event.cause] ?? (primary ? profile.effect : 'dust');
  }
  if (event.type === 'elimination') return 'doom';
  if (event.type === 'revival') return 'revival';
  if (event.type === 'heal') return 'heal';
  if (event.type === 'shield') return primary && profile.effect === 'ward' ? 'ward' : 'guard';
  return impactCauses[event.cause] ?? profile.effect;
}
export function impactScale(amount) {
  // Small hits use a legible minimum size, while extreme late-game hits stay inside the area.
  return 0.69 + Math.min(0.94, Math.sqrt(Math.max(0, Number(amount) || 0)) * 0.078);
}
function badge(event) {
  if (event.type === 'damage') {
    const bits = [];
    if (event.healthDamage || !event.shieldDamage)
      bits.push('−' + (event.healthDamage ?? event.amount ?? 0) + ' HP');
    if (event.shieldDamage) bits.push('−' + event.shieldDamage + ' shield');
    if (event.shieldBroken) bits.push('Break');
    return bits.join(' · ');
  }
  if (event.type === 'heal') return '+' + event.amount + ' HP';
  if (event.type === 'shield') return '+' + event.amount + ' shield';
  if (event.type === 'elimination') return 'Fallen';
  if (event.type === 'revival') return 'Revived';
  return '';
}
function part(parent, cls) {
  const el = document.createElement('span');
  el.className = cls;
  parent.append(el);
  return el;
}
function positioned(el, x, y, w, h) {
  Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
}

const running = new WeakMap();

const causeNames = {
  'arena-fire': 'Arena fire',
  echo: 'Echo',
  retaliation: 'Retaliation',
  burn: 'Burn',
  bleed: 'Bleed',
  poison: 'Poison',
  doom: 'Doom',
  freeze: 'Freeze',
  chill: 'Chill',
  shock: 'Shock',
  curse: 'Curse',
};
const centerX = (r) => r.x + r.w * 0.5;
const centerY = (r) => r.y + r.h * 0.5;
const translated = (x, y, scale = 1, lean = 0) =>
  'translate(' + x + 'px,' + y + 'px) scale(' + scale + ') rotate(' + lean + 'deg)';

export function playArenaAction(arena, recap, options = {}) {
  running.get(arena)?.cancel();
  const seats = new Map();
  for (const seat of arena?.querySelectorAll('[data-seat]') ?? []) {
    const sprite = seat.querySelector('.arena-sprite');
    if (sprite) seats.set(seat.dataset.seat, { seat, sprite });
  }
  const actor = seats.get(recap?.actorId);
  const target = seats.get(recap?.targetId) ?? actor;
  if (!actor || !target) return { finished: Promise.resolve(), cancel() {} };

  const speed = Math.max(0.25, Math.min(6, Number(options.speed) || 1));
  const still = Boolean(
    options.reducedMotion ||
      arena.closest('.reduce-motion') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const role = actor.sprite.dataset.class;
  const action = recap.actionId;
  const score = motionScore(action, role, actor === target);
  const scene = part(arena, 'arena-fx');
  scene.setAttribute('aria-hidden', 'true');
  Object.assign(scene.dataset, {
    motion: still ? 'reduced' : score.family,
    action,
    choreography: score.track,
    stage: 'windup',
  });

  function boxFor(element) {
    const rect = arena.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    const kx = arena.clientWidth / (rect.width || 1),
      ky = arena.clientHeight / (rect.height || 1);
    return { x: (r.left - rect.left) * kx, y: (r.top - rect.top) * ky, w: r.width * kx, h: r.height * ky };
  }
  const bounds = (subject) => boxFor(subject.sprite.closest('.fighter-art') ?? subject.seat);
  const start = bounds(actor),
    end = bounds(target);
  const horizontal = centerX(end) - centerX(start);
  const facing =
    Math.abs(horizontal) < 2 ? (actor.seat.dataset.facing ?? 'right') : horizontal > 0 ? 'right' : 'left';
  const dir = facing === 'right' ? 1 : -1;
  const ghost = part(scene, 'arena-fx-actor');
  ghost.dataset.facing = facing;
  positioned(ghost, start.x, start.y, start.w, start.h);
  const art = actor.sprite.cloneNode(true);
  ghost.append(art);
  actor.sprite.dataset.playing = 'hidden';

  // A retaliation can land while the attacker is still retreating. Reactions
  // follow the visible body instead of bursting over the empty seat marker.
  const visibleBounds = (subject) => (subject === actor && !still ? boxFor(ghost) : bounds(subject));
  const activeClips = new Map();
  const originals = new Map(),
    labels = new Map();
  const animations = new Map();
  const cues = [];
  let nextFrame;
  let finishedScene = false,
    resolve;
  const finished = new Promise((done) => {
    resolve = done;
  });
  function cancel() {
    if (finishedScene) return;
    finishedScene = true;
    cancelAnimationFrame(nextFrame);
    document.removeEventListener('visibilitychange', onVisibility);
    cues.length = 0;
    for (const animation of animations.keys()) animation.cancel();
    for (const [element, oldPose] of originals) pose(element, oldPose);
    delete actor.seat.dataset.travelling;
    delete actor.sprite.dataset.playing;
    scene.remove();
    running.delete(arena);
    resolve();
  }
  const handle = { finished, cancel };
  running.set(arena, handle);
  // Start the compositor and the public event queue on the same presentation
  // clock. A timeout can fire between paints while the body is still winding up.
  let timelineStart = document.timeline?.currentTime ?? performance.now();
  let cueTime = 0;
  function at(delay, run) {
    cues.push({ time: cueTime + delay, run });
    cues.sort((a, b) => a.time - b.time);
  }
  function onVisibility() {
    if (document.hidden) cancel();
  }
  function advance(paintTime) {
    let elapsed = (paintTime - timelineStart) * speed;
    if (paintPoints.length && elapsed >= paintPoints[0]) {
      // Reserve one paint for the actual contact when the main thread misses its
      // frame. The small fraction crosses the authored step on rounded clocks.
      elapsed = paintPoints.shift() + 0.1;
      timelineStart = paintTime - elapsed / speed;
      for (const [animation, offset] of animations) {
        if (animation.playState !== 'idle') animation.startTime = timelineStart + offset / speed;
      }
    }
    try {
      while (cues.length && cues[0].time <= elapsed) {
        const cue = cues.shift();
        cueTime = cue.time;
        cue.run();
      }
    } finally {
      cueTime = 0;
      if (!finishedScene) nextFrame = requestAnimationFrame(advance);
    }
  }
  function tween(element, frames, ms, easing = 'linear') {
    if (!element.animate || still) return;
    const animation = element.animate(frames, { duration: ms / speed, easing, fill: 'forwards' });
    animation.startTime = timelineStart + cueTime / speed;
    animations.set(animation, cueTime);
    return animation;
  }
  function cut(subject, name) {
    const element = subject === actor ? art : subject.sprite;
    activeClips.delete(element);
    if (subject !== actor && !originals.has(element)) originals.set(element, element.dataset.pose);
    pose(element, name);
  }
  function imprint(kind, x, y, size, duration) {
    const el = part(scene, 'arena-fx-burst');
    el.dataset.effect = kind;
    positioned(el, x - size / 2, y - size / 2, size, size);
    el.style.setProperty('--effect-row', (effectRows.indexOf(kind) / (effectRows.length - 1)) * 100 + '%');
    el.style.setProperty('--effect-time', duration / speed + 'ms');
    if (still) el.classList.add('arena-fx-still');
    at(duration, () => el.remove());
    return el;
  }
  function statusBurst(subject, cue) {
    const box = visibleBounds(subject);
    const size = Math.max(54, Math.min(210, box.h * cue.scale));
    const el = part(scene, 'arena-fx-burst arena-status-burst');
    el.dataset.effect = cue.effect;
    el.dataset.status = cue.id;
    el.dataset.change = cue.change;
    positioned(el, centerX(box) - size / 2, box.y + box.h * cue.anchor - size / 2, size, size);
    el.style.setProperty('--effect-row', cue.row * 100 / 7 + '%');
    el.style.setProperty('--effect-time', 630 / speed + 'ms');
    if (still) el.classList.add('arena-fx-still');
    at(630, () => el.remove());
  }
  function contactBurst(subject, kind, amount, full = true) {
    const box = visibleBounds(subject);
    const emphasis = full ? (kind === 'venom' ? 1.19 : 0.91) : 0.58;
    const size = Math.max(34, Math.min(205, box.h * impactScale(amount) * emphasis));
    return imprint(kind, centerX(box), centerY(box), size, still ? 245 : full ? 370 : 305);
  }
  const clip = actorClip(score, action, role);
  const duration = score.path.at(-1)[0];
  const lead = score.family === 'cast' ? score.release : score.contact;
  const actorFrames = [0, 0.2, 0.37, 0.53, 0.67, 0.8, 0.91, 1].map((fraction) => fraction * lead);
  const recovery = score.family === 'melee' ? Math.min(225, (duration - lead) * 0.73) : duration - lead;
  for (const fraction of [0.14, 0.37, 0.68, 1]) actorFrames.push(lead + fraction * recovery);
  function flipbook(element, track, frames, exposures) {
    if (still) return false;
    if (track === 'consume' && !element.hasAttribute('data-consume-ready')) track = 'brace';
    const single = track === 'consume';
    if (!single && (!element.hasAttribute('data-motion-ready') || !motionSheet.rows.includes(track))) return false;
    element.dataset.track = track;
    element.dataset.pose = 'perform';
    const totalRows = motionSheet.rows.length * fighterLayout.health.length;
    element.style.setProperty('--clip-row', single ? '0%' : motionSheet.rows.indexOf(track) * 100 / (totalRows - 1) + '%');
    const atlas = element.querySelector('.arena-cel');
    // Pixel art is exposed one cel at a time. Keeping that cel on the painted
    // clock also lets a later reaction replace a still-unfolding recoil.
    const token = {};
    activeClips.set(element, token);
    atlas.style.backgroundPositionX = '0%';
    frames.slice(1).forEach((time, i) => {
      at(time, () => {
        if (activeClips.get(element) !== token) return;
        const column = exposures?.[i + 1] ?? i + 1;
        atlas.style.backgroundPositionX = column / (motionSheet.columns - 1) * 100 + '%';
      });
    });
    return true;
  }
  function articulate() {
    const exposures = clip === 'consume' && score.gesture === 'use' && art.hasAttribute('data-consume-ready') ? useExposures : undefined;
    if (flipbook(art, clip, actorFrames, exposures)) return;
    const guard = score.track === 'bash' || score.track === 'brace' || clip === 'consume';
    const windup = guard
      ? 'guard'
      : score.family === 'melee'
        ? 'windup'
        : score.track === 'stagger'
          ? 'hurt'
          : 'channel';
    pose(art, windup);
    if (still) return;
    at(lead * 0.7, () => pose(art, guard ? 'guard' : score.family === 'melee' ? 'windup' : 'release'));
    at(lead - 25, () => pose(art, guard ? 'guard' : score.family === 'melee' ? 'strike' : 'release'));
    at(lead + (duration - lead) * 0.5, () => pose(art, 'settle'));
  }

  function stageFootwork(begin, end) {
    if (!readySheets.has(art.dataset.footworkSrc)) return;
    // Both sheets have paintable layers before the attack starts. Mutating the
    // active background here can leave a blank compositor frame on first use.
    const stepLayer = part(art, 'arena-step-cel');
    const baseLayer = art.querySelector('.arena-cel');
    at(begin, () => {
      art.dataset.footwork = '';
      const span = end - begin;
      const envelope = [
        { offset: 0, opacity: .008 }, { offset: Math.min(.18, 38/span), opacity: 1 },
        { offset: 1 - Math.min(.24, 75/span), opacity: 1 }, { offset: 1, opacity: .008 },
      ];
      tween(stepLayer, envelope, span);
      tween(baseLayer, envelope.map(({offset,opacity}) => ({offset,opacity: 1.008 - opacity})), span);
      const timings = [0, 0.12, 0.27, 0.42, 0.52, 0.65, 0.8, 0.97, 1];
      const cells = [0, 1, 2, 3, 0, 1, 2, 3, 3];
      const steps = tween(
        stepLayer,
        timings.map((offset, i) => ({
          offset,
          backgroundPositionX: (cells[i] / 3) * 100 + '%',
          easing: 'steps(1,end)',
        })),
        end - begin,
      );
      at(end - begin, () => {
        steps?.cancel();
        delete art.dataset.footwork;
      });
    });
  }

  function moveActor() {
    const melee = score.family === 'melee';
    const reach = score.track === 'bash' ? 0.79 : score.track === 'needle' ? 0.53 : 0.46;
    const stop = Math.min(Math.abs(horizontal) * 0.85, end.w * reach);
    const dx = melee ? horizontal - dir * stop : 0;
    const floorDelta = end.y + end.h - start.y - start.h;
    const dy = melee
      ? floorDelta - Math.sign(floorDelta) * Math.min(end.h * 0.08, Math.abs(floorDelta) * 0.12)
      : 0;
    const endScale = melee ? Math.max(0.67, Math.min(1.5, end.h / start.h)) : 1;
    const body = [],
      shadow = [];
    for (const [ms, progress, forward, lift, lean] of score.path) {
      const x = progress * dx + dir * forward * start.w;
      const floorY = progress * dy;
      const scale = 1 + (endScale - 1) * progress;
      const point = { offset: ms / duration, easing: 'cubic-bezier(.31,.08,.61,.98)' };
      body.push({ ...point, transform: translated(x, floorY - lift * start.h, scale, dir * lean) });
      shadow.push({
        ...point,
        transform: translated(x, floorY, scale * (1 - Math.max(0, lift) * 1.5)),
        opacity: 0.65 - lift * 1.6,
      });
    }
    tween(ghost, body, duration);
    if (melee) {
      const launch = score.path.find((point) => point[1] > 0);
      at(launch[0], () => {
        actor.seat.dataset.travelling = '';
      });
      at(duration - 90, () => {
        delete actor.seat.dataset.travelling;
      });
      const floor = part(scene, 'arena-fx-shadow');
      positioned(
        floor,
        centerX(start) - start.w * 0.27,
        start.y + start.h * 0.95,
        start.w * 0.54,
        start.h * 0.09,
      );
      tween(floor, shadow, duration);
      // Dust marks the push-off and landing rather than following the character.
      const pushTime = score.track === 'bash' ? 267 : score.track === 'cleave' ? 241 : 147;
      at(pushTime, () =>
        imprint('dust', centerX(start) - dir * start.w * 0.21, start.y + start.h * 0.97, start.w * 0.62, 285),
      );
      const leave = score.contact + (score.track === 'needle' ? 80 : 200);
      // The weapon retracts on the spot; two short, planted countersteps bring the
      // fighter back across the floor with a different silhouette from the strike.
      stageFootwork(leave, duration - 26);
      at(leave, () =>
        imprint('dust', centerX(start) + dx - dir * end.w * 0.19, end.y + end.h * 0.95, end.w * 0.56, 270),
      );
      at(duration - 60, () =>
        imprint('dust', centerX(start) - dir * start.w * 0.16, start.y + start.h * 0.96, start.w * 0.44, 210),
      );
    }
  }

  function castPoint() {
    // The throw starts higher and farther behind the leading shoulder than a bolt.
    const thrown = score.track === 'throw';
    return {
      x: centerX(start) + dir * start.w * (thrown ? 0.15 : 0.3),
      y: start.y + start.h * (thrown ? 0.26 : 0.38),
    };
  }
  function projectilePoint(t) {
    const hand = castPoint();
    const dx = centerX(end) - hand.x,
      dy = centerY(end) - hand.y;
    const spin = score.track === 'throw';
    const rise = spin
      ? Math.min(126, Math.max(34, Math.abs(dx) * 0.17 + Math.abs(dy) * 0.07))
      : score.track === 'kindle'
        ? Math.min(24, Math.abs(dx) * 0.032)
        : 0;
    const progress = score.track === 'dial' ? t * t * (2 - t) : t;
    return {
      x: hand.x + dx * progress,
      y: hand.y + dy * progress - 4 * rise * t * (1 - t),
      angle: spin ? dir * (-45 + 260 * t) : (Math.atan2(dy - 4 * rise * (1 - 2 * t), dx) * 180) / Math.PI,
    };
  }
  function launch() {
    const kind = score.missile;
    const travel = score.contact - score.release;
    const el = part(scene, 'arena-fx-missile');
    const size = Math.max(26, Math.min(68, start.h * (score.track === 'throw' ? 0.3 : 0.39)));
    el.dataset.missile = kind;
    el.style.setProperty('--projectile-x', (missiles.indexOf(kind) / (missiles.length - 1)) * 100 + '%');
    positioned(el, -size / 2, -size / 2, size, size);
    const keyframes = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16,
        p = projectilePoint(t);
      return { offset: t, transform: translated(p.x, p.y, 1, p.angle) };
    });
    tween(el, keyframes, travel);
    at(travel, () => el.remove());
    if (score.track !== 'throw') {
      for (const t of [0.23, 0.46, 0.69]) {
        at(travel * t, () => {
          const p = projectilePoint(t);
          const trail = part(scene, 'arena-fx-trail');
          positioned(trail, p.x - 2, p.y - 2, 4, 4);
          trail.dataset.element = kind;
          tween(
            trail,
            [
              { opacity: 0.88, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(.25)' },
            ],
            155,
          );
          at(155, () => trail.remove());
        });
      }
    }
  }

  function stageCasting() {
    const hand = castPoint();
    if (score.move === 'eruption') {
      at(score.release, () => imprint(score.effect, centerX(end), end.y + end.h * 0.75, end.h * 0.58, 300));
    } else if (score.move === 'wave') {
      at(score.release - 205, () => {
        imprint(score.effect, hand.x, hand.y, start.h * 0.47, 265);
        const shard = part(scene, 'arena-fx-missile');
        const size = start.h * 0.28;
        shard.style.setProperty(
          '--projectile-x',
          (missiles.indexOf(score.missile) / (missiles.length - 1)) * 100 + '%',
        );
        positioned(shard, hand.x - size / 2, hand.y - size / 2, size, size);
        tween(
          shard,
          [
            { transform: translated(0, 0, 0.55, 75) },
            { transform: translated(dir * start.w * 0.17, start.h * 0.56, 0.9, 75) },
          ],
          228,
        );
        at(228, () => shard.remove());
      });
      for (const t of [0.22, 0.47, 0.72]) {
        at(score.release + (score.contact - score.release) * t, () => {
          const x = hand.x + (centerX(end) - hand.x) * t;
          const y = start.y + start.h + (end.y + end.h - start.y - start.h) * t;
          imprint(score.effect, x, y - end.h * 0.19, end.h * (0.43 + t * 0.24), 280);
        });
      }
    } else if (score.move === 'knell') {
      at(170, () => imprint(score.effect, hand.x, hand.y, start.h * 0.52, 445));
      at(score.release + 105, () => imprint(score.effect, centerX(end), centerY(end), end.h * 0.57, 355));
    } else {
      if (score.track !== 'throw') {
        at(Math.round(score.release * 0.47), () =>
          imprint(score.effect, hand.x, hand.y, start.h * 0.42, score.release * 0.58),
        );
      }
      at(score.release, launch);
    }
  }
  const effectsOnly = !!options.effectsOnly;
  const timing = combatTiming(recap, effectsOnly ? 0 : still ? 40 : score.contact, still, effectsOnly);
  // On a slow display allow the weight shift, chamber, release and recovery to
  // each reach the screen. Fast bots retain their deliberately compressed score.
  const illustratedActor = art.hasAttribute('data-motion-ready') || (clip === 'consume' && art.hasAttribute('data-consume-ready'));
  const keyDrawings = !effectsOnly && !still && speed <= 1 && illustratedActor
    ? [2, 4, 6, 7, 9, 10].map(index => timing.windup + actorFrames[index])
    : [];
  const paintPoints = [...new Set([
    timing.contact,
    ...timing.beats.map(({ time }) => time),
    ...keyDrawings,
    ...(score.family === 'cast' && !still ? [timing.windup + score.release] : []),
  ])].sort((a, b) => a - b);
  function startMove() {
    articulate();
    if (!still) {
      moveActor();
      if (score.family === 'cast') stageCasting();
      stageCombatProps({ scene, ghost, box: start, anchors: resolveFighterSkin(role, art.dataset.skin).anchors,
        role, tier: art.dataset.tier, clip, score, dir, frames: actorFrames, duration, at, tween });
      if (score.effect === 'eclipse')
        at(230, () => imprint('eclipse', centerX(start), centerY(start), start.h * 0.85, 560));
    }
  }
  if (!effectsOnly) {
    if (timing.windup) at(timing.windup, startMove);
    else startMove();
  }

  // The back row shares screen space with the turn rail and announcement.
  // Position the receipt after the announcement changes on this same beat.
  function placeLabel(subject, label) {
    const box = visibleBounds(subject);
    const w = label.offsetWidth, h = label.offsetHeight;
    const gap = 14; // includes the rise during the fade
    const hud = [...(arena.closest('.battle-shell')?.querySelectorAll('.scene-callout,.turn-rail,.round-meta') ?? [])].map(boxFor);
    const cx = centerX(box), side = cx < arena.clientWidth / 2 ? 1 : -1;
    const offset = box.w * 0.36 + w / 2;
    const candidates = [
      [cx, box.y + box.h * 0.1],
      [cx + side * offset, box.y + box.h * 0.54],
      [cx - side * offset, box.y + box.h * 0.54],
      [cx + side * offset, Math.max(box.y + box.h * 0.65, ...hud.map(r => r.y + r.h + h + gap))],
    ];
    for (const [x, y] of candidates) {
      const left = Math.max(4, Math.min(arena.clientWidth - w - 4, x - w / 2));
      const bottom = Math.max(h + gap, Math.min(arena.clientHeight - 6, y));
      label.style.left = (left + w / 2) + 'px';
      label.style.top = bottom + 'px';
      if (!hud.some(r => left < r.x + r.w + 4 && left + w > r.x - 4 &&
        bottom + 4 > r.y && bottom - h - gap < r.y + r.h)) break;
    }
  }
  const recoil = new Map();
  const reactions = new Map();
  function react(event) {
    const subject = seats.get(event.targetId);
    if (!subject) return;
    const direct = directOutcome(event, recap);
    const status = statusCue(event);
    const kind = effectFor(event, score, direct);
    const full = event === timing.primary || event.type === 'revival' || event.type === 'elimination';
    const wardHit = !still && (direct || status) && event.type === 'damage' && (kind === 'guard' || kind === 'fracture');
    // A ward records its own result just after physical contact; it never erases
    // the bottle breaking, blade hitting, or spell that caused that result.
    if (status) statusBurst(subject, status);
    else contactBurst(subject, wardHit ? score.effect : kind, event.amount, full);
    if (wardHit) at(108, () => contactBurst(subject, kind, event.amount, false));
    const blocked = event.type === 'damage' && event.shieldDamage && !event.healthDamage;
    const reaction = {
      damage: blocked ? 'guard' : 'hurt',
      elimination: 'fallen',
      revival: 'victory',
      heal: 'victory',
      shield: 'guard',
    }[event.type];
    // A caster drinking a tonic or bracing a shield finishes its own authored motion.
    if (reaction && (subject !== actor || event.type === 'elimination' || event.type === 'revival')) {
      reactions.set(subject, event);
      cut(subject, reaction);
      // Return the feet under the body before the victor's weapon returns home.
      // A subsequent impact or knockout owns the pose and supersedes this recovery.
      const body = subject === actor ? art : subject.sprite;
      const reactionClip = reaction === 'guard' ? 'brace' : reaction === 'hurt' ? 'hurt' : null;
      const illustrated = reactionClip && flipbook(body, reactionClip, [0, 15, 32, 46, 61, 78, 95, 135, 176, 227, 315, 402]);
      if (illustrated) {
        at(410, () => {
          if (reactions.get(subject) === event) cut(subject, 'idle');
        });
      } else if (!still && reaction !== 'fallen') {
        if (reaction === 'hurt')
          at(142, () => {
            if (reactions.get(subject) === event) cut(subject, 'guard');
          });
        at(280, () => {
          if (reactions.get(subject) === event) cut(subject, 'settle');
        });
        at(402, () => {
          if (reactions.get(subject) === event) cut(subject, 'idle');
        });
      }
    }
    if (!still && !status && event.type === 'damage' && subject !== actor) {
      const source = seats.get(event.actorId);
      const from = source ? centerX(visibleBounds(source)) : centerX(start);
      const sign = centerX(bounds(subject)) >= from ? 1 : -1;
      const reach =
        (blocked ? 0.36 : 1) *
        Math.min(score.track === 'bash' && direct ? 22 : 16, 4 + Math.sqrt(event.amount || 0) * 1.5);
      recoil.get(subject)?.cancel();
      recoil.set(
        subject,
        tween(
          subject.sprite,
          [
            { transform: 'translate(0,0) rotate(0deg)' },
            { transform: translated(sign * reach, -reach * 0.19, 1, sign * (blocked ? 2 : 5)), offset: 0.2 },
            { transform: translated(sign * reach * 0.66, 0, 0.992, sign * 2), offset: 0.47 },
            { transform: translated(-sign * reach * 0.09, 0, 1, -sign * 0.45), offset: 0.78 },
            { transform: 'translate(0,0) rotate(0deg)' },
          ],
          blocked ? 210 : 340,
        ),
      );
    }
    const text = badge(event);
    if (text || status) {
      labels.get(subject)?.remove();
      const label = part(scene, 'arena-fx-label');
      label.dataset.kind = event.type;
      if (status) {
        label.classList.add('arena-status-label');
        label.dataset.status = status.id;
        label.dataset.change = status.change;
        label.style.setProperty('--status-ink', status.ink);
        const title = part(label, 'arena-status-title');
        title.innerHTML = statusIcon(status.id);
        title.append(status.title);
        if (text) part(label, 'arena-status-value').textContent = text;
        const sources = event.statusSources;
        const source = seats.get(event.actorId)?.seat.querySelector('.fighter-title')?.textContent;
        if (sources?.length > 1) part(label, 'arena-fx-source').textContent = sources.length + ' sources';
        else if (source && event.actorId !== event.targetId) part(label, 'arena-fx-source').textContent = 'From ' + source;
      } else {
        label.textContent = text;
        const cause = causeNames[event.cause];
        if (cause && (!direct || event.timing !== 'action')) {
          const name = seats.get(event.actorId)?.seat.querySelector('.fighter-title')?.textContent;
          part(label, 'arena-fx-source').textContent = name ? cause + ' · ' + name : cause;
        }
      }
      const hold = status ? 660 : still ? 250 : 550;
      labels.set(subject, label);
      tween(
        label,
        [
          { opacity: 0, translate: '0 4px' },
          { opacity: 1, translate: '0 0', offset: 0.1 },
          { opacity: 1, translate: '0 -4px', offset: 0.74 },
          { opacity: 0, translate: '0 -12px' },
        ],
        hold,
      );
      at(hold, () => label.remove());
    }
    options.onCue?.({ action, role, effect: status?.sound ?? (wardHit ? score.effect : kind), event, first: event === timing.primary });
  }
  at(timing.contact, () => {
    scene.dataset.stage = 'impact';
    if (!effectsOnly && !timing.primary) {
      contactBurst(target, score.effect, 0);
      options.onCue?.({ action, role, effect: score.effect, event: null, first: true });
    }
  });
  timing.beats.forEach((beat, index) => {
    at(beat.time, () => {
      options.onBeat?.(beat, index, timing.beats.length);
      if (beat.event) {
        react(beat.event);
        const subject = seats.get(beat.event.targetId);
        const label = labels.get(subject);
        if (label?.isConnected) placeLabel(subject, label);
      }
      for (const event of beat.events) options.onImpact?.(event);
    });
  });
  at(
    Math.max(effectsOnly ? 0 : timing.windup + (still ? 360 : duration), timing.last + timing.tail),
    cancel,
  );
  document.addEventListener('visibilitychange', onVisibility);
  nextFrame = requestAnimationFrame(advance);
  return handle;
}
