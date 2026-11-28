import { test, expect } from '@playwright/test';

async function browse(page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Outfitter',exact:true})).toBeVisible();
}

// Observe each exposed scene even if Playwright is waiting on the next paint.
// Projectiles may be removed before the driver can read a networked screenshot.
async function watchStage(page) {
  await page.evaluate(() => {
    const stage = document.querySelector('.pg-fitting');
    const seen = window.rehearsal = {clips:[], effects:[], missiles:[], travel:[], completed:false, props:[]};
    let underway = false;
    function sample() {
      const scene = stage.querySelector('.arena-fx');
      const ghost = scene?.querySelector('.arena-fx-actor');
      if (scene) {
        underway = true;
        const clip = ghost?.querySelector('.arena-sprite')?.dataset.track;
        if (clip && !seen.clips.includes(clip)) seen.clips.push(clip);
        for (const el of scene.querySelectorAll('[data-effect]')) seen.effects.push(el.dataset.effect);
        for (const el of scene.querySelectorAll('[data-prop]')) seen.props.push(el.dataset.prop);
        const missile = scene.querySelector('.arena-fx-missile');
        if (missile) seen.missiles.push(missile.getBoundingClientRect().left);
        if (ghost) {
          const home = stage.querySelector('.pg-mannequin').getBoundingClientRect();
          seen.travel.push(Math.abs(ghost.getBoundingClientRect().left-home.left)/home.width);
        }
      } else if (underway) { seen.completed=true; return; }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}

test('an outfitter strike steps into empty space; a spell travels outward without a phantom victim',async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  await browse(page);
  await page.getByRole('button',{name:'Berserker',exact:true}).click();
  await page.locator('[data-pg="outfit"][data-value="wolf-tracker"]').click();
  await expect(page.locator('.pg-mannequin .arena-sprite[data-skin="wolf-tracker"][data-motion-ready]')).toBeAttached();
  await watchStage(page);
  await page.getByRole('button',{name:'Strike',exact:true}).click();
  await expect.poll(() => page.evaluate(()=>window.rehearsal.completed)).toBe(true);
  const swing = await page.evaluate(()=>window.rehearsal);
  expect(swing.clips).toContain('attack');
  expect(swing.effects.filter(effect=>effect!=='dust')).toEqual([]);
  expect(swing.missiles).toEqual([]);
  expect(swing.props).toEqual([]);
  expect(Math.max(...swing.travel)).toBeGreaterThan(.15);
  expect(Math.max(...swing.travel)).toBeLessThan(.72);
  await expect(page.locator('.pg-fitting [data-seat]')).toHaveCount(1);

  await page.getByRole('button',{name:'Chronomancer',exact:true}).click();
  await watchStage(page);
  await page.getByRole('button',{name:'Time Bolt',exact:true}).click();
  await expect.poll(() => page.evaluate(()=>window.rehearsal.completed)).toBe(true);
  const cast = await page.evaluate(()=>window.rehearsal);
  expect(cast.clips).toContain('signature');
  expect(cast.missiles.length).toBeGreaterThan(1);
  expect(Math.max(...cast.missiles)-Math.min(...cast.missiles)).toBeGreaterThan(45);
  await expect(page.locator('.pg-fitting .arena-fx')).toHaveCount(0);
});

test('selecting another rehearsal retires the open cache and every carried prop',async ({page}) => {
  await browse(page);
  await page.getByRole('button',{name:'Scavenge',exact:true}).click();
  await expect(page.locator('.pg-fitting [data-prop="cache"]')).toBeVisible();
  await page.getByRole('button',{name:'Drink',exact:true}).click();
  await expect(page.locator('.pg-fitting [data-prop="bottle"]')).toBeAttached();
  await expect(page.locator('.pg-fitting [data-prop="cache"],.pg-fitting [data-prop="parcel"]')).toHaveCount(0);
  await expect(page.locator('.pg-fitting .arena-fx')).toHaveCount(0);
  await expect(page.locator('.pg-mannequin [data-playing="hidden"]')).toHaveCount(0);
});
