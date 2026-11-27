import { expect, test } from '@playwright/test';
import { createMatch, sandboxEdit } from '../src/game/index.js';

function fixture(count) {
  const state = createMatch({
    seed: 'inspect-offer',
    players: Array.from({ length: count }, (_, i) => ({
      id: 'p' + i, name: 'Contender ' + (i + 1), classId: 'berserker', bot: false,
    })),
  });
  return { state, viewerId: state.activeId };
}

async function openMatch(page, payload) {
  await page.goto('/');
  await page.evaluate(data => sessionStorage.setItem('rift-solo', JSON.stringify(data)), payload);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose a reward' })).toBeVisible();
}

const saved = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('rift-solo')).state);

test('inspect with keyboard, switch offers and take exactly one reward', async ({ page }) => {
  const payload = fixture(2);
  payload.state.offers = ['blood-compass', 'fang-shard', 'cinder-orb'];
  await openMatch(page, payload);
  const before = await saved(page);
  const hero = before.players.find(p => p.id === payload.viewerId);
  await expect(page.getByRole('button', { name: 'Take reward' })).toBeDisabled();
  await expect(page.locator('[data-draft-select][aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('[data-pick]')).toHaveCount(0);

  const fire = page.getByRole('button', { name: 'Inspect Cinder Orb' });
  await fire.focus();
  await page.keyboard.press('Space');
  await expect(fire).toHaveAttribute('aria-pressed', 'true');
  await expect(fire).toBeFocused();
  await page.getByText('How Burn works', { exact: true }).click();
  await expect(page.locator('.draft-glossary dd')).toContainText('stack');
  const compass = page.getByRole('button', { name: 'Inspect Blood Compass' });
  await compass.click();
  await expect(fire).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.loot-draft')).toContainText('Blood Cleave');
  const fang = page.getByRole('button', { name: 'Inspect Fang Shard' });
  await fang.click();
  await expect(page.locator('[data-draft-select][aria-pressed=true]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Take Fang Shard', exact: true })).toBeEnabled();
  expect(await saved(page)).toEqual(before);
  await page.getByRole('button', { name: 'Take Fang Shard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Choose an action' })).toBeVisible();
  const after = await saved(page);
  expect(after.players.find(p => p.id === hero.id).attack).toBe(hero.attack + 2);
  expect(after.globalTurn).toBe(before.globalTurn);
});

test('reroll clears an inspected reward before accepting another choice', async ({ page }) => {
  await openMatch(page, fixture(2));
  await page.locator('[data-draft-select]').first().click();
  await expect(page.locator('[data-pick]')).toHaveCount(1);
  await page.getByRole('button', { name: /Reroll \(1\)/ }).click();
  await expect(page.getByRole('button', { name: /Reroll \(0\)/ })).toBeDisabled();
  await expect(page.locator('[data-draft-select]')).toHaveCount(3);
  await expect(page.locator('[data-draft-select][aria-pressed=true]')).toHaveCount(0);
  await expect(page.locator('[data-pick]')).toHaveCount(0);
});

test('an eight-contender desktop draft exposes copies and lets you cancel replacement', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const payload = fixture(8);
  for (const rewardId of ['red-tonic', 'spark-bottle', 'antidote', 'red-tonic', 'second-breath']) {
    payload.state = sandboxEdit(payload.state, { type: 'grant', playerId: payload.viewerId, rewardId });
  }
  payload.state.offers = ['second-breath', 'echo-rune', 'widows-brew'];
  await openMatch(page, payload);
  await expect(page.locator('.combatant')).toHaveCount(8);
  const before = await saved(page);
  const card = page.getByRole('button', { name: 'Inspect Second Breath' });
  await card.click();
  await expect(page.locator('.draft-review')).toContainText('Already carrying 1 copy');
  const confirm = page.getByRole('button', { name: 'Choose replacement for Second Breath' });
  for (const [width, height] of [[1280,720], [1440,900], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    await expect(confirm).toBeVisible();
    const boxes = await page.locator('[data-draft-select]').evaluateAll(nodes =>
      nodes.map(node => ({ width: node.offsetWidth, height: node.offsetHeight })));
    expect(boxes.every(box => box.width >= 44 && box.height >= 44)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await confirm.click();
  await expect(page.getByRole('dialog')).toContainText('Replace a slot');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await saved(page)).toEqual(before);
  await confirm.click();
  await page.getByRole('dialog').getByRole('button', { name: /Spark Bottle/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose an action' })).toBeVisible();
  const items = (await saved(page)).players.find(p => p.id === payload.viewerId).consumables;
  expect(items).toHaveLength(5);
  expect(items.filter(id => id === 'second-breath')).toHaveLength(2);
  expect(items).not.toContain('spark-bottle');
});

test('the third laptop offer reveals its confirmation within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const payload = fixture(8);
  payload.state.offers = ['second-breath', 'echo-rune', 'widows-brew'];
  await openMatch(page, payload);
  const third = page.getByRole('button', { name: 'Inspect Widow’s Brew' });
  await third.click();
  const confirm = page.getByRole('button', { name: 'Take Widow’s Brew' });
  await expect(confirm).toBeVisible();
  await expect.poll(() => confirm.evaluate(node => {
    const box = node.getBoundingClientRect();
    return box.top >= 0 && box.bottom <= innerHeight + 1;
  })).toBe(true);
});

test('three illustrated offers stay together on the arena and survive viewing the battlefield', async ({ page }) => {
  const payload = fixture(8);
  payload.state.offers = ['iron-shard', 'cinder-orb', 'starfall-cache'];
  await openMatch(page, payload);
  const stage = page.getByRole('region', { name: 'Battlefield' });
  const cards = stage.getByRole('group', { name: 'Reward offers' }).getByRole('button');
  await expect.poll(() => cards.evaluateAll(nodes => nodes.filter(node => node.querySelector('img').naturalWidth > 0).length)).toBe(3);
  for (const [width, height] of [[1280,720], [1366,768], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    const positions = await cards.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect();
      const image = node.querySelector('img');
      return { x: box.left, top: box.top, right: box.right, image: image.currentSrc };
    }));
    expect(positions).toHaveLength(3);
    expect(new Set(positions.map(card => card.image)).size).toBe(3);
    expect(positions.every(card => card.top === positions[0].top)).toBe(true);
    expect(positions[0].right).toBeLessThan(positions[1].x);
    expect(positions[1].right).toBeLessThan(positions[2].x);
    expect(positions[2].right).toBeLessThanOrEqual(width);
  }
  await cards.nth(1).click();
  const before = await saved(page);
  await stage.getByRole('button', { name: 'View arena' }).click();
  await expect(cards).toHaveCount(0);
  await expect(stage.locator('.combatant')).toHaveCount(8);
  await stage.getByRole('button', { name: 'Show rewards' }).click();
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(stage.getByRole('button', { name: 'Take Cinder Orb' })).toBeEnabled();
  expect(await saved(page)).toEqual(before);
});
