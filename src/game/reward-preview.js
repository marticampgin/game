import { REWARDS, STATUSES } from './catalog.js';
import { armorPromotionChance, eligible, modifiedSlot } from './draft.js';
import { capacity, castCooldown, currentAttack, defendShield, echoDamage, findPlayer, rawHit, receivedHealing, scaled, statGain } from './combat.js';

const statNames = {armor:'Armor',attack:'Attack',spellPower:'Spell power',maxHp:'Maximum health',regen:'Regeneration',rerolls:'Rerolls'};
const noStatuses = {statuses:{}};
const change = (name,from,to) => name + ' ' + from + ' → ' + to;
const hitEffect = reward => reward.effects?.find(e => e.kind === 'hit' || e.kind === 'consumeHit');

function statPreview(player,reward) {
  const after = {...player};
  const lines = [];
  for (const e of reward.effects) {
    if (e.kind !== 'stat') continue;
    const gain = statGain(after,e.key,e.amount);
    after[e.key] += gain;
    lines.push(change(statNames[e.key],player[e.key],after[e.key]) + ' (+' + gain + ')');
    if (e.key === 'maxHp') {
      after.hp = Math.min(after.maxHp,after.hp + receivedHealing(after,gain));
      if (after.hp !== player.hp) lines.push(change('Health',player.hp,after.hp));
    }
  }
  for (const slot of player.abilities) {
    const ability = REWARDS[slot.id];
    const hit = hitEffect(ability);
    if (hit) {
      const beforeHit = rawHit(player,noStatuses,hit,slot);
      const afterHit = rawHit(after,noStatuses,hit,slot);
      if (beforeHit !== afterHit) lines.push(change(ability.name,beforeHit,afterHit) + ' base damage');
    }
    const heal = ability.effects.find(e => e.kind === 'heal' && e.scale);
    if (heal) {
      const beforeHeal = receivedHealing(player,scaled(player,heal.amount,heal.scale,heal.factor));
      const afterHeal = receivedHealing(after,scaled(after,heal.amount,heal.scale,heal.factor));
      if (beforeHeal !== afterHeal) lines.push(change(ability.name,beforeHeal,afterHeal) + ' healing before the health cap');
    }
  }
  if (currentAttack(player) !== currentAttack(after)) lines.push(change('Basic Attack',currentAttack(player),currentAttack(after)) + ' base damage');
  if (defendShield(player) !== defendShield(after)) lines.push(change('Defend',defendShield(player),defendShield(after)) + ' shield');
  return lines;
}

function modifierPreview(p,r) {
  const slot = modifiedSlot(p,r.modifier);
  if (!slot) return [];
  const ability = REWARDS[slot.id];
  const next = {...slot,modifiers:[...slot.modifiers,r.modifier]};
  const e = hitEffect(ability);
  const before = rawHit(p,noStatuses,e,slot);
  const after = rawHit(p,noStatuses,e,next);
  const suffix = e.kind === 'consumeHit' ? ' base damage at 0 stacks' : ' base damage';
  const lines = ['Applies to ' + ability.name];
  if (castCooldown(ability,slot) !== castCooldown(ability,next)) {
    const cooldown = castCooldown(ability,next);
    lines.push(change('Cooldown',castCooldown(ability,slot),cooldown) + (cooldown === 1 ? ' personal turn' : ' personal turns'));
  }
  if (before !== after) lines.push(change(ability.name,before,after) + suffix);
  if (r.modifier === 'echo') lines.push('Next global turn: ' + echoDamage(after) + suffix + ' as an echo');
  return lines;
}

function inventoryPreview(state,p,r,replaceIndex) {
  const carried = r.category === 'consumable';
  const kind = carried ? 'consumables' : 'abilities';
  const items = p[kind];
  const limit = capacity(state,p,kind);
  const label = carried ? 'Consumable slots' : 'Equipment slots';
  const lines = [];
  if (items.length < limit) lines.push(change(label,items.length + '/' + limit,(items.length + 1) + '/' + limit));
  else if (Number.isInteger(replaceIndex) && items[replaceIndex]) {
    const old = carried ? items[replaceIndex] : items[replaceIndex].id;
    lines.push('Replaces ' + REWARDS[old].name + ' in slot ' + (replaceIndex + 1));
  } else lines.push(label + ' full (' + limit + '/' + limit + ') · choose a slot to replace');
  if (carried) {
    lines.push(r.reaction ? 'Hidden until its automatic reaction triggers' : 'Hidden until you use it');
  } else {
    const hit = hitEffect(r);
    const value = hit ? rawHit(p,noStatuses,hit) + ' base damage' + (hit.kind === 'consumeHit' ? ' at 0 stacks' : '') + ' · ' : '';
    const cooldown = castCooldown(r);
    lines.push(value + 'ready immediately · cooldown ' + cooldown + (cooldown === 1 ? ' personal turn' : ' personal turns'));
  }
  return lines;
}

