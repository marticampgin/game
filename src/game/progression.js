import { CLASSES, REWARDS } from './catalog.js';

export const MASTERY_TARGET = 12;
const outfits = {
  guardian: [['harbor-warden', 'Harbor Warden'], ['sunspire-paladin', 'Sunspire Paladin']],
  berserker: [['wolf-tracker', 'Wolf Tracker'], ['ash-dragon', 'Ash Dragon']],
  chronomancer: [['star-cartographer', 'Star Cartographer'], ['glass-oracle', 'Glass Oracle']],
  alchemist: [['apiarist', 'Apiarist'], ['nightshade-apothecary', 'Nightshade Apothecary']],
};
const rewardPrices = {
  'glass-orchard': 65, 'phoenix-heart': 75, 'starfall-cache': 90,
  'echo-rune': 95, 'pocket-eclipse': 110, 'borrowed-time': 125,
};
export const SHOP = [
  ...Object.entries(outfits).flatMap(([classId, skins]) => skins.map(([skinId, name], i) => ({
    id:skinId, kind:'skin', classId, skinId, name, price:i ? 260 : 85,
    description:i ? 'Earn this outfit through class mastery or purchase it with coins.' : 'An alternate outfit for the ' + CLASSES[classId].name + '.',
    ...(i ? {mastery:MASTERY_TARGET} : {}),
  }))),
  ...Object.entries(rewardPrices).map(([id, price]) => ({
    id, kind:'reward', rewardId:id, name:REWARDS[id].name, description:REWARDS[id].description, price,
  })),
];
const quest = (id, name, description, metric, target, coins) => ({id, name, description, metric, target, coins});
export const MATCH_QUESTS = [
  quest('iron-gatherer', 'Iron Gatherer', 'Collect four Iron Shards, including shards from caches.', 'ironShards', 4, 40),
  quest('spellwork', 'Spellwork', 'Use a learned ability four times.', 'abilities', 4, 25),
  quest('hold-fast', 'Hold Fast', 'Defend three times.', 'defends', 3, 20),
  quest('trail-seeker', 'Trail Seeker', 'Open two bonus drafts with Scavenge.', 'scavenges', 2, 20),
  quest('breaking-ground', 'Breaking Ground', 'Deal 120 damage to rival health.', 'damage', 120, 30),
  quest('stock-the-pack', 'Stock the Pack', 'Choose six draft rewards.', 'drafts', 6, 25),
];
export const LIFETIME_QUESTS = [
  quest('first-steps', 'First Steps', 'Complete your first match.', 'matches', 1, 35),
  quest('blood-and-iron', 'Blood and Iron', 'Deal 1,000 total damage to rival health.', 'damage', 1000, 75),
  quest('seasoned', 'Seasoned Contender', 'Win ten matches.', 'wins', 10, 160),
  quest('century', 'A Hundred Thousand Scars', 'Deal 100,000 total damage to rival health.', 'damage', 100000, 1000),
];

export const owns = (profile, item) => !!item && !!profile?.unlocks?.includes(item.id);
export const isDraftUnlocked = (id, unlocked) => !Object.hasOwn(rewardPrices, id) || unlocked.includes(id);
const emptyStats = () => ({damage:0, matches:0, wins:0});
export function newProfile() {
  return {version:1,revision:0,coins:0,unlocks:[],equipped:{},totals:emptyStats(),classes:{},claimed:[]};
}

// Each seat gets a different adjacent pair. This small hash has its own input
// and never consumes the combat RNG or changes reward draws.
export function careerSeat(runId, seatIndex, unlocks) {
  let start = 0;
  for (const ch of runId) start = (Math.imul(start, 31) + ch.charCodeAt(0)) >>> 0;
  const first = (start + seatIndex) % MATCH_QUESTS.length;
  return {unlocks:[...unlocks], metrics:{damage:0,ironShards:0,abilities:0,defends:0,scavenges:0,drafts:0},
    objectives:[MATCH_QUESTS[first].id, MATCH_QUESTS[(first + 1 + Math.floor(seatIndex / MATCH_QUESTS.length)) % MATCH_QUESTS.length].id]};
}
export function careerView(state, playerId) {
  const data = state.career?.seats[playerId];
  if (!data) return undefined;
  const objectives = data.objectives.map(id => {
    const q = MATCH_QUESTS.find(def => def.id === id);
    const value = Math.min(q.target, data.metrics[q.metric]);
    return {...q,value,complete:value === q.target};
  });
  return {runId:state.career.runId,objectives,metrics:{...data.metrics},
    earnedCoins:objectives.reduce((sum, q) => sum + (q.complete ? q.coins : 0), 0)};
}
export function countCareer(state, playerId, metric, amount = 1) {
  const seat = playerId && state.career?.seats[playerId];
  if (seat) seat.metrics[metric] += amount;
}

export function buy(profile, id) {
  const item = SHOP.find(i => i.id === id);
  if (!item) throw new Error('Choose an available shop item.');
  if (owns(profile, item)) return false;
  if (profile.coins < item.price) throw new Error('You need ' + (item.price - profile.coins) + ' more coins.');
  profile.coins -= item.price;
  profile.unlocks.push(item.id);
  return true;
}
export function equip(profile, classId, skinId) {
  if (!Object.hasOwn(CLASSES, classId) || (skinId !== 'founder' &&
      !owns(profile, SHOP.find(i => i.kind === 'skin' && i.classId === classId && i.skinId === skinId))))
    throw new Error('Unlock this class outfit first.');
  if ((profile.equipped[classId] || 'founder') === skinId) return false;
  profile.equipped[classId] = skinId;
  return true;
}

// The caller commits the receipt and profile in the same transaction. A lost
// HTTP reply, another tab, a short battle log or an old room snapshot can never
// cause the same damage, contract or class completion to count twice.
export function credit(profile, receipt, state, playerId) {
  const progress = careerView(state, playerId);
  if (!progress) return false;
  const player = state.players.find(p => p.id === playerId);
  const damage = Math.max(0, progress.metrics.damage - (receipt.damage || 0));
  const coins = Math.max(0, progress.earnedCoins - (receipt.coins || 0));
  const finished = !receipt.finished && (state.phase === 'finished' || !player.alive) && player.personalTurn > 0;
  if (!damage && !coins && !finished) return false;
  const stats = profile.classes[player.classId] ??= emptyStats();
  stats.damage += damage;
  profile.totals.damage += damage;
  profile.coins += coins;
  receipt.damage = Math.max(receipt.damage || 0, progress.metrics.damage);
  receipt.coins = Math.max(receipt.coins || 0, progress.earnedCoins);
  if (finished) {
    receipt.finished = true;
    stats.matches++;
    profile.totals.matches++;
    if (state.winnerId === playerId) { stats.wins++; profile.totals.wins++; }
    for (const skin of SHOP.filter(i => i.classId === player.classId && i.mastery && stats.matches >= i.mastery))
      if (!owns(profile, skin)) profile.unlocks.push(skin.id);
  }
  for (const q of LIFETIME_QUESTS) {
    if (!profile.claimed.includes(q.id) && profile.totals[q.metric] >= q.target) {
      profile.claimed.push(q.id);
      profile.coins += q.coins;
    }
  }
  return true;
}
