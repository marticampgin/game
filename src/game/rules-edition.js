import { CLASSES, REWARDS } from './catalog.js';

// A solo ticket can be resumed after an update. Both peers must continue using
// its original numerical rules and bot decisions to verify queued commands.
export const currentRulesEdition = 3;
export const rulesEdition = state => state.config.rulesEdition ?? (state.rewardPool ? 2 : 1);

const originalStats = {
  guardian:{maxHp:520,armor:10}, berserker:{maxHp:500},
  chronomancer:{maxHp:470,spellPower:7}, necromancer:{maxHp:475,spellPower:7}
};
export function startingStats(classId,edition) {
  const stats=CLASSES[classId].stats;
  return edition < 3 ? {...stats,...originalStats[classId]} : stats;
}

const originalForgeAffinity = ['equipment','shield','armor','ability'];
export function favoredTags(state,classId) {
  return classId === 'artificer' && rulesEdition(state) < 3 ? originalForgeAffinity : CLASSES[classId].favored;
}

const originalRewards = {};
function preserve(id,description,effects) {
  originalRewards[id]={...REWARDS[id],description,summary:description,cooldown:2,target:'enemy',effects};
}
const hit = (base,scale,factor=1,extra={}) => ({kind:'hit',base,scale,factor,...extra});
preserve('bastion-bash','Strike for 5 plus 120% of your armor. Cooldown 2.',
  [hit(5,'armor',1.2,{flavor:'armor-strike'})]);
preserve('blood-cleave','Strike for attack + 3 and inflict 3 Bleed. Cooldown 2.',
  [hit(3,'attack'),{kind:'status',key:'bleed',target:'enemy',amount:3}]);
preserve('cut-the-deck','Throw a card for attack + 3 or attack + 11, with equal odds. Rerolling guarantees the high card this personal turn. Cooldown 2.',
  [hit(3,'attack',1,{cardBonus:8})]);
preserve('soul-tithe','Strike for spell power + 4, dealing 4 more if the rival already carries Curse. Apply 3 Curse. Cooldown 2.',
  [hit(4,'spellPower',1,{cursedBonus:4}),{kind:'status',key:'curse',target:'enemy',amount:3}]);
preserve('mirror-feint','Strike for attack + 3. Copy up to 2 stacks of the first hostile status printed on the rival’s equipped abilities, reading slots in order. Gain 6 shield if there is none. Cooldown 2.',
  [hit(3,'attack'),{kind:'imitate',limit:2,shield:6}]);
const molten=REWARDS['molten-mail'];
originalRewards[molten.id]={...molten,description:'Armor-scaling hits apply 3 Burn.',rules:[
  {...molten.rules[0],effects:[{...molten.rules[0].effects[0],amount:3}]}
]};

export function rewardInMatch(state,id) {
  return state && rulesEdition(state) < 3 && Object.hasOwn(originalRewards,id) ? originalRewards[id] : REWARDS[id];
}
