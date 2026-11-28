import { countCareer } from './progression.js';
import { REWARDS, STATUSES } from './catalog.js';
import { eligible, modifiedSlot, random, sample } from './draft.js';
import { captureOutcome, settleStatusTick } from './recap.js';

export const findPlayer = (state,id) => state.players.find(p => p.id === id);
const shards = Object.values(REWARDS).filter(r => r.category === 'shard' && r.id !== 'fortune-chip');
const eventBudget = new WeakMap();
const statLabels = {armor:'armor',attack:'attack',spellPower:'spell power',maxHp:'maximum health',regen:'regeneration',rerolls:'reroll'};
export const statGain = (p,key,amount) => amount + Number(key === 'armor' && p.classId === 'guardian' && amount > 0);
export const receivedHealing = (p,amount) => Math.round(amount * (1 - Math.min(0.8,(p.statuses.curse || 0) * 0.2)));
export const defendShield = p => 6 + Math.floor(p.armor / 2);
export const castCooldown = (reward,slot) => Math.max(1,reward.cooldown - Number(slot?.modifiers.includes('accelerate') || false));
export const echoDamage = raw => Math.round(raw * 0.4);
export function record(state,type,text,details={}) {
  const entry = {id:++state.logSequence,round:state.round,type,text};
  for (const [key,value] of Object.entries(details)) {
    if (value !== undefined) entry[key] = value;
  }
  state.log.push(entry);
  captureOutcome(state,entry);
  if (state.log.length > state.config.logLimit) state.log.shift();
  return entry;
}
export function capacity(state,player,kind) {
  if (kind === 'abilities') return state.config.abilitySlots;
  return state.config.consumableSlots * player.artifacts.reduce((n,id) => n * (REWARDS[id].consumableCapacity || 1),1);
}
export function currentAttack(player) {
  const bonus = player.classId === 'berserker' ? Math.floor(10 * (player.maxHp - player.hp) / player.maxHp) : 0;
  return player.attack + bonus;
}
export const scaled = (p, base, scale, factor=1) => Math.round((base || 0) + (scale ? (scale === 'attack' ? currentAttack(p) : p[scale]) * factor : 0));
const modifierFactor = (slot) => (slot?.modifiers.includes('amplify') ? 1.4 : 1) * (slot?.modifiers.includes('accelerate') ? 0.85 : 1);
export const highCardReady = p => p.stackedDeckTurn !== undefined && p.stackedDeckTurn === p.personalTurn;
export const fittingCount = p => p.artifacts.length + p.abilities.reduce((count,slot) =>
  count + slot.modifiers.length + Number(REWARDS[slot.id].category === 'item'),0);

// Mirroring reads printed enemy techniques in public slot order. Generated
// effects (including another mirror) have no printed status to recurse into.
export function imitatedStatus(target,effect) {
  for (const slot of target.abilities) {
    const ability = REWARDS[slot.id];
    const printed = ability.target === 'enemy' && ability.effects.find(e => e.kind === 'status' && e.target === 'enemy');
    if (printed) return {key:printed.key,amount:Math.min(printed.amount,effect.limit)};
  }
  return null;
}

export function rawHit(player,target,effect,slot,highCard=highCardReady(player)) {
  let value = effect.kind === 'consumeHit' ? effect.base + effect.factor * (target.statuses[effect.key] || 0)
    : scaled(player,effect.base,effect.scale,effect.factor);
  if (effect.cardBonus && highCard) value += effect.cardBonus;
  if (effect.cursedBonus && target.statuses.curse) value += effect.cursedBonus;
  if (effect.fittingBonus) value += effect.fittingBonus * Math.min(effect.maxFittings,fittingCount(player));
  return Math.max(0,Math.round(value * modifierFactor(slot)));
}
export function assessHit(state,target,raw,{trueDamage=false,direct=false,bypassShield=false}={}) {
  const boosted = raw * (1 + (direct ? (target.statuses.shock || 0) * 0.25 : 0));
  const reduced = trueDamage ? boosted : boosted * state.config.armorConstant / (Math.max(0,target.armor) + state.config.armorConstant);
  const damage = Math.max(0,Math[state.config.rounding](reduced));
  const shieldDamage = bypassShield ? 0 : Math.min(target.shield,damage);
  return {damage,shieldDamage,healthDamage:Math.min(target.hp,damage - shieldDamage)};
}

