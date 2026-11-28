import { CLASSES, DEFAULT_CONFIG, EVENTS, REWARDS, STATUSES } from './catalog.js';
import { drawOffers, eligible, sample, seedNumber, shuffled } from './draft.js';
import { assessHit, capacity, castCooldown, deal, executeEffects, findPlayer, grantReward, previewSelfSupport, rawHit, record, resolveDefend, restore, setStatus, spendConsumable, tickStatus } from './combat.js';
import { beginRecap, finishRecap, markBoundary, publicEvent, publicRecap, resumeRecap } from './recap.js';
import { careerSeat, careerView, countCareer } from './progression.js';
import { isSkinId } from './skin-id.js';

export { CLASSES, DEFAULT_CONFIG, EVENTS, RARITIES, REWARDS, STATUSES } from './catalog.js';
export { rarityWeights, resonance, eligible } from './draft.js';
export { currentAttack } from './combat.js';
export { previewReward } from './reward-preview.js';

const ageNames = ['Age of Discovery','Age of Conflict','Age of Ascension','Age of Chaos'];
const standard = {
  attack:{id:'attack',name:'Basic Attack',description:'Strike a rival for your effective attack, reduced by armor and shields.',target:'enemy',effects:[{kind:'hit',base:0,scale:'attack',factor:1}]},
  defend:{id:'defend',name:'Defend',description:'Gain 6 shield plus half your armor. Shield lasts until depleted.',target:'self'},
  scavenge:{id:'scavenge',name:'Scavenge',description:'Spend this action to draft one additional reward.',target:'self'}
};
const requireValue = (condition,message) => { if (!condition) throw Error(message); };
const integer = (value,min,max) => Number.isInteger(value) && value >= min && value <= max;

function configuration(overrides={}) {
  const config = structuredClone({...DEFAULT_CONFIG,...overrides});
  requireValue(integer(config.abilitySlots,1,30) && integer(config.consumableSlots,1,30),'Invalid inventory capacity.');
  requireValue(config.armorConstant > 0 && ['round','floor','ceil'].includes(config.rounding),'Invalid mitigation settings.');
  requireValue(config.ages.length === 4 && config.ages[0] === 1 && config.ages.every((r,i,a) => integer(r,1,10000) && (!i || r > a[i-1])),'Invalid ages.');
  requireValue(integer(config.eventInterval,1,1000) && integer(config.logLimit,10,5000),'Invalid event interval or history length.');
  requireValue(integer(config.adaptiveSlots,0,3) && config.resonanceWeight >= 0,'Invalid resonance settings.');
  requireValue(config.favoredChance >= 0 && config.exclusiveChance >= 0 && config.favoredChance + config.exclusiveChance <= 1,'Invalid class weighting.');
  requireValue(config.chaosBase > 0 && config.chaosStep > 0 && config.killHeal >= 0 && config.killHeal <= 1,'Invalid arena pressure or elimination healing.');
  requireValue(Array.isArray(config.rarityCurve) && config.rarityCurve.length &&
    config.rarityCurve.every((row,i,rows) => row.length === 6 && row.every(Number.isFinite) && (!i || row[0] > rows[i-1][0]) && row.slice(1).every(x => x >= 0) && row.slice(1).some(x => x > 0)),'Invalid rarity curve.');
  return config;
}
function makePlayer(seat) {
  requireValue(typeof seat.id === 'string' && seat.id.length && typeof seat.name === 'string' && seat.name.trim(),'Each contender needs an ID and a name.');
  requireValue(Object.hasOwn(CLASSES,seat.classId),'Unknown class.');
  const role = CLASSES[seat.classId];
  return {id:seat.id,name:seat.name.trim(),classId:role.id,bot:Boolean(seat.bot),...role.stats,hp:role.stats.maxHp,
    ...(isSkinId(seat.skinId) ? {skinId:seat.skinId} : {}),
    alive:true,shield:0,regen:0,rerolls:1,statuses:{},sources:{},abilities:[{id:role.ability,cooldown:0,modifiers:[]}],
    artifacts:[],consumables:[],personalTurn:0,usedBorrowedTime:false,extraTurnRound:0};
}
function ageAt(state) {
  return ageNames[state.config.ages.filter(r => state.round >= r).length - 1];
}
function announceEvent(state) {
  const round = (Math.floor(state.round / state.config.eventInterval) + 1) * state.config.eventInterval;
  const pool = Object.values(EVENTS).filter(e => round >= state.config.ages[1] || ['crystal-rain','fortunes-favor'].includes(e.id));
  const {id,name,description} = sample(state,pool);
  state.nextEvent = {id,name,description,round};
}
export function createMatch({seed,players,config,career}={}) {
  requireValue(Array.isArray(players) && players.length >= 2 && players.length <= 8,'A match needs 2–8 contenders.');
  requireValue(new Set(players.map(p => p.id)).size === players.length,'Each contender needs a unique ID.');
  seed ??= globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  const state = {version:1,seed:String(seed),rng:seedNumber(seed),config:configuration(config),players:players.map(makePlayer),
    round:1,age:ageNames[0],globalTurn:0,globalAction:0,phase:'acquire',activeId:null,winnerId:null,offers:[],
    remainingActions:1,extraTurnId:null,bonusDraft:false,order:[],queue:[],delayed:[],log:[],logSequence:0,nextEvent:null,recentActions:[]};
  if (career) {
    const seats = Object.fromEntries(players.flatMap((p, i) => Object.hasOwn(career.seats, p.id)
      ? [[p.id, careerSeat(career.runId, i, career.seats[p.id])]] : []));
    state.career = {runId:career.runId,seats};
  }
  state.order = shuffled(state,state.players.map(p => p.id));
  state.queue = [...state.order];
  announceEvent(state);
  startNextTurn(state);
  return state;
}

