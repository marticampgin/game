import { expect, test } from '@playwright/test';

const screens = [{ width: 1280, height: 720 }, { width: 1440, height: 900 }];
const fitting = {
  en: { outfitter: 'Outfitter', role: 'Artificer', critical: 'Critical', tryOn: 'Try in Sandbox', seats: 'Seats', seed: 'Match seed', load: 'Load experiment', play: 'Play match' },
  ru: { outfitter: 'Гардероб', role: 'Механик', critical: 'При смерти', tryOn: 'Испытать в песочнице', seats: 'Места', seed: 'Зерно матча', load: 'Загрузить сборку', play: 'Начать бой' },
};

async function expectScreenToFit(page, control) {
  await expect(control).toBeVisible();
  const bounds = await control.evaluate(el => ({
    width: document.documentElement.scrollWidth - innerWidth,
    height: document.documentElement.scrollHeight - innerHeight,
    bottom: el.getBoundingClientRect().bottom - innerHeight,
  }));
  expect(bounds.width, 'horizontal page overflow').toBe(0);
  expect(bounds.height, 'vertical page overflow').toBe(0);
  expect(bounds.bottom, 'bottom of the control outside the viewport').toBeLessThanOrEqual(0);
}

for (const [language, labels] of Object.entries(fitting)) {
  for (const seats of [2, 8]) {
    test(`${language} ${seats}-seat outfit trial keeps wardrobe and draft footer on screen`, async ({ page }) => {
      const button = name => page.getByRole('button', { name, exact: true });
      await page.setViewportSize(screens[0]);
      await page.goto('/');
      await page.getByRole('combobox', { name: 'Language' }).selectOption(language);
      await button(labels.outfitter).click();
      await button(labels.role).click();
      await page.locator('[data-pg="outfit"][data-value="stormglass-engineer"]').click();
      await button(labels.critical).click();
      for (const screen of screens) {
        await page.setViewportSize(screen);
        await expectScreenToFit(page, button(labels.tryOn));
      }
      await button(labels.tryOn).click();
      await page.getByLabel(labels.seats, { exact: true }).selectOption(String(seats));
      await page.getByLabel(labels.seed, { exact: true }).fill('foundry-3');
      await button(labels.load).click();
      await button(labels.play).click();
      const cards = page.locator('[data-draft-select]');
      await expect(cards).toHaveCount(3);
      await cards.first().click();
      const footer = page.locator('.battle-bottom button').last();
      for (const screen of screens) {
        await page.setViewportSize(screen);
        await expectScreenToFit(page, footer);
        expect(await cards.evaluateAll(buttons => buttons.every(button => {
          const preview = button.querySelector('.offer-preview').getBoundingClientRect();
          return preview.bottom <= button.getBoundingClientRect().bottom;
        })), 'every line of the reward previews fits in its card').toBe(true);
      }
    });
  }
}