function matches(condition,p,context) {
  if (!condition) return true;
  if (condition === 'four') return context.amount >= 4;
  if (condition === 'three') return context.amount >= 3;
  if (condition === 'wounded') return p.hp < p.maxHp / 2;
  return context.key === condition;
}

export function trigger(state,player,event,context={}) {
  if (!player?.alive) return;
  for (const id of player.artifacts) {
    for (const rule of REWARDS[id].rules || []) {
      if (rule.on !== event || !matches(rule.condition,player,context)) continue;
      // A generous per-command ceiling prevents future declarative trigger cycles
      // from hanging the server. Ordinary chains only spend a handful of entries.
      const spent = eventBudget.get(state) || 0;
      if (spent >= 256) return;
      eventBudget.set(state,spent + 1);
      record(state,'synergy',player.name + ' triggered ' + REWARDS[id].name + '.', {actorId:player.id});
      executeEffects(state,player,context.target || player,rule.effects,{label:REWARDS[id].name});
    }
  }
}
export function restore(state,p,amount,label) {
  if (!p?.alive || amount <= 0) return;
  const net = receivedHealing(p,amount);
  const healed = Math.min(p.maxHp - p.hp,net);
  p.hp += healed;
  if (healed) record(state,'heal',p.name + ' recovered ' + healed + ' health from ' + label + '.', {targetId:p.id,amount:healed});
  if (net > healed) trigger(state,p,'overheal',{amount:net - healed});
}
export function setStatus(p,key,value) {
  if (value > 0) p.statuses[key] = value;
  else {
    delete p.statuses[key];
    delete p.sources[key];
    if (key === 'doom') delete p.doomClock;
  }
}
function addStatus(state,p,target,key,amount,label) {
  if (!target.alive) return;
  if (key === 'burn') amount *= p?.artifacts.reduce((n,id) => n * (REWARDS[id].burnMultiplier || 1),1) ?? 1;
  const current = target.statuses[key] || 0;
  if (key === 'freeze') {
    if (current) return;
    amount = 1;
  }
  setStatus(target,key,current + amount);
  if (key === 'doom' && !target.doomClock) target.doomClock = 2;
  // Keep periodic stacks attributed to their individual appliers, oldest first.
  if (['burn','poison','bleed','doom'].includes(key)) {
    target.sources[key] ||= [];
    const last = target.sources[key].at(-1);
    if (last && last.id === (p?.id ?? null)) last.amount += amount;
    else target.sources[key].push({id:p?.id ?? null,amount});
  }
  record(state,'status',label + ' applied ' + amount + ' ' + STATUSES[key].name + ' to ' + target.name + '.',{actorId:p?.id,targetId:target.id,amount,cause:key,statusChange:'applied',statusRemaining:target.statuses[key]});
  if (key === 'chill' && target.statuses.chill >= 3) {
    setStatus(target,'chill',target.statuses.chill % 3);
    setStatus(target,'freeze',1);
    record(state,'status',target.name + ' is frozen.',{actorId:p?.id,targetId:target.id,cause:'freeze',statusChange:'frozen',statusRemaining:1,chillRemaining:target.statuses.chill || 0});
  }
  if (key === 'curse' && p !== target && p?.classId === 'necromancer' && p.lastRitesTurn !== p.personalTurn) {
    p.lastRitesTurn = p.personalTurn;
    restore(state,p,5,'Last Rites');
  }
  trigger(state,p,'applyStatus',{key,target});
}
export function addStat(state,p,key,amount,label) {
  amount = statGain(p,key,amount);
  p[key] += amount;
  record(state,'stat',p.name + ' gained ' + amount + ' ' + statLabels[key] + ' from ' + label + '.',{targetId:p.id,amount});
  if (key === 'maxHp') restore(state,p,amount,label);
}
function absorbShard(state, p, shard, source) {
  if (shard.id === 'iron-shard') countCareer(state, p.id, 'ironShards');
  executeEffects(state, p, p, shard.effects, {label:source + ' / ' + shard.name});
}
function usedConsumable(state,p,shard) {
  if (shard) absorbShard(state, p, shard, 'Distillation');
  trigger(state,p,'usedConsumable');
}
export function spendConsumable(state,p,id) {
  const i = p.consumables.indexOf(id);
  if (i < 0) throw Error('That consumable is unavailable.');
  p.consumables.splice(i,1);
  usedConsumable(state,p,p.classId === 'alchemist' ? sample(state,shards) : null);
}
function react(state,target,key) {
  const id = target.consumables.find(id => REWARDS[id].reaction === key);
  if (!id) return false;
  const r = REWARDS[id];
  if (key === 'lethal') {
    target.hp = Math.max(1,Math.ceil(target.maxHp * 0.25));
    record(state,'revival',target.name + ' revealed ' + r.name + ' and survived at ' + target.hp + ' health.',{targetId:target.id,amount:target.hp});
  } else record(state,'action',target.name + ' revealed ' + r.name + '.',{actorId:target.id});
  spendConsumable(state,target,id);
  executeEffects(state,target,target,r.effects,{label:r.name});
  return true;
}

