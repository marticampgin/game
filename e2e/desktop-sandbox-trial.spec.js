import { expect, test } from '@playwright/test';

const button = (page,name) => page.getByRole('button',{name,exact:true});
const savedBench = page => page.evaluate(() => sessionStorage.getItem('rift-practice-bench-v1'));

async function tryWolfTracker(page) {
  await button(page,'Outfitter').click();
  await button(page,'Berserker').click();
  await page.locator('[data-pg="outfit"][data-value="wolf-tracker"]').click();
  await button(page,'Wounded').click();
  await button(page,'Try in Sandbox').click();
  await expect(page.locator('.bench-body [data-skin="wolf-tracker"][data-tier="wounded"]')).toBeVisible();
}

test('an Outfitter visit and its edits leave the saved eight-seat Sandbox exactly as the player left it', async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/');
  await button(page,'Sandbox').click();
  await page.getByLabel('Seats',{exact:true}).selectOption('8');
  await page.getByLabel('Match seed',{exact:true}).fill('saved-foundry');
  await button(page,'Load experiment').click();
  await page.locator('[data-pick="sparring-5"]').click();
  await button(page,'Critical').click();
  const original = await savedBench(page);
  await button(page,'Back').click();
  await tryWolfTracker(page);
  await button(page,'Healthy').click();
  await button(page,'Step phase').click();
  expect(await savedBench(page)).toBe(original);
  await button(page,'Back').click();
  await expect(button(page,'Try in Sandbox')).toBeFocused();
  await button(page,'Back').click();
  await page.reload();
  await button(page,'Sandbox').click();
  await expect(page.locator('[data-pick]')).toHaveCount(8);
  await expect(page.locator('[data-pick="sparring-5"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByLabel('Match seed',{exact:true})).toHaveValue('saved-foundry');
  await expect(page.locator('.bench-body [data-tier="critical"]')).toBeVisible();
  expect(await savedBench(page)).toBe(original);
});

test('resizing a trial carries its current costume and condition into a full preset and the playable arena', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await tryWolfTracker(page);
  await page.locator('[data-outfit="ash-dragon"]').click();
  await button(page,'Critical').click();
  await page.getByLabel('Starting build',{exact:true}).selectOption('flame');
  await page.getByLabel('Seats',{exact:true}).selectOption('8');
  await button(page,'Load experiment').click();
  await expect(page.locator('[data-pick]')).toHaveCount(8);
  await expect(page.locator('.bench-body [data-skin="ash-dragon"][data-tier="critical"]')).toBeVisible();
  await page.getByText('Fighter build',{exact:true}).click();
  await expect(page.locator('.rb-build')).toContainText('Blood Cleave');
  await expect(page.locator('.rb-build')).toContainText('Cinder Orb');
  await expect(page.locator('.rb-build')).toContainText('Borrowed Time');
  expect(await savedBench(page)).toBeNull();
  await button(page,'Play match').click();
  await expect(page.locator('.combatant')).toHaveCount(8);
  await expect(page.locator('[data-seat="experimenter"] [data-class="berserker"][data-skin="ash-dragon"][data-tier="critical"]')).toBeAttached();
  const match = await page.evaluate(() => JSON.parse(sessionStorage.getItem('rift-solo')));
  expect(match.viewerId).toBe('experimenter');
  expect(new Set(match.state.players.map(p=>p.classId)).size).toBe(8);
  expect(match.state.career).toBeUndefined();
});
