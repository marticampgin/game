import { expect, test } from '@playwright/test';
import { applyCommand, botCommand, createMatch, sandboxEdit } from '../src/game/index.js';

test('keyboard users can close a centered dialog and return from each main menu destination', async ({ page }) => {
  await page.goto('/');
  const settings = page.getByRole('button', { name: 'Settings and rules' });
  await settings.focus();
  await settings.press('Enter');
  const close = page.getByRole('dialog', { name: 'Settings & rules' }).getByRole('button', { name: 'Close dialog' });
  await expect(close).toBeFocused();
  const offset = await close.evaluate(button => {
    const target = button.getBoundingClientRect();
    const glyph = button.querySelector('svg').getBoundingClientRect();
    return [glyph.x + glyph.width / 2 - target.x - target.width / 2,
      glyph.y + glyph.height / 2 - target.y - target.height / 2];
  });
  for (const delta of offset) expect(Math.abs(delta)).toBeLessThanOrEqual(0.5);
  await close.press('Tab');
  const toggle = page.getByLabel('Sound effects');
  await expect(toggle).toBeFocused();
  const before = await toggle.isChecked();
  await toggle.press('Space');
  expect(await toggle.isChecked()).toBe(!before);
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();

  for (const [destination, back] of [['lobby', '[data-lobby=back]'], ['atlas', '.rb-tool-back'], ['sandbox', '.rb-tool-back']]) {
    const opener = page.locator('[data-ui="' + destination + '"]');
    await opener.focus();
    await opener.press('Enter');
    await page.locator(back).press('Enter');
    await expect(opener).toBeFocused();
  }
});

async function camera(page) {
  return page.locator('.arena-world').evaluate(arena => {
    const bounds = node => {
      const rect = node.getBoundingClientRect();
      return [rect.x, rect.y, rect.width, rect.height].map(Math.round);
    };
    const style = getComputedStyle(arena);
    return {
      arena: bounds(arena),
      crop: [style.backgroundPosition, style.backgroundSize],
      seats: [...arena.querySelectorAll('.fighter-art')].map(bounds),
    };
  });
}

