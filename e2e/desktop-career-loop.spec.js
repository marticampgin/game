import { test, expect } from '@playwright/test';
import { applyCommand, botCommand, createMatch, getActions } from '../src/game/index.js';

const duo = [
  {id:'p1', name:'Moss', classId:'guardian', bot:false},
  {id:'p2', name:'Cinder', classId:'alchemist', bot:true},
];

async function verifiedPost(page, headers, endpoint, data) {
  const response = await page.request.post('/api/profile' + endpoint, {headers, data});
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

function winningDuel() {
  // Draft balance can change which seat wins a particular seed. Select a real
  // duel whose last basic attack can be performed through the ordinary HUD.
  for (let i = 0; i < 32; i++) {
    const seed = 'career-finish-' + i;
    let state = createMatch({seed,players:duo,career:{runId:'fixture',seats:{p1:[]}}});
    const commands = [];
    while (state.phase !== 'finished' && commands.length < 400) {
      if (state.activeId === 'p1' && state.phase === 'action' &&
          getActions(state,'p1').some(action => action.id === 'attack' && !action.disabled) &&
          applyCommand(state,'p1',{type:'act',actionId:'attack',targetId:'p2'}).winnerId === 'p1')
        return {seed,commands};
      const command = botCommand(state);
      commands.push(command);
      state = applyCommand(state,state.activeId,command);
    }
  }
  throw Error('No playable Guardian finishing blow across 32 seeded duels.');
}

test('the finishing blow settles lifetime coins and opens the Outfitter from victory', async ({page}) => {
  await page.goto('/');
  const headers = await page.evaluate(async () => {
    const client = await import('/career-client.js');
    await client.initCareer();
    return client.profileHeaders();
  });
  const {seed,commands} = winningDuel();
  const start = await verifiedPost(page, headers, '/solo', {seed,players:duo});
  const state = commands.reduce((prior,cmd) => applyCommand(prior,prior.activeId,cmd), start.state);
  expect(state.activeId).toBe('p1');
  expect(state.phase).toBe('action');
  for (let from = 0; from < commands.length; from += 48) {
    await verifiedPost(page, headers, '/solo/' + state.career.runId, {from,commands:commands.slice(from,from+48)});
  }
  await page.evaluate(save => {
    localStorage.setItem('rift-preferences',JSON.stringify({reduce:true}));
    sessionStorage.setItem('rift-solo',JSON.stringify({state:save,viewerId:'p1'}));
  }, {...state,careerJournal:commands});
  await page.reload();
  await page.locator('[data-execute="attack"]').click();
  await expect(page.getByRole('heading',{name:'Victory is yours'})).toBeVisible();
  await expect(page.locator('.result-purse')).toContainText('lifetime quest coins');
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  const verified = await (await page.request.get('/api/profile',{headers})).json();
  expect(verified.totals.wins).toBe(1);
  expect(verified.lastSettlement.lifetimeCoins).toBeGreaterThanOrEqual(35);
  await expect(page.locator('.pg-wallet')).toHaveAttribute('aria-label',verified.coins + ' coins');
  await page.locator('[data-pg="back"]').click();
  await expect(page.getByRole('heading',{name:'Victory is yours'})).toBeVisible();
  await page.getByRole('button',{name:'Play again'}).click();
  await expect(page.getByRole('button',{name:'Start match'})).toBeVisible();
});

for (const count of [2,8]) {
  test(count + ' contenders can read personal quests, draft, act and see progress after reload',async ({page}) => {
    await page.setViewportSize(count===2 ? {width:1280,height:720} : {width:1440,height:900});
    await page.goto('/');
    await page.getByRole('button',{name:'Enter the arena'}).click();
    await page.getByRole('button',{name:'Match setup'}).click();
    await page.getByLabel('Contenders').selectOption(String(count));
    await page.getByLabel('Match seed (optional)').fill(count === 2 ? 'career-draft-2-0' : 'career-draft-8-3');
    await page.getByRole('button',{name:'Start match'}).click();
    await expect(page.locator('[data-seat]')).toHaveCount(count);
    await page.locator('[data-ui="objectives"]').click();
    const quests = page.getByRole('dialog').locator('.pg-objective-head strong');
    const assigned = await quests.allTextContents();
    expect(assigned).toHaveLength(2);
    await page.getByRole('button',{name:'Close dialog'}).click();
    await page.locator('[data-draft-select]').first().click({timeout:30_000});
    await page.locator('[data-pick]').first().click();
    if (count > 2) await page.locator('#target-select').selectOption({index:1});
    await page.locator('[data-execute="attack"]').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('rift-solo')).state.career.seats.p1.metrics.damage)).toBeGreaterThan(0);
    await page.reload();
    await page.locator('[data-ui="objectives"]').click();
    expect(await quests.allTextContents()).toEqual(assigned);
  });
}
