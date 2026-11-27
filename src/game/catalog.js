// Both the game and the Atlas read this catalog. Producers and consumers describe
// directed relationships, including scaling and triggers, rather than shared flavor.
const stat = (key, amount) => ({ kind: 'stat', key, amount });
const hit = (base, scale, factor = 1, extra = {}) => ({ kind: 'hit', base, scale, factor, ...extra });
const status = (key, amount, target = 'enemy') => ({ kind: 'status', key, amount, target });
const heal = (amount) => ({ kind: 'heal', amount });
const shield = (amount) => ({ kind: 'shield', amount });
const rule = (on, effects, condition) => ({ on, effects, condition });
const tags = (words) => words ? words.split(' ') : [];

function entry(id, name, category, rarity, icon, description, produces, consumes, details = {}) {
  produces = tags(produces);
  consumes = tags(consumes);
  return { id, name, category, rarity, icon, description, produces, consumes,
    tags: [...new Set([...produces, ...consumes])], ...details };
}

const shard = (id, name, icon, description, ingredient, key, amount) =>
  entry(id, name, 'shard', 'common', icon, description, ingredient, '', { effects: [stat(key, amount)] });
const ability = (id, name, rarity, icon, description, produces, consumes, cooldown, effects, details) =>
  entry(id, name, 'ability', rarity, icon, description,
    effects.some(effect => ['hit','consumeHit'].includes(effect.kind)) ? produces + ' ability' : produces,
    consumes, { target: 'enemy', cooldown, effects, ...details });
const artifact = (id, name, rarity, icon, description, produces, consumes, rules, details) =>
  entry(id, name, 'artifact', rarity, icon, description, produces, consumes, { rules, ...details });
const potion = (id, name, rarity, icon, description, produces, consumes, effects, details) =>
  entry(id, name, 'consumable', rarity, icon, description, produces, consumes, { target: 'self', effects, ...details });
const byId = (entries) => Object.fromEntries(entries.map((entry) => [entry.id, entry]));

