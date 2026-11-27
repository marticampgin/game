import { expect, test } from '@playwright/test';
import { createMatch } from '../src/game/index.js';

for (const motion of ['no-preference', 'reduce']) {
  test('a confirmed reward reaches its owner with ' + motion + ' motion settings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: motion });
    const players = ['guardian', 'alchemist'].map((classId, i) => ({ classId, id: 'p' + i, name: classId }));
    const state = createMatch({ seed: 'desktop-reward', players });
    state.offers = ['iron-shard', 'cinder-orb', 'golden-shell'];
    await page.addInitScript(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)),
      { state, viewerId: state.activeId });
    await page.goto('/');
    await page.locator('[data-draft-select="iron-shard"]').click();
    await page.evaluate(owner => {
      const middle = box => [box.x + box.width / 2, box.y + box.height / 2];
      const card = document.querySelector('[data-draft-select="iron-shard"] .reward-art');
      const seat = document.querySelector('[data-seat="' + owner + '"] .fighter-art');
      const box = seat.getBoundingClientRect();
      const observed = window.pickEvidence = {
        origin: middle(card.getBoundingClientRect()), seat: [box.x, box.y, box.width, box.height],
        count: 0, arrived: false,
      };
      const observer = new MutationObserver(() => {
        const token = document.querySelector('.reward-flight img');
        if (!token) return;
        observer.disconnect();
        observed.count++;
        observed.src = new URL(token.src).pathname;
        const flight = token.getAnimations()[0];
        const frames = flight.effect.getKeyframes();
        const center = frame => {
          // Sample the actual endpoint transforms of the materialized animation.
          const transform = new DOMMatrixReadOnly(frame.transform);
          return [transform.m41 + token.offsetWidth / 2, transform.m42 + token.offsetHeight / 2];
        };
        observed.start = center(frames[0]);
        observed.end = center(frames.at(-1));
        flight.finished.then(() => { observed.arrived = true; }, () => {});
      });
      observer.observe(document.body, { childList: true });
    }, state.activeId);
    await page.locator('[data-pick="iron-shard"]').press('Enter');
    await expect(page.getByRole('heading', { name: 'Choose an action' })).toBeFocused();
    if (motion === 'no-preference') {
      await page.waitForFunction(() => window.pickEvidence.arrived);
      const record = await page.evaluate(() => window.pickEvidence);
      expect(record.count).toBe(1);
      expect(record.src).toBe('/assets/rewards/iron-shard.png');
      expect(Math.hypot(...record.start.map((n,i) => n - record.origin[i]))).toBeLessThan(2);
      const [x,y,width,height] = record.seat;
      expect(Math.hypot(record.end[0] - x - width / 2, record.end[1] - y - height * .52)).toBeLessThan(2);
    } else {
      expect(await page.evaluate(() => window.pickEvidence.count)).toBe(0);
    }
    await expect(page.locator('.reward-flight')).toHaveCount(0);
    await expect(page.locator('.dock-heading')).toContainText('Took Iron Shard');
  });
}

