// Short, locally synthesized contact sounds. Tonal partials carry the material;
// a filtered noise transient gives the metal, glass and wood a distinct attack.
function tone(wave, from, to, length, gain, delay = 0) {
  return { wave, from, to, length, gain, delay };
}
function noise(filter, from, to, length, gain, delay = 0) {
  return { filter, from, to, length, gain, delay };
}
const cues = {
  bash: [
    noise('lowpass', 800, 90, 0.13, 0.19),
    tone('triangle', 112, 40, 0.21, 0.095),
    tone('sine', 326, 254, 0.13, 0.032, 0.008),
  ],
  hammer: [
    noise('bandpass', 1450, 410, 0.085, 0.16),
    tone('triangle', 177, 62, 0.14, 0.073),
    tone('sine', 549, 409, 0.096, 0.021),
  ],
  blade: [noise('highpass', 3700, 930, 0.105, 0.064), tone('triangle', 441, 144, 0.1, 0.044)],
  cleave: [noise('bandpass', 2060, 370, 0.17, 0.13), tone('triangle', 245, 68, 0.21, 0.062)],
  glass: [
    noise('highpass', 3300, 1500, 0.105, 0.074),
    tone('sine', 1760, 1570, 0.1, 0.042),
    tone('sine', 2690, 2600, 0.13, 0.032, 0.012),
    tone('sine', 1160, 1020, 0.13, 0.027, 0.045),
    tone('triangle', 84, 53, 0.12, 0.034, 0.025),
  ],
  clock: [
    noise('highpass', 3200, 2300, 0.022, 0.075),
    tone('sine', 988, 740, 0.19, 0.055),
    tone('sine', 1480, 1175, 0.16, 0.028, 0.048),
  ],
  fire: [noise('bandpass', 1150, 160, 0.27, 0.15), tone('triangle', 145, 49, 0.21, 0.064)],
  frost: [
    noise('highpass', 4700, 2700, 0.1, 0.043),
    tone('sine', 1410, 1320, 0.15, 0.033),
    tone('sine', 1980, 1840, 0.21, 0.027, 0.05),
  ],
  ward: [tone('sine', 466, 453, 0.26, 0.042), tone('sine', 699, 680, 0.24, 0.04, 0.02)],
  venom: [noise('bandpass', 590, 170, 0.13, 0.084), tone('sine', 299, 94, 0.13, 0.045)],
  pulse: [tone('sine', 161, 71, 0.18, 0.055)],
  heal: [tone('sine', 465, 523, 0.2, 0.042), tone('sine', 623, 698, 0.24, 0.032, 0.07)],
  bell: [
    tone('sine', 494, 489, 0.35, 0.045),
    tone('sine', 1180, 1172, 0.25, 0.02),
    tone('sine', 1651, 1642, 0.14, 0.012),
  ],
  fall: [tone('triangle', 150, 39, 0.29, 0.074), noise('lowpass', 530, 100, 0.2, 0.1, 0.035)],
  coins: [tone('sine', 1305, 1154, 0.11, 0.036), tone('sine', 1760, 1695, 0.13, 0.03, 0.043)],
  revival: [tone('sine', 392, 523, 0.2, 0.044), tone('sine', 587, 784, 0.26, 0.033, 0.065)],
};

function instrument({ action, role, effect, event, first }) {
  if (!first && event?.type === 'status') return null;
  if (effect === 'fracture') return 'glass';
  if (effect === 'dust') return 'pulse';
  if (effect === 'guard' || effect === 'ward') return 'ward';
  if (effect === 'miasma') return 'venom';
  if (action === 'menders-bell' && first) return 'bell';
  if (effect === 'heal' || effect === 'revival') return effect;
  if (event?.type === 'elimination') return 'fall';
  if (action === 'bastion-bash' && first) return 'bash';
  if (action === 'attack' && first && role === 'guardian') return 'hammer';
  if ((action === 'venom-flask' || action === 'spark-bottle') && first) return 'glass';
  if (effect === 'arcane' || effect === 'echo' || effect === 'shock') return 'clock';
  if (effect === 'fire' || effect === 'frost') return effect;
  if (effect === 'doom' || effect === 'eclipse') return 'bell';
  if (effect === 'slash' || effect === 'thorns') return 'blade';
  if (effect === 'cleave') return 'cleave';
  if (effect === 'loot') return 'coins';
  if (effect === 'venom') return 'venom';
  return 'pulse';
}

const noiseBuffers = new WeakMap();
function hiss(context) {
  if (noiseBuffers.has(context)) return noiseBuffers.get(context);
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 0.4), context.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = 0x2944;
  for (let i = 0; i < channel.length; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    channel[i] = seed / 2147483648 - 1;
  }
  noiseBuffers.set(context, buffer);
  return buffer;
}

export function playContactSound(context, cue, destination = context?.destination) {
  if (!context || !destination) return;
  const name = instrument(cue);
  if (!name) return;
  const start = context.currentTime;
  const weight = (cue.first ? 1 : 0.76) * (0.75 + Math.min(0.4, Math.sqrt(cue.event?.amount || 0) * 0.047));
  for (const voice of cues[name]) {
    const begin = start + voice.delay,
      end = begin + voice.length;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, begin);
    envelope.gain.exponentialRampToValueAtTime(voice.gain * weight, begin + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.connect(destination);
    let source, filter;
    if (voice.filter) {
      source = context.createBufferSource();
      source.buffer = hiss(context);
      filter = context.createBiquadFilter();
      filter.type = voice.filter;
      filter.Q.value = 0.78;
      filter.frequency.setValueAtTime(voice.from, begin);
      filter.frequency.exponentialRampToValueAtTime(voice.to, end);
      source.connect(filter).connect(envelope);
    } else {
      source = context.createOscillator();
      source.type = voice.wave;
      source.frequency.setValueAtTime(voice.from, begin);
      source.frequency.exponentialRampToValueAtTime(voice.to, end);
      source.connect(envelope);
    }
    source.onended = () => {
      source.disconnect();
      filter?.disconnect();
      envelope.disconnect();
    };
    source.start(begin);
    source.stop(end + 0.009);
  }
}
