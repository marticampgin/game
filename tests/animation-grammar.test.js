import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { SHOP } from '../src/game/progression.js';
import { CLASSES, REWARDS } from '../src/game/catalog.js';
import { actorClip, effectRows, missiles, motionScore, rewardMotion } from '../public/combat-motion.js';
import { fighterAnchors, fighterLayout, fighterModel, fighterPortrait, fighterSkins, registerFighterSkin, resolveFighterSkin } from '../public/fighter-kit.js';
import { fighterSpriteHTML } from '../public/animation.js';

test('new rewards use their category, icon, target and effects to select a gesture', () => {
  const cases = [
    ['consumable', 'self', 'flask', { kind: 'heal' }, 'drink', 'heal'],
    ['consumable', 'enemy', 'bolt', { kind: 'status', key: 'shock' }, 'throw', 'shock'],
    ['consumable', 'self', 'rune', { kind: 'stat', key: 'attack' }, 'use', 'arcane'],
    ['item', 'self', 'shield', { kind: 'shield' }, 'use', 'ward'],
    ['ability', 'self', 'leaf', { kind: 'purify' }, 'invoke', 'heal'],
    ['ability', 'enemy', 'frost', { kind: 'status', key: 'chill' }, 'bolt', 'frost'],
    ['ability', 'enemy', 'fire', { kind: 'consumeHit', key: 'burn' }, 'eruption', 'fire'],
    ['ability', 'enemy', 'shield', { kind: 'hit', scale: 'armor' }, 'bash', 'bastion'],
    ['ability', 'enemy', 'axe', { kind: 'hit', scale: 'attack' }, 'weapon', 'cleave'],
  ];
  const id = 'test-reward';
  try {
    for (const [category, target, icon, effect, move, expected] of cases) {
      REWARDS[id] = { id, category, target, icon, effects: [effect] };
      const score = motionScore(id, 'berserker');
      assert.equal(score.move, move);
      assert.equal(score.effect, expected);
      assert.ok(missiles.includes(score.missile));
    }
    REWARDS[id].presentation = { move: 'wave', effect: 'frost' };
    assert.equal(motionScore(id, 'guardian').move, 'wave');
    assert.equal(actorClip(motionScore(id, 'guardian'), id, 'guardian'), 'cast');
    assert.throws(() => rewardMotion({ id, presentation: { move: 'typo' } }, 'guardian'), /Unknown animation move/);
    assert.throws(() => rewardMotion({ id, presentation: { effect: 'typo' } }, 'guardian'), /Unknown impact art/);
  } finally {
    delete REWARDS[id];
  }
});

test('every live action commits to an available clip and impact for each founder', () => {
  for (const role of Object.values(CLASSES)) {
    for (const reward of Object.values(REWARDS).filter(r => r.target && !r.reaction)) {
      const score = motionScore(reward.id, role.id);
      const clip = actorClip(score, reward.id, role.id);
      assert.ok([...fighterLayout.layers.motions.rows, 'consume'].includes(clip));
      assert.equal(clip === 'signature', reward.id === role.ability);
      assert.ok(effectRows.includes(score.effect));
      assert.ok(score.release <= score.contact && score.contact < score.path.at(-1)[0]);
    }
  }
  for (const id of ['red-tonic', 'antidote', 'widows-brew']) {
    const score = motionScore(id, 'guardian');
    assert.equal(score.gesture, 'drink');
    assert.equal(score.clip, 'consume');
  }
  assert.equal(motionScore('spark-bottle', 'guardian').gesture, 'throw');
  assert.equal(motionScore('pocket-eclipse', 'guardian').gesture, 'use');
  assert.equal(motionScore('removed', 'guardian', true).family, 'support');
});

test('an installed skin owns its portrait, model, consumable cels and attachment sockets', () => {
  const player = { classId: 'guardian', skinId: 'harvest-order' };
  const path = '/assets/skins/harvest/';
  const anchors = { mouth: [112, 38], hand: [124, 85] };
  const skin = { sheet: path + 'stand.png', consume: path + 'drink.webp',
    portrait: path + 'portrait.webp', model: path + 'body.png', anchors };
  registerFighterSkin(player.classId, player.skinId, skin);
  anchors.mouth[0] = 0;
  const actual = resolveFighterSkin(player.classId, player.skinId);
  assert.equal(actual.name, 'Harvest Order');
  assert.ok(fighterSkins('guardian').includes(actual));
  assert.ok(!fighterSkins('alchemist').some(s => s.id === player.skinId));
  assert.deepEqual(actual.anchors.mouth, [112, 38]);
  assert.equal(fighterPortrait(player), skin.portrait);
  assert.equal(fighterModel(player), skin.model);
  assert.match(fighterSpriteHTML({ ...player, hp: 2, maxHp: 10 }), /data-tier="critical"/);
  assert.match(fighterSpriteHTML(player), /data-consume-src="\/assets\/skins\/harvest\/drink.webp"/);
  assert.equal(fighterPortrait({ ...player, skinId: 'uninstalled' }), '/assets/portrait-guardian.webp');
  assert.throws(() => registerFighterSkin('guardian', 'bad-anchor', { ...skin, anchors: { hand: [300, 10] } }));
  assert.throws(() => registerFighterSkin('guardian', 'bad-portrait', { ...skin, portrait: '/untrusted/art.png' }));
});

test('prop attachments follow the selected painting and inherit missing points independently', () => {
  const anchors = { mouth: [130, 45], wounded: { hand: [110, 83] }, critical: { mouth: [109, 66] } };
  const sheet = '/assets/skins/winter.png';
  registerFighterSkin('guardian', 'winter', { sheet, anchors });
  anchors.critical.mouth[1] = 0;
  const skin = resolveFighterSkin('guardian', 'winter');
  assert.deepEqual(fighterAnchors('guardian', 'healthy', skin.anchors),
    { hand: [95, 75], mouth: [130, 45], ground: [166, 149] });
  assert.deepEqual(fighterAnchors('guardian', 'wounded', skin.anchors),
    { hand: [110, 83], mouth: [130, 45], ground: [164, 149] });
  assert.deepEqual(fighterAnchors('guardian', 'critical', skin.anchors),
    { hand: [100, 81], mouth: [109, 66], ground: [158, 149] });
  assert.deepEqual(fighterAnchors('new-role', 'critical'), fighterLayout.defaultAnchors.critical);
  assert.deepEqual(fighterAnchors('new-role', undefined), fighterLayout.defaultAnchors.healthy);
  for (const invalid of [{ injured: { mouth: [112, 41] } }, { critical: { wounded: {} } },
    { healthy: ['hand'] }, { wounded: { ground: [-1, 144] } }]) {
    assert.throws(() => registerFighterSkin('guardian', 'winter-invalid', { sheet, anchors: invalid }));
  }
});

test('every costume offered for coins or mastery ships its own complete painted kit', async () => {
  const listed = SHOP.filter(item => item.kind === 'skin');
  assert.equal(new Set(listed.map(item => item.skinId)).size, listed.length);
  for (const item of listed) {
    const skin = resolveFighterSkin(item.classId,item.skinId);
    assert.equal(skin.id,item.skinId,item.name + ' must not resolve to the Founder fallback');
    assert.equal(skin.name,item.name);
    for (const layer of [...Object.keys(fighterLayout.layers),'portrait','model']) {
      assert.ok(skin[layer],item.name + ' is missing ' + layer);
      await access(new URL('../public' + skin[layer],import.meta.url));
    }
  }
});
