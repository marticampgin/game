import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createMatch, applyCommand } from '../src/game/index.js';
import { BOT_PACING, planBotStep } from '../public/pacing.js';
import { createRooms } from '../server/rooms.js';

const initial = () => createMatch({seed:'watch-the-ring',players:[
  {id:'a',name:'Moss',classId:'guardian',bot:true},
  {id:'b',name:'Ivy',classId:'guardian',bot:true},
]});
const active = state => state.players.find(p => p.id === state.activeId);

test('bot planning uses the same command at both speeds and keeps the private draft out of its signal', () => {
  const state = initial();
  const normal = planBotStep(state);
  const fast = planBotStep(state,{fast:true});
  assert.deepEqual(normal.command,fast.command);
  assert.deepEqual(normal.intent,fast.intent);
  assert.ok(state.offers.includes(normal.command.rewardId));
  assert.equal(normal.intent.actionId,null);
  assert.equal(normal.intent.targetId,null);
  assert.equal(JSON.stringify(normal.intent).includes(normal.command.rewardId),false);
  assert.equal(normal.delayMs,BOT_PACING.normal.acquire);
  assert.ok(fast.delayMs < normal.delayMs);
  const next = applyCommand(state,state.activeId,normal.command);
  const p = active(next);
  p.attack = 100;
  const action = planBotStep(next);
  assert.equal(action.intent.actionId,'attack');
  assert.equal(action.intent.targetId,action.command.targetId);
  assert.equal(action.intent.actorId,p.id);
  assert.equal(action.delayMs,BOT_PACING.normal.action);
  p.bot = false;
  assert.equal(planBotStep(next),null);
  next.phase = 'finished';
  p.bot = true;
  assert.equal(planBotStep(next),null);
});

test('a prepared reactive or carried item never discloses the hidden item identity or target in advance', () => {
  let state = initial();
  state = applyCommand(state,state.activeId,planBotStep(state).command);
  const p = active(state);
  p.consumables = ['second-breath','pocket-eclipse'];
  for (const slot of p.abilities) slot.cooldown = 2;
  p.attack = 1;
  const plan = planBotStep(state);
  assert.equal(plan.command.actionId,'pocket-eclipse');
  assert.deepEqual([plan.intent.actionId,plan.intent.actionName,plan.intent.targetId],[null,null,null]);
  assert.doesNotMatch(JSON.stringify(plan.intent),/Eclipse|Breath|second-breath|pocket-eclipse/i);
});

test('a just-resolved chain receives bounded reading time exactly at the following bot step', () => {
  const state = initial();
  state.recentActions = [{events:Array.from({length:30},()=>({type:'damage'})),
    next:{activeId:state.activeId,phase:'acquire',globalTurn:state.globalTurn}}];
  assert.equal(planBotStep(state).delayMs,BOT_PACING.normal.acquire + BOT_PACING.normal.maxSettle);
  assert.equal(planBotStep(state,{fast:true}).delayMs,BOT_PACING.fast.acquire + BOT_PACING.fast.maxSettle);
  state.recentActions[0].next.globalTurn--;
  assert.equal(planBotStep(state).delayMs,BOT_PACING.normal.acquire);
});

test('the room publishes only the committed public bot step and immediately returns authority to a human', async () => {
  const rooms = createRooms({botDelay:100});
  try {
    const host = rooms.create({name:'Rook',capacity:2,fillBots:false});
    const guest = rooms.join(host.code,{name:'Fern'});
    const interact = (seat,operation,input = {}) => rooms.interact(host.code,seat.token,operation,input);
    assert.throws(() => interact(host,'start',{fastBots:'true'}),/bot speed/);
    const start = interact(host,'start',{fastBots:true});
    assert.equal(start.room.fastBots,true);
    assert.equal(start.game.botIntent,null);
    const [departing,other] = start.game.activeId === host.playerId ? [host,guest] : [guest,host];
    interact(departing,'leave');
    let view = interact(other,'view');
    const first = view.game.botIntent;
    assert.equal(first.actorId,departing.playerId);
    assert.deepEqual([first.phase,first.actionId,first.targetId],['acquire',null,null]);
    assert.deepEqual(view.game.offers,[]);
    assert.ok(!('command' in first) && !('rewardId' in first));
    const until = Date.now() + 4000;
    let publishedAction;
    while (Date.now() < until && view.game.activeId !== other.playerId) {
      await delay(10);
      view = interact(other,'view');
      if (view.game.botIntent?.phase === 'action') publishedAction = view.game.botIntent;
    }
    assert.ok(publishedAction);
    if (publishedAction.actionId) assert.equal(view.game.lastAction.actionId,publishedAction.actionId);
    assert.equal(view.game.activeId,other.playerId);
    assert.equal(view.game.botIntent,null);
    const pick = interact(other,'command',{revision:view.revision,command:{type:'pick',rewardId:view.game.offers[0]}});
    assert.equal(pick.game.phase,'action');
  } finally { rooms.close(); }
});