function conclude(state) {
  const living = state.players.filter(p => p.alive);
  if (living.length > 1) return false;
  state.phase = 'finished';
  state.winnerId = living[0]?.id ?? null;
  state.activeId = null;
  state.offers = [];
  state.bonusDraft = false;
  state.remainingActions = 0;
  record(state,'victory',living.length ? living[0].name + ' is the last contender standing.' : 'The arena claimed every contender. The match is a draw.');
  return true;
}
function arenaEvent(state,id) {
  requireValue(Object.hasOwn(EVENTS,id),'Unknown arena event.');
  const e = EVENTS[id];
  record(state,'event',e.name + ' · ' + e.description);
  for (const p of state.players.filter(p => p.alive)) executeEffects(state,p,p,e.effects,{label:e.name});
}
function beginRound(state) {
  state.round++;
  markBoundary(state,'round');
  state.age = ageAt(state);
  if (state.nextEvent.round <= state.round) {
    arenaEvent(state,state.nextEvent.id);
    announceEvent(state);
  }
  const chaosStart = state.config.ages[3];
  if (state.round >= chaosStart) {
    const amount = state.config.chaosBase + (state.round - chaosStart) * state.config.chaosStep;
    record(state,'event','The arena burns. All living contenders take ' + amount + ' unavoidable damage.');
    // All seats take the pulse before the victory check so simultaneous deaths can draw.
    for (const p of state.players.filter(p => p.alive)) deal(state,null,p,amount,'Arena fire',{trueDamage:true,bypassShield:true,cause:'arena-fire'});
    if (conclude(state)) return;
  }
  state.queue = state.order.filter(id => findPlayer(state,id).alive);
}
function startNextTurn(state) {
  for (;;) {
    if (conclude(state)) return;
    if (!state.extraTurnId && !state.queue.length) {
      beginRound(state);
      if (state.phase === 'finished') return;
    }
    const id = state.extraTurnId ?? state.queue.shift();
    state.extraTurnId = null;
    const p = findPlayer(state,id);
    if (!p?.alive) continue;
    state.activeId = id;
    markBoundary(state,'turn',id);
    state.globalTurn++;
    p.personalTurn++;
    p.usedBorrowedTime = false;
    state.phase = 'acquire';
    state.remainingActions = p.classId === 'chronomancer' && p.personalTurn % 5 === 0 ? 2 : 1;
    state.bonusDraft = false;
    for (const a of p.abilities) a.cooldown = Math.max(0,a.cooldown - 1);
    record(state,'turn',p.name + ' begins a turn.',{actorId:id});
    const due = state.delayed.filter(e => e.due <= state.globalTurn);
    state.delayed = state.delayed.filter(e => e.due > state.globalTurn);
    for (const e of due) deal(state,findPlayer(state,e.source),findPlayer(state,e.target),e.raw,e.label,{trueDamage:e.trueDamage,cause:'echo'});
    for (const key of ['burn','poison']) tickStatus(state,p,key);
    if (p.alive && p.doomClock && --p.doomClock === 0) tickStatus(state,p,'doom');
    if (conclude(state)) return;
    if (!p.alive) continue;
    restore(state,p,p.regen,'regeneration');
    state.offers = drawOffers(state,p);
    return;
  }
}
function finishAction(state,p) {
  if (conclude(state)) return;
  state.remainingActions--;
  if (p.alive && state.remainingActions > 0) {
    state.phase = 'action';
    state.bonusDraft = false;
    return;
  }
  if (p.statuses.curse) {
    setStatus(p,'curse',p.statuses.curse - 1);
    record(state,'status',p.name + ' lost one stack of Curse.',{targetId:p.id,amount:1,cause:'curse',statusChange:'decayed',statusRemaining:p.statuses.curse || 0});
  }
  startNextTurn(state);
}
function actionDefinition(p,id) {
  if (Object.hasOwn(standard,id)) return standard[id];
  const ability = p.abilities.some(a => a.id === id);
  return ability || p.consumables?.includes(id) ? REWARDS[id] : undefined;
}
function disabledReason(state,p,def) {
  if (state.phase !== 'action' || p.id !== state.activeId || !p.alive) return 'Wait for your action phase.';
  if (def.reaction) return 'Triggers automatically.';
  if (p.statuses.freeze && !['defend','scavenge'].includes(def.id)) return 'Frozen. Defend or Scavenge to thaw.';
  if (def.oncePerRound && p.extraTurnRound === state.round) return 'Already used this round.';
  const slot = p.abilities.find(a => a.id === def.id);
  if (slot?.cooldown) return 'Ready in ' + slot.cooldown + ' personal turn' + (slot.cooldown === 1 ? '.' : 's.');
  return '';
}
export function getActions(state,playerId=state.activeId) {
  const p = findPlayer(state,playerId);
  if (!p) return [];
  const ids = new Set(['attack',...p.abilities.map(a => a.id),...(p.consumables || []),'defend','scavenge']);
  return [...ids].map(id => {
    const def = actionDefinition(p,id);
    const reason = disabledReason(state,p,def);
    return {id,name:def.name,description:def.description,target:def.target,category:def.category || 'basic',icon:def.icon,
      cooldown:p.abilities.find(a => a.id === id)?.cooldown || 0,disabled:!!reason,reason};
  });
}
export function previewAction(state,playerId,actionId,targetId) {
  const p = findPlayer(state,playerId);
  const def = p && actionDefinition(p,actionId);
  if (!def) return {text:'Action unavailable.'};
  const target = def.target === 'enemy' ? findPlayer(state,targetId) : p;
  if (!target || !target.alive || (def.target === 'enemy' && target === p)) return {text:'Select a living rival.'};
  const effect = def.effects?.find(e => ['hit','consumeHit'].includes(e.kind));
  if (effect) {
    const slot = p.abilities.find(a => a.id === actionId);
    const hit = assessHit(state,target,rawHit(p,target,effect,slot),{trueDamage:effect.trueDamage,direct:true});
    const status = def.effects.find(e => e.kind === 'status');
    let text = hit.healthDamage + ' health damage' + (hit.shieldDamage ? ' · ' + hit.shieldDamage + ' absorbed' : '');
    if (status) text += ' · ' + status.amount * (status.key === 'burn' && p.artifacts.includes('phoenix-feather') ? 2 : 1) + ' ' + STATUSES[status.key].name;
    return {...hit,text};
  }
  return previewSelfSupport(p,def) || {text:def.description};
}
function act(state,p,command) {
  const def = actionDefinition(p,command.actionId);
  requireValue(def,'You do not have that action.');
  const reason = disabledReason(state,p,def);
  requireValue(!reason,reason);
  const target = def.target === 'enemy' ? findPlayer(state,command.targetId) : p;
  requireValue(target?.alive && (def.target !== 'enemy' || target !== p),'Select a living rival.');
  state.globalAction++;
  record(state,'action',p.name + ' used ' + def.name + (target === p ? '.' : ' on ' + target.name + '.'),{actorId:p.id,targetId:target.id});
  const announcement = state.log.at(-1);
  beginRecap(state,p,def,target);
  if (p.statuses.freeze) {
    setStatus(p,'freeze',0);
    record(state,'status',p.name + ' thawed.',{targetId:p.id,cause:'freeze',statusChange:'thawed',statusRemaining:0});
  }
  if (def.target === 'enemy') tickStatus(state,p,'bleed');
  if (!p.alive || !target.alive) {
    // Bleed can cancel an attempted throw before spending the private item.
    // Its identity must stay out of the public command header and timeline.
    if (def.category === 'consumable') {
      const recap = state.recentActions.at(-1);
      recap.actionId = 'interrupted';
      recap.actionName = 'Interrupted action';
      announcement.text = p.name + ' attempted an action on ' + target.name + '.';
    }
    record(state,'timing',p.name + '’s action was interrupted.',{actorId:p.id,targetId:target.id});
    finishAction(state,p);
    return;
  }
  if (def.category === 'ability') countCareer(state, p.id, 'abilities');
  if (def.id === 'defend') countCareer(state, p.id, 'defends');
  if (def.id === 'scavenge') {
    countCareer(state, p.id, 'scavenges');
    state.offers = drawOffers(state,p);
    state.bonusDraft = true;
    state.phase = 'acquire';
    record(state,'timing',p.name + ' opened an additional reward draft.',{actorId:p.id});
    return;
  }
  if (def.id === 'defend') {
    resolveDefend(state,p);
  } else {
    const slot = p.abilities.find(a => a.id === def.id);
    if (slot) slot.cooldown = castCooldown(def,slot);
    if (def.category === 'consumable') spendConsumable(state,p,def.id);
    executeEffects(state,p,target,def.effects,{label:def.name,slot});
  }
  finishAction(state,p);
}
export function applyCommand(previous,playerId,command) {
  requireValue(previous.phase !== 'finished','This match has finished.');
  requireValue(previous.activeId === playerId,'It is another contender’s turn.');
  requireValue(command && typeof command === 'object','Invalid command.');
  const state = structuredClone(previous);
  const p = findPlayer(state,playerId);
  if (command.type === 'act') {
    requireValue(state.phase === 'action','Choose a reward first.');
    act(state,p,command);
  } else {
    requireValue(state.phase === 'acquire','This is the action phase.');
    if (command.type === 'reroll') {
      requireValue(p.rerolls > 0,'No rerolls remain.');
      p.rerolls--;
      state.offers = drawOffers(state,p);
      record(state,'reward',p.name + ' rerolled the draft.',{actorId:p.id});
    } else {
      requireValue(command.type === 'pick' && state.offers.includes(command.rewardId),'Choose one of the offered rewards.');
      if (state.bonusDraft && state.recentActions?.at(-1)?.actionId === 'scavenge') resumeRecap(state);
      grantReward(state,p,command.rewardId,command.replaceIndex);
      countCareer(state,p.id,'drafts');
      state.offers = [];
      if (state.bonusDraft) finishAction(state,p);
      else state.phase = 'action';
    }
  }
  finishRecap(state);
  if (state.careerJournal) state.careerJournal.push(structuredClone(command));
  return state;
}

