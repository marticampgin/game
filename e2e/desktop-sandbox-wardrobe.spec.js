import { expect, test } from '@playwright/test';
import { CLASSES } from '../src/game/catalog.js';
import { fighterSkins } from '../public/fighter-kit.js';

for (const [count,width,height] of [[2,1280,720],[8,1440,900]]) {
  test('test an unowned outfit and pilot a custom fighter in a ' + count + '-seat PC practice match', async ({page}) => {
    await page.setViewportSize({width,height});
    const errors = [];
    page.on('pageerror',e => errors.push(e.message));
    await page.goto('/');
    const openBench = () => page.getByRole('button',{name:'Sandbox',exact:true}).click();
    await openBench();
    await page.getByLabel('Seats',{exact:true}).selectOption(String(count));
    await page.getByRole('button',{name:'Load experiment'}).click();
    const seat = count === 2 ? 'rival' : 'sparring-5';
    await page.locator('[data-pick="' + seat + '"]').click();
    await page.getByRole('button',{name:'Choose class',exact:true}).click();
    const classSelect = page.getByRole('combobox',{name:'Class',exact:true});
    await expect(classSelect.locator('option')).toHaveCount(Object.keys(CLASSES).length);
    await classSelect.selectOption('berserker');
    await page.getByRole('button',{name:'Change class',exact:true}).click();
    const outfits = page.getByRole('group',{name:'Practice outfits'});
    await expect(outfits.getByRole('button')).toHaveCount(fighterSkins('berserker').length);
    await outfits.getByRole('button',{name:'Wolf Tracker'}).click();
    await page.getByRole('button',{name:'Critical',exact:true}).click();
    await page.getByRole('button',{name:'Control this fighter'}).click();
    await expect(page.locator('.bench-body [data-skin="wolf-tracker"][data-tier="critical"]')).toBeVisible();
    await expect(page.locator('.bench-turn')).toBeInViewport();
    await expect(page.getByRole('button',{name:'Play match',exact:true})).toBeInViewport();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await page.reload();
    await openBench();
    await expect(page.locator('.bench-name')).toHaveText('Wolf Tracker');
    await expect(page.locator('.bench-pilot-info')).toHaveText('Your fighter');
    await page.getByRole('button',{name:'Play match',exact:true}).click();
    await expect(page.locator('[data-seat]')).toHaveCount(count);
    await expect(page.locator('[data-seat="' + seat + '"] .arena-sprite')).toHaveAttribute('data-skin','wolf-tracker');
    await page.reload();
    await expect(page.locator('[data-seat="' + seat + '"] .arena-sprite')).toHaveAttribute('data-tier','critical');
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('rift-solo')));
    expect(saved.viewerId).toBe(seat);
    expect(saved.state.career).toBeUndefined();
    expect(saved.state.careerJournal).toBeUndefined();
    expect(errors).toEqual([]);
  });
}
