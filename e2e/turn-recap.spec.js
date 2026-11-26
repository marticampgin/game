import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

const recap = page => page.getByRole('region', { name: 'Last action' });

async function roomRequest(api, path, body, session) {
  const headers = session ? { Authorization: 'Bearer ' + session.token } : {};
  const response = body === undefined ? await api.get(path, {headers}) : await api.post(path, {headers, data:body});
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function openSession(page, kind, saved) {
  await page.goto('/');
  await page.evaluate(([kind, data]) => sessionStorage.setItem(kind, JSON.stringify(data)), [kind, saved]);
  await page.reload();
  await expect(page.getByRole('heading', {name:'The Shattered Ring'})).toBeVisible();
}

async function pickOpeningReward(api, room, seat) {
  const view = await roomRequest(api, room, undefined, seat);
  return roomRequest(api, room + '/command', {
    revision: view.revision, command:{type:'pick', rewardId:view.game.offers[0]},
  }, seat);
}

function localMatch(classes) {
  let state = createMatch({seed:'recap-gate',players:classes.map((classId,i) => ({
    id:'p' + i, name:['Flint','Morrow','Sable'][i], classId, bot:false,
  }))});
  state = applyCommand(state,state.activeId,{type:'pick',rewardId:state.offers[0]});
  return state;
}

test('two human clients see the same resolved hit, browse prior actions and keep the live turn visible', async ({browser, page, baseURL, request}) => {
  const host = await roomRequest(request,'/api/rooms',{name:'Moss',classId:'guardian',fillBots:false,capacity:2});
  const room = '/api/rooms/' + host.code;
  const guest = await roomRequest(request,room + '/join',{name:'Ember',classId:'berserker'});
  const start = await roomRequest(request,room + '/start',{},host);
  const otherContext = await browser.newContext({baseURL});
  const otherPage = await otherContext.newPage();
  const [actor, other, actingPage, watchingPage] = start.game.activeId === host.playerId ?
    [host,guest,page,otherPage] : [guest,host,otherPage,page];
  try {
    await pickOpeningReward(request,room,actor);
    for (const [client, seat] of [[page,host],[otherPage,guest]]) {
      const {code,token,playerId} = seat;
      await openSession(client,'rift-room',{code,token,playerId});
      await expect(recap(client)).toHaveCount(0);
    }
    await actingPage.locator('[data-execute="attack"]').click();
    for (const client of [page,otherPage]) {
      await expect(recap(client).locator('.recap-who')).toContainText('Basic Attack');
      await expect(recap(client).locator('.recap-route')).toContainText('Moss');
      await expect(recap(client).locator('.recap-route')).toContainText('Ember');
      await expect(recap(client)).toContainText('health lost');
    }
    await expect(recap(watchingPage).locator('.recap-handoff')).toContainText('Your turn');
    await expect(recap(watchingPage).locator('.recap-handoff')).toContainText('Choose a reward');
    await pickOpeningReward(request,room,other);
    await watchingPage.locator('[data-action="defend"]').click();
    await watchingPage.locator('[data-execute="defend"]').click();
    await expect(recap(actingPage).locator('.recap-who')).toContainText('Defend');
    await recap(actingPage).getByRole('button',{name:'Effects',exact:true}).click();
    await recap(actingPage).getByRole('button',{name:'Previous action'}).click();
    await expect(recap(actingPage).getByRole('heading',{name:'Basic Attack'})).toBeVisible();
    await expect(recap(actingPage).locator('.recap-event')).toContainText(['dealt']);
    await expect(recap(actingPage).locator('.recap-strip')).toContainText('Your turn');
    await expect(recap(actingPage).locator('.recap-handoff.was')).toContainText('Then');
    await recap(actingPage).getByRole('button',{name:'Next action'}).click();
    await expect(recap(actingPage).getByRole('heading',{name:'Defend'})).toBeVisible();
    await actingPage.reload();
    await expect(recap(actingPage).locator('.recap-who')).toContainText('Defend');
    await expect(recap(actingPage).getByRole('button',{name:'Effects'})).toHaveAttribute('aria-expanded','false');
    await recap(actingPage).getByRole('button',{name:'Effects'}).click();
    const pinned = await recap(actingPage).locator('.recap-details').getAttribute('data-shown-action-id');
    let next = await roomRequest(request,room,undefined,actor);
    for (let i = 0; i < 8; i++) {
      const seat = next.game.activeId === actor.playerId ? actor : other;
      if (next.game.phase === 'acquire') next = await pickOpeningReward(request,room,seat);
      next = await roomRequest(request,room + '/command',{revision:next.revision,command:{type:'act',actionId:'defend'}},seat);
    }
    await expect(recap(actingPage).locator('.recap-details')).toContainText('This action is pinned.');
    await expect(recap(actingPage).locator('.recap-details')).toHaveAttribute('data-shown-action-id',pinned);
  } finally {
    await otherContext.close();
    await roomRequest(request,room + '/leave',{},host);
    await roomRequest(request,room + '/leave',{},guest);
  }
});

test('a shielded lethal hit reveals its survival chain in order while the rival’s remaining item stays hidden', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  let state = localMatch(['guardian','berserker']);
  const source = state.activeId, target = state.players.find(p => p.id !== source).id;
  for (const edit of [
    {type:'stat',playerId:source,stat:'attack',value:50},
    {type:'stat',playerId:target,stat:'hp',value:8},
    {type:'stat',playerId:target,stat:'shield',value:4},
    ...['second-breath','emergency-ward','briar-crown','pocket-eclipse'].map(rewardId => ({type:'grant',playerId:target,rewardId})),
  ]) state = sandboxEdit(state,edit);
  await openSession(page,'rift-solo',{state,viewerId:source});
  await page.locator('[data-execute="attack"]').click();
  const panel = recap(page);
  await expect(panel).toContainText('8 health lost');
  await expect(panel).toContainText('4 absorbed by shield');
  await panel.getByRole('button',{name:'Effects'}).click();
  await expect(panel.locator('.recap-split').first()).toContainText('overkill');
  const rows = await panel.locator('.recap-event').allTextContents();
  const positions = ['dealt','Second Breath','Emergency Ward','gained 18 shield','Briar Crown','dealt 3'].map(
    label => rows.findIndex(text => text.includes(label))
  );
  expect(positions[0]).toBeGreaterThanOrEqual(0);
  for (let i = 1; i < positions.length; i++) expect(positions[i],rows.join('\n')).toBeGreaterThan(positions[i-1]);
  await expect(panel).not.toContainText('Pocket Eclipse');
  await expect(panel.locator('.recap-handoff')).toContainText('Choosing a reward');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('extra actions, spectating after a knockout, and victory each show the correct handoff', async ({page}) => {
  let state = localMatch(['guardian','guardian','guardian']);
  const source = state.activeId, targets = state.players.filter(p => p.id !== source);
  for (const edit of [
    {type:'grant',playerId:source,rewardId:'combustion'}, {type:'grant',playerId:source,rewardId:'borrowed-time'},
    {type:'status',playerId:targets[0].id,status:'burn',value:6},
    ...targets.map(p => ({type:'stat',playerId:p.id,stat:'hp',value:1})),
  ]) state = sandboxEdit(state,edit);
  state = applyCommand(state,source,{type:'act',actionId:'combustion',targetId:targets[0].id});
  await openSession(page,'rift-solo',{state,viewerId:targets[0].id});
  await expect(recap(page).locator('.recap-handoff')).toContainText('Spectating');
  await expect(recap(page).locator('.recap-handoff')).toContainText('extra action');
  await openSession(page,'rift-solo',{state,viewerId:source});
  await expect(recap(page).locator('.recap-handoff')).toContainText('Your extra action');
  await page.locator('[data-execute="attack"]').click();
  await expect(recap(page).locator('.recap-handoff')).toContainText('Match complete');
  await expect(recap(page).locator('.recap-handoff')).toContainText('You won');
});
