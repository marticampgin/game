import { expect, test } from '@playwright/test';

async function openBerserker(page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  await page.getByRole('button',{name:'Berserker',exact:true}).click();
  const stage = page.locator('.pg-fitting');
  await expect(stage).toHaveAttribute('data-shown','berserker/founder/healthy');
  return stage;
}

test('the fitting stays painted during a slow switch and gestures wait for the selected costume', async ({page}) => {
  const stage = await openBerserker(page);
  const oldModel = await stage.locator('.pg-mannequin .arena-sprite').elementHandle();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/outfits/wolf-tracker/motions.webp',async route => { await gate; await route.continue(); });
  await page.getByRole('button',{name:/Wolf Tracker.*coins/}).click();
  await expect(stage).toHaveAttribute('aria-busy','true');
  await page.getByRole('button',{name:'Scavenge',exact:true}).click();
  expect(await oldModel.evaluate(el => el.isConnected && el.getBoundingClientRect().height > 0)).toBe(true);
  await expect(stage.locator('[data-prop=cache]')).toHaveCount(0);
  release();
  await expect(stage).toHaveAttribute('data-shown','berserker/wolf-tracker/healthy');
  await expect(stage.locator('[data-prop=cache]')).toBeAttached();
  await expect(stage.locator('.pg-previous')).toHaveCount(0);
});

test('a stale outfit cannot win a quick switch or overwrite a later condition', async ({page}) => {
  const errors=[];
  page.on('pageerror',e => errors.push(e.message));
  const stage = await openBerserker(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/outfits/wolf-tracker/motions.webp',async route => { await gate; await route.continue(); });
  await page.getByRole('button',{name:/Wolf Tracker.*coins/}).click();
  await page.getByRole('button',{name:/Ash Dragon.*coins/}).click();
  await page.getByRole('button',{name:'Critical',exact:true}).click();
  await expect(stage).toHaveAttribute('data-shown','berserker/ash-dragon/critical');
  const later = page.waitForResponse('**/outfits/wolf-tracker/motions.webp');
  release();
  await later;
  await expect(stage).toHaveAccessibleName('Ash Dragon Berserker, critical');
  await expect(stage.locator('.pg-mannequin .arena-sprite')).toHaveAttribute('data-skin','ash-dragon');
  await expect(stage.locator('.pg-previous')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a failed outfit download can be retried in place and its practice round trip preserves keyboard focus', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const stage = await openBerserker(page);
  const motion = '**/outfits/wolf-tracker/motions.webp';
  await page.route(motion,route => route.abort('failed'));
  await page.getByRole('button',{name:/Wolf Tracker.*coins/}).click();
  await expect(page.getByRole('button',{name:'Retry preview'})).toBeVisible();
  await expect(stage).toHaveAttribute('data-shown','berserker/founder/healthy');
  await page.unroute(motion);
  await page.getByRole('button',{name:'Retry preview'}).click();
  await expect(stage).toHaveAttribute('data-shown','berserker/wolf-tracker/healthy');
  await expect(page.getByRole('button',{name:'Retry preview'})).toHaveCount(0);
  await expect(stage.locator('.pg-previous')).toHaveCount(0);
  await page.getByRole('button',{name:'Wounded',exact:true}).click();
  await page.getByRole('button',{name:'Try in Sandbox'}).click();
  await expect(page.locator('.bench-body .arena-sprite')).toHaveAttribute('data-skin','wolf-tracker');
  await expect(page.locator('.bench-body .arena-sprite')).toHaveAttribute('data-tier','wounded');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await expect(stage).toHaveAttribute('data-shown','berserker/wolf-tracker/wounded');
  await expect(page.getByRole('button',{name:'Try in Sandbox'})).toBeFocused();
});

test('a failed practice outfit keeps the previous fighter and retries from the yard', async ({page}) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Sandbox',exact:true}).click();
  const yard = page.locator('.bench-yard');
  const fighter = yard.locator('.bench-body .arena-sprite');
  await expect(yard).toHaveAttribute('aria-busy','false');
  await expect(fighter).toHaveAttribute('data-skin','founder');
  await page.route('**/outfits/harbor-warden/motions.webp',route => route.abort('failed'));
  await page.getByRole('button',{name:'Harbor Warden',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Harbor Warden could not load.'})).toBeVisible();
  await expect(fighter).toHaveAttribute('data-skin','founder');
  await page.unroute('**/outfits/harbor-warden/motions.webp');
  await page.getByRole('button',{name:'Retry preview'}).click();
  await expect(yard).toHaveAccessibleName('Harbor Warden outfit, healthy');
  await expect(fighter).toHaveAttribute('data-skin','harbor-warden');
  await expect(page.getByRole('button',{name:'Retry preview'})).toBeHidden();
});

test('the pose library replays the selected health band and releases it on costume changes', async ({page}) => {
  const stage = await openBerserker(page);
  await page.getByRole('button',{name:'Wounded',exact:true}).click();
  await page.getByRole('button',{name:'Poses',exact:true}).click();
  await page.getByRole('button',{name:'Check gear',exact:true}).click();
  const sprite = stage.locator('.pg-mannequin .arena-sprite');
  await expect(sprite).toHaveAttribute('data-audition-row','check');
  await expect(sprite).toHaveCSS('--audition-y','50%');
  await page.getByRole('button',{name:/Wolf Tracker.*coins/}).click();
  await expect(stage).toHaveAttribute('data-shown','berserker/wolf-tracker/wounded');
  await expect(sprite).not.toHaveAttribute('data-audition-row','check');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'Flourish',exact:true}).click();
  await expect(sprite).toHaveCSS('--audition-y','62.5%');
  expect(await sprite.locator('.arena-check-cel').evaluate(el => el.getAnimations().length)).toBe(0);
  await page.getByRole('button',{name:'Victory',exact:true}).click();
  await expect(sprite).toHaveAttribute('data-pose','victory');
  await page.getByRole('button',{name:'Actions',exact:true}).click();
  await expect(sprite).toHaveAttribute('data-pose','idle');
  await page.getByRole('button',{name:'Defend',exact:true}).click();
  await expect(stage.locator('.arena-fx[data-action=defend]')).toBeAttached();
});
