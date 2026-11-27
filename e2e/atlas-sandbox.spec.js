import { expect, test } from '@playwright/test';
import { REWARDS } from '../src/game/catalog.js';

test('atlas searches real mechanics and follows directed connections through filters', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const entry = page.getByRole('button', { name: 'Reward Atlas', exact: true });
  await entry.click();
  await expect(page.getByRole('heading', { name: 'Reward Atlas' })).toBeVisible();
  await expect(page.locator('[data-node]')).toHaveCount(Object.keys(REWARDS).length);
  await page.getByRole('searchbox').fill('phoenix');
  await expect(page.locator('[data-node]')).toHaveCount(2);
  await page.getByLabel('Find reward on map').selectOption('phoenix-heart');
  await page.locator('[data-jump="molten-mail"]').click();
  await expect(page.getByRole('heading', { name: 'Molten Mail' })).toBeVisible();
  await expect(page.getByRole('searchbox')).toHaveValue('');
  const map = page.getByRole('region', { name: /Constellation map/ });
  await map.focus();
  const transform = () => map.locator('.rb-world').evaluate(node => node.style.transform);
  const before = await transform();
  await page.keyboard.press('+');
  expect(await transform()).not.toBe(before);
  await page.getByLabel('Rarity', { exact: true }).selectOption('legendary');
  await page.getByLabel('Category', { exact: true }).selectOption('artifact');
  await expect(page.getByRole('heading', { name: 'Borrowed Time' })).toBeVisible();
  await page.getByRole('searchbox').fill('missing star that does not exist');
  await expect(page.getByText('No matching rewards')).toBeVisible();
  await page.locator('.rb-map-empty').getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-node]')).toHaveCount(Object.keys(REWARDS).length);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel('Find reward on map').selectOption('quicksilver-lung');
  await expect(page.getByRole('heading', { name: 'Quicksilver Lung' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(entry).toBeFocused();
  expect(errors).toEqual([]);
});

test('sandbox applies live edits, reproduces builds and carries them into battle', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sandbox', exact: true }).click();
  await page.getByLabel('Starting build').selectOption('molten');
  await page.getByLabel('Match seed').fill('hearth');
  await page.getByRole('button', { name: 'Load experiment' }).click();
  await expect(page.locator('.rb-inventory')).toContainText('Molten Mail, Phoenix Heart');
  const edit = page.locator('.rb-edit');
  const choose = (choice) => page.getByLabel('Operation').selectOption(choice);
  await choose('stat');
  await page.getByLabel('Attribute').selectOption('armor');
  await page.getByLabel('Value', { exact: true }).fill('52');
  await edit.getByRole('button', { name: 'Set attribute' }).click();
  await expect(page.locator('.rb-attribute-list')).toContainText('Armor52');
  await choose('status');
  await page.getByLabel('Status', { exact: true }).selectOption('poison');
  await page.getByLabel('Stacks').fill('3');
  await edit.getByRole('button', { name: 'Apply status' }).click();
  await expect(page.locator('.rb-inventory')).toContainText('Poison 3');
  await choose('grant');
  await page.getByLabel('Reward', { exact: true }).selectOption('second-breath');
  await edit.getByRole('button', { name: 'Grant reward' }).click();
  await expect(page.locator('.rb-inventory')).toContainText('Second Breath');
  await choose('cooldown');
  await page.getByLabel('Turns remaining').fill('5');
  await edit.getByRole('button', { name: 'Set cooldown' }).click();
  await expect(page.locator('.rb-loadout')).toContainText('5 turns');
  await choose('round');
  await page.getByLabel('Round', { exact: true }).fill('31');
  await edit.getByRole('button', { name: 'Set round' }).click();
  await expect(page.locator('.rb-phase')).toContainText('Age of Chaos');
  await choose('event');
  await page.getByLabel('Arena event').selectOption('blood-moon');
  await edit.getByRole('button', { name: 'Trigger event' }).click();
  await expect(page.locator('.rb-history')).toContainText('Blood Moon');
  await page.getByRole('button', { name: 'Step phase' }).click();
  await expect(page.locator('.rb-phase')).toContainText('Action');
  await page.getByRole('button', { name: 'Play match' }).click();
  await expect(page.getByLabel('Battlefield')).toBeVisible();
  await page.getByRole('button', { name: 'Your inventory' }).click();
  await expect(page.getByRole('dialog')).toContainText('Second Breath');
  await expect(page.getByRole('dialog')).toContainText('Phoenix Heart');
  expect(errors).toEqual([]);
});

for (const [width, height] of [[1280,720], [1920,1080]]) {
  test('desktop atlas opens with its active region and reward visible at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Reward Atlas', exact: true }).click();
    const map = page.getByRole('region', { name: /Constellation map/ });
    const node = map.locator('[aria-pressed=true]');
    await expect(node).toHaveAccessibleName('Bastion Bash');
    await expect.poll(() => map.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const targets = element.querySelectorAll('.rb-region, [aria-pressed="true"]');
      return Array.from(targets).filter(button => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return box.left < bounds.left || box.right > bounds.right ||
          box.top < bounds.top || box.bottom > bounds.bottom || !button.contains(hit);
      }).map(button => button.getAttribute('aria-label'));
    })).toEqual([]);
  });
}
