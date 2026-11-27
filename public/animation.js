import { isSkinId } from '../src/game/skin-id.js';
import { actorClip, impactCauses, motionScore } from './combat-motion.js';

// Sheets face right. Each of the three health bands repeats the same twelve
// poses in four columns. A cosmetic can replace the artwork without touching rules.
const roles = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
const skins = new Map();
const localSheet = /^\/assets\/skins\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(png|webp)$/;
const readySheets = new Set();
export function registerFighterSkin(classId, id, sheet, motions) {
  if (
    !roles.includes(classId) ||
    !isSkinId(id) ||
    !localSheet.test(sheet) ||
    (motions !== undefined && !localSheet.test(motions))
  ) {
    throw new Error('A skin needs a known class, a simple ID and local sprite sheets.');
  }
  skins.set(classId + '/' + id, Object.freeze({ classId, id, sheet, ...(motions ? { motions } : {}) }));
}
for (const role of roles) registerFighterSkin(role, 'founder', '/assets/skins/' + role + '-founder.png');

export function resolveFighterSkin(classId, skinId = 'founder') {
  const role = roles.includes(classId) ? classId : 'guardian';
  return skins.get(role + '/' + skinId) ?? skins.get(role + '/founder');
}
export function healthBand(player) {
  if (player.alive === false) return 'critical';
  if (!Number.isFinite(player.hp) || !(player.maxHp > 0)) return 'healthy';
  const fraction = player.hp / player.maxHp;
  return fraction <= 0.3 ? 'critical' : fraction <= 0.65 ? 'wounded' : 'healthy';
}
const poses = [
  'idle',
  'breathe',
  'survey',
  'settle',
  'windup',
  'strike',
  'channel',
  'release',
  'guard',
  'hurt',
  'fallen',
  'victory',
];
function pose(element, name) {
  delete element.dataset.track;
  element.style.removeProperty('--clip-row');
  const index = poses.indexOf(name);
  element.dataset.pose = name;
  element.style.setProperty('--pose-x', ((index % 4) / 3) * 100 + '%');
  element.style.setProperty('--pose-y', Math.floor(index / 4) * 12.5 + '%');
}
export function fighterSpriteHTML(player, { skinId = player.skinId, reducedMotion = false } = {}) {
  const skin = resolveFighterSkin(player.classId, skinId);
  const band = healthBand(player);
  const fallen = player.alive === false || player.hp === 0;
  const seed = Array.from(String(player.id ?? skin.classId)).reduce(
    (n, c) => (31 * n + c.charCodeAt(0)) >>> 0,
    0,
  );
  const motion = skin.motions
    ? ' data-motion-src="' + skin.motions + '"' + (readySheets.has(skin.motions) ? ' data-motion-ready' : '')
    : '';
  const style =
    '--skin:url(' +
    skin.sheet +
    ');' +
    (skin.motions ? '--motion-skin:url(' + skin.motions + ');' : '') +
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
    ' style="' +
    style +
    '"><span class="arena-cel"></span></span>'
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
    ...players.flatMap((p) => {
      const skin = resolveFighterSkin(p.classId, p.skinId);
      return skin.motions ? [skin.sheet, skin.motions] : [skin.sheet];
    }),
  ]);
  return Promise.all(
    Array.from(urls, (url) => {
      if (!images.has(url)) {
        const image = new Image();
        images.set(
          url,
          new Promise((resolve) => {
            image.onload = () => {
              readySheets.add(url);
              document
                .querySelectorAll('[data-motion-src="' + url + '"]')
                .forEach((el) => el.setAttribute('data-motion-ready', ''));
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

const effectRows = [
  'slash',
  'cleave',
  'bastion',
  'arcane',
  'venom',
  'fire',
  'frost',
  'doom',
  'heal',
  'guard',
  'shock',
  'loot',
  'revival',
  'fracture',
  'dust',
  'bleed',
  'thorns',
  'eclipse',
  'ward',
  'echo',
  'miasma',
];
const missiles = ['arcane', 'venom', 'fire', 'frost', 'doom', 'shock'];
export function actionVisual(actionId, classId, self = false) {
  const score = motionScore(actionId, classId, self);
  return { motion: score.family, effect: score.effect };
}
const animatedEvents = new Set(['damage', 'shield', 'heal', 'revival', 'elimination', 'status']);
function visualBeats(recap) {
  const eligible = (recap.events ?? []).filter((event) => event.targetId && animatedEvents.has(event.type));
  // Hundreds of simultaneous status messages can come from a round boundary.
  // Preserve the public ordering of selected beats and always prioritize deaths/reactions.
  if (eligible.length <= 6) return eligible;
  const chosen = new Set([eligible[0]]);
  for (const event of eligible) {
    if (chosen.size < 6 && ['revival', 'elimination'].includes(event.type)) chosen.add(event);
  }
  for (const event of eligible) {
    if (chosen.size < 6 && event.type !== 'status') chosen.add(event);
  }
  for (const event of eligible) if (chosen.size < 6) chosen.add(event);
  return eligible.filter((event) => chosen.has(event));
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
const clipRows = ['idle', 'attack', 'signature', 'cast', 'utility'];
const propIcons = {
  'red-tonic': 'tonic',
  antidote: 'antidote',
  'widows-brew': 'flask',
  'ward-lantern': 'lantern',
  'menders-bell': 'bell',
  'grave-bell': 'bell',
};
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

  function bounds(subject) {
    // Read the stable footprint, even while the painted layer recoils. Recompute
    // for bursts so an intervening resize still anchors them on the correct body.
    const rect = arena.getBoundingClientRect();
    const r = (subject.sprite.closest('.fighter-art') ?? subject.seat).getBoundingClientRect();
    const kx = arena.clientWidth / (rect.width || 1),
      ky = arena.clientHeight / (rect.height || 1);
    return { x: (r.left - rect.left) * kx, y: (r.top - rect.top) * ky, w: r.width * kx, h: r.height * ky };
  }
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

  const originals = new Map(),
    labels = new Map();
  const animations = [],
    timers = [];
  let finishedScene = false,
    resolve,
    clipAnimation;
  const finished = new Promise((done) => {
    resolve = done;
  });
  function cancel() {
    if (finishedScene) return;
    finishedScene = true;
    timers.forEach(clearTimeout);
    for (const animation of animations) animation.cancel();
    for (const [element, oldPose] of originals) pose(element, oldPose);
    delete actor.seat.dataset.travelling;
    delete actor.sprite.dataset.playing;
    scene.remove();
    running.delete(arena);
    resolve();
  }
  const handle = { finished, cancel };
  running.set(arena, handle);
  // Timers drive public event order. Compositor movement shares one clock so a
  // late frame cannot leave a released flask halfway to a hit that already landed.
  const epoch = performance.now(),
    timelineStart = document.timeline?.currentTime;
  let cueTime = 0;
  function at(delay, run) {
    const due = cueTime + delay;
    timers.push(
      setTimeout(
        () => {
          if (finishedScene) return;
          cueTime = due;
          try {
            run();
          } finally {
            cueTime = 0;
          }
        },
        Math.max(0, epoch + due / speed - performance.now()),
      ),
    );
  }
  function tween(element, frames, ms, easing = 'linear') {
    if (!element.animate || still) return;
    const animation = element.animate(frames, { duration: ms / speed, easing, fill: 'forwards' });
    if (typeof timelineStart === 'number') animation.startTime = timelineStart + cueTime / speed;
    animations.push(animation);
    return animation;
  }
  function cut(subject, name) {
    const element = subject === actor ? art : subject.sprite;
    if (subject === actor) clipAnimation?.cancel();
    else if (!originals.has(element)) originals.set(element, element.dataset.pose);
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
  function contactBurst(subject, kind, amount, full = true) {
    const box = bounds(subject);
    const emphasis = full ? (kind === 'venom' ? 1.19 : 0.91) : 0.58;
    const size = Math.max(34, Math.min(205, box.h * impactScale(amount) * emphasis));
    return imprint(kind, centerX(box), centerY(box), size, still ? 245 : full ? 370 : 305);
  }
  function heldIcon(icon, fromMs, untilMs) {
    at(fromMs, () => {
      const obj = part(ghost, 'arena-fx-prop'),
        size = start.h * 0.27;
      obj.style.backgroundImage = 'url(/assets/i-' + icon + '.png)';
      positioned(obj, start.w * (dir > 0 ? 0.7 : 0.3) - size / 2, start.h * 0.5 - size / 2, size, size);
      const lift = score.track === 'sip' ? 0.22 : 0.13;
      tween(
        obj,
        [
          { opacity: 0, transform: translated(0, 0, 0.8) },
          {
            opacity: 1,
            transform: translated(-dir * start.w * 0.05, -start.h * lift, 1, dir * -22),
            offset: 0.5,
          },
          {
            opacity: 1,
            transform: translated(-dir * start.w * 0.1, -start.h * lift, 1, dir * -36),
            offset: 0.76,
          },
          { opacity: 0, transform: translated(0, 0, 0.85) },
        ],
        untilMs - fromMs,
      );
      at(untilMs - fromMs, () => obj.remove());
    });
  }

  const clip = actorClip(score, action, role);
  const duration = score.path.at(-1)[0];
  function articulate() {
    const lead = score.family === 'cast' ? score.release : score.contact;
    if (!still && art.hasAttribute('data-motion-ready') && clipRows.includes(clip)) {
      art.dataset.track = clip;
      art.dataset.pose = 'perform';
      art.style.setProperty('--clip-row', (clipRows.indexOf(clip) / 14) * 100 + '%');
      const frames = [0, 0.2, 0.37, 0.53, 0.67, 0.8, 0.91, 1].map((t) => t * lead);
      for (const t of [0.14, 0.37, 0.68, 1]) frames.push(lead + t * (duration - lead));
      clipAnimation = tween(
        art.querySelector('.arena-cel'),
        frames.map((ms, i) => ({
          offset: ms / duration,
          backgroundPositionX: (i / 11) * 100 + '%',
          easing: 'steps(1,end)',
        })),
        duration,
      );
      return;
    }
    const guard = score.track === 'bash' || score.track === 'brace';
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

  function moveActor() {
    const melee = score.family === 'melee';
    const distance = Math.hypot(horizontal, centerY(end) - centerY(start)) || 1;
    const reach = score.track === 'bash' ? 0.3 : score.track === 'needle' ? 0.53 : 0.46;
    const stop = Math.min(distance * 0.38, end.w * reach);
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
      at(pushTime, () => imprint('dust', centerX(start), start.y + start.h * 0.99, start.w * 0.72, 330));
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
    const kind = score.effect;
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
    if (action === 'combustion') {
      at(score.release, () => imprint('fire', centerX(end), end.y + end.h * 0.75, end.h * 0.58, 300));
    } else if (action === 'whiteout') {
      for (const t of [0.22, 0.47, 0.72]) {
        at(score.release + (score.contact - score.release) * t, () => {
          const x = hand.x + (centerX(end) - hand.x) * t;
          const y = start.y + start.h + (end.y + end.h - start.y - start.h) * t;
          imprint('frost', x, y - end.h * 0.19, end.h * (0.43 + t * 0.24), 280);
        });
      }
    } else if (action === 'grave-bell') {
      at(170, () => imprint('doom', hand.x, hand.y, start.h * 0.52, 445));
      at(score.release + 105, () => imprint('doom', centerX(end), centerY(end), end.h * 0.57, 355));
    } else {
      if (score.track !== 'throw') {
        at(Math.round(score.release * 0.47), () =>
          imprint(score.effect, hand.x, hand.y, start.h * 0.42, score.release * 0.58),
        );
      }
      at(score.release, launch);
    }
  }
  const beats = visualBeats(recap);
  const contact = still ? 40 : score.contact;
  const step = still ? 70 : Math.min(268, 810 / Math.max(1, beats.length - 1));
  articulate();
  if (!still) {
    moveActor();
    if (score.family === 'cast') stageCasting();
    if (propIcons[action]) heldIcon(propIcons[action], 80, Math.min(duration - 45, score.contact + 180));
    if (score.track === 'bash' && role !== 'guardian') heldIcon('shield', 65, score.contact + 165);
    if (score.track === 'scavenge')
      at(300, () =>
        imprint('loot', centerX(start) + dir * start.w * 0.23, start.y + start.h * 0.88, start.h * 0.5, 515),
      );
    if (action === 'pocket-eclipse')
      at(230, () => imprint('eclipse', centerX(start), centerY(start), start.h * 0.85, 560));
  }

  const recoil = new Map();
  function react(event, index) {
    const subject = seats.get(event.targetId);
    if (!subject) return;
    const direct =
      event.targetId === recap.targetId &&
      event.timing !== 'turn' &&
      event.timing !== 'round' &&
      (!event.actorId || event.actorId === recap.actorId);
    const kind = effectFor(event, score, direct);
    const full = index === 0 || event.type === 'revival' || event.type === 'elimination';
    contactBurst(subject, kind, event.amount, full);
    const blocked = event.type === 'damage' && event.shieldDamage && !event.healthDamage;
    const reaction = {
      damage: blocked ? 'guard' : 'hurt',
      elimination: 'fallen',
      revival: 'victory',
      heal: 'victory',
      shield: 'guard',
    }[event.type];
    // A caster drinking a tonic or bracing a shield finishes its own authored motion.
    if (reaction && (subject !== actor || event.type === 'elimination' || event.type === 'revival'))
      cut(subject, reaction);
    if (!still && event.type === 'damage' && subject !== actor) {
      const source = seats.get(event.actorId);
      const from = source ? centerX(bounds(source)) : centerX(start);
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
    if (text) {
      labels.get(subject)?.remove();
      const box = bounds(subject),
        label = part(scene, 'arena-fx-label');
      label.dataset.kind = event.type;
      label.textContent = text;
      const cause = causeNames[event.cause];
      if (cause && (!direct || event.timing !== 'action')) {
        const name = seats.get(event.actorId)?.seat.querySelector('.fighter-title')?.textContent;
        const byline = part(label, 'arena-fx-source');
        byline.textContent = name ? cause + ' · ' + name : cause;
      }
      label.style.left = centerX(box) + 'px';
      label.style.top = Math.max(24, box.y + box.h * 0.1) + 'px';
      labels.set(subject, label);
      tween(
        label,
        [
          { opacity: 0, translate: '0 4px' },
          { opacity: 1, translate: '0 0', offset: 0.1 },
          { opacity: 1, translate: '0 -4px', offset: 0.74 },
          { opacity: 0, translate: '0 -12px' },
        ],
        550,
      );
      at(still ? 250 : 550, () => label.remove());
    }
    options.onImpact?.(event);
  }
  at(contact, () => {
    scene.dataset.stage = 'impact';
    if (!beats.length) contactBurst(target, score.effect, 0);
  });
  beats.forEach((event, index) => at(contact + index * step, () => react(event, index)));
  at(
    Math.max(still ? 360 : duration, contact + Math.max(0, beats.length - 1) * step + (still ? 275 : 555)),
    cancel,
  );
  return handle;
}
