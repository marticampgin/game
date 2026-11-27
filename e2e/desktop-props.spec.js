import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

const classes = ['guardian', 'berserker', 'chronomancer', 'alchemist'];

function turn(count, index, role, action, band) {
  const players = Array.from({ length: count }, (_, i) => ({
    id: 'seat-' + i, name: 'Fighter ' + i, classId: i === index ? role : classes[i % 4], bot: false,
  }));
  const viewerId = players[index].id;
  let state;
  for (let seed = 0; seed < 200; seed++) {
    state = createMatch({ players, seed: 'staged-props-' + seed });
    if (state.activeId === viewerId) break;
  }
  if (action !== 'scavenge') state = sandboxEdit(state, { type: 'grant', playerId: viewerId, rewardId: action });
  const fighter = state.players.find(p => p.id === viewerId);
  const hp = Math.round(fighter.maxHp * ({ healthy: 1, wounded: .49, critical: .2 })[band]);
  state = sandboxEdit(state, { type: 'stat', playerId: viewerId, stat: 'hp', value: hp });
  return { viewerId, state: applyCommand(state, viewerId, { type: 'pick', rewardId: state.offers[0] }) };
}

// Observe the impact on the game's own paint clock. The browser driver can
// arrive well after the chest, shared consumable strip and bottle are removed.
async function play(page, save, action) {
  await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), save);
  await page.reload();
  await page.locator('[data-action="' + action + '"]').click();
  expect(await page.evaluate(async players => (await (await import('/animation.js')).preloadArenaSkins(players)).every(Boolean), save.state.players)).toBe(true);
  await page.evaluate(() => {
    const world = document.querySelector('.arena-world');
    const data = window.propSample = { countCoins: 0 };
    const observer = new MutationObserver(() => {
      const scene = world.querySelector('.arena-fx');
      if (!scene) {
        if (data.impact) { data.done = true; observer.disconnect(); }
        return;
      }
      data.countCoins = Math.max(data.countCoins, scene.querySelectorAll('[data-prop="coin"]').length);
      if (scene.dataset.stage !== 'impact' || data.impact) return;
      const actor = scene.querySelector('.arena-fx-actor');
      const sprite = actor.querySelector('.arena-sprite');
      const element = scene.querySelector('[data-prop]:not([data-prop="coin"])');
      const bounds = element.getBoundingClientRect();
      const feet = actor.getBoundingClientRect();
      const cel = getComputedStyle(sprite.querySelector('.arena-cel'));
      const style = getComputedStyle(element);
      data.impact = {
        kind: element.dataset.prop, icon: element.dataset.icon,
        inHand: element.parentElement === actor, facing: actor.dataset.facing,
        band: sprite.dataset.tier, clip: sprite.dataset.track, sheet: cel.backgroundImage,
        exposure: Math.round(parseFloat(cel.backgroundPositionX) * .11),
        cellY: parseFloat(cel.backgroundPositionY), z: Number(style.zIndex) - Number(getComputedStyle(actor).zIndex),
        x: (bounds.x + bounds.width / 2 - feet.x) / feet.width,
        bottom: (bounds.bottom - feet.y) / feet.height, size: bounds.width / feet.height,
        rotation: new DOMMatrix(style.transform).b,
      };
    });
    observer.observe(world, { attributes: true, subtree: true, childList: true, attributeFilter: ['data-stage'] });
  });
  await page.locator('[data-execute="' + action + '"]').click();
  await expect.poll(() => page.evaluate(() => !!window.propSample.done)).toBe(true);
  return page.evaluate(() => window.propSample);
}

for (const [count, index, role, band] of [[2, 0, 'guardian', 'healthy'], [8, 6, 'berserker', 'wounded']]) {
  test('scavenge sets a reachable foreground cache on the floor in a ' + count + '-seat arena', async ({ page }) => {
    await page.goto('/');
    const trace = await play(page, turn(count, index, role, 'scavenge', band), 'scavenge');
    expect(trace.countCoins).toBeGreaterThanOrEqual(2);
    expect(trace.impact).toMatchObject({ kind: 'cache', inHand: false, band, clip: 'utility', facing: index ? 'left' : 'right' });
    expect(trace.impact.z).toBeGreaterThan(0);
    expect(trace.impact.bottom).toBeGreaterThan(.90);
    expect(trace.impact.bottom).toBeLessThan(1.12);
    const forward = trace.impact.facing === 'left' ? 1 - trace.impact.x : trace.impact.x;
    expect(forward).toBeGreaterThan(.76);
    expect(forward).toBeLessThan(1.2);
  });
}

test('four founder grips lift and tip the bottle, then use a bell below the mouth', async ({ page }) => {
  await page.goto('/');
  for (const [i, role] of classes.entries()) {
    const band = ['healthy', 'critical', 'wounded', 'critical'][i];
    const rightSeat = i % 2 === 0;
    const action = rightSeat ? 'red-tonic' : 'antidote';
    const sample = (await play(page, turn(2, i % 2, role, action, band), action)).impact;
    expect(sample).toMatchObject({ kind: 'bottle', icon: rightSeat ? 'tonic' : 'antidote', clip: 'consume', inHand: true, band });
    expect(sample.sheet).toContain(role + '-consume.webp');
    expect(sample.cellY).toBe(({ healthy: 0, wounded: 50, critical: 100 })[band]);
    expect(sample.exposure).toBeGreaterThanOrEqual(6);
    expect(sample.bottom).toBeLessThan(.48);
    expect(sample.size).toBeLessThan(.22);
    expect(sample.rotation * (rightSeat ? -1 : 1)).toBeGreaterThan(.85);
  }
  const bell = (await play(page, turn(8, 7, 'alchemist', 'menders-bell', 'critical'), 'menders-bell')).impact;
  expect(bell).toMatchObject({ kind: 'held', icon: 'bell', clip: 'consume', inHand: true, exposure: 4 });
  expect(Math.abs(bell.rotation)).toBeLessThan(.32);
});