export function deal(state,source,target,raw,label,flags={}) {
  if (!target?.alive) return;
  const {damage,shieldDamage,healthDamage} = assessHit(state,target,raw,flags);
  const discharged = flags.direct ? target.statuses.shock : 0;
  if (discharged) setStatus(target,'shock',0);
  target.shield -= shieldDamage;
  target.hp -= healthDamage;
  if (source && source.id !== target.id) countCareer(state,source.id,'damage',healthDamage);
  const split = shieldDamage ? ' (' + shieldDamage + ' to shield)' : '';
  const hit = record(state,'damage',label + ' dealt ' + damage + ' to ' + target.name + split + '.',{actorId:source?.id,targetId:target.id,amount:damage,shieldDamage,healthDamage,cause:flags.cause,
    shieldBroken:shieldDamage > 0 && target.shield === 0});
  if (discharged) record(state,'status',target.name + ' discharged ' + discharged + ' Shock.',{actorId:source?.id,targetId:target.id,amount:discharged,cause:'shock',statusChange:'discharged',statusRemaining:0});
  if (target.hp <= 0) {
    if (!react(state,target,'lethal')) {
      target.alive = false;
      record(state,'elimination',target.name + ' fell to ' + label + '.',{actorId:source?.id,targetId:target.id});
      for (const witness of state.players) {
        if (witness.alive && witness.classId === 'necromancer') addStat(state,witness,'spellPower',1,'Last Rites');
      }
      if (source?.alive && source !== target) restore(state,source,Math.ceil(source.maxHp * state.config.killHeal),'elimination');
    }
  }
  // Surviving via Second Breath also qualifies for a threshold reaction. Resolve
  // it after revival and its associated consumable effects determine current HP.
  if (target.alive && healthDamage && target.hp <= target.maxHp * 0.35) react(state,target,'wounded');
  if (flags.direct && source && source !== target) {
    trigger(state,source,'hit',{key:flags.flavor,target});
    if (shieldDamage && target.alive && target.classId === 'trickster' && target.falseGuardTurn !== target.personalTurn) {
      target.falseGuardTurn = target.personalTurn;
      executeEffects(state,target,target,[{kind:'shield',amount:5}],{label:'False Guard'});
    }
    trigger(state,target,'struck',{target:source});
  }
  return hit;
}

function removeStatus(state,p,target,key,change='consumed') {
  const count = target.statuses[key] || 0;
  setStatus(target,key,0);
  if (count) {
    record(state,'status',p.name + (change === 'cleansed' ? ' cleansed ' : ' consumed ') + count + ' ' + STATUSES[key].name + ' from ' + target.name + '.',{actorId:p.id,targetId:target.id,amount:count,cause:key,statusChange:change,statusRemaining:0});
    trigger(state,p,'consumedStatus',{amount:count,key,target});
  }
  return count;
}
export function grantReward(state,p,id,replaceIndex) {
  const reward = Object.hasOwn(REWARDS,id) && REWARDS[id];
  if (!reward || !eligible(p,reward)) throw Error('This reward is ineligible.');
  if (id === 'iron-shard') countCareer(state,p.id,'ironShards');
  const {category} = reward;
  if (['ability','item','consumable'].includes(category)) {
    const key = category === 'consumable' ? 'consumables' : 'abilities';
    const item = key === 'abilities' ? {id,cooldown:0,modifiers:[]} : id;
    if (p[key].length < capacity(state,p,key)) p[key].push(item);
    else {
      if (!Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex >= p[key].length) throw Error('Choose a slot to replace.');
      p[key][replaceIndex] = item;
    }
  } else if (category === 'artifact') p.artifacts.push(id);
  else if (category === 'modifier') {
    const slot = modifiedSlot(p,reward.modifier);
    slot.modifiers.push(reward.modifier);
    record(state,'synergy',p.name + ' etched ' + reward.name + ' onto ' + REWARDS[slot.id].name + '.',{actorId:p.id});
  } else executeEffects(state,p,p,reward.effects,{label:reward.name});
  if (['item','artifact','modifier'].includes(category)) {
    if (p.classId === 'artificer') executeEffects(state,p,p,[{kind:'shield',amount:6}],{label:'Workshop'});
    trigger(state,p,'fitted');
  }
  record(state,'reward',p.name + ' acquired ' + (category === 'consumable' ? 'a concealed consumable' : reward.name) + '.',{actorId:p.id});
}