export function viewMatch(state,viewerId=null) {
  const {round,age,phase,activeId,winnerId,globalTurn,globalAction,remainingActions,bonusDraft,order,log,nextEvent} = state;
  // Construct the wire contract explicitly. New bookkeeping or private mechanics
  // added to an engine player must never become public merely by being present.
  const players = state.players.map(p => ({
    id:p.id,name:p.name,classId:p.classId,bot:p.bot,alive:p.alive,hp:p.hp,maxHp:p.maxHp,
    ...(isSkinId(p.skinId) ? {skinId:p.skinId} : {}),
    attack:p.attack,armor:p.armor,spellPower:p.spellPower,shield:p.shield,regen:p.regen,rerolls:p.rerolls,
    statuses:p.statuses,abilities:p.abilities.map(({id,cooldown,modifiers}) => ({id,cooldown,modifiers})),
    artifacts:p.artifacts,personalTurn:p.personalTurn,
    ...(p.doomClock ? {doomClock:p.doomClock} : {}),
    consumableCount:p.consumables.length,abilityCapacity:capacity(state,p,'abilities'),consumableCapacity:capacity(state,p,'consumables'),
    ...(p.id === viewerId ? {consumables:p.consumables,extraTurnRound:p.extraTurnRound} : {})
  }));
  const upcoming = phase === 'finished' ? [] : [activeId,state.extraTurnId,...state.queue,...order].filter(id => id && findPlayer(state,id)?.alive);
  const recentActions = (state.recentActions || []).map(publicRecap);
  const career = careerView(state, viewerId);
  return structuredClone({...(career ? {career} : {}),round,age,phase,activeId,winnerId,globalTurn,globalAction,remainingActions,bonusDraft,order,upcoming,players,
    log:log.map(publicEvent),recentActions,lastAction:recentActions.at(-1) || null,nextEvent,config:{abilitySlots:state.config.abilitySlots,consumableSlots:state.config.consumableSlots,
      armorConstant:state.config.armorConstant,rounding:state.config.rounding},offers:viewerId && viewerId === activeId ? state.offers : []});
}

