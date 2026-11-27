import { expect, test } from '@playwright/test';
import { createMatch } from '../src/game/index.js';

function ring(seats) {
  const roles = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
  const players = Array.from({ length: seats }, (_, i) => ({
    id: 'seat' + i,
    name: 'Fighter ' + (i + 1),
    classId: roles[i % 4],
    bot: false,
  }));
  const state = createMatch({ seed: 'seat-layout', players });
  state.offers = ['iron-shard', 'fang-shard', 'heartwood'];
  return { state, viewerId: state.activeId };
}

function obstructedVitals() {
  return Array.from(document.querySelectorAll('.fighter-title, .fighter-hp')).flatMap((label) => {
    const box = label.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const seat = label.closest('[data-seat]');
    return top?.closest('[data-seat]') === seat ? [] : [seat.dataset.seat + ' ' + label.className];
  });
}

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test.describe(viewport.width + 'px arena', () => {
    test.use({ viewport });
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      test('keeps ' + count + ' seats on the same floor through inspection, targeting and drafting', async ({ page }) => {
        await page.goto('/');
        const save = ring(count);
        await page.evaluate((s) => sessionStorage.setItem('rift-solo', JSON.stringify(s)), save);
        await page.reload();
        await expect(page.locator('.combatant')).toHaveCount(count);
        // Every label and fighter must be on screen and above the reward shelf.
        const placement = await page.evaluate(() => {
          window.startingSprite = document.querySelector('.arena-sprite');
          const shelf = document.querySelector('.draft-stage').getBoundingClientRect().top;
          return [...document.querySelectorAll('.fighter-panel')].every((node) => {
            const rect = node.getBoundingClientRect();
            return rect.x >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= shelf;
          });
        });
        expect(placement, 'draft obstructs a seat in a ' + count + '-player match').toBe(true);
        expect(await page.evaluate(obstructedVitals), count + '-seat draft nameplates').toEqual([]);
        await page.getByRole('button', { name: 'View arena', exact: true }).click();
        await expect(page.locator('.draft-stage')).toHaveCount(0);
        await page.getByRole('button', { name: 'Show rewards', exact: true }).click();
        await page.locator('[data-draft-select="iron-shard"]').click();
        await page.locator('[data-pick="iron-shard"]').click();
        expect(await page.evaluate(obstructedVitals), count + '-seat battle nameplates').toEqual([]);
        for (const p of save.state.players.filter((p) => p.id !== save.viewerId)) {
          await page.locator('[data-aim="' + p.id + '"]').click();
          await expect(page.locator('.confirm-action')).toHaveAttribute('data-target', p.id);
        }
        expect(
          await page.evaluate(() => window.startingSprite === document.querySelector('.arena-sprite')),
        ).toBe(true);
      });
    }
  });
}
