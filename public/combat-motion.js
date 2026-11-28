import { CLASSES, REWARDS } from '../src/game/catalog.js';
import { fighterKit } from './fighter-kit.js';

// Each landmark is [milliseconds, progress to opponent, forward offset in body
// widths, lift in body heights, lean in degrees]. The planted foot is the pivot.
const tracks = {
  swing: [
    [0, 0, 0, 0, 0],
    [135, 0, -0.055, 0.012, -5],
    [240, 0.33, 0, 0.055, -3],
    [350, 0.82, 0, 0.02, 1],
    [425, 1, 0, 0, 7],
    [495, 1, 0, 0, 3],
    [619, 1, -0.025, -0.022, -3],
    [708, 0.68, 0, 0.13, -4],
    [772, 0.49, 0, -0.012, 2],
    [841, 0.19, 0, 0.075, -3],
    [925, 0, 0, 0, 0],
  ],
  bash: [
    [0, 0, 0, 0, 0],
    [145, 0, -0.045, 0, -5],
    [255, 0, -0.1, -0.025, -9],
    [300, 0.07, 0, -0.025, 5],
    [408, 0.55, 0, -0.012, 10],
    [495, 1, 0, 0, 12],
    [570, 1, 0, 0, 9],
    [681, 1, -0.024, -0.025, -3],
    [779, 0.75, 0, 0.095, -5],
    [877, 0.5, 0, -0.022, 2],
    [979, 0.19, 0, 0.077, -3],
    [1130, 0, 0, 0, 0],
  ],
  cleave: [
    [0, 0, 0, 0, 0],
    [145, 0, -0.065, 0.02, -8],
    [245, 0.12, 0, -0.015, -10],
    [365, 0.56, 0, 0.13, -6],
    [465, 0.93, 0, 0.11, 0],
    [530, 1, 0, 0, 10],
    [655, 1, 0, -0.02, 5],
    [725, 1, -0.024, -0.023, -3],
    [829, 0.71, 0, 0.16, -6],
    [900, 0.49, 0, -0.025, 2],
    [1008, 0.18, 0, 0.12, -4],
    [1145, 0, 0, 0, 0],
  ],
  needle: [
    [0, 0, 0, 0, 0],
    [126, 0, -0.055, -0.022, -3],
    [205, 0.14, 0, 0, 1],
    [308, 1, 0, 0.03, 8],
    [358, 0.99, 0, 0.018, 5],
    [475, 0.55, 0, 0.04, -5],
    [655, 0.025, 0, 0, 0],
    [705, 0, 0, 0, 0],
  ],
  'card-flick': [
    [0,0,0,0,0], [116,0,-.012,.016,-3], [228,0,-.05,.035,-7],
    [308,0,.07,.026,8], [386,0,.053,.01,5], [510,0,-.01,.008,-1], [790,0,0,0,0],
  ],
  'soul-thread': [
    [0,0,0,0,0], [218,0,.025,.018,3], [420,0,.062,.035,6],
    [498,0,.045,.042,3], [610,0,-.08,.012,-7], [762,0,-.035,0,-4], [990,0,0,0,0],
  ],
  'mirror-feint': [
    [0,0,0,0,0], [123,.07,-.025,.029,-4], [218,.39,0,.06,2],
    [285,.23,0,-.018,-7], [400,.79,0,.042,3], [455,1,0,0,9],
    [518,.91,0,.022,2], [641,.52,0,.07,-4], [748,.17,0,.014,-2], [850,0,0,0,0],
  ],
  'rivet-drive': [
    [0,0,0,0,0], [153,0,-.044,-.018,-4], [282,.05,-.086,-.047,-9],
    [345,.22,0,-.04,1], [445,.82,0,.018,6], [489,1,0,.044,10],
    [554,.99,0,.006,8], [688,.92,0,-.018,-2], [795,.6,0,.065,-5], [940,.22,0,.036,-2], [1030,0,0,0,0],
  ],
  dial: [
    [0, 0, 0, 0, 0],
    [220, 0, -0.018, 0.022, -3],
    [386, 0, -0.035, 0.05, -5],
    [450, 0, 0.035, 0.04, 3],
    [760, 0, 0, 0.018, 0],
    [980, 0, 0, 0, 0],
  ],
  throw: [
    [0, 0, 0, 0, 0],
    [155, 0, -0.025, -0.012, -3],
    [320, 0, -0.075, 0.024, -10],
    [405, 0, 0.055, 0.04, 7],
    [490, 0, 0.08, 0.005, 12],
    [680, 0, 0.015, 0, 2],
    [860, 0, 0, 0, 0],
  ],
  kindle: [
    [0, 0, 0, 0, 0],
    [235, 0, -0.025, -0.012, -4],
    [390, 0, -0.045, 0.014, -5],
    [450, 0, 0.054, 0.025, 5],
    [640, 0, 0.023, 0.005, 2],
    [925, 0, 0, 0, 0],
  ],
  summon: [
    [0, 0, 0, 0, 0],
    [150, 0, -0.02, -0.025, -3],
    [345, 0, 0, 0.044, -3],
    [500, 0, 0.025, 0.038, 2],
    [760, 0, 0.015, -0.008, 2],
    [990, 0, 0, 0, 0],
  ],
  brace: [
    [0, 0, 0, 0, 0],
    [155, 0, -0.026, -0.026, -4],
    [315, 0, 0.056, -0.035, 6],
    [560, 0, 0.05, -0.026, 4],
    [840, 0, 0, 0, 0],
  ],
  scavenge: [
    [0, 0, 0, 0, 0],
    [145, 0, 0.008, -0.002, 1],
    [320, 0, 0.018, -0.005, 2],
    [490, 0, 0.024, -0.006, 3],
    [685, 0, 0.008, 0.003, -1],
    [935, 0, 0, 0, 0],
  ],
  sip: [
    [0, 0, 0, 0, 0],
    [130, 0, 0.016, -0.012, 1],
    [310, 0, -0.018, 0.006, -5],
    [490, 0, -0.036, 0.014, -7],
    [630, 0, 0, 0, 2],
    [810, 0, 0, 0, 0],
  ],
  ring: [
    [0, 0, 0, 0, 0],
    [170, 0, -0.024, 0.018, -4],
    [320, 0, 0.045, 0.025, 5],
    [400, 0, -0.012, 0.005, -2],
    [560, 0, 0.015, 0, 2],
    [780, 0, 0, 0, 0],
  ],
  stagger: [
    [0, 0, 0, 0, 0],
    [110, 0, -0.085, 0.008, -9],
    [260, 0, -0.055, -0.03, -5],
    [410, 0, 0.01, -0.01, 2],
    [680, 0, 0, 0, 0],
  ],
};

