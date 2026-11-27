import { combatTiming } from './combat-timing.js';
import { motionScore } from './combat-motion.js';
import { statusCue } from './status-effects.js';
import { botCommand, REWARDS } from '../src/game/index.js';

// A normal decision stays visible across two room polls. A long outcome gets
// extra reading time while the next bot drafts. Human commands never wait.
export const BOT_PACING = Object.freeze({
  normal: Object.freeze({ acquire: 1450, action: 1750, effect: 170, maxSettle: 850 }),
  fast: Object.freeze({ acquire: 240, action: 420, effect: 30, maxSettle: 120 }),
});

const basicNames = { attack: 'Basic Attack', defend: 'Defend', scavenge: 'Scavenge' };

/**
 * Plan exactly one deterministic bot command. Only intent may be sent to a
 * viewer. The command can contain draft choices or a concealed consumable.
 */
export function planBotStep(state, { fast = false, delayOverride, roomPlayback = false } = {}) {
  const actor = state.players.find(p => p.id === state.activeId);
  if (state.phase === 'finished' || !actor?.alive || !actor.bot) return null;
  const command = botCommand(state);
  const speed = fast ? BOT_PACING.fast : BOT_PACING.normal;
  const last = state.recentActions?.at(-1);
  const followsAction = last && last.next.globalTurn === state.globalTurn &&
    last.next.phase === state.phase && last.next.activeId === actor.id;
  const extraEffects = followsAction ? Math.max(0, last.events.length - 1) : 0;
  let delayMs = speed[state.phase] + Math.min(speed.maxSettle, speed.effect * extraEffects);
  // Solo starts its timer when the picture finishes. Room bots have their own
  // clock, so let clients read the conditions before the next bot decision.
  if (roomPlayback && followsAction && last.events.some(event => statusCue(event))) {
    const previous = state.players.find(p => p.id === last.actorId);
    const score = motionScore(last.actionId, previous?.classId, last.actorId === last.targetId);
    const {last:finalBeat, tail} = combatTiming(last, score.contact, false);
    const playbackRate = fast && previous?.bot ? 2.3 : 1;
    delayMs = Math.max(delayMs, Math.ceil((finalBeat + tail) / playbackRate));
  }
  delayMs = delayOverride ?? delayMs;
  const knownAction = command.type === 'act' &&
    (Object.hasOwn(basicNames, command.actionId) || actor.abilities.some(slot => slot.id === command.actionId));
  const actionId = knownAction ? command.actionId : null;
  const intent = {
    actorId: actor.id, phase: state.phase, globalTurn: state.globalTurn, globalAction: state.globalAction,
    actionId, actionName: actionId ? (basicNames[actionId] || REWARDS[actionId].name) : null,
    targetId: knownAction ? command.targetId ?? actor.id : null,
  };
  return { command, delayMs, intent };
}
