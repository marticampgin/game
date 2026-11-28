// A reward's home determines its position only. Edges always use the catalog's
// producer / consumer metadata, including connections across these regions.
export const REGIONS = [
  { id: 'bulwark', name: 'Bulwark', x: 190, y: 210, color: '#a5d4ca', tags: ['armor-strike', 'armor', 'shield', 'retaliation', 'defend'] },
  { id: 'ember', name: 'Ember', x: 575, y: 160, color: '#ecac78', tags: ['burn', 'bleed', 'missing-health', 'attack', 'physical'] },
  { id: 'arcana', name: 'Arcana', x: 950, y: 216, color: '#c6a3f4', tags: ['chill', 'freeze', 'doom', 'curse', 'shock', 'spell', 'arcane'] },
  { id: 'vitality', name: 'Vitality', x: 210, y: 550, color: '#d5adbd', tags: ['revival', 'vitality', 'healing', 'regeneration', 'lethal'] },
  { id: 'alchemy', name: 'Alchemy', x: 580, y: 529, color: '#b7cd85', tags: ['poison', 'capacity', 'fortune', 'consumable'] },
  { id: 'tempo', name: 'Tempo', x: 950, y: 540, color: '#99bcee', tags: ['extra-turn', 'extra-action', 'delayed', 'cooldown', 'status-consumed', 'ability'] },
];

export const MAP_WIDTH = 1140;
export const MAP_HEIGHT = 740;

function homeRegion(reward) {
  // The most distinctive ingredient wins. Common collateral outputs such as
  // "physical" have less weight than "burn" or "extra-turn".
  const scores = REGIONS.map(region => region.tags.reduce((score, tag, i) => {
    const rank = Math.pow(.72, i);
    return score + rank * ((reward.produces.includes(tag) ? 1 : 0) + (reward.consumes.includes(tag) ? .85 : 0));
  }, 0));
  return REGIONS[scores.indexOf(Math.max(...scores))];
}

export function buildAtlas(rewards) {
  const members = {};
  for (const reward of rewards) (members[homeRegion(reward).id] ??= []).push(reward);
  const points = new Map();
  for (const region of REGIONS) {
    const group = members[region.id] || [];
    const positions = [{ x: 0, y: 0 }];
    for (let ring = 1; positions.length < group.length; ring++) {
      const count = Math.min(6 * ring, group.length - positions.length);
      for (let i = 0; i < count; i++) {
        const angle = 2 * Math.PI * i / count + ring * .44;
        positions.push({ x: Math.cos(angle) * ring * 65, y: Math.sin(angle) * ring * 53 });
      }
    }
    group.forEach((reward, index) => points.set(reward.id, {
      x: region.x + positions[index].x, y: region.y + positions[index].y, region,
    }));
  }
  const edges = [];
  for (const source of rewards) {
    for (const target of rewards) {
      if (source === target) continue;
      const ingredients = source.produces.filter(tag => target.consumes.includes(tag));
      if (ingredients.length) edges.push({ from: source.id, to: target.id, ingredients });
    }
  }
  return { points, edges };
}

export function matchingRewards(rewards, classes, filters) {
  const needle = (filters.search || '').toLowerCase().trim();
  return rewards.filter(reward => {
    if (filters.rarity && reward.rarity !== filters.rarity) return false;
    if (filters.category && reward.category !== filters.category) return false;
    if (filters.tag && !reward.tags.includes(filters.tag)) return false;
    if (filters.classId === 'universal' && reward.exclusive) return false;
    if (classes[filters.classId]) {
      if (reward.exclusive && reward.exclusive !== filters.classId) return false;
      if (!reward.exclusive && !reward.tags.some(tag => classes[filters.classId].favored.includes(tag))) return false;
    }
    return !needle || [reward.name, reward.description, reward.category, reward.rarity, ...reward.tags]
      .some(word => {
        const label = word.replaceAll('-', ' ');
        const query = needle.replaceAll('-', ' ');
        return [label, translate(label)].some(value => value.toLowerCase().includes(query));
      });
  });
}
import { translate } from './i18n.js';
