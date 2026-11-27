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
  assert.ok(long.beats.length <= 8);
  assert.deepEqual(long.beats.flatMap(b => b.events), events);
  assert.equal(long.beats.find(b => b.event === hit).time, long.contact);
  assert.equal(long.beats.at(-1).event.type, 'elimination');
  const empty = combatTiming({ events: [], actorId: 'a', targetId: 'a' }, 350, false);
  assert.equal(empty.primary, undefined);
  assert.equal(empty.windup, 0);
  assert.equal(empty.last, 350);
});

test('three different turn-start ticks each have a readable hold and preserve the complete health history', () => {
  const tick = cause => ({ type: 'damage', cause, actorId: 'b', targetId: 'b', timing: 'turn', amount: 3, healthDamage: 3 });
  const events = [tick('burn'), tick('poison'), tick('doom')];
  for (const reduced of [false, true]) {
    const timing = combatTiming({ actorId:'a', targetId:'a', events }, reduced ? 40 : 320, reduced);
    assert.deepEqual(timing.beats.map(b => b.event.cause), ['burn', 'poison', 'doom']);
    for (let i = 1; i < timing.beats.length; i++) {
      assert.ok(timing.beats[i].time - timing.beats[i - 1].time >= 600);
    }
    assert.ok(timing.last + timing.tail < 3300);
  }
});

test('consecutive doses share the burst and keep each source and HP transaction intact', () => {
  const make = (source, hp, shield) => ({ type: 'damage', cause: 'burn', actorId: source, targetId: 'g',
    timing: 'turn', amount: hp + shield, healthDamage: hp, shieldDamage: shield, shieldBroken: shield === 2 });
  const events = [make('b', 0, 2), make('c', 6, 0)];
  const { beats } = combatTiming({ actorId: 'a', targetId: 'g', events }, 400, false);
  assert.equal(beats.length, 1);
  assert.deepEqual(beats[0].events, events);
  assert.equal(beats[0].event.healthDamage, 6);
  assert.equal(beats[0].event.shieldDamage, 2);
  assert.equal(beats[0].event.shieldBroken, true);
  assert.deepEqual(beats[0].event.statusSources, ['b','c']);
});

test('a consumed Burn and pre-strike Bleed never claim contact from the actual weapon', () => {
  const events = [
    {type:'damage',cause:'bleed',actorId:'a',targetId:'a',timing:'action'},
    {type:'status',cause:'burn',statusChange:'consumed',actorId:'a',targetId:'b',timing:'action'},
    {type:'damage',actorId:'a',targetId:'b',timing:'action'},
  ];
  const result = combatTiming({actorId:'a',targetId:'b',events}, 425, false);
  assert.equal(result.primary, events[2]);
  assert.equal(result.beats[2].time, result.contact);
});
