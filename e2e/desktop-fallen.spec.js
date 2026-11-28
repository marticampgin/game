import { test, expect } from '@playwright/test';
import { CLASSES, applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

function finalBlow(count) {
  const players = Object.keys(CLASSES).slice(0, count).map((classId,i) => ({id:'p'+i, name:'Fighter '+i, classId}));
  Object.assign(players[1], count === 2 ? {classId:'trickster', skinId:'carnival-fox'} : {classId:'necromancer', skinId:'ossuary-queen'});
  let state;
  for (let seed = 0; seed < 100; seed++) {
    state = createMatch({seed:'grounded-'+seed, players});
    if (state.activeId === 'p0') break;
  }
  expect(state.activeId).toBe('p0');
  state = applyCommand(state, 'p0', {type:'pick', rewardId:state.offers[0]});
  state = sandboxEdit(state, {type:'stat',playerId:'p1',stat:'hp',value:1});
  return state;
}

for (const count of [2,8]) for (const reduced of [false,true]) {
  test(`a ${count}-seat knockout lands on the persistent costume pose with ${reduced ? 'reduced' : 'full'} motion`, async ({page}) => {
    await page.setViewportSize(count === 2 ? {width:1280,height:720} : {width:1440,height:900});
    await page.emulateMedia({reducedMotion:reduced ? 'reduce' : 'no-preference'});
    await page.addInitScript(state => {
      if (!sessionStorage.getItem('rift-solo')) sessionStorage.setItem('rift-solo',JSON.stringify({state,viewerId:'p0'}));
    }, finalBlow(count));
    await page.goto('/');
    const sprite = page.locator('[data-seat="p1"] .arena-sprite');
    await expect(sprite).toHaveAttribute('data-collapse-ready','');
    const skin = await sprite.getAttribute('data-skin');
    await page.evaluate(delayFall => {
      window.fallColumns = [];
      window.winnerCues = [];
      function paint() {
        const body = document.querySelector('[data-seat="p1"] .arena-sprite');
        if (body?.hasAttribute('data-collapsing')) {
          const cel = getComputedStyle(body.querySelector('.arena-cel'));
          window.fallColumns.push([cel.backgroundPositionX,cel.backgroundPositionY]);
          if (delayFall) {
            const nextPaint = performance.now() + 92;
            while (performance.now() < nextPaint) { /* A late desktop paint during the landing. */ }
          }
        }
        const champion = document.querySelector('.champion .arena-cel');
        if (champion?.getAnimations().some(animation => animation.id === 'fighter-celebrate')) {
          window.winnerCues.push(getComputedStyle(champion).backgroundPositionX);
        }
        if (!window.endPoseSampling) requestAnimationFrame(paint);
      }
      requestAnimationFrame(paint);
    },count === 2 && !reduced);
    await page.locator('[data-aim="p1"]').click();
    await page.locator('[data-execute="attack"]').click();
    await expect(page.locator('[data-seat="p1"].fallen')).toBeAttached();
    await expect(sprite).toHaveAttribute('data-pose','fallen');
    await expect(sprite).toHaveAttribute('data-skin',skin);
    const columns = await page.evaluate(() => window.fallColumns);
    if (reduced) expect(columns).toHaveLength(0);
    else {
      expect(new Set(columns.map(([x]) => x)).size).toBeGreaterThanOrEqual(3);
      expect(columns.every(([,y]) => y === '100%')).toBe(true);
    }
    expect(await sprite.locator('.arena-cel').evaluate(cel => cel.getAnimations().length)).toBe(0);
    if (count === 2) {
      await expect(page.locator('.champion .arena-sprite')).toHaveAttribute('data-pose','victory');
      if (!reduced) await expect.poll(() => page.evaluate(() => new Set(window.winnerCues).size)).toBeGreaterThanOrEqual(3);
      else expect(await page.evaluate(() => window.winnerCues)).toHaveLength(0);
      await page.reload();
      await expect(page.locator('.result')).toBeVisible();
      const replay = await page.locator('.champion .arena-cel').evaluate(cel => cel.getAnimations().map(animation => animation.id));
      expect(replay).not.toContain('fighter-celebrate');
    }
    await page.evaluate(() => { window.endPoseSampling = true; });
  });
}