// A move combines a body clip, travel track and impact/release landmarks.
// Repeated weapons, spells and consumables reuse these beats with a new element or prop.
const score = (family, gesture, effect, track, clip, contact, release = contact) =>
  Object.freeze({ family, gesture, effect, track, clip, contact, release, path: tracks[track] });

const moves = {
  'card-flick':   score('cast', 'throw', 'arcane', 'card-flick', 'cast', 608, 308),
  'soul-thread':  score('cast', 'cast', 'doom', 'soul-thread', 'cast', 610, 420),
  'mirror-feint': score('melee', 'attack', 'slash', 'mirror-feint', 'attack', 455),
  'rivet-drive':  score('melee', 'attack', 'bastion', 'rivet-drive', 'attack', 489),
  swing:     score('melee', 'attack', 'slash', 'swing', 'attack', 425),
  bash:      score('melee', 'attack', 'bastion', 'bash', 'attack', 495),
  cleave:    score('melee', 'attack', 'cleave', 'cleave', 'attack', 530),
  thrust:    score('melee', 'attack', 'slash', 'needle', 'attack', 308),
  bolt:      score('cast', 'cast', 'arcane', 'dial', 'cast', 728, 450),
  throw:     score('cast', 'throw', 'arcane', 'throw', 'cast', 785, 405),
  orb:       score('cast', 'cast', 'fire', 'kindle', 'cast', 766, 450),
  eruption:  score('cast', 'cast', 'fire', 'summon', 'cast', 685, 475),
  wave:      score('cast', 'cast', 'frost', 'summon', 'cast', 808, 465),
  knell:     score('cast', 'cast', 'doom', 'ring', 'cast', 738, 320),
  brace:     score('support', 'guard', 'guard', 'brace', 'brace', 315),
  invoke:    score('support', 'cast', 'arcane', 'summon', 'cast', 500),
  ring:      score('support', 'use', 'heal', 'ring', 'consume', 320),
  drink:     score('support', 'drink', 'arcane', 'sip', 'consume', 420),
  use:       score('support', 'use', 'arcane', 'ring', 'consume', 425),
  scavenge:  score('support', 'scavenge', 'loot', 'scavenge', 'utility', 490),
  stagger:   score('interrupted', 'hurt', 'cleave', 'stagger', 'hurt', 110),
};
const coreMoves = { defend: 'brace', scavenge: 'scavenge', interrupted: 'stagger' };
const elemental = { burn: 'fire', chill: 'frost', freeze: 'frost', poison: 'venom', shock: 'shock', doom: 'doom', curse: 'doom' };
export const effectRows = [
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
export const missiles = ['arcane', 'venom', 'fire', 'frost', 'doom', 'shock'];

function weaponStrike(role) {
  const weapon = fighterKit(role).weapon;
  if (weapon === 'dagger') return moves.thrust;
  return weapon === 'saber' ? { ...moves.swing, effect: 'cleave' } : moves.swing;
}

function inferMove(reward, self) {
  if (reward.category === 'consumable') {
    if (!self) return 'throw';
    return reward.icon === 'flask' || reward.icon === 'heart' ? 'drink' : 'use';
  }
  if (self) return reward.category === 'item' ? 'use' : 'invoke';
  const hit = reward.effects?.find(e => e.kind === 'hit' || e.kind === 'consumeHit');
  if (hit?.scale === 'armor') return 'bash';
  if (hit?.scale === 'attack' || reward.tags?.includes('physical')) return 'weapon';
  if (hit?.kind === 'consumeHit') return 'eruption';
  if (reward.icon === 'flask') return 'throw';
  if (reward.icon === 'fire') return 'orb';
  return 'bolt';
}

export function rewardMotion(reward, role, self = reward.target === 'self') {
  const art = reward.presentation || {};
  const move = art.move ?? inferMove(reward, self);
  const base = move === 'weapon' ? weaponStrike(role) : moves[move];
  if (!base) throw new Error('Unknown animation move for ' + reward.id + ': ' + move);
  const effects = reward.effects || [];
  const status = effects.find(e => e.kind === 'status' || e.kind === 'consumeHit');
  const element = elemental[status?.key];
  let effect = art.effect;
  if (!effect && base.family !== 'melee') {
    if (effects.some(e => e.kind === 'shield')) effect = 'ward';
    else if (effects.some(e => ['heal', 'cleanse', 'purify'].includes(e.kind))) effect = 'heal';
    else effect = element;
  }
  effect ??= base.effect;
  if (!effectRows.includes(effect)) throw new Error('Unknown impact art for ' + reward.id + ': ' + effect);
  return {
    ...base, move, effect,
    missile: missiles.includes(effect) ? effect : 'arcane',
    prop: art.prop ?? (base.gesture === 'drink' ? 'flask' : undefined),
  };
}

export function motionScore(actionId, role, self = false) {
  if (Object.hasOwn(coreMoves, actionId)) return moves[coreMoves[actionId]];
  if (actionId === 'attack') return weaponStrike(role);
  if (Object.hasOwn(REWARDS, actionId)) return rewardMotion(REWARDS[actionId], role);
  // Replays may refer to removed rewards.
  return self ? moves.invoke : weaponStrike(role);
}

export function actorClip(score, actionId, role) {
  return Object.hasOwn(CLASSES, role) && CLASSES[role].ability === actionId ? 'signature' : score.clip;
}

export const impactCauses = {
  burn: 'fire',
  'arena-fire': 'fire',
  bleed: 'bleed',
  poison: 'miasma',
  doom: 'doom',
  curse: 'doom',
  shock: 'shock',
  chill: 'frost',
  freeze: 'frost',
  retaliation: 'thorns',
  echo: 'echo',
};