export function sandboxEdit(previous,edit) {
  requireValue(previous.phase !== 'finished','Start a new experiment after a match ends.');
  const state = structuredClone(previous);
  delete state.career;
  delete state.careerJournal;
  const p = findPlayer(state,edit.playerId);
  if (!['event','round'].includes(edit.type)) requireValue(p?.alive,'Select a living contender.');
  switch (edit.type) {
    case 'skin':
      requireValue(isSkinId(edit.skinId),'Choose a valid skin.');
      if (edit.skinId === 'founder') delete p.skinId;
      else p.skinId = edit.skinId;
      break;
    case 'class': {
      requireValue(Object.hasOwn(CLASSES,edit.classId),'Choose a valid class.');
      if (edit.classId === p.classId) return state;
      const replacement = makePlayer({id:p.id,name:p.name,bot:p.bot,classId:edit.classId});
      replacement.personalTurn = p.personalTurn;
      state.players[state.players.indexOf(p)] = replacement;
      if (p.id === state.activeId) {
        state.remainingActions = 1;
        if (state.phase === 'acquire') state.offers = drawOffers(state,replacement);
      }
      if (state.extraTurnId === p.id) state.extraTurnId = null;
      break;
    }
    case 'pilot':
      for (const seat of state.players) seat.bot = seat.id !== p.id;
      break;
    case 'grant':
      grantReward(state,p,edit.rewardId,edit.replaceIndex);
      break;
    case 'stat':
      requireValue(['hp','maxHp','attack','armor','spellPower','shield','regen','rerolls'].includes(edit.stat),'Unknown stat.');
      requireValue(integer(edit.value,['hp','maxHp'].includes(edit.stat) ? 1 : 0,9999),'Invalid stat value.');
      p[edit.stat] = edit.value;
      p.hp = Math.min(p.hp,p.maxHp);
      break;
    case 'status':
      requireValue(Object.hasOwn(STATUSES,edit.status) && integer(edit.value,0,999),'Invalid status.');
      setStatus(p,edit.status,0);
      if (edit.value) executeEffects(state,p,p,[{kind:'status',key:edit.status,amount:edit.value,target:'self'}],{label:'Sandbox'});
      break;
    case 'round':
      requireValue(integer(edit.value,1,999),'Invalid round.');
      state.round = edit.value;
      state.age = ageAt(state);
      announceEvent(state);
      break;
    case 'event': arenaEvent(state,edit.eventId); break;
    case 'cooldown': {
      const a = p.abilities.find(a => a.id === edit.abilityId);
      requireValue(a && integer(edit.value,0,99),'Invalid cooldown.');
      a.cooldown = edit.value;
      break;
    }
    default: throw Error('Unknown sandbox operation.');
  }
  if (state.phase === 'acquire') {
    const drafter = findPlayer(state,state.activeId);
    if (edit.type === 'round' || state.offers.some(id => !eligible(drafter,REWARDS[id]))) {
      state.offers = drawOffers(state,drafter);
    }
  }
  record(state,'sandbox','Sandbox applied ' + edit.type + (p ? ' to ' + p.name : '') + '.');
  return state;
}

