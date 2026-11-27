import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

const roster = [
  {id:'m',name:'Moss',classId:'guardian',bot:false},
  {id:'r',name:'Rook',classId:'guardian',bot:false},
];

function draft(state) {
  return applyCommand(state,state.activeId,{type:'pick',rewardId:state.offers[0],replaceIndex:0});
}

async function restore(page,key,data) {
  await page.goto('/');
  await page.evaluate(([key,value]) => sessionStorage.setItem(key,JSON.stringify(value)),[key,data]);
  await page.reload();
  await expect(page.getByRole('heading',{name:'The Shattered Ring'})).toBeVisible();
}

test('journal finds an older cast, attributes its later Burn tick and conceals private loot', async ({page}) => {
  let state = createMatch({seed:'quiet-archive',players:roster});
  const source = state.activeId;
  const rival = state.players.find(p => p.id !== source);
  state = sandboxEdit(state,{type:'grant',playerId:source,rewardId:'cinder-orb'});
  state = sandboxEdit(state,{type:'grant',playerId:rival.id,rewardId:'second-breath'});
  state = applyCommand(draft(state),source,{type:'act',actionId:'cinder-orb',targetId:rival.id});
  for (let i = 0; i < 10; i++) state = applyCommand(draft(state),state.activeId,{type:'act',actionId:'defend'});
  expect(state.recentActions.every(a => a.actionId !== 'cinder-orb')).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await restore(page,'rift-solo',{state,viewerId:source});
  await page.getByRole('button',{name:'Battle log',exact:true}).first().click();
  const dialog = page.getByRole('dialog');
  const search = dialog.getByRole('searchbox',{name:'Search the log'});
  const oldRound = dialog.locator('[data-round="1"]');
  await expect(oldRound).not.toHaveAttribute('open','');
  await search.fill('Cinder Orb');
  await expect(oldRound).toHaveAttribute('open','');
  await expect(oldRound.locator('.journal-row:visible')).toContainText(['used Cinder Orb']);
  await search.fill('Burn');
  await expect(dialog.locator('.journal-row:visible')).toContainText(['applied 3 Burn']);
  const owner = state.players.find(p => p.id === source);
  await expect(dialog.locator('.journal-row:visible .recap-split')).toContainText(['Source ' + owner.name]);
  await search.fill('Second Breath');
  await expect(dialog).toContainText('No matching events.');
  await expect(dialog.locator('.journal-row:visible')).toHaveCount(0);
  await search.fill('');
  await expect(oldRound).not.toHaveAttribute('open','');
  await expect(dialog.locator('[data-round]').first()).toHaveAttribute('open','');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test('solo bot declares a visible target before executing its prepared public attack', async ({page}) => {
  let state = draft(createMatch({seed:'windup',players:roster}));
  const actor = state.players.find(p => p.id === state.activeId);
  actor.bot = true;
  const rival = state.players.find(p => p.id !== state.activeId);
  for (const slot of actor.abilities) slot.cooldown = 3;
  state = sandboxEdit(state,{type:'stat',playerId:actor.id,stat:'attack',value:95});
  await page.emulateMedia({reducedMotion:'reduce'});
  await restore(page,'rift-solo',{state,viewerId:rival.id});
  await expect(page.locator('.watch')).toContainText('Preparing Basic Attack against ' + rival.name);
  await expect(page.getByRole('region',{name:'Last action'})).toHaveCount(0);
  const result = page.getByRole('region',{name:'Last action'});
  await expect(result).toContainText('Basic Attack',{timeout:8000});
  await expect(result).toContainText('Your turn');
});

test('room history updates under an active search while a departed seat’s bot completes its turn', async ({page,request}) => {
  const post = async (path,body,token) => {
    const response = await request.post(path,{data:body,headers:token ? {Authorization:'Bearer ' + token} : {}});
    expect(response.ok(),await response.text()).toBe(true);
    return response.json();
  };
  const host = await post('/api/rooms',{name:'Flint',classId:'guardian',capacity:2,fillBots:false});
  const room = '/api/rooms/' + host.code;
  const guest = await post(room + '/join',{name:'Fern',classId:'guardian'});
  const start = await post(room + '/start',{fastBots:false},host.token);
  const [departing,staying] = start.game.activeId === host.playerId ? [host,guest] : [guest,host];
  try {
    await page.emulateMedia({reducedMotion:'reduce'});
    await restore(page,'rift-room',{code:staying.code,token:staying.token,playerId:staying.playerId});
    await page.getByRole('button',{name:'Battle log',exact:true}).click();
    const dialog = page.getByRole('dialog');
    const search = dialog.getByRole('searchbox',{name:'Search the log'});
    await search.fill('used');
    await expect(dialog.locator('.journal-empty')).toBeVisible();
    await post(room + '/leave',{},departing.token);
    await expect(dialog.locator('.journal-row.main-action:visible').first()).toContainText('used',{timeout:15000});
    await expect(search).toHaveValue('used');
    await expect(search).toBeFocused();
    await expect(dialog.locator('.journal-empty')).toBeHidden();
  } finally { await post(room + '/leave',{},staying.token); }
});
