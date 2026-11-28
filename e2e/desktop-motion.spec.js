import { expect, test } from '@playwright/test';
import { createMatch, applyCommand } from '../src/game/index.js';

const roles = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
function readySeat(role) {
  const players = roles.map((classId) => ({ id: classId, classId, name: classId, bot: false }));
  let match;
  for (let seed = 0; seed < 200; seed++) {
    match = createMatch({ seed: 'desktop-choreography-' + seed, players });
    if (match.activeId === role) break;
  }
  return applyCommand(match, role, { type: 'pick', rewardId: match.offers[0] });
}

async function perform(page, role, action) {
  const state = readySeat(role);
  if (action === 'venom-flask') state.players.find((p) => p.id === 'berserker').shield = 500;
  await page.evaluate((save) => sessionStorage.setItem('rift-solo', JSON.stringify(save)), {
    state,
    viewerId: role,
  });
  await page.reload();
  await page.locator('[data-action="' + action + '"]').click();
  await page.locator('[data-aim="berserker"]').click();
  const loaded = await page.evaluate(
    async (players) => (await (await import('/animation.js')).preloadArenaSkins(players)).every(Boolean),
    state.players,
  );
  expect(loaded).toBe(true);

  await page.evaluate(() => {
    const world = document.querySelector('.arena-world');
    const trace = (window.motionTrace = {
      seen: false,
      finished: false,
      cells: [],
      clip: null,
      score: null,
      impact: null,
      floorLeft: false,
      steps: new Set(),
      minCoverage: 1,
      maxOverlap: 0,
      fx: [],
    });
    let raf;
    function sample() {
      const scene = world.querySelector('.arena-fx');
      if (!scene) {
        if (trace.seen) {
          trace.finished = true;
          observed.disconnect();
          cancelAnimationFrame(raf);
        }
        return;
      }
      const actor = scene.querySelector('.arena-fx-actor .arena-sprite');
      if (!actor) return;
      trace.seen = true;
      trace.clip = actor.dataset.track;
      trace.score = scene.dataset.choreography;
      const number = Math.round(
        (parseFloat(getComputedStyle(actor.querySelector('.arena-cel')).backgroundPositionX) * 11) / 100,
      );
      if (actor.hasAttribute('data-footwork')) {
        const stepStyle = getComputedStyle(actor.querySelector('.arena-step-cel'));
        const baseOpacity = parseFloat(getComputedStyle(actor.querySelector('.arena-cel')).opacity);
        const stepOpacity = parseFloat(stepStyle.opacity);
        trace.minCoverage = Math.min(trace.minCoverage, baseOpacity + stepOpacity);
        trace.maxOverlap = Math.max(trace.maxOverlap, Math.min(baseOpacity, stepOpacity));
        trace.steps.add(Math.round((parseFloat(stepStyle.backgroundPositionX) * 3) / 100));
      } else if (!trace.cells.includes(number)) trace.cells.push(number);
      if (scene.dataset.stage === 'impact' && trace.impact === null) trace.impact = number;
      if (world.querySelector('[data-travelling]')) trace.floorLeft = true;
      for (const el of scene.querySelectorAll('[data-effect]'))
        if (!trace.fx.includes(el.dataset.effect)) trace.fx.push(el.dataset.effect);
    }
    const observed = new MutationObserver(sample);
    observed.observe(world, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-stage', 'data-track', 'data-travelling'],
    });
    raf = requestAnimationFrame(function tick() {
      sample();
      if (!trace.finished) raf = requestAnimationFrame(tick);
    });
  });
  await page.locator('[data-execute="' + action + '"]').click();
  await expect.poll(() => page.evaluate(() => window.motionTrace.finished), { timeout: 10000 }).toBe(true);
  return page.evaluate(() => ({ ...window.motionTrace, steps: Array.from(window.motionTrace.steps) }));
}

test('desktop weapon swing, shield drive and bottle throw use different illustrated actor sequences', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [role, action, score, clip, effect, travels] of [
    ['guardian', 'attack', 'swing', 'attack', 'slash', true],
    ['guardian', 'bastion-bash', 'bash', 'signature', 'bastion', true],
    ['alchemist', 'venom-flask', 'throw', 'signature', 'venom', false],
  ]) {
    const sample = await perform(page, role, action);
    await info.attach(action + '-motion', { body: JSON.stringify(sample), contentType: 'application/json' });
    expect(sample.score).toBe(score);
    expect(sample.clip).toBe(clip);
    expect(sample.cells.length).toBeGreaterThanOrEqual(6);
    expect(sample.impact).toBeGreaterThanOrEqual(6);
    expect(sample.fx).toContain(effect);
    expect(sample.floorLeft).toBe(travels);
    if (travels) {
      expect(sample.steps.length).toBeGreaterThanOrEqual(2);
      expect(sample.minCoverage).toBeGreaterThanOrEqual(0.99);
      expect(sample.maxOverlap).toBeLessThan(.02);
    }
    if (action === 'venom-flask') expect(sample.fx).toContain('guard');
    await expect(page.locator('[data-travelling],.arena-fx,[data-playing="hidden"]')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('a slow paint loop preserves the anticipation and recovery of a normal-speed shield drive', async ({ page }) => {
  await page.addInitScript(() => {
    function delayPaint() {
      if (document.querySelector('.arena-fx')) {
        const end = performance.now() + 105;
        while (performance.now() < end) { /* Simulate sustained slow frames. */ }
      }
      requestAnimationFrame(delayPaint);
    }
    requestAnimationFrame(delayPaint);
  });
  await page.goto('/');
  const trace = await perform(page, 'guardian', 'bastion-bash');
  expect(trace.cells).toEqual(expect.arrayContaining([2, 4, 6, 7, 9, 10]));
  expect(trace.impact).toBe(7);
});

test('idle equipment checks are staggered by seat and respect reduced motion', async ({ page }) => {
  const state = readySeat('guardian');
  await page.addInitScript(
    (state) => sessionStorage.setItem('rift-solo', JSON.stringify({ state, viewerId: 'guardian' })),
    state,
  );
  await page.goto('/');
  const record = await page.evaluate(async (players) => {
    await (await import('/animation.js')).preloadArenaSkins(players);
    const checks = Array.from(document.querySelectorAll('[data-seat] .arena-check-cel'));
    return checks.map((el) => {
      const cycle = el.getAnimations().find((a) => a.animationName === 'arena-equipment-check');
      const timing = cycle.effect.getTiming();
      cycle.pause();
      cycle.currentTime = timing.delay + timing.duration * 0.89;
      return {
        delay: timing.delay,
        duration: timing.duration,
        alpha: parseFloat(getComputedStyle(el).opacity),
        column: parseFloat(getComputedStyle(el).backgroundPositionX),
      };
    });
  }, state.players);
  expect(record).toHaveLength(4);
  expect(new Set(record.map((r) => r.delay)).size).toBe(4);
  for (const row of record) {
    expect(row.duration).toBeGreaterThanOrEqual(9500);
    expect(row.alpha).toBe(1);
    expect(row.column).toBeGreaterThan(30);
    expect(row.column).toBeLessThan(85);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('[data-seat] .arena-check-cel')
      .evaluateAll((nodes) =>
        nodes.every((el) => el.getAnimations().length === 0 && Number(getComputedStyle(el).opacity) === 0),
      ),
  ).toBe(true);
});
