import { expect, test } from '@playwright/test';

const enter = async page => {
  await page.goto('/');
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.locator('.lobby-identity > img')).toHaveAttribute('data-model','/assets/guardian.png');
};
const choose = (page,name) => page.getByRole('button',{name,exact:true}).click();

test('class selection keeps a painted figure during a cold change and ignores stale decodes',async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  let release;
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/chronomancer.png',async route => { await delayed; await route.continue(); });
  await enter(page);
  const incoming = page.locator('.lobby-identity > img');
  try {
    await choose(page,'Chronomancer');
    await expect(page.locator('.lobby-identity h2')).toHaveText('Chronomancer');
    await expect(page.locator('.lobby-model-hold img')).toHaveAttribute('src','/assets/guardian.png');
    await expect(page.locator('.lobby-model-hold img')).toBeVisible();
    await expect(incoming).toBeHidden();
    await choose(page,'Artificer');
    await expect(incoming).toHaveAttribute('data-model','/assets/artificer.png');
    await expect(page.locator('.lobby-model-hold')).toHaveCount(0);
    const completed = page.waitForEvent('requestfinished',req => req.url().endsWith('/assets/chronomancer.png'));
    release();
    await completed;
    await expect(incoming).toHaveAttribute('src','/assets/artificer.png');
    await expect(incoming).toBeVisible();
  } finally { release(); }
});

test('a missing model falls back to its own portrait and reduced motion swaps it directly',async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/assets/necromancer.png',route => route.fulfill({status:404,body:''}));
  await enter(page);
  await choose(page,'Necromancer');
  const model = page.locator('.lobby-identity > img');
  await expect(model).toHaveAttribute('src','/assets/portrait-necromancer.webp');
  await expect(model).toBeVisible();
  await expect(page.locator('.lobby-model-hold')).toHaveCount(0);
  await choose(page,'Guardian');
  await expect(model).toHaveAttribute('data-model','/assets/guardian.png');
  await expect(page.locator('.lobby-model-hold')).toHaveCount(0);
});

test('the large-PC gallery grows with its portraits and holds their positions through match setup',async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  await enter(page);
  const gallery = page.locator('.lobby-classes');
  const small = await gallery.boundingBox();
  await page.setViewportSize({width:1920,height:1080});
  const full = await gallery.boundingBox();
  expect(full.width).toBeGreaterThan(small.width * 1.2);
  expect(full.height).toBeGreaterThan(small.height * 1.3);
  await choose(page,'Artificer');
  await page.getByRole('button',{name:'Match setup'}).click();
  await page.getByLabel('Contenders').selectOption('8');
  await expect(page.getByRole('button',{name:'Start match'})).toBeInViewport();
  expect((await gallery.boundingBox()).y).toEqual(full.y);
  await choose(page,'Host room');
  await expect(page.getByRole('button',{name:'Create room'})).toBeInViewport();
  expect((await gallery.boundingBox()).y).toEqual(full.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
});

test('browsing several fighters warms only the settled choice’s primary combat sheet',async ({page}) => {
  await enter(page);
  const sheets = [];
  page.on('request',request => {
    const name = request.url().split('/').pop();
    if (/^(necromancer|chronomancer|artificer)-.*\.webp$/.test(name)) sheets.push(name);
  });
  const warmed = page.waitForResponse(response => response.url().endsWith('/artificer-motions.webp'));
  await page.evaluate(() => {
    for (const role of ['necromancer','chronomancer','artificer'])
      document.querySelector('[data-lobby-class="' + role + '"]').click();
  });
  await warmed;
  expect(sheets).toEqual(['artificer-motions.webp']);
});