export function executeEffects(state,p,target,effects,context={}) {
  const {label='Arena',slot} = context;
  for (const e of effects) {
    if (!p.alive) break;
    switch (e.kind) {
      case 'hit':
      case 'consumeHit': {
        const highCard = e.cardBonus && (highCardReady(p) || random(state) < 0.5);
        const raw = rawHit(p,target,e,slot,highCard);
        if (e.kind === 'consumeHit') removeStatus(state,p,target,e.key);
        const hitLabel = e.cardBonus ? label + (highCard ? ' (high card)' : ' (low card)') : label;
        deal(state,p,target,raw,hitLabel,{trueDamage:e.trueDamage,direct:true,flavor:e.flavor});
        if (slot?.modifiers.includes('echo') && target.alive) state.delayed.push({source:p.id,target:target.id,raw:echoDamage(raw),due:state.globalTurn + 1,label:label + ' echo',trueDamage:Boolean(e.trueDamage)});
        break;
      }
      case 'heal': restore(state,p,scaled(p,e.amount,e.scale,e.factor),label); break;
      case 'shield':
        p.shield += e.amount;
        record(state,'shield',p.name + ' gained ' + e.amount + ' shield from ' + label + '.',{targetId:p.id,amount:e.amount});
        break;
      case 'status': addStatus(state,p,e.target === 'self' ? p : target,e.key,e.amount,label); break;
      case 'imitate': {
        if (!target.alive) break;
        const copied = imitatedStatus(target,e);
        if (copied) {
          addStatus(state,p,target,copied.key,copied.amount,label);
          trigger(state,p,'imitation',{key:copied.key,target});
        } else executeEffects(state,p,p,[{kind:'shield',amount:e.shield}],{label});
        break;
      }
      case 'stat': addStat(state,p,e.key,e.amount,label); break;
      case 'retaliate': deal(state,p,target,e.amount,label,{trueDamage:true,cause:'retaliation'}); break;
      case 'shards':
        for (let i=0; i<e.amount; i++) {
          const shard = sample(state,shards);
          absorbShard(state,p,shard,label);
        }
        break;
      case 'cleanse':
        for (const key of e.keys) removeStatus(state,p,p,key,'cleansed');
        break;
      case 'purify': {
        const stacks = removeStatus(state,p,p,'poison');
        if (stacks) {
          restore(state,p,stacks * 5,label);
          addStat(state,p,'regen',stacks,label);
        }
        break;
      }
      case 'cooldown':
        for (const a of p.abilities) {
          const previous = a.cooldown;
          a.cooldown = Math.max(0,a.cooldown - e.amount);
          if (a.cooldown < previous) {
            record(state,'cooldown',label + ' advanced ' + p.name + '’s ' + REWARDS[a.id].name + ' cooldown from ' + previous + ' to ' + a.cooldown + '.',{targetId:p.id,amount:previous-a.cooldown});
          }
        }
        break;
      case 'extraAction':
        if (!p.usedBorrowedTime && p.id === state.activeId && state.phase === 'action') {
          p.usedBorrowedTime = true;
          state.remainingActions++;
          record(state,'timing',p.name + ' gained an extra action from ' + label + '.',{actorId:p.id});
        }
        break;
      case 'extraTurn':
        p.extraTurnRound = state.round;
        state.extraTurnId = p.id;
        record(state,'timing',p.name + ' gained an extra full turn from ' + label + '.',{actorId:p.id});
        break;
      default: throw Error('Unknown effect: ' + e.kind);
    }
  }
}

export function resolveDefend(state,p) {
  executeEffects(state,p,p,[{kind:'shield',amount:defendShield(p)}],{label:'Defend'});
  trigger(state,p,'defend');
}

