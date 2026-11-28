import { expect, test } from '@playwright/test';
import { applyCommand, botCommand, CLASSES, createMatch, viewMatch } from '../src/game/index.js';
import { finishPlace } from '../public/finish-place.js';

const players = Object.keys(CLASSES).map((classId,i) => ({id:'p'+i,classId,name:CLASSES[classId].name}));

for (const [width,height] of [[1024,768],[1280,720]]) {
  test('the final log finds an early knockout after its action detail rolls away at ' + width + 'px', async ({page}) => {
    await page.setViewportSize({width,height});
    let state = createMatch({seed:'history-jury',players});
    while (state.phase !== 'finished') state = applyCommand(state,state.activeId,botCommand(state));
    const view = viewMatch(state);
    const earliest = view.milestones.eliminations.find(fall => fall.id < view.log[0].id && fall.actorId !== fall.targetId);
    expect(earliest).toBeTruthy();
    const place = finishPlace(view,earliest);
    const defeated = players.find(p => p.id === earliest.targetId);
    const killer = players.find(p => p.id === earliest.actorId);
    await page.goto('/');
    await page.evaluate(save => sessionStorage.setItem('rift-solo',JSON.stringify(save)),{state,viewerId:defeated.id});
    await page.reload();
    await expect(page.locator('.result-identity')).toContainText('Your finish · ' + place);
    const openLog = page.locator('.result [data-ui=history]');
    await openLog.focus();
    await openLog.press('Enter');
    const journal = page.getByRole('dialog');
    await expect(journal.locator('.journal-limit')).toContainText('latest 100 events');
    const row = journal.locator('[data-event-id="' + earliest.id + '"]');
    for (const query of [defeated.name,place,...(killer ? [killer.name] : [])]) {
      await journal.getByRole('searchbox').fill(query);
      await expect(row).toBeVisible();
      await expect(row).toContainText(earliest.text);
      await expect(row).toContainText(place);
    }
    const ids = await journal.locator('.journal-row').evaluateAll(rows => rows.map(row => row.dataset.eventId));
    expect(new Set(ids).size).toBe(ids.length);
    await expect(journal.locator('.journal-round[open] [data-event-id="' + earliest.id + '"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await journal.getByRole('searchbox').fill('');
    await page.keyboard.press('Escape');
    await expect(openLog).toBeFocused();
  });
}
