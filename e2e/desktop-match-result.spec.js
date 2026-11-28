import { test, expect } from '@playwright/test';
import { applyCommand, botCommand, createMatch, sandboxEdit } from '../src/game/index.js';
import { fighterPortrait, resolveFighterSkin } from '../public/fighter-kit.js';

const seats = [
  ['Moss','alchemist','nightshade-apothecary'], ['Cinder','berserker','wolf-tracker'],
  ['Ember','chronomancer','founder'], ['Rook','guardian','founder'],
  ['Vale','gambler','gilded-jack'], ['Juniper','necromancer','ossuary-queen'],
  ['Sable','trickster','carnival-fox'], ['Wanderer','artificer','stormglass-engineer'],
].map(([name,classId,skinId],i) => ({ id:'p' + i, name, classId, skinId }));

async function openMatch(page,state,viewerId) {
  await page.goto('/');
  await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)),{state,viewerId});
  await page.reload();
}

async function checkWinner(page,state,own) {
  const winner = state.players.find(p => p.id === state.winnerId);
  const result = page.locator('.result');
  await expect(result.getByRole('heading')).toHaveText(own ? 'Victory is yours' : winner.name + ' wins');
  await expect(result.locator('.result-identity')).toContainText(resolveFighterSkin(winner.classId,winner.skinId).name);
  await expect(result.locator('.result-portrait img')).toHaveAttribute('src',fighterPortrait(winner));
  await expect(result.locator('.result-health')).toContainText(winner.hp + ' / ' + winner.maxHp + ' HP');
  const champion = page.locator('.champion .arena-sprite');
  await expect(champion).toHaveAttribute('data-skin',winner.skinId);
  await expect(champion).toHaveAttribute('data-pose','victory');
  await expect(page.locator('.seat-conditions .condition-chips')).toHaveCount(0);
  const rail = page.getByRole('navigation',{name:'Final roster'});
  await expect(rail.getByRole('button',{name:'Champion · ' + winner.name})).toHaveAttribute('data-inspect',winner.id);
  await expect(rail.locator('[data-outcome="eliminated"]')).toHaveCount(state.players.length - 1);
  await expect(rail.locator('[aria-current="step"]')).toHaveCount(0);
}

test('a lethal duel settles from the attack to the winning outfit and a readable final log',async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  let state = createMatch({seed:'final-duel',players:seats.slice(0,2)});
  const actor = state.activeId, rival = state.players.find(p => p.id !== actor).id;
  state = applyCommand(state,actor,{type:'pick',rewardId:state.offers[0]});
  state = sandboxEdit(state,{type:'stat',playerId:rival,stat:'hp',value:1});
  state = sandboxEdit(state,{type:'status',playerId:rival,status:'poison',value:3});
  await openMatch(page,state,actor);
  await expect(page.locator('.seat-conditions .condition-chip[data-condition="poison"]')).toBeVisible();
  await page.locator('[data-execute="attack"]').click();
  const end = applyCommand(state,actor,{type:'act',actionId:'attack',targetId:rival});
  await checkWinner(page,end,true);
  await page.locator('.result').getByRole('button',{name:'Battle log'}).click();
  await expect(page.getByRole('dialog')).toContainText('last contender standing');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.locator('.result-portrait').click();
  await expect(page.getByRole('dialog').getByRole('heading').first()).toHaveText(seats.find(s => s.id === actor).name);
});

test('a defeated viewer sees the eight-seat winner after reload and can inspect each finalist',async ({page}) => {
  await page.setViewportSize({width:1920,height:1080});
  let state;
  for (let i = 0; i < 8; i++) {
    state = createMatch({seed:'final-eight-' + i,players:seats});
    for (let count = 0; state.phase !== 'finished' && count < 1400; count++)
      state = applyCommand(state,state.activeId,botCommand(state));
    if (state.winnerId && state.winnerId !== state.players[0].id) break;
  }
  expect(state.winnerId).toBeTruthy();
  expect(state.winnerId).not.toBe(seats[0].id);
  await openMatch(page,state,seats[0].id);
  await checkWinner(page,state,false);
  const rail = page.getByRole('navigation',{name:'Final roster'});
  await expect(rail.getByRole('button')).toHaveCount(8);
  await rail.getByRole('button',{name:'Eliminated · Moss'}).click();
  await expect(page.getByRole('dialog').getByRole('heading').first()).toHaveText('Moss');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Play again'}).click();
  await expect(page.getByRole('button',{name:'Start match'})).toBeVisible();
});

test('simultaneous arena fire draws without a champion, health claim or highlighted first seat',async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  let state = createMatch({seed:'final-draw',players:seats.slice(0,2),config:{ages:[1,2,3,4],chaosBase:10000,eventInterval:200}});
  while (state.phase !== 'finished' && state.round < 5) {
    const command = state.phase === 'acquire' ? {type:'pick',rewardId:state.offers[0],replaceIndex:0} : {type:'act',actionId:'defend'};
    state = applyCommand(state,state.activeId,command);
  }
  expect(state.winnerId).toBeNull();
  expect(state.phase).toBe('finished');
  await openMatch(page,state,seats[0].id);
  const result = page.locator('.result');
  await expect(result).toContainText('Draw · All 2 contenders fell');
  await expect(result.locator('.result-health')).toHaveCount(0);
  await expect(page.locator('.arena-sprite[data-pose="fallen"]')).toHaveCount(2);
  const rail = page.getByRole('navigation',{name:'Final roster'});
  await expect(rail.locator('[data-outcome="eliminated"]')).toHaveCount(2);
  await expect(rail.locator('[data-outcome="champion"],[aria-current]')).toHaveCount(0);
  expect(await rail.locator('li').first().evaluate(el => getComputedStyle(el,'::after').content)).toBe('none');
});