export const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const REWARDS = byId([
  shard('iron-shard', 'Iron Shard', 'shield', 'Permanently gain 4 armor.', 'armor', 'armor', 4),
  shard('fang-shard', 'Fang Shard', 'sword', 'Permanently gain 2 attack.', 'attack', 'attack', 2),
  shard('astral-shard', 'Astral Shard', 'crystal', 'Permanently gain 2 spell power.', 'spell', 'spellPower', 2),
  shard('heartwood', 'Heartwood', 'heart', 'Gain 12 maximum health and heal for 12.', 'vitality healing', 'maxHp', 12),
  shard('spring-seed', 'Spring Seed', 'leaf', 'Regenerate 1 additional health at the start of each personal turn.', 'regeneration healing', 'regen', 1),
  ability('bastion-bash', 'Bastion Bash', 'uncommon', 'shield', 'Strike for 5 plus 120% of your armor. Cooldown 2.', 'physical armor-strike', 'armor', 2, [hit(5, 'armor', 1.2, { flavor:'armor-strike' })]),
  ability('blood-cleave', 'Blood Cleave', 'uncommon', 'axe', 'Strike for attack + 3 and inflict 3 Bleed. Cooldown 2.', 'physical bleed', 'attack', 2, [hit(3, 'attack'), status('bleed', 3)], {presentation:{move:'cleave'}}),
  ability('time-bolt', 'Time Bolt', 'uncommon', 'clock', 'Strike for 5 + spell power and apply 1 Shock. Cooldown 2.', 'arcane shock', 'spell', 2, [hit(5, 'spellPower'), status('shock', 1)], {presentation:{effect:'arcane'}}),
  ability('venom-flask', 'Venom Flask', 'uncommon', 'flask', 'Strike for half spell power + 3 and apply 2 persistent Poison. Cooldown 3.', 'poison arcane', 'spell', 3, [hit(3,'spellPower',0.5), status('poison',2)]),
  ability('cinder-orb','Cinder Orb','uncommon','fire','Strike for 5 + spell power and apply 3 Burn. Cooldown 2.','burn arcane','spell',2,[hit(5,'spellPower'),status('burn',3)]),
  ability('whiteout','Whiteout','rare','frost','Strike for 3 + spell power and apply 2 Chill. Three Chill become Freeze. Cooldown 3.','chill freeze','spell',3,[hit(3,'spellPower'),status('chill',2)],{presentation:{move:'wave'}}),
  ability('combustion','Combustion','rare','fire','Remove all Burn from a rival. Deal 6 + 4 per stack consumed. Cooldown 2.','status-consumed arcane','burn',2,[{kind:'consumeHit',key:'burn',base:6,factor:4}]),
  ability('hollow-needle','Hollow Needle','rare','dagger','Strike for attack + 4, ignoring armor. Shields still absorb this hit. Cooldown 3.','physical','attack',3,[hit(4,'attack',1,{trueDamage:true})],{presentation:{move:'thrust'}}),
  ability('grave-bell','Grave Bell','rare','skull','Apply 2 Curse and 12 Doom. Doom erupts after two of the target’s personal turns. Cooldown 4.','curse doom','',4,[status('curse',2),status('doom',12)],{presentation:{move:'knell',prop:'bell'}}),
  ability('reverse-polarity','Reverse Polarity','rare','leaf','Cleanse your Poison, heal for 5 per stack removed, and gain 1 regeneration per stack. Cooldown 4.','healing regeneration status-consumed','poison',4,[{kind:'purify'}],{target:'self'}),
  artifact('molten-mail','Molten Mail','rare','fire','Armor-scaling hits apply 3 Burn.','burn','armor-strike',[rule('hit',[status('burn',3)],'armor-strike')]),
  artifact('phoenix-heart','Phoenix Heart','epic','heart','Heal 4 whenever your Burn ticks on a living rival.','healing','burn',[rule('burnTick',[heal(4)])]),
  artifact('phoenix-feather','Phoenix Feather','rare','feather','Double all Burn stacks you apply.','burn','burn',[],{burnMultiplier:2}),
  artifact('shockglass','Shockglass','uncommon','crystal','Gain 4 shield when you apply Shock.','shield','shock',[rule('applyStatus',[shield(4)],'shock')]),
  artifact('blood-compass','Blood Compass','rare','dagger','Heal 3 whenever your Bleed triggers on a rival.','healing','bleed',[rule('bleedTick',[heal(3)])]),
  artifact('stillwater-ring','Stillwater Ring','uncommon','ring','Whenever you Defend, permanently gain 1 armor.','armor','defend',[rule('defend',[stat('armor',1)])]),
  artifact('glass-orchard','Glass Orchard','epic','leaf','Whenever you overheal by at least 4, gain 1 attack.','attack','healing',[rule('overheal',[stat('attack',1)],'four')]),
  artifact('quicksilver-lung','Quicksilver Lung','rare','flask','When you take Poison damage, advance all your cooldowns by 1.','cooldown','poison',[rule('poisoned',[{kind:'cooldown',amount:1}])]),
  artifact('borrowed-time','Borrowed Time','legendary','clock','Consuming 3 or more status stacks grants another action, once per personal turn.','extra-action','status-consumed',[rule('consumedStatus',[{kind:'extraAction'}],'three')]),
  artifact('golden-shell','Golden Shell','epic','shield','Every 20 armor grants a 5% chance to promote the rarity of each drawn reward by one tier (up to 35%).','fortune','armor',[],{armorFortune:true}),
  artifact('vial-sash','Vial Sash','uncommon','flask','Double your consumable slots.','capacity','consumable',[],{consumableCapacity:2}),
  artifact('briar-crown','Briar Crown','rare','crown','After surviving a rival’s direct hit, retaliate for 3 armor-piercing damage.','retaliation','physical arcane',[rule('struck',[{kind:'retaliate',amount:3}])]),
  artifact('fortress-oath','Fortress Oath','epic','shield','Guardian exclusive. Defend also heals you for 25% of your armor.','healing','armor defend',[rule('defend',[{kind:'heal',scale:'armor',factor:0.25}])],{exclusive:'guardian'}),
  artifact('red-wake','Red Wake','epic','axe','Berserker exclusive. Direct hits while below half health apply 3 Bleed.','bleed','missing-health physical',[rule('hit',[status('bleed',3)],'wounded')],{exclusive:'berserker'}),
  artifact('clockmaker','Clockmaker’s Key','epic','clock','Chronomancer exclusive. Defending advances all your cooldowns by 2.','cooldown','defend',[rule('defend',[{kind:'cooldown',amount:2}])],{exclusive:'chronomancer'}),
  artifact('herbalists-legacy','Herbalist’s Legacy','epic','leaf','Alchemist exclusive. Using a consumable permanently gives you 1 spell power.','spell','consumable',[rule('usedConsumable',[stat('spellPower',1)])],{exclusive:'alchemist'}),
  potion('red-tonic','Red Tonic','common','heart','Drink to heal 22.','healing consumable','',[heal(22)],{presentation:{prop:'tonic'}}),
  potion('spark-bottle','Spark Bottle','common','bolt','Throw to inflict 2 Shock.','shock consumable','',[status('shock',2)],{target:'enemy'}),
  potion('antidote','Moon Antidote','uncommon','flask','Cleanse Poison, Burn, Bleed, and Curse. Heal 8.','healing status-consumed consumable','poison burn bleed curse',[{kind:'cleanse',keys:['poison','burn','bleed','curse']},heal(8)],{presentation:{prop:'antidote'}}),
  potion('widows-brew','Widow’s Brew','uncommon','flask','Gain 5 spell power permanently and inflict 3 Poison on yourself.','spell poison consumable','',[stat('spellPower',5),status('poison',3,'self')]),
  potion('second-breath','Second Breath','legendary','feather','Hidden reaction. When damage would eliminate you, consume this to survive at 25% maximum health.','revival consumable','lethal',[],{reaction:'lethal'}),
  potion('emergency-ward','Emergency Ward','rare','shield','Hidden reaction. After surviving damage at or below 35% health, gain 18 shield.','shield consumable','missing-health', [shield(18)],{reaction:'wounded'}),
  potion('pocket-eclipse','Pocket Eclipse','legendary','clock','Consume to take another full turn, including a new draft. Once per round.','extra-turn consumable','',[{kind:'extraTurn'}],{oncePerRound:true,presentation:{move:'use',effect:'eclipse',prop:'clock'}}),
  entry('ward-lantern','Ward Lantern','item','uncommon','lantern','Gain 12 shield, which lasts until depleted. Cooldown 3.','shield','',{target:'self',cooldown:3,effects:[shield(12)],presentation:{prop:'lantern'}}),
  entry('menders-bell','Mender’s Bell','item','rare','heart','Heal for 8 + your spell power. Cooldown 3.','healing','spell',{target:'self',cooldown:3,effects:[{kind:'heal',amount:8,scale:'spellPower',factor:1}],presentation:{move:'ring',prop:'bell'}}),
  entry('pilgrim-cache','Pilgrim’s Cache','chest','uncommon','chest','Absorb two independently drawn common stat shards.','armor attack spell vitality regeneration','fortune',{effects:[{kind:'shards',amount:2}]}),
  entry('starfall-cache','Starfall Cache','chest','legendary','chest','Absorb four random stat shards and gain two rerolls.','armor attack spell vitality regeneration fortune','',{effects:[{kind:'shards',amount:4},stat('rerolls',2)]}),
  entry('amplify','Amplify Rune','modifier','rare','rune','Your first compatible unamplified damaging ability hits 40% harder.','physical arcane','ability',{modifier:'amplify'}),
  entry('accelerate','Haste Rune','modifier','epic','clock','Your first compatible damaging ability recovers one turn sooner but deals 15% less damage.','cooldown','ability',{modifier:'accelerate'}),
  entry('echo-rune','Echo Rune','modifier','legendary','rune','Your first compatible damaging ability repeats 40% of its base hit as the next global turn begins.','delayed','ability',{modifier:'echo'}),
  entry('fortune-chip','Fortune Chip','shard','common','coin','Gain one reward reroll to spend during a future draft.','fortune','',{effects:[stat('rerolls',1)]})
]);

