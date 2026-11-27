import assert from 'node:assert/strict';
import test from 'node:test';
import { combatTiming } from '../public/combat-timing.js';

test('BLEED, lifesteal and the target hit keep their order with the blow on contact', () => {
  const bleed = { actorId: 'rival', targetId: 'self', type: 'damage', timing: 'action' };
  const heal = { targetId: 'rival', type: 'heal', timing: 'action' };
  const hit = { actorId: 'self', targetId: 'target', type: 'damage', timing: 'action' };
  const poison = { ...hit, timing: 'turn' };
  const events = [bleed, { ...bleed }, heal, hit, poison];
  for (const reduced of [true, false]) {
    const lead = reduced ? 40 : 495;
    const timing = combatTiming({ events, actorId: 'self', targetId: 'target' }, lead, reduced);
    assert.deepEqual(timing.beats.map(b => b.event), events);
    assert.equal(timing.primary, hit);
    assert.equal(timing.beats[3].time, timing.windup + lead);
    assert.ok(timing.beats.every((b, i) => b.time >= 0 && (!i || timing.beats[i - 1].time < b.time)));
  }
});

test('a long cascade reserves the chosen target hit while a loot action has its own contact cue', () => {
  const advance = { actorId: 'b', targetId: 'c', type: 'status', timing: 'action' };
  const hit = { actorId: 'a', targetId: 'b', type: 'damage', timing: 'action' };
  const events = [...Array.from({ length: 10 }, () => ({ ...advance })), hit, { ...hit, type: 'elimination' }];
  const long = combatTiming({ events, actorId: 'a', targetId: 'b' }, 400, false);
  assert.equal(long.beats.length, 6);
  assert.equal(long.beats.find(b => b.event === hit).time, long.contact);
  assert.equal(long.beats.at(-1).event.type, 'elimination');
  const empty = combatTiming({ events: [], actorId: 'a', targetId: 'a' }, 350, false);
  assert.equal(empty.primary, undefined);
  assert.equal(empty.windup, 0);
  assert.equal(empty.last, 350);
});