function artifactPreview(state,p,r) {
  const owned = [...p.abilities.map(a => REWARDS[a.id]),...p.consumables.map(id => REWARDS[id])];
  if (r.consumableCapacity) {
    const count = capacity(state,p,'consumables');
    return [change('Consumable capacity',count,count*r.consumableCapacity)];
  }
  if (r.armorFortune) return ['At ' + p.armor + ' armor: ' + Math.round(100*armorPromotionChance(p.armor)) + '% rarity promotion per draw'];
  const rule = r.rules?.[0];
  const effect = rule?.effects?.[0];
  if (rule?.on === 'defend') {
    if (effect.kind === 'stat') return ['Defend adds ' + statGain(p,effect.key,effect.amount) + ' permanent ' + statNames[effect.key].toLowerCase()];
    if (effect.kind === 'heal') return ['Defend heals up to ' + receivedHealing(p,scaled(p,effect.amount,effect.scale,effect.factor)) + ' at your current armor'];
    if (effect.kind === 'cooldown') return ['Defend advances your ' + REWARDS[p.abilities[0].id].name + ' cooldown'];
  }
  if (rule?.on === 'hit' && rule.condition === 'armor-strike') {
    const source = owned.find(a => a.effects.some(e => e.flavor === rule.condition));
    if (source) return [source.name + ' will apply ' + effect.amount * p.artifacts.reduce((n,id) => n*(REWARDS[id].burnMultiplier || 1),1) + ' ' + STATUSES[effect.key].name];
  }
  if (rule?.on === 'poisoned') {
    if (p.statuses.poison) return ['You currently carry ' + p.statuses.poison + ' Poison'];
    const source = owned.find(a => a.effects.some(e => e.kind === 'status' && e.key === 'poison' && e.target === 'self'));
    if (source) return [source.name + ' applies Poison to you'];
  }
  const status = r.burnMultiplier || rule?.on === 'burnTick' ? 'burn'
    : rule?.on === 'bleedTick' ? 'bleed' : rule?.on === 'applyStatus' ? rule.condition : null;
  if (status) {
    const source = owned.find(a => a.effects.some(e => e.kind === 'status' && e.key === status && e.target === 'enemy'));
    if (source) return [source.name + ' applies ' + STATUSES[status].name + ' to rivals'];
  }
  const count = p.artifacts.length;
  return [change('Passive artifacts',count,count+1) + ' · no equipment slot needed'];
}

// Accept only a draft visible to its owner. Random bundles describe their draw
// count; no forecast, private rival inventory, or mutable random stream is read.
export function previewReward(view,viewerId,rewardId,replaceIndex) {
  const p = findPlayer(view,viewerId);
  const r = Object.hasOwn(REWARDS,rewardId) && REWARDS[rewardId];
  if (!r || !p?.consumables || view.phase !== 'acquire' || view.activeId !== viewerId ||
      !view.offers.includes(rewardId) || !eligible(p,r)) return {text:'',lines:[]};
  let lines;
  switch (r.category) {
    case 'shard': lines=statPreview(p,r); break;
    case 'modifier': lines=modifierPreview(p,r); break;
    case 'artifact': lines=artifactPreview(view,p,r); break;
    case 'chest': {
      const draws = r.effects.find(e => e.kind === 'shards');
      lines = ['Draws ' + draws.amount + ' random stat shards · no slot needed'];
      for (const e of r.effects.filter(e => e.kind === 'stat')) lines.push(change(statNames[e.key],p[e.key],p[e.key] + statGain(p,e.key,e.amount)));
      break;
    }
    default: lines=inventoryPreview(view,p,r,replaceIndex);
  }
  return {lines,text:lines.join(' · ')};
}
