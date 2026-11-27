import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

function stackedMatch(count) {
  const names = ['Moss', 'Cinder', 'Vesper', 'Rowan', 'Juniper', 'Aster', 'Flint', 'Ember'];
  const roles = ['guardian', 'alchemist', 'chronomancer', 'berserker'];
  const players = names.slice(0, count).map((name, i) => ({
    id: 'p' + i, name, classId: roles[i % roles.length], bot: false,
  }));
  let state;
  for (let seed = 0; seed < 1000; seed++) {
    state = createMatch({seed: 'painted-status-' + seed, players});
    if (state.activeId === 'p0' && state.queue[0] === 'p1') break;
  }
  expect([state.activeId, state.queue[0]]).toEqual(['p0', 'p1']);
  for (const [status, value] of [['burn', 3], ['poison', 5], ['doom', 2]])
    state = sandboxEdit(state, {type:'status', playerId:'p1', status, value});
  state.players[1].doomClock = 1;
  return applyCommand(state, state.activeId, {type:'pick', rewardId:state.offers[0]});
}

async function start(page, count, reduce = false) {
  const state = stackedMatch(count);
  await page.emulateMedia({reducedMotion:reduce ? 'reduce' : 'no-preference'});
  await page.goto('/');
  await page.evaluate(state => sessionStorage.setItem('rift-solo', JSON.stringify({state, viewerId:'p0'})), state);
  await page.reload();
  await expect(page.locator('[data-seat="p1"] .condition-chip')).toHaveCount(3);
  await page.locator('[data-action="defend"]').click();
  await page.evaluate(() => {
    window.beatReads = [];
    const vitals = document.querySelector('[data-seat="p1"]');
    const observer = new MutationObserver(() => {
      const row = document.querySelector('.effect-receipt:last-child');
      if (!row?.dataset.receipt || window.beatReads.at(-1)?.id === row.dataset.receipt) return;
      window.beatReads.push({
        id:row.dataset.receipt, time:performance.now(), hp:vitals.querySelector('.fighter-hp').textContent,
        stack:vitals.querySelector('[data-condition="' + row.dataset.receipt + '"] b')?.textContent ?? '0',
        label:document.querySelector('.arena-status-label')?.textContent,
        phase:document.querySelector('.live-phase').textContent,
        turn:document.querySelector('.scene-callout').textContent,
        owner:document.querySelector('.turn-rail [aria-current]').dataset.inspect,
        trail:Array.from(document.querySelectorAll('.effect-receipt'), chip => chip.textContent),
        bursts:document.querySelectorAll('.arena-status-burst').length,
      });
    });
    observer.observe(document.querySelector('.battle-shell'), {childList:true, subtree:true});
  });
  await page.locator('[data-execute="defend"]').click();
  return state.players[1];
}

for (const count of [2, 8]) {
  test(count + ' PC seats read each turn-start condition before handoff', async ({ page }) => {
    const player = await start(page, count);
    await expect(page.locator('[data-ui="skip-effects"]')).toBeVisible();
    await expect(page.locator('.recap-handoff')).toContainText('Cinder’s turn', {timeout:9000});
    const reads = await page.evaluate(() => window.beatReads);
    expect(reads.map(r => r.id)).toEqual(['burn', 'poison', 'doom']);
    for (const [i, read] of reads.entries()) {
      expect(read.hp).toBe((player.hp - [3, 8, 10][i]) + ' / ' + player.maxHp);
      expect(read.stack).toBe(['2', '5', '0'][i]);
      expect(read.label).toContain(['Burn−3 HP', 'Poison−5 HP', 'Doom−2 HP'][i]);
      expect(read.phase).toContain('Turn startCinder');
      expect([read.turn, read.owner]).toEqual(['Cinder · Turn start', 'p1']);
      expect(read.bursts).toBeGreaterThan(0);
      if (i) expect(read.time - reads[i - 1].time).toBeGreaterThan(590);
    }
    expect(reads.at(-1).trail).toEqual(['BurnCinder · −3 HP','PoisonCinder · −5 HP','DoomCinder · −2 HP']);
    const recap = page.locator('[data-ui="toggle-recap"]');
    await expect(recap.locator('.status-icon')).toHaveCount(3);
    await recap.click();
    await expect(page.locator('.recap-events .status-icon')).toHaveCount(3);
    await expect(page.locator('.recap-events')).toContainText('Doom dealt 2 to Cinder');
    await expect(page.locator('[data-seat="p1"] .condition-chip')).toHaveCount(2);
  });
}

test('reduced motion keeps the sequence readable and skipping restores final vitals and focus', async ({page}) => {
  const player = await start(page, 2, true);
  const skip = page.getByRole('button', {name:'Skip effects'});
  await expect(page.locator('.effect-receipt[data-receipt="burn"]')).toBeVisible();
  await expect(page.locator('.arena-status-burst[data-status="burn"]')).toHaveCSS('animation-name', 'none');
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.arena-fx')).toHaveCount(0);
  await expect(page.locator('[data-seat="p1"] .fighter-hp')).toHaveText((player.hp - 10) + ' / ' + player.maxHp);
  await expect(page.locator('[data-seat="p1"] [data-condition="doom"]')).toHaveCount(0);
  await expect(page.locator('[data-ui="toggle-recap"]')).toBeFocused();
  await expect(page.locator('.recap-handoff')).toContainText('Cinder’s turn');
});

test('taking Scavenge loot plays the new turn ticks once without reopening the chest', async ({page}) => {
  let state = stackedMatch(2);
  state = applyCommand(state, 'p0', {type:'act', actionId:'scavenge'});
  state.offers = ['iron-shard','heartwood','golden-shell'];
  await page.goto('/');
  await page.evaluate(state => sessionStorage.setItem('rift-solo', JSON.stringify({state,viewerId:'p0'})), state);
  await page.reload();
  await page.locator('[data-draft-select="iron-shard"]').click();
  await page.evaluate(() => {
    window.cacheOpened = false;
    new MutationObserver(() => {
      if (document.querySelector('[data-prop="cache"]')) window.cacheOpened = true;
    }).observe(document.querySelector('.arena-world'), {subtree:true,childList:true});
  });
  await page.locator('[data-pick="iron-shard"]').click();
  await expect(page.locator('.arena-status-label[data-status="burn"]')).toBeVisible();
  await expect(page.locator('.effect-receipt[data-receipt="doom"]')).toBeVisible();
  await expect(page.locator('.recap-handoff')).toContainText('Cinder’s turn');
  expect(await page.evaluate(() => window.cacheOpened)).toBe(false);
  await expect(page.locator('[data-seat="p1"] .fighter-hp')).toHaveText('475 / 485');
  await expect(page.locator('[data-ui="toggle-recap"] .status-icon')).toHaveCount(3);
});