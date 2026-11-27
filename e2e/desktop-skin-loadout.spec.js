import { test, expect } from '@playwright/test';
import { createArenaServer } from '../server/index.js';
import { registerFighterSkin } from '../public/fighter-kit.js';

const festival = {
  classId: 'guardian', id: 'festival-test', name: 'Festival Guard',
  sheet: '/assets/skins/berserker-founder.png', portrait: '/assets/skins/festival-head.webp',
  model: '/assets/skins/festival-body.png',
};
let server, address;

test.beforeAll(async () => {
  registerFighterSkin(festival.classId, festival.id, festival);
  server = createArenaServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  address = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function installClient(page) {
  await page.route('**/fighter-kit.json', async route => {
    const response = await route.fetch();
    const manifest = await response.json();
    manifest.skins.push(festival);
    await route.fulfill({ response, json: manifest });
  });
  for (const [fixture, source] of [[festival.portrait, '/assets/portrait-berserker.webp'], [festival.model, '/assets/berserker.png']]) {
    await page.route('**' + fixture, async route => route.fulfill({ response: await route.fetch({ url: address + source }) }));
  }
}
async function enter(page) {
  await installClient(page);
  await page.goto(address);
  await page.getByRole('button', { name: 'Enter the arena' }).click();
}
async function expectCostume(page, id) {
  const actor = page.locator('[data-seat="' + id + '"] .arena-sprite');
  await expect(actor).toHaveAttribute('data-class', 'guardian');
  await expect(actor).toHaveAttribute('data-skin', festival.id);
  await expect(actor.locator('.arena-cel')).toHaveCSS('background-image', /berserker-founder\.png/);
  await expect(page.locator('.turn-rail [data-inspect="' + id + '"] img')).toHaveAttribute('src', festival.portrait);
}

test('a solo player selects a class costume in the lobby and enters wearing it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await enter(page);
  const skin = page.getByRole('combobox', { name: 'Skin', exact: true });
  await expect(skin).toHaveValue('founder');
  await skin.selectOption({ label: festival.name });
  await expect(page.locator('.lobby-identity > img')).toHaveAttribute('src', festival.model);
  await expect(page.locator('[data-lobby-class="guardian"] img.class-portrait')).toHaveAttribute('src', festival.portrait);
  await page.getByRole('button', { name: 'Alchemist', exact: true }).click();
  await expect(skin).toHaveCount(0);
  await page.getByRole('button', { name: 'Guardian', exact: true }).click();
  await expect(skin).toHaveValue('founder');
  await skin.selectOption(festival.id);
  await page.getByRole('button', { name: 'Start match' }).click();
  await expectCostume(page, 'p1');
  await page.reload();
  await expectCostume(page, 'p1');
});

test('two room clients preview, reset, reconnect and start in their chosen costumes', async ({ page, browser }) => {
  await enter(page);
  await page.getByRole('button', { name: 'Host room' }).click();
  const skin = client => client.getByRole('combobox', { name: 'Skin', exact: true });
  await skin(page).selectOption(festival.id);
  await page.getByLabel('Contenders').selectOption('2');
  await page.getByLabel('Fill empty seats with bots').uncheck();
  await page.getByRole('button', { name: 'Create room' }).click();
  const code = await page.locator('[data-room-code]').innerText();
  await expect(skin(page)).toHaveValue(festival.id);
  const context = await browser.newContext();
  try {
    const guest = await context.newPage();
    await installClient(guest);
    await guest.goto(address + '/?room=' + code);
    await skin(guest).selectOption(festival.id);
    await guest.getByLabel('Your name').fill('Rook');
    await guest.locator('form').getByRole('button', { name: 'Join room' }).click();
    const costumes = page.locator('.lobby-seats img[src="' + festival.model + '"]');
    await expect(costumes).toHaveCount(2);
    await skin(guest).selectOption('founder');
    await expect(costumes).toHaveCount(1);
    await guest.reload();
    await expect(skin(guest)).toHaveValue('founder');
    await skin(guest).selectOption(festival.id);
    await expect(costumes).toHaveCount(2);
    await page.getByRole('button', { name: 'Start match' }).click();
    for (const client of [page, guest]) {
      await expectCostume(client, 'p1');
      await expectCostume(client, 'p2');
    }
  } finally {
    await context.close();
  }
});
