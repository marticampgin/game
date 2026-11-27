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
export function planBotStep(state, { fast = false, delayOverride } = {}) {
  const actor = state.players.find(p => p.id === state.activeId);
  if (state.phase === 'finished' || !actor?.alive || !actor.bot) return null;
  const command = botCommand(state);
  const speed = fast ? BOT_PACING.fast : BOT_PACING.normal;
  const last = state.recentActions?.at(-1);
  const followsAction = last && last.next.globalTurn === state.globalTurn &&
    last.next.phase === state.phase && last.next.activeId === actor.id;
  const extraEffects = followsAction ? Math.max(0, last.events.length - 1) : 0;
  const delayMs = delayOverride ?? speed[state.phase] + Math.min(speed.maxSettle, speed.effect * extraEffects);
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
