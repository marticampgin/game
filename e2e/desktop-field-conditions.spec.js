import { expect, test } from '@playwright/test';
import { applyCommand, CLASSES, createMatch, sandboxEdit } from '../src/game/index.js';

const names = ['Obsidian Gatekeeper','Coronet of Embers','Architect of Hours','Rook of the Dawn',
  'Keeper of Fortunes','Juniper Blackthorn','Mirrored Jessamine','Cinderrail Mechanist'];

test('crowded back-row conditions keep their owners and fit above the command dock',async ({page}) => {
  const players = Object.keys(CLASSES).slice(0,8).map((classId,i) => ({id:'p' + i,classId,name:names[i]}));
  let state = createMatch({seed:'field-conditions',players});
  state = applyCommand(state,state.activeId,{type:'pick',rewardId:state.offers[0]});
  for (const p of players) for (const status of ['poison','burn','chill','curse'])
    state = sandboxEdit(state,{type:'status',playerId:p.id,status,value:99});
  await page.goto('/');
  await page.evaluate(save => sessionStorage.setItem('rift-solo',JSON.stringify(save)), {state,viewerId:state.activeId});
  await page.reload();
  await expect(page.locator('.combatant .condition-chips')).toHaveCount(8);
  await page.evaluate(() => document.fonts.ready);
  for (const [width,height] of [[960,580],[1280,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    const overlaps = await page.evaluate(() => {
      const arena = document.querySelector('.arena-world').getBoundingClientRect();
      const seats = Array.from(document.querySelectorAll('.combatant'),seat => ({
        name:seat.querySelector('.fighter-title').textContent,
        label:seat.querySelector('.fighter-panel').getBoundingClientRect(),
        tray:seat.querySelector('.condition-chips').getBoundingClientRect(),
      }));
      const issues = [];
      for (const {name,tray} of seats) {
        if (tray.left < arena.left || tray.right > arena.right || tray.bottom > arena.bottom)
          issues.push(name + ' clipped');
        for (const other of seats) {
          if (name === other.name) continue;
          for (const rect of [other.label,other.tray]) {
            if (tray.left < rect.right && tray.right > rect.left && tray.top < rect.bottom && tray.bottom > rect.top)
              issues.push(name + ' overlaps ' + other.name);
          }
        }
      }
      return issues;
    });
    expect(overlaps,'Field at ' + width + '×' + height).toEqual([]);
  }
});
