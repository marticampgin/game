import { CLASSES, RARITIES, REWARDS } from './catalog.js';

export function seedNumber(seed) {
  let value = 2166136261;
  for (const char of String(seed)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  // Avalanche adjacent seat IDs and adjacent seeds before deriving a preference.
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

// Mulberry32 uses only 32-bit arithmetic and survives a JSON save/reload.
export function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let x = state.rng;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

export const sample = (state, items) => items[Math.floor(random(state) * items.length)];
export function shuffled(state, items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function modifiedSlot(player, modifier) {
  return player.abilities.find(slot => !slot.modifiers.includes(modifier) &&
    REWARDS[slot.id].effects.some(effect => ['hit','consumeHit'].includes(effect.kind)));
}
export function eligible(player, reward) {
  if (reward.exclusive && reward.exclusive !== player.classId) return false;
  if (reward.category === 'modifier') return Boolean(modifiedSlot(player, reward.modifier));
  if (reward.category === 'artifact') return !player.artifacts.includes(reward.id);
  if (['ability','item'].includes(reward.category)) return !player.abilities.some(slot => slot.id === reward.id);
  return true;
}

export function rarityWeights(config, round) {
  const points = config.rarityCurve;
  const upper = points.findIndex(row => row[0] >= round);
  if (upper < 0) return points.at(-1).slice(1);
  if (upper === 0) return points[0].slice(1);
  const a = points[upper - 1], b = points[upper];
  const t = (round - a[0]) / (b[0] - a[0]);
  return a.slice(1).map((w,i) => w + t * (b[i + 1] - w));
}

function weighted(state, values, weights) {
  let roll = random(state) * weights.reduce((sum,w) => sum + w, 0);
  for (let i = 0; i < values.length; i++) {
    roll -= weights[i];
    if (roll < 0) return values[i];
  }
  return values.at(-1);
}

export function resonance(player, reward) {
  const build = [...player.artifacts, ...player.abilities.map(a => a.id), ...player.consumables].map(id => REWARDS[id]);
  const produced = new Set(build.flatMap(r => r.produces));
  const consumed = new Set(build.flatMap(r => r.consumes));
  for (const [stat, tag] of [['armor','armor'],['attack','attack'],['spellPower','spell']]) {
    if (player[stat] >= 10) produced.add(tag);
  }
  return Number(reward.produces.some(tag => consumed.has(tag))) +
    Number(reward.consumes.some(tag => produced.has(tag)));
}
export const armorPromotionChance = armor => Math.min(0.35,Math.floor(armor / 20) * 0.05);

export function drawOffers(state, player) {
  const result = [];
  const { config } = state;
  const candidates = Object.values(REWARDS).filter(r => eligible(player,r));
  for (let i = 0; i < 3; i++) {
    const left = candidates.filter(r => !result.includes(r.id));
    let tier = weighted(state, RARITIES, rarityWeights(config,state.round));
    if (player.artifacts.some(id => REWARDS[id].armorFortune) &&
        random(state) < armorPromotionChance(player.armor)) {
      tier = RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(tier) + 1)];
    }
    const sameRarity = left.filter(r => r.rarity === tier);
    const eligibleTier = sameRarity.length ? sameRarity : left;
    const universal = eligibleTier.filter(r => !r.exclusive);
    const roll = random(state);
    let pool = universal;
    if (roll < config.exclusiveChance) pool = eligibleTier.filter(r => r.exclusive === player.classId);
    else if (roll < config.exclusiveChance + config.favoredChance) {
      pool = universal.filter(r => r.tags.some(tag => CLASSES[player.classId].favored.includes(tag)));
    }
    if (!pool.length) pool = universal.length ? universal : eligibleTier;
    const adaptive = i >= 3 - config.adaptiveSlots;
    const chosen = weighted(state, pool, pool.map(r => 1 + (adaptive ? resonance(player,r) * config.resonanceWeight : 0)));
    result.push(chosen.id);
  }
  return shuffled(state,result);
}
