import { expect, test } from '@playwright/test';

async function enterLobby(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter the arena' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the arena' })).toBeVisible();
}

test('two browsers draft classes, reconnect and play each other through a private room', async ({ browser, page, baseURL }) => {
  const guestContext = await browser.newContext({ baseURL });
  const guest = await guestContext.newPage();
  const errors = [];
  for (const client of [page, guest]) client.on('pageerror', error => errors.push(error.message));
  try {
    await enterLobby(page);
    await page.getByRole('button', { name: 'Host room' }).click();
    await page.getByLabel('Your name').fill('Moss');
    await page.getByRole('combobox', { name: 'Contenders', exact: true }).selectOption('2');
    await page.getByLabel('Class selection').selectOption('draft');
    await page.getByLabel('Fill empty seats with bots').uncheck();
    await page.getByRole('button', { name: 'Create room' }).click();
    await expect(page.getByRole('heading', { name: 'Room lobby' })).toBeVisible();
    await expect(page.locator('[data-lobby-class]')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Start match' })).toBeDisabled();
    const code = await page.locator('[data-room-code]').innerText();
    await guest.goto('/?room=' + code);
    await expect(guest.getByLabel('Room code')).toHaveValue(code);
    await guest.getByLabel('Your name').fill('Ember');
    await guest.locator('form').getByRole('button', { name: 'Join room' }).click();
    await expect(guest.locator('[data-lobby-class]')).toHaveCount(3);
    await guest.locator('[data-lobby-class]').last().click();
    await expect(guest.locator('[data-lobby-class]').last()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Room roster')).toContainText('Ember');
    const credentials = await guest.evaluate(() => sessionStorage.getItem('rift-room'));
    await guest.reload();
    await expect(guest.getByLabel('Room roster')).toContainText('Moss');
    expect(await guest.evaluate(() => sessionStorage.getItem('rift-room'))).toBe(credentials);

    await page.getByRole('button', { name: 'Start match' }).click();
    for (const client of [page, guest]) await expect(client.getByLabel('Battlefield')).toBeVisible();
    await expect.poll(async () => (await page.locator('[data-pick]').count()) + (await guest.locator('[data-pick]').count())).toBe(3);
    const [first, next] = (await page.locator('[data-pick]').count()) ? [page, guest] : [guest, page];
    await expect(next.locator('[data-pick]')).toHaveCount(0);
    await first.locator('[data-pick]').first().click();
    await first.locator('[data-execute="attack"]').click();
    await expect(next.getByRole('heading', { name: 'Choose a reward' })).toBeVisible();
    await next.reload();
    await expect(next.locator('[data-pick]')).toHaveCount(3);
    await expect(first.locator('[data-pick]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close();
  }
});

test('mobile lobby exposes all illustrated classes, editable settings and the solo battle', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await enterLobby(page);
  await page.getByRole('button', {name:'Chronomancer', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Chronomancer', exact:true})).toBeVisible();
  await expect(page.getByLabel('Selected class details')).toContainText('Second Hand');
  await page.getByRole('button', {name:/Match setup/}).click();
  await page.getByRole('combobox', {name:'Contenders',exact:true}).selectOption('8');
  await page.getByLabel('Your name').fill('Nightshade');
  const images = page.locator('.class-portrait');
  await expect(images).toHaveCount(4);
  await expect.poll(() => images.evaluateAll(nodes => nodes.every(img => img.complete && img.naturalWidth > 0))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', {name:'Start match'}).click();
  await expect(page.getByLabel('Battlefield')).toContainText('Nightshade');
  await expect(page.locator('.combatant')).toHaveCount(8);
});
