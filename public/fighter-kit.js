import { CLASSES } from '../src/game/catalog.js';
import { isSkinId } from '../src/game/skin-id.js';

// Early Node 20 reads import assertions; browsers and later Node read attributes.
const { default: layout } = await import('./fighter-kit.json', {
  with: { type: 'json' }, assert: { type: 'json' },
});
export const fighterLayout = layout;
const skins = new Map();
const localSheet = /^\/assets\/skins\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(png|webp)$/;
const bitmapFields = [...Object.keys(layout.layers), 'portrait', 'model'];
const genericKit = { weapon: 'blade', emblem: 'sword', layers: [] };

const sockets = ['hand', 'mouth', 'ground', 'belt'];
const healthBands = new Set(layout.health.map(tier => tier.id));

function checkedAnchors(input, allowBands = true) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid fighter anchors');
  const anchors = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowBands && healthBands.has(key)) {
      anchors[key] = checkedAnchors(value, false);
    } else {
      if (!sockets.includes(key) || !Array.isArray(value) || value.length !== 2 ||
          !value.every(Number.isFinite) || value[0] < 0 || value[0] > layout.cell.width ||
          value[1] < 0 || value[1] > layout.cell.height) throw new Error('Invalid fighter anchor: ' + key);
      anchors[key] = Object.freeze([...value]);
    }
  }
  return Object.freeze(anchors);
}

const defaultAnchors = checkedAnchors(layout.defaultAnchors);
const classAnchors = new Map();

// A skin can override just the lowered chin on the critical drawing, while
// its other grips continue to follow the class artist's measured positions.
export function fighterAnchors(role, tier, skinAnchors) {
  const band = healthBands.has(tier) ? tier : 'healthy';
  const base = classAnchors.get(role);
  function point(key) {
    return skinAnchors?.[band]?.[key] ?? skinAnchors?.[key] ?? base?.[band]?.[key] ?? base?.[key] ?? defaultAnchors[band][key];
  }
  return { hand: point('hand'), mouth: point('mouth'), ground: point('ground') };
}

export function fighterKit(classId) {
  return Object.hasOwn(layout.founders, classId) ? layout.founders[classId] : genericKit;
}

export function registerFighterSkin(classId, id, skin, motions, footwork, ambient) {
  // The positional form is retained for existing skin packs.
  const descriptor = typeof skin === 'string' ? { sheet: skin, motions, footwork, ambient } : skin;
  if (!Object.hasOwn(CLASSES, classId) || !isSkinId(id) || !descriptor?.sheet) {
    throw new Error('A skin needs a known class, a simple ID and a standing sheet.');
  }
  const displayName = typeof descriptor.name === 'string' ? descriptor.name.trim() : '';
  const entry = { classId, id, name: displayName || id.replaceAll('-', ' ').replace(/(^| )\w/g, c => c.toUpperCase()) };
  for (const field of bitmapFields) {
    const url = descriptor[field];
    if (url === undefined) continue;
    if (typeof url !== 'string' || !localSheet.test(url)) throw new Error('Invalid local skin image: ' + field);
    entry[field] = url;
  }
  if (descriptor.anchors !== undefined) entry.anchors = checkedAnchors(descriptor.anchors);
  skins.set(classId + '/' + id, Object.freeze(entry));
}

for (const { id } of Object.values(CLASSES)) {
  const base = '/assets/skins/' + id + '-';
  const descriptor = { sheet: base + 'founder.png' };
  const kit = fighterKit(id);
  if (kit.anchors) classAnchors.set(id, checkedAnchors(kit.anchors));
  for (const layer of kit.layers) descriptor[layer] = base + layer + '.webp';
  registerFighterSkin(id, 'founder', descriptor);
}
for (const skin of layout.skins) registerFighterSkin(skin.classId, skin.id, skin);

export function fighterSkins(classId) {
  return [...skins.values()].filter(skin => skin.classId === classId);
}

export function resolveFighterSkin(classId, skinId = 'founder') {
  const role = Object.hasOwn(CLASSES, classId) ? classId : 'guardian';
  return skins.get(role + '/' + skinId) ?? skins.get(role + '/founder');
}

export function fighterPortrait(player) {
  const skin = resolveFighterSkin(player.classId, player.skinId);
  return skin.portrait ?? '/assets/portrait-' + skin.classId + '.webp';
}
export function fighterModel(player) {
  const skin = resolveFighterSkin(player.classId, player.skinId);
  return skin.model ?? '/assets/' + skin.classId + '.png';
}

export function healthBand(player) {
  if (player.alive === false) return 'critical';
  if (!Number.isFinite(player.hp) || !(player.maxHp > 0)) return 'healthy';
  const ratio = player.hp / player.maxHp;
  return layout.health.find(tier => tier.above === undefined || ratio > tier.above).id;
}
