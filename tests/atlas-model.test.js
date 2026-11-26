import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASSES, REWARDS } from '../src/game/catalog.js';
import { buildAtlas, MAP_HEIGHT, MAP_WIDTH, matchingRewards } from '../public/atlas-model.js';

const rewards = Object.values(REWARDS);
const graph = buildAtlas(rewards);

test('every catalog entry gets a distinct, visible and selectable node', () => {
  assert.equal(graph.points.size, rewards.length);
  const points = [...graph.points.values()];
  for (const [i, point] of points.entries()) {
    assert.ok(point.x >= 21 && point.x <= MAP_WIDTH - 21);
    assert.ok(point.y >= 21 && point.y <= MAP_HEIGHT - 21);
    for (const other of points.slice(i + 1)) assert.ok(Math.hypot(point.x - other.x, point.y - other.y) >= 41);
  }
});

test('one directed edge per reward pair includes every real ingredient', () => {
  const lookup = new Map(graph.edges.map(edge => [edge.from + '/' + edge.to, edge.ingredients]));
  assert.equal(lookup.size, graph.edges.length);
  for (const a of rewards) for (const b of rewards) {
    const ingredients = a.produces.filter(tag => b.consumes.includes(tag));
    assert.deepEqual(lookup.get(a.id + '/' + b.id), a !== b && ingredients.length ? ingredients : undefined);
  }
  assert.deepEqual(lookup.get('molten-mail/phoenix-heart'), ['burn']);
  assert.equal(lookup.has('phoenix-heart/molten-mail'), false);
});

test('search combines rarity, category, class affinity and mechanical tags', () => {
  const search = filters => matchingRewards(rewards, CLASSES, filters).map(r => r.id);
  assert.ok(search({ search: '  armor strike  ' }).includes('molten-mail'));
  assert.ok(search({ category: 'artifact', classId: 'guardian', tag: 'armor', rarity: 'epic' }).includes('fortress-oath'));
  assert.ok(!search({ classId: 'universal' }).includes('fortress-oath'));
  assert.ok(!search({ classId: 'alchemist' }).includes('fortress-oath'));
  assert.ok(search({ classId: 'guardian' }).includes('iron-shard'));
  assert.deepEqual(search({ search: 'no such reward here' }), []);
  assert.deepEqual(search({}), rewards.map(r => r.id));
});
