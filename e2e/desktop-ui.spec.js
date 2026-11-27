import { expect, test } from '@playwright/test';
import { createMatch } from '../src/game/index.js';

test('keyboard users can close a centered dialog and return from each main menu destination', async ({ page }) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings and rules' });
  await settings.focus();
  await settings.press('Enter');
  const close = page.getByRole('dialog', { name: 'Settings & rules' }).getByRole('button', { name: 'Close dialog' });
  await expect(close).toBeFocused();
  const offset = await close.evaluate(button => {
    const target = button.getBoundingClientRect();
    const glyph = button.querySelector('svg').getBoundingClientRect();
    return [glyph.x + glyph.width / 2 - target.x - target.width / 2,
      glyph.y + glyph.height / 2 - target.y - target.height / 2];
  });
  for (const delta of offset) expect(Math.abs(delta)).toBeLessThanOrEqual(0.5);
  await close.press('Tab');
  const toggle = page.getByLabel('Sound effects');
  await expect(toggle).toBeFocused();
  const before = await toggle.isChecked();
  await toggle.press('Space');
  expect(await toggle.isChecked()).toBe(!before);
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();

  for (const [destination, back] of [['lobby', '[data-lobby=back]'], ['atlas', '.rb-tool-back'], ['sandbox', '.rb-tool-back']]) {
    const opener = page.locator('[data-ui="' + destination + '"]');
    await opener.focus();
    await opener.press('Enter');
    await page.locator(back).press('Enter');
    await expect(opener).toBeFocused();
  }
});

async function camera(page) {
  return page.locator('.arena-world').evaluate(arena => {
    const bounds = node => {
      const rect = node.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map(Math.round);
    };
    const style = getComputedStyle(arena);
    return {
      arena: bounds(arena),
      crop: [style.backgroundPosition, style.backgroundSize],
      seats: [...arena.querySelectorAll('.fighter-art')].map(bounds),
    };
  });
}

const classes = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
  for (const seats of [2, 8]) {
    test('keeps the same camera and clickable vitals across a ' + seats + '-seat turn at ' + width, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const state = createMatch({ seed: 'gui3', players: Array.from({ length: seats }, (_, i) => ({
        id: 'p' + i, name: 'Player ' + (i + 1), classId: classes[i % classes.length], bot: false,
      })) });
      state.offers = ['iron-shard', 'ward-lantern', 'cinder-orb'];
      await page.goto('/');
      await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), { state, viewerId: state.activeId });
      await page.reload();
      await page.locator('[data-draft-select="iron-shard"]').click();
      const take = page.locator('[data-pick="iron-shard"]');
      await expect(take).toBeInViewport({ ratio: 1 });
      const labels = page.locator('.fighter-hp');
      await expect(labels).toHaveCount(seats);
      const visibleLabels = await labels.evaluateAll(nodes => nodes.every(node => {
        const b = node.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return hit?.closest('.combatant') === node.closest('.combatant');
      }));
      expect(visibleLabels).toBe(true);
      const starting = await camera(page);
      await take.click();
      await expect(page.locator('.command-deck')).toBeVisible();
      expect(await camera(page)).toEqual(starting);
      await page.locator('[data-action="defend"]').click();
      await page.locator('[data-execute="defend"]').click();
      await expect(page.locator('.watch')).toBeVisible();
      expect(await camera(page)).toEqual(starting);
      await expect(page.getByRole('region', { name: 'Last action' })).toContainText('Defend');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    });
  }
}
