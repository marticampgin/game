import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

const names = ['Morrow', 'Aster of the North', 'Juniper', 'Cinder', 'Moss', 'Vesper', 'Rowan', 'Ember'];
const classes = ['guardian', 'alchemist', 'chronomancer', 'berserker'];

function crowdedBuild(seats) {
  let state = createMatch({
    seed: 'crowded-turn-' + seats,
    players: names
      .slice(0, seats)
      .map((name, i) => ({ id: 'p' + i, name, classId: classes[i % 4], bot: false })),
  });
  // The previous seat has just acted, so the recap competes for real space.
  state = applyCommand(state, state.activeId, { type: 'pick', rewardId: state.offers[0] });
  state = applyCommand(state, state.activeId, { type: 'act', actionId: 'defend' });
  const playerId = state.activeId;
  state = sandboxEdit(state, { type: 'round', value: 15 });
  const abilities = ['whiteout', 'cinder-orb', 'ward-lantern', 'menders-bell'];
  for (const rewardId of [...abilities, 'red-tonic', 'antidote', 'spark-bottle'])
    state = sandboxEdit(state, { type: 'grant', playerId, rewardId });
  for (const p of state.players) {
    state = sandboxEdit(state, { type: 'status', playerId: p.id, status: 'poison', value: 2 });
    state = sandboxEdit(state, { type: 'status', playerId: p.id, status: 'burn', value: 1 });
  }
  state.offers = ['iron-shard', 'spring-seed', 'fang-shard'];
  return { state, viewerId: playerId };
}

async function bounds(page) {
  return page.evaluate(() => {
    const confirm = document.querySelector('.confirm-action').getBoundingClientRect();
    return {
      bottom: Math.ceil(confirm.bottom + window.scrollY),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

for (const [width,height] of [[1024,768],[1280,720]]) {
  test('the eight-seat target selector keeps health and the native choice readable at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({width,height});
    const save = crowdedBuild(8);
    const [rival,longName] = save.state.players.filter(p => p.id !== save.viewerId);
    rival.name = 'Sparring rival';
    longName.name = 'W'.repeat(24);
    await page.goto('/');
    await page.evaluate(data => sessionStorage.setItem('rift-solo', JSON.stringify(data)),save);
    await page.reload();
    await page.locator('[data-draft-select="iron-shard"]').click();
    await page.locator('[data-pick="iron-shard"]').click();
    const select = page.getByRole('combobox',{name:'Target',exact:true});
    const health = page.locator('.target-caption small');
    await select.focus();
    for (const target of [rival,longName]) {
      await select.selectOption(target.id);
      await expect(select).toBeFocused();
      await expect(select.locator('option:checked')).toHaveText(`${target.name} (${target.hp} / ${target.maxHp})`);
      await expect(select).toHaveAttribute('title',`${target.name} (${target.hp} / ${target.maxHp})`);
      await expect(health).toHaveText(`${target.hp} / ${target.maxHp} HP`);
      const geometry = await page.locator('.aim-line').evaluate(line => {
        const label = line.querySelector('.target-name');
        const health = line.querySelector('.target-caption small').getBoundingClientRect();
        const field = line.getBoundingClientRect();
        const arrow = line.querySelector('.target-picker > svg').getBoundingClientRect();
        return {healthFits:health.left >= field.left - 1 && health.right <= field.right + 1,
          nameFits:label.scrollWidth <= label.clientWidth + 1,
          beforeArrow:label.getBoundingClientRect().right <= arrow.left + 1,
          ellipsis:getComputedStyle(label).textOverflow};
      });
      expect(geometry.healthFits).toBe(true);
      expect(geometry.beforeArrow).toBe(true);
      expect(geometry.ellipsis).toBe('ellipsis');
      expect(geometry.nameFits).toBe(target === rival);
    }
  });
}

for (const seats of [2, 8]) {
  for (const [device, viewport] of Object.entries({
    desktop: { width: 1366, height: 768 },
    laptop: { width: 1280, height: 720 },
  })) {
    test.describe(seats + '-seat late-game ' + device, () => {
      test.use({
        viewport,
        reducedMotion: 'reduce',
      });
      test('keeps a full loadout usable with a recap, statuses and an explicit target', async ({
        page,
      }, testInfo) => {
        const save = crowdedBuild(seats);
        const { viewerId, state } = save;
        const rival = state.players.findLast((p) => p.id !== viewerId);
        await page.goto('/');
        await page.evaluate((data) => sessionStorage.setItem('rift-solo', JSON.stringify(data)), save);
        await page.reload();
        await expect(page.locator('.turn-recap')).toContainText('Defend');
        await page.locator('[data-draft-select="iron-shard"]').click();
        await page.locator('[data-pick="iron-shard"]').click();
        await expect(page.locator('.dock-heading')).toContainText('Took Iron Shard');
        const confirm = page.locator('.confirm-action');
        await expect(page.locator('.action-pages')).toContainText('1–6 of 11');
        if (seats === 8) {
          await expect(confirm).toBeDisabled();
          await expect(page.locator('.action-description')).toContainText('Strike a rival');
        } else await expect(confirm).toHaveAttribute('data-target', rival.id);
        await page.getByRole('button', { name: 'More actions' }).click();
        await expect(page.locator('.action-pages')).toContainText('7–11 of 11');
        await page.locator('[data-action="ward-lantern"]').click();
        await expect(confirm).toHaveAttribute('data-target', viewerId);
        await expect(page.locator('.preview')).toContainText('12 shield');
        await page.getByRole('button', { name: 'Previous actions' }).click();
        await page.locator('[data-action="attack"]').click();
        await page.locator('[data-aim="' + rival.id + '"]').click();
        await expect(page.locator('#target-select')).toHaveValue(rival.id);
        await expect(page.locator('.marked')).toHaveAttribute('data-seat', rival.id);
        await page.locator('.fighter-info[data-inspect="' + rival.id + '"]').click();
        await expect(page.getByRole('dialog')).toContainText('Poison ×2');
        await page.getByRole('button', { name: 'Close dialog' }).click();
        await expect(confirm).toHaveAttribute('data-target', rival.id);
        await page.evaluate(() => window.scrollTo(0, 0));
        const layout = await bounds(page);
        expect(layout.overflow).toBe(0);
        expect(layout.bottom, 'confirmation below initial viewport').toBeLessThanOrEqual(viewport.height);
        const screenshot = testInfo.outputPath('battle-' + seats + '-' + device + '.png');
        await page.screenshot({ path: screenshot });
        await testInfo.attach('Target, estimate and confirmation', {
          path: screenshot,
          contentType: 'image/png',
        });
        await confirm.click();
        await expect(page.locator('.turn-recap .recap-who')).toContainText('Basic Attack');
        await expect(page.locator('.turn-recap .recap-route').first()).toContainText(rival.name);
        await expect(page.locator('.recap-toggle')).toBeFocused();
        await page.locator('.recap-toggle').press('Enter');
        await expect(page.locator('.recap-events')).toContainText('dealt');
      });
    });
  }
}
