import { test, expect } from '@playwright/test';
import { createMatch, sandboxEdit } from '../src/game/index.js';

function seedBattle(count = 2) {
  const classes = ['guardian', 'alchemist', 'chronomancer', 'berserker'];
  let state = createMatch({
    seed: 'qa-courtyard',
    players: Array.from({ length: count }, (_, i) => ({
      id: 'p' + i,
      name: i ? 'Opponent ' + i : 'Wanderer of the North',
      classId: classes[i % 4],
      bot: false,
    })),
  });
  const hero = state.activeId;
  state.players.forEach((p) => (p.bot = p.id !== hero));
  return { state, viewerId: hero };
}
async function restore(page, payload) {
  await page.goto('/');
  await page.evaluate((data) => sessionStorage.setItem('rift-solo', JSON.stringify(data)), payload);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The Shattered Ring' })).toBeVisible();
}

test('title menu, real solo turns, previews, cooldowns, reload and victory', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/Riftbound/);
  await page.getByRole('button', { name: 'Settings and rules' }).click();
  await page.getByLabel('Faster bots in solo and hosted rooms').check();
  await page.getByLabel('Reduce motion').check();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Enter the arena' }).click();
  await page.getByRole('button', { name: 'Berserker', exact: true }).click();
  await page.getByRole('button', { name: /Match setup/ }).click();
  await page.getByLabel('Contenders').selectOption('2');
  // This opening contains no cooldown modifiers. Other seeds can legitimately
  // make Blood Cleave ready again before the next personal action.
  await page.getByLabel('Match seed (optional)').fill('cooldown-duel');
  await page.getByRole('button', { name: 'Start match' }).click();
  const firstCard = page.locator('.reward-card').first();
  await expect(firstCard).toBeVisible();
  await page.getByRole('button', { name: /Reroll \(1\)/ }).click();
  await expect(page.getByRole('button', { name: /Reroll \(0\)/ })).toBeDisabled();
  await firstCard.click();
  await page.locator('.draft-confirm').click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Choose an action' })).toBeVisible();
  await page.locator('[data-action="blood-cleave"]').click();
  await expect(page.locator('.preview')).toContainText('health damage');
  await page.locator('[data-execute="blood-cleave"]').click();
  await firstCard.waitFor();
  await firstCard.click();
  await page.locator('.draft-confirm').click();
  await expect(page.locator('[data-action="blood-cleave"]')).toBeDisabled();
  await page.locator('[data-ui="atlas"]').click();
  await expect(page.getByRole('heading', { name: 'Reward Atlas' })).toBeVisible();
  await page.locator('.rb-tool-back').click();
  await expect(page.getByRole('heading', { name: 'Choose an action' })).toBeVisible();

  // Drive every remaining player decision through the visible controls.
  for (let turn = 0; turn < 110; turn++) {
    await page.locator('.result, .reward-card, .action-grid').first().waitFor();
    if (await page.locator('.result').count()) break;
    if (await firstCard.count()) {
      await firstCard.click();
      await page.locator('.draft-confirm').click();
      if (await page.getByRole('heading', { name: 'Replace a slot' }).count())
        await page.locator('[data-replace]').first().click();
    } else {
      const cleave = page.locator('[data-action="blood-cleave"]');
      if ((await cleave.count()) && (await cleave.isEnabled())) await cleave.click();
      else {
        const attack = page.locator('[data-action="attack"]');
        if (await attack.isEnabled()) await attack.click();
        else await page.locator('[data-action="defend"]').click();
      }
      await page.locator('[data-execute]').click();
    }
  }
  await expect(page.locator('.result')).toContainText('Match complete');
  await page.locator('.result [data-ui="history"]').click();
  await expect(page.getByRole('dialog')).toContainText('Solo seed · cooldown-duel');
  await expect(page.locator('.history')).toContainText(/last contender standing|match is a draw/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByRole('button', { name: 'Start match' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('populated eight-seat Chaos state remains usable in a laptop window', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let { state, viewerId } = seedBattle(8);
  const rival = state.players.find((p) => p.id !== viewerId);
  for (const edit of [
    { type: 'round', value: 33 },
    { type: 'grant', playerId: rival.id, rewardId: 'second-breath' },
    { type: 'grant', playerId: viewerId, rewardId: 'phoenix-heart' },
    { type: 'status', playerId: viewerId, status: 'poison', value: 7 },
  ])
    state = sandboxEdit(state, edit);
  await restore(page, { state, viewerId });
  await expect(page.locator('.combatant')).toHaveCount(8);
  await expect(page.locator('.battle-heading')).toContainText('Age of Chaos');
  await page.locator('.fighter-info[data-inspect="' + rival.id + '"]').click();
  await expect(page.getByRole('dialog')).toContainText('Consumables · 1');
  await expect(page.getByRole('dialog')).not.toContainText('Second Breath');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Your inventory' }).click();
  await expect(page.getByRole('dialog')).toContainText('Poison ×7');
  await expect(page.getByRole('dialog')).toContainText('Phoenix Heart');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.locator('.reward-card').first().click();
  await page.locator('.draft-confirm').click();
  await page.locator('#target-select').selectOption(rival.id);
  await expect(page.locator('.preview')).toContainText('health damage');
  for (const [width, height] of [[1280,720], [1440,900], [1920,1080]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('an inventory replacement commits the chosen slot and a cancelled exit preserves it', async ({ page }) => {
  let { state, viewerId } = seedBattle();
  state.config.consumableSlots = 1;
  state = sandboxEdit(state, { type: 'grant', playerId: viewerId, rewardId: 'red-tonic' });
  state.offers = ['second-breath', 'heartwood', 'fang-shard'];
  await restore(page, { state, viewerId });
  await page.locator('[data-draft-select="second-breath"]').click();
  await page.locator('[data-pick="second-breath"]').click();
  await page.getByRole('button', { name: 'Red Tonic' }).click();
  await page.getByRole('button', { name: 'Your inventory' }).click();
  await expect(page.getByRole('dialog')).toContainText('Second Breath');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Leave match' }).click();
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Leave match' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave match' }).click();
  await expect(page.getByRole('button', { name: 'Enter the arena' })).toBeVisible();
});