// Bots deliberately use the same public projection and commands as a human seat.
// A small deterministic preference per turn prevents all opponents from following
// one fixed draft priority or ganging up on the same contender every round.
export function botCommand(state) {
  requireValue(state.phase !== 'finished','This match has finished.');
  const view = viewMatch(state,state.activeId);
  const p = findPlayer(view,view.activeId);
  const preference = (id) => seedNumber([p.id,p.personalTurn,view.globalAction,id].join('/')) / 4294967296;
  if (view.phase === 'acquire') {
    const score = (id) => {
      const r = REWARDS[id];
      const favored = r.tags.some(tag => CLASSES[p.classId].favored.includes(tag));
      const rare = ['common','uncommon','rare','epic','legendary'].indexOf(r.rarity);
      return preference(id) * 5 + Number(favored) + rare * 0.55 + Number(id === 'red-tonic' && p.hp < p.maxHp / 2) * 2;
    };
    const rewardId = [...view.offers].sort((a,b) => score(b) - score(a))[0];
    return {type:'pick',rewardId,replaceIndex:0};
  }
  const ready = getActions(view,p.id).filter(a => !a.disabled);
  const enemies = view.players.filter(other => other.alive && other.id !== p.id);
  const picks = [];
  for (const action of ready) {
    for (const target of action.target === 'enemy' ? enemies : [p]) {
      const preview = previewAction(view,p.id,action.id,target.id);
      const r = REWARDS[action.id];
      let score = 0;
      if (action.target === 'enemy') {
        score = (preview.damage || 0) + (r?.effects.some(e => e.kind === 'status') ? 6 : 0);
        if (preview.healthDamage >= target.hp) score += 12;
        // Consider an armored leader's threat alongside immediate damage. Otherwise
        // a whole table tends to ignore the best-defended rival until the final duel.
        const leaderThreat = target.hp / target.maxHp * 4 + target.armor * 0.33 + target.attack * 0.12;
        if (enemies.length > 1) score += leaderThreat - 6;
      } else if (action.id === 'scavenge') score = view.round <= 8 ? 8 : 0;
      else if (action.id === 'defend' || r?.effects.some(e => e.kind === 'shield')) score = p.shield < 12 ? 8 : 0;
      else if (r?.effects.some(e => e.kind === 'heal')) score = Math.min(24,p.maxHp - p.hp);
      else if (r?.effects.some(e => e.kind === 'purify')) score = (p.statuses.poison || 0) * 6;
      else if (r?.effects.some(e => e.kind === 'extraTurn')) score = 30;
      picks.push({actionId:action.id,targetId:target.id,score:score + preference(action.id + '/' + target.id) * 18});
    }
  }
  const best = picks.sort((a,b) => b.score - a.score)[0];
  return {type:'act',actionId:best.actionId,targetId:best.targetId};
}

export function replayMatch(options,commands) {
  requireValue(options?.seed != null,'Replay requires the original match seed.');
  return commands.reduce((state,command) => applyCommand(state,state.activeId,command),createMatch(options));
}

export function simulateMatch(options,limit=20000) {
  let state = createMatch(options);
  let count = 0;
  let firstElimination = null;
  while (state.phase !== 'finished' && count < limit) {
    state = applyCommand(state,state.activeId,botCommand(state));
    count++;
    if (!firstElimination && state.players.some(p => !p.alive)) firstElimination = state.round;
  }
  requireValue(state.phase === 'finished','Simulation command limit exceeded.');
  return {state,commands:count,firstElimination};
}