export const CLASSES = byId([
  {id:'guardian',name:'Guardian',description:'An armored sentinel who turns protection into pressure.',innate:'Ironbound: armor gains are increased by 1.', ability:'bastion-bash',color:'#82bfc5',stats:{maxHp:520,attack:7,armor:10,spellPower:4},favored:tags('armor shield armor-strike defend')},
  {id:'berserker',name:'Berserker',description:'A relentless raider whose wounds sharpen every strike.',innate:'Bloodrush: gain 1 effective attack per 10% of health missing.', ability:'blood-cleave',color:'#eb8c71',stats:{maxHp:500,attack:9,armor:4,spellPower:3},favored:tags('attack bleed missing-health physical')},
  {id:'chronomancer',name:'Chronomancer',description:'A star-reader who bends the rhythm of battle.',innate:'Second Hand: gain an additional action every fifth personal turn.', ability:'time-bolt',color:'#ae96ee',stats:{maxHp:470,attack:7,armor:5,spellPower:7},favored:tags('cooldown shock extra-action delayed spell')},
  {id:'alchemist',name:'Alchemist',description:'A field apothecary who harvests power from volatile brews.',innate:'Distillation: every consumed item grants a random stat shard.', ability:'venom-flask',color:'#9ac47d',stats:{maxHp:485,attack:7,armor:5,spellPower:6},favored:tags('poison consumable regeneration spell')}
]);

