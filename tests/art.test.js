import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import { classArt, rewardIcon } from '../public/art.js';
import { CLASSES, REWARDS } from '../src/game/catalog.js';

const assets = new URL('../public/assets/', import.meta.url);
const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('every catalog reward points to a distinct transparent PNG illustration', async () => {
  const directory = new URL('rewards/', assets);
  const files = await readdir(directory);
  assert.deepEqual(files.sort(), Object.keys(REWARDS).map(id => id + '.png').sort());
  const fingerprints = new Set();
  for (const reward of Object.values(REWARDS)) {
    const file = reward.id + '.png';
    const markup = rewardIcon(reward);
    assert.ok(markup.includes('src="/assets/rewards/' + file + '"'));
    const png = await readFile(new URL(file, directory));
    assert.deepEqual(png.subarray(0, 8), pngHeader, file);
    assert.equal(png[25], 6, file + ' must carry an RGBA color channel');
    assert.ok(png.readUInt32BE(16) >= 24 && png.readUInt32BE(20) >= 24, file);
    const fingerprint = createHash('sha256').update(png).digest('hex');
    assert.ok(!fingerprints.has(fingerprint), file + ' duplicates another reward illustration');
    fingerprints.add(fingerprint);
  }
});

test('classes, lobby statistics, menu entries and basic battle commands retain their artwork', async () => {
  for (const id of Object.keys(CLASSES)) {
    assert.equal(classArt(id), '/assets/' + id + '.png');
    for (const file of [id + '.png', 'portrait-' + id + '.webp']) {
      assert.ok((await readFile(new URL(file, assets))).length > 0, file);
    }
  }
  const icons = ['shield', 'axe', 'clock', 'flask', 'heart', 'sword', 'crystal', 'atlas', 'dice', 'chest', 'crown'];
  for (const key of icons) {
    const file = 'i-' + key + '.png';
    assert.deepEqual((await readFile(new URL(file, assets))).subarray(0, 8), pngHeader);
  }
  assert.ok(rewardIcon({ icon: 'shield' }).includes('src="/assets/i-shield.png"'));
  assert.ok(rewardIcon(undefined).includes('src="/assets/i-crystal.png"'));
});
