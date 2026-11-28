import { expect, test } from '@playwright/test';
import { createMatch, applyCommand } from '../src/game/index.js';

const roles = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
const fullRoster = [...roles, 'gambler', 'necromancer', 'trickster', 'artificer'];
function readySeat(role, seats = roles) {
  const players = seats.map((classId) => ({ id: classId, classId, name: classId, bot: false }));
  let match;
  for (let seed = 0; seed < 200; seed++) {
    match = createMatch({ seed: 'desktop-choreography-' + seed, players });
    if (match.activeId === role) break;
  }
  return applyCommand(match, role, { type: 'pick', rewardId: match.offers[0] });
}

async function perform(page, role, action, take = 1, seats = roles) {
  const state = readySeat(role, seats);
  state.players.find((p) => p.id === role).personalTurn = take;
  if (action === 'venom-flask') state.players.find((p) => p.id === 'berserker').shield = 500;
  // Replacing the save navigates away from the current page. Let its real
  // startup request finish before WebKit tears down that document.
  await expect.poll(() => page.evaluate(async () => (await import('/career-client.js')).readCareerStatus()),
    {message:'the real profile request has completed',timeout:10000}).toBe('online');
  await page.evaluate((save) => sessionStorage.setItem('rift-solo', JSON.stringify(save)), {
    state,
    viewerId: role,
  });
  await page.reload({waitUntil:'domcontentloaded'});
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
      pickup: [],
      impactTake: null,
      clip: null,
      score: null,
      impact: null,
      floorLeft: false,
      steps: new Set(),
      minCoverage: 1,
      maxOverlap: 0,
      fx: [],
      missiles: [],
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
      if (actor.hasAttribute('data-pickup')) {
        const take = actor.querySelector('.arena-variation-cel');
        if (Number(getComputedStyle(take).opacity) === 1 &&
            Number(getComputedStyle(actor.querySelector('.arena-cel')).opacity) === 0) {
          const column = Math.round(parseFloat(getComputedStyle(take).backgroundPositionX) / 25);
          if (!trace.pickup.includes(column)) trace.pickup.push(column);
        }
      }
      if (actor.hasAttribute('data-footwork')) {
        const stepStyle = getComputedStyle(actor.querySelector('.arena-step-cel'));
        const baseOpacity = parseFloat(getComputedStyle(actor.querySelector('.arena-cel')).opacity);
        const stepOpacity = parseFloat(stepStyle.opacity);
        trace.minCoverage = Math.min(trace.minCoverage, baseOpacity + stepOpacity);
        trace.maxOverlap = Math.max(trace.maxOverlap, Math.min(baseOpacity, stepOpacity));
        trace.steps.add(Math.round((parseFloat(stepStyle.backgroundPositionX) * 3) / 100));
      } else if (!trace.cells.includes(number)) trace.cells.push(number);
      if (scene.dataset.stage === 'impact' && trace.impact === null) {
        trace.impact = number;
        trace.impactTake = Number(getComputedStyle(actor.querySelector('.arena-cel')).opacity);
      }
      if (world.querySelector('[data-travelling]')) trace.floorLeft = true;
      for (const el of scene.querySelectorAll('[data-missile]'))
        if (!trace.missiles.includes(el.dataset.missile)) trace.missiles.push(el.dataset.missile);
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
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/',{waitUntil:'domcontentloaded'});
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

for (const [role, action, track, missile] of [
  ['gambler','cut-the-deck','card-flick','gilt-card'],
  ['necromancer','soul-tithe','soul-thread','soul-thread'],
  ['trickster','mirror-feint','mirror-feint',null],
  ['artificer','rivet-drive','rivet-drive',null],
]) {
  for (const seats of [[role,'berserker'], fullRoster]) {
    test(role + ' performs its signature and yields the ' + seats.length + '-seat arena', async ({page}) => {
      await page.goto('/',{waitUntil:'domcontentloaded'});
      const trace = await perform(page, role, action, 2, seats);
      expect(trace.score).toBe(track);
      expect(trace.clip).toBe('signature');
      expect(trace.impact).toBeGreaterThanOrEqual(6);
      if (missile) expect(trace.missiles).toContain(missile);
      else expect(trace.floorLeft).toBe(true);
      await expect(page.locator('[data-seat] .arena-sprite[data-idles-ready]')).toHaveCount(seats.length);
      await expect(page.locator('.arena-fx,[data-pickup],[data-travelling]')).toHaveCount(0);
    });
  }
}

test('alternate weapon and signature preparations land on their original contact drawing', async ({ page }) => {
  await page.goto('/');
  for (const [role, action] of [['guardian','attack'], ['guardian','bastion-bash'], ['alchemist','venom-flask']]) {
    const first = await perform(page, role, action, 1);
    const second = await perform(page, role, action, 2);
    expect(first.pickup).toEqual([]);
    expect(second.pickup).toEqual(expect.arrayContaining([1,3]));
    expect(second.impact).toBe(first.impact);
    expect(second.impactTake).toBe(1);
  }
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
    return Promise.all(checks.map(async (el) => {
      const cycle = el.getAnimations().find((a) => a.animationName === 'arena-role-idle');
      const timing = cycle.effect.getTiming();
      cycle.pause();
      await cycle.ready;
      return {
        delay: timing.delay,
        duration: timing.duration,
        poses: [0.08, 0.24, 0.89].map((fraction) => {
          cycle.currentTime = timing.delay + timing.duration * (1 + fraction);
          const style = getComputedStyle(el);
          return {
            row: parseFloat(style.backgroundPositionY), column: parseFloat(style.backgroundPositionX),
            ink: Number(style.opacity), base: getComputedStyle(el.previousElementSibling).visibility,
          };
        }),
      };
    }));
  }, state.players);
  expect(record).toHaveLength(4);
  expect(new Set(record.map((r) => r.delay)).size).toBe(4);
  for (const row of record) {
    expect(row.duration).toBeGreaterThanOrEqual(9500);
    expect(row.poses.map((p) => p.row)).toEqual([0, 12.5, 25]);
    for (const cel of row.poses) {
      expect(cel.ink).toBe(1);
      expect(cel.base).toBe('hidden');
      expect(cel.column).toBeGreaterThan(30);
      expect(cel.column).toBeLessThan(85);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page
      .locator('[data-seat] .arena-check-cel')
      .evaluateAll((nodes) =>
        nodes.length === 4 && nodes.every((el) => Number(getComputedStyle(el).opacity) === 0 && el.getAnimations().length === 0),
      )
  ).toBe(true);
});
