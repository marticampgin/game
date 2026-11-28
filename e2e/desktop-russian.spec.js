import { test, expect } from '@playwright/test';

const button = (page, name) => page.getByRole('button', { name, exact: true });

async function russianMenu(page) {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('ru');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(button(page, 'Войти на арену')).toBeVisible();
}

async function switchBattleLanguage(page, language) {
  await page.locator('[data-ui="battle-settings"]').click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('combobox').selectOption(language);
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await settings.getByRole('button', { name: language === 'ru' ? 'Закрыть окно' : 'Close dialog' }).click();
}

test('the Russian atlas finds Cyrillic reward names and follows a translated interaction', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await russianMenu(page);
  await button(page, 'Атлас наград').click();
  const search = page.getByRole('searchbox');
  await search.fill('ФЕНИКС');
  const nodes = page.locator('[data-node]');
  await expect(nodes).toHaveCount(2);
  expect(await nodes.evaluateAll(matches => matches.map(node => node.dataset.node).sort()))
    .toEqual(['phoenix-feather', 'phoenix-heart']);
  await page.getByLabel('Найти награду на карте').selectOption('phoenix-heart');
  await expect(page.getByRole('heading', { name: 'Сердце феникса' })).toBeVisible();
  await page.locator('[data-jump="molten-mail"]').click();
  await expect(page.getByRole('heading', { name: 'Расплавленная кольчуга' })).toBeVisible();
  await expect(search).toHaveValue('');
  await button(page, 'Назад').click();
  await page.reload();
  await expect(button(page, 'Атлас наград')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Язык' })).toHaveValue('ru');
});

for (const [seats, skin, outfit, tier, condition] of [
  [2, 'railway-smith', 'Путевой кузнец', 'wounded', 'Ранен'],
  [8, 'stormglass-engineer', 'Мастер грозового стекла', 'critical', 'При смерти'],
]) {
  test(`a ${seats}-seat Russian fitting keeps the Artificer and draft intact across battle language changes`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(seats === 2 ? { width: 1280, height: 720 } : { width: 1440, height: 900 });
    await russianMenu(page);
    await button(page, 'Гардероб').click();
    await button(page, 'Механик').click();
    const costume = page.locator(`[data-pg="outfit"][data-value="${skin}"]`);
    await expect(costume).toContainText(outfit);
    await costume.click();
    await button(page, condition).click();
    const figure = `.arena-sprite[data-class="artificer"][data-skin="${skin}"][data-tier="${tier}"]`;
    await expect(page.locator('.pg-mannequin ' + figure)).toBeVisible();
    await button(page, 'Испытать в песочнице').click();
    await expect(page.locator('.bench-body ' + figure)).toBeVisible();
    await page.getByLabel('Места', { exact: true }).selectOption(String(seats));
    // This seed gives the fitted fighter initiative at both table sizes.
    await page.getByLabel('Зерно матча', { exact: true }).fill('foundry-3');
    await button(page, 'Загрузить сборку').click();
    await expect(page.locator('[data-pick]')).toHaveCount(seats);
    await expect(page.locator('.bench-body ' + figure)).toBeVisible();
    await button(page, 'Начать бой').click();
    await expect(page.getByLabel('Поле боя', { exact: true })).toBeVisible();
    await expect(page.locator('.combatant')).toHaveCount(seats);
    const player = page.locator('[data-seat="experimenter"] ' + figure);
    await expect(player).toBeVisible();
    const titles = page.locator('.combatant .fighter-title');
    const names = await titles.allTextContents();
    const offers = page.locator('[data-draft-select]');
    await expect(offers).toHaveCount(3);
    const chosenId = await offers.first().getAttribute('data-draft-select');
    await offers.first().click();
    const chosen = page.locator(`[data-draft-select="${chosenId}"]`);
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await switchBattleLanguage(page, 'en');
    await expect(page.getByRole('heading', { name: 'Choose a reward' })).toBeVisible();
    await expect(titles).toHaveText(names);
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await expect(player).toBeVisible();
    await switchBattleLanguage(page, 'ru');
    await expect(page.getByRole('heading', { name: 'Выберите награду' })).toBeVisible();
    await expect(titles).toHaveText(names);
    await expect(chosen).toHaveAttribute('aria-pressed', 'true');
    await expect(player).toBeVisible();
    await page.locator('.draft-confirm').click();
    await expect(page.locator('[data-execute="attack"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('room clients read the same contenders and turns in independently selected languages', async ({ page, browser, baseURL }) => {
  const guestContext = await browser.newContext({ baseURL });
  try {
    await russianMenu(page);
    await button(page, 'Войти на арену').click();
    await button(page, 'Своя комната').click();
    // Both names also occur in the game's English dictionary.
    await page.getByLabel('Ваше имя').fill('Guardian');
    await page.getByRole('combobox', { name: 'Бойцы', exact: true }).selectOption('2');
    await page.getByLabel('Заполнить свободные места ботами').uncheck();
    await button(page, 'Создать комнату').click();
    await expect(page.getByRole('heading', { name: 'Комната' })).toBeVisible();
    const code = await page.locator('[data-room-code]').innerText();
    const guest = await guestContext.newPage();
    await guest.goto('/?room=' + code);
    await guest.getByLabel('Your name').fill('Ember');
    await guest.locator('form').getByRole('button', { name: 'Join room' }).click();
    await expect(page.getByLabel('Участники комнаты')).toContainText('Ember');
    await expect(guest.getByLabel('Room roster')).toContainText('Guardian');
    await button(page, 'Начать матч').click();
    for (const [client, field] of [[page, 'Поле боя'], [guest, 'Battlefield']]) {
      await expect(client.getByLabel(field, { exact: true })).toBeVisible();
      await expect(client.locator('.fighter-title')).toHaveText(['Guardian', 'Ember']);
    }
    const actors = [page, guest];
    await expect.poll(async () => (await Promise.all(actors.map(client => client.locator('[data-draft-select]').count())))
      .reduce((sum, count) => sum + count, 0)).toBe(3);
    const current = await page.locator('[data-draft-select]').count() ? page : guest;
    const next = current === page ? guest : page;
    await current.locator('[data-draft-select]').first().click();
    await current.locator('.draft-confirm').click();
    await current.locator('[data-execute="attack"]').click();
    await expect(next.getByRole('heading', { name: next === page ? 'Выберите награду' : 'Choose a reward' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(guest.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.fighter-title')).toHaveText(['Guardian', 'Ember']);
  } finally {
    await guestContext.close();
  }
});
