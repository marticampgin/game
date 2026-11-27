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
    [595, 0.87, 0, 0.018, -2],
    [805, 0.16, 0, 0.035, -1],
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
    [690, 0.92, 0, 0.015, -4],
    [805, 0.73, 0, 0.02, -3],
    [1000, 0.18, 0, 0.025, -1],
    [1130, 0, 0, 0, 0],
  ],
  cleave: [
    [0, 0, 0, 0, 0],
    [145, 0, -0.065, 0.02, -8],
    [245, 0.12, 0, -0.015, -10],
    [365, 0.56, 0, 0.13, -6],
    [465, 0.93, 0, 0.11, 0],
    [530, 1, 0, 0, 10],
    [655, 0.96, 0, -0.012, 7],
    [825, 0.72, 0, 0.02, -3],
    [1030, 0.12, 0, 0.025, -1],
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
    [145, 0, 0.03, -0.03, 5],
    [320, 0, 0.09, -0.1, 13],
    [490, 0, 0.14, -0.11, 15],
    [685, 0, 0.04, 0.018, -4],
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

const score = (family, effect, track, clip, contact, release = contact) =>
  Object.freeze({ family, effect, track, clip, contact, release, path: tracks[track] });

const swing = score('melee', 'slash', 'swing', 'attack', 425);
const axe = score('melee', 'cleave', 'swing', 'attack', 425);
const sigils = {
  'bastion-bash': score('melee', 'bastion', 'bash', 'signature', 495),
  'blood-cleave': score('melee', 'cleave', 'cleave', 'signature', 530),
  'hollow-needle': score('melee', 'slash', 'needle', 'attack', 308),
  'time-bolt': score('cast', 'arcane', 'dial', 'signature', 728, 450),
  'venom-flask': score('cast', 'venom', 'throw', 'signature', 785, 405),
  'spark-bottle': score('cast', 'shock', 'throw', 'cast', 753, 405),
  'cinder-orb': score('cast', 'fire', 'kindle', 'cast', 766, 450),
  combustion: score('cast', 'fire', 'summon', 'cast', 685, 475),
  whiteout: score('cast', 'frost', 'summon', 'cast', 808, 465),
  'grave-bell': score('cast', 'doom', 'ring', 'cast', 738, 320),
  defend: score('support', 'guard', 'brace', 'brace', 315),
  'ward-lantern': score('support', 'ward', 'summon', 'cast', 500),
  'menders-bell': score('support', 'heal', 'ring', 'utility', 320),
  'red-tonic': score('support', 'heal', 'sip', 'utility', 420),
  antidote: score('support', 'heal', 'sip', 'utility', 450),
  'reverse-polarity': score('support', 'heal', 'summon', 'cast', 500),
  'pocket-eclipse': score('support', 'eclipse', 'dial', 'cast', 490),
  'widows-brew': score('support', 'venom', 'sip', 'utility', 460),
  scavenge: score('support', 'loot', 'scavenge', 'utility', 490),
  interrupted: score('interrupted', 'cleave', 'stagger', 'hurt', 110),
};
const fallbackSupport = score('support', 'arcane', 'summon', 'cast', 500);
const signatures = {
  guardian: 'bastion-bash',
  berserker: 'blood-cleave',
  chronomancer: 'time-bolt',
  alchemist: 'venom-flask',
};

export function motionScore(actionId, role, self = false) {
  return Object.hasOwn(sigils, actionId)
    ? sigils[actionId]
    : self
      ? fallbackSupport
      : role === 'berserker'
        ? axe
        : swing;
}

export function actorClip(score, actionId, role) {
  if (score.clip === 'signature' && signatures[role] !== actionId)
    return score.family === 'melee' ? 'attack' : 'cast';
  return score.clip;
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