// Forecast one self-targeted support action through the same effect handlers
// as combat. The isolated subject has no next-turn ticks, rivals or live RNG.
function supportOutcome(player,reward,effects,shard) {
  const p = structuredClone({...player,sources:{}});
  const state = {activeId:p.id,phase:'action',round:0,logSequence:0,log:[],config:{logLimit:64},remainingActions:1};
  if (reward.category === 'consumable') {
    p.consumables.splice(p.consumables.indexOf(reward.id),1);
    usedConsumable(state,p,shard);
  }
  // Only attribute the action's own restoration to it. A shard can change
  // health or maximum health before the consumable runs, especially under Curse.
  const {hp,attack,shield,regen} = p;
  if (reward.id === 'defend') resolveDefend(state,p);
  else executeEffects(state,p,p,effects,{label:reward.name});
  return {
    healing:p.hp-hp,
    shield:p.shield-shield,
    regeneration:p.regen-regen,
    attack:p.attack-attack,
    cleansed:Object.fromEntries(Object.entries(player.statuses).filter(([key]) => !p.statuses[key]))
  };
}

export function previewSelfSupport(player,reward) {
  if (reward.target !== 'self' || reward.reaction) return null;
  const defending = reward.id === 'defend';
  const effects = reward.effects || [];
  const healing = effects.some(e => e.kind === 'heal' || e.kind === 'purify');
  if (!defending && !healing && !effects.some(e => e.kind === 'shield')) return null;
  const distills = player.classId === 'alchemist' && reward.category === 'consumable';
  const options = distills ? shards : [null];
  const outcomes = options.map(shard => supportOutcome(player,reward,effects,shard));
  const [first] = outcomes;
  const possibleHealing = [...new Set(outcomes.map(o=>o.healing))].sort((a,b)=>a-b);
  const parts = [];
  const cleansed = Object.entries(first.cleansed);
  if (cleansed.length) parts.push('Cleanse ' + cleansed.map(([key,n]) => n + ' ' + STATUSES[key].name).join(', '));
  else if (effects.some(e => e.kind === 'cleanse' || e.kind === 'purify')) parts.push('No active stacks to cleanse');
  if (first.shield) parts.push('Gain ' + first.shield + ' shield (' + (player.shield + first.shield) + ' total)');
  if (healing || possibleHealing.some(n => n > 0)) {
    const full = possibleHealing.length === 1 && first.healing === 0 && player.hp === player.maxHp;
    parts.push('Recover ' + possibleHealing.join(' or ') + ' health' + (full ? ' (already at full health)' : ''));
  }
  if (first.regeneration) parts.push('Gain ' + first.regeneration + ' regeneration');
  if (player.artifacts.includes('glass-orchard') && outcomes.some(o => o.attack === 1)) {
    parts.push(outcomes.every(o => o.attack === 1) ? 'Glass Orchard grants 1 attack' : 'Glass Orchard may grant 1 attack');
  }
  if (distills) parts.push('Distillation draws a stat shard first');
  return {
    text:parts.join(' · '),shieldGain:first.shield,possibleHealing,cleansed:first.cleansed,
    ...(possibleHealing.length === 1 ? {healing:first.healing} : {})
  };
}

export function tickStatus(state,p,key) {
  if (!p.alive || !p.statuses[key]) return;
  const label = STATUSES[key].name;
  // Resolve one damage packet per author, keeping healing and kill attribution intact.
  const contributors = new Map();
  for (const group of p.sources[key] || []) contributors.set(group.id,(contributors.get(group.id) || 0) + group.amount);
  let lastPacket;
  for (const [id,amount] of contributors) {
    if (!p.alive) break;
    const source = findPlayer(state,id);
    lastPacket = deal(state,source,p,amount,label,{trueDamage:['doom','poison'].includes(key),cause:key});
    if (key === 'poison') trigger(state,p,'poisoned');
    if (source && source !== p) trigger(state,source,key + 'Tick',{target:p});
  }
  if (key === 'burn' || key === 'bleed') {
    const groups = p.sources[key];
    if (groups?.length && --groups[0].amount <= 0) groups.shift();
    setStatus(p,key,p.statuses[key] - 1);
  } else if (key === 'doom') setStatus(p,key,0);
  settleStatusTick(state,lastPacket,p.statuses[key] || 0);
}
