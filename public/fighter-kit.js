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

export function fighterKit(classId) {
  return Object.hasOwn(layout.founders, classId) ? layout.founders[classId] : genericKit;
}

export function registerFighterSkin(classId, id, skin, motions, footwork, ambient) {
  // The positional form is retained for existing skin packs.
  const descriptor = typeof skin === 'string' ? { sheet: skin, motions, footwork, ambient } : skin;
  if (!Object.hasOwn(CLASSES, classId) || !isSkinId(id) || !descriptor?.sheet) {
    throw new Error('A skin needs a known class, a simple ID and a standing sheet.');
  }
  const entry = { classId, id };
  for (const field of bitmapFields) {
    const url = descriptor[field];
    if (url === undefined) continue;
    if (typeof url !== 'string' || !localSheet.test(url)) throw new Error('Invalid local skin image: ' + field);
    entry[field] = url;
  }
  if (descriptor.anchors) {
    const anchors = {};
    for (const [key, point] of Object.entries(descriptor.anchors)) {
      if (!['mouth', 'hand', 'ground'].includes(key) || !Array.isArray(point) || point.length !== 2 ||
          !point.every(Number.isFinite) || point[0] < 0 || point[0] > layout.cell.width ||
          point[1] < 0 || point[1] > layout.cell.height) throw new Error('Invalid fighter anchor: ' + key);
      anchors[key] = Object.freeze([...point]);
    }
    entry.anchors = Object.freeze(anchors);
  }
  skins.set(classId + '/' + id, Object.freeze(entry));
}

for (const { id } of Object.values(CLASSES)) {
  const base = '/assets/skins/' + id + '-';
  const descriptor = { sheet: base + 'founder.png' };
  for (const layer of fighterKit(id).layers) descriptor[layer] = base + layer + '.webp';
  registerFighterSkin(id, 'founder', descriptor);
}
for (const skin of layout.skins) registerFighterSkin(skin.classId, skin.id, skin);

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