export const STATUSES = byId([
  {id:'burn',name:'Burn',description:'At personal-turn start, lose health equal to stacks after armor and shields. The oldest stack expires.'},
  {id:'poison',name:'Poison',description:'At personal-turn start, take armor-piercing damage equal to persistent stacks. Shields absorb it.'},
  {id:'bleed',name:'Bleed',description:'Performing a hostile action causes damage equal to stacks, then one stack expires.'},
  {id:'shock',name:'Shock',description:'The next direct hit deals 25% more damage per stack and consumes all stacks.'},
  {id:'chill',name:'Chill',description:'Every three Chill become Freeze. A combatant can carry only one Freeze.'},
  {id:'freeze',name:'Freeze',description:'On your next action, only Defend and Scavenge are available. Freeze then expires.'},
  {id:'curse',name:'Curse',description:'Each stack reduces incoming healing by 20%, up to 80%. One expires after each personal turn.'},
  {id:'doom',name:'Doom',description:'After two personal turns, take armor-piercing damage equal to Doom stacks. Reapplication adds damage without resetting the clock.'}
]);

export const EVENTS = byId([
  {id:'crystal-rain',name:'Crystal Rain',description:'Each living contender absorbs a random stat shard.',effects:[{kind:'shards',amount:1}]},
  {id:'fortunes-favor',name:'Fortune’s Favor',description:'Each living contender gains a reward reroll.',effects:[stat('rerolls',1)]},
  {id:'temporal-tide',name:'Temporal Tide',description:'Advance all living contenders’ cooldowns by 2.',effects:[{kind:'cooldown',amount:2}]},
  {id:'blood-moon',name:'Blood Moon',description:'Each living contender receives 2 Curse.',effects:[status('curse',2,'self')]},
  {id:'arcane-overload',name:'Arcane Overload',description:'Each living contender receives 1 Shock.',effects:[status('shock',1,'self')]}
]);

export const DEFAULT_CONFIG = {
  abilitySlots:6, consumableSlots:5, adaptiveSlots:1, resonanceWeight:3, favoredChance:0.30,
  exclusiveChance:0.05, armorConstant:100, rounding:'round', eventInterval:4,
  ages:[1,9,19,31], killHeal:0.10, chaosBase:3, chaosStep:2, logLimit:100,
  rarityCurve:[[1,60,28,9,2.5,0.5],[8,50,30,14,5,1],[18,38,30,21,8,3],[30,25,30,26,14,5],[40,15,25,30,20,10]]
};