for (const own of [true, false]) {
  test(`an open ${own ? 'inventory' : 'rival inspection'} updates in place when a bot attacks`, async ({ page }) => {
    await page.setViewportSize(own ? {width:1280,height:720} : {width:2560,height:1440});
    await page.clock.install({time:new Date('2026-01-01T12:00:00Z')});
    await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
    const players = [
      {id:'p0',name:'Mirelle',classId:'necromancer'},
      {id:'bot',name:'Bran',classId:'guardian',bot:true},
    ];
    let state = createMatch({seed:'dialog-live-0',players});
    state = sandboxEdit(state,{type:'stat',playerId:'bot',stat:'armor',value:42});
    state = sandboxEdit(state,{type:'stat',playerId:'p0',stat:'shield',value:6});
    state = sandboxEdit(state,{type:'grant',playerId:'bot',rewardId:'second-breath'});
    for (const rewardId of ['red-tonic','ward-lantern','wake-candle','stillwater-ring'])
      state = sandboxEdit(state,{type:'grant',playerId:'p0',rewardId});
    state = applyCommand(state,'bot',botCommand(state));
    const blow = botCommand(state);
    expect(blow.actionId).toBe('bastion-bash');
    const after = applyCommand(state,'bot',blow);
    await page.addInitScript(save => sessionStorage.setItem('rift-solo',JSON.stringify(save)),{state,viewerId:'p0'});
    await page.goto('/');
    const origin = own ? page.getByRole('button',{name:'Your inventory'}) : page.locator('.turn-rail [data-inspect="bot"]');
    await origin.focus();
    await origin.press('Enter');
    const dialog = page.getByRole('dialog',{name:own ? 'Mirelle' : 'Bran'});
    const close = dialog.getByRole('button',{name:'Close dialog'});
    await expect(close).toBeFocused();
    const stat = label => dialog.locator('.stats-row div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
    if (own) await expect(stat('Shield')).toHaveText('6');
    else {
      await expect(dialog.locator('.item-list li').filter({hasText:'Bastion Bash'})).toContainText('Ready');
      await expect(dialog).toContainText('Only the owner can see these items.');
    }
    const body = dialog.getByRole('region',{name:'Stats and equipment'});
    if (own) {
      await close.press('Tab');
      await expect(body).toBeFocused();
      await page.keyboard.press('End');
      await expect.poll(() => body.evaluate(el => el.scrollTop > 0 && el.scrollTop >= el.scrollHeight - el.clientHeight - 1)).toBe(true);
    }
    const offset = await body.evaluate(el => el.scrollTop);
    await page.clock.runFor(2300);
    if (own) {
      const viewer = after.players.find(player => player.id === 'p0');
      await expect(stat('Health')).toHaveText(viewer.hp + '/' + viewer.maxHp);
      await expect(stat('Shield')).toHaveText('0');
      await expect(dialog).toContainText('Red Tonic');
    } else {
      await expect(dialog.locator('.item-list li').filter({hasText:'Bastion Bash'})).toContainText('Cooldown 2');
      await expect(dialog).not.toContainText('Second Breath');
    }
    await expect(own ? body : close).toBeFocused();
    expect(await body.evaluate(el => el.scrollTop)).toBe(offset);
    await page.keyboard.press('Escape');
    await expect(origin).toBeFocused();
  });
}

const classes = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
  for (const seats of [2, 8]) {
    test('keeps the same camera and clickable vitals across a ' + seats + '-seat turn at ' + width, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const state = createMatch({ seed: 'gui3', players: Array.from({ length: seats }, (_, i) => ({
        id: 'p' + i, name: 'Player ' + (i + 1), classId: classes[i % classes.length], bot: false,
      })) });
      state.offers = ['antidote', 'ward-lantern', 'cinder-orb'];
      await page.goto('/');
      await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), { state, viewerId: state.activeId });
      await page.reload();
      await page.locator('[data-draft-select="antidote"]').click();
      const take = page.locator('[data-pick="antidote"]');
      await expect(take).toBeInViewport({ ratio: 1 });
      const labels = page.locator('.fighter-hp');
      await expect(labels).toHaveCount(seats);
      const visibleLabels = await labels.evaluateAll(nodes => nodes.every(node => {
        const b = node.getBoundingClientRect();
        const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
        return hit?.closest('.combatant') === node.closest('.combatant');
      }));
      expect(visibleLabels).toBe(true);
      const starting = await camera(page);
      await take.click();
      await expect(page.locator('.command-deck')).toBeVisible();
      expect(await camera(page)).toEqual(starting);
      // A carried item can wrap the deck labels to a second text line.
      await expect(page.locator('.battle-bottom')).toBeInViewport({ ratio: 1 });
      await page.locator('[data-action="defend"]').click();
      await page.locator('[data-execute="defend"]').click();
      await expect(page.locator('.watch')).toBeVisible();
      expect(await camera(page)).toEqual(starting);
      await expect(page.getByRole('region', { name: 'Last action' })).toContainText('Defend');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    });
  }
}

test('keeps the same crest for each contender on the field, turn rail and target picker', async ({ page }) => {
  const state = createMatch({ seed: 'eight-guardians', players: Array.from({ length: 8 }, (_, i) => ({
    id: 'p' + i, name: i < 2 ? 'Rowan' : 'Guardian ' + i, classId: 'guardian', bot: false,
  })) });
  await page.goto('/');
  await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), { state, viewerId: state.activeId });
  await page.reload();
  const rail = page.getByRole('navigation', { name: 'Turn order' });
  const signatures = new Set();
  for (const player of state.players) {
    const crest = page.locator('[data-seat="' + player.id + '"] .seat-crest');
    await expect(crest).toBeVisible();
    const value = await crest.getAttribute('data-crest');
    signatures.add(value);
    await expect(rail.locator('[data-inspect="' + player.id + '"] .seat-crest')).toHaveAttribute('data-crest', value);
  }
  expect(signatures.size).toBe(8);
  await expect(rail.locator('[aria-current=step]')).toHaveAttribute('data-inspect', state.activeId);
  await page.locator('[data-draft-select]').first().click();
  await page.locator('[data-pick]').click();
  const target = state.players.find(p => p.id !== state.activeId);
  await page.locator('[data-aim="' + target.id + '"]').click();
  const identity = id => page.locator('[data-seat="' + id + '"] .seat-crest').getAttribute('data-crest');
  await expect(page.locator('.command-portrait .seat-crest')).toHaveAttribute('data-crest', await identity(state.activeId));
  await expect(page.locator('.command-target-art .seat-crest')).toHaveAttribute('data-crest', await identity(target.id));
  await expect(page.locator('[data-ui=event]')).toContainText('Next event');
});
