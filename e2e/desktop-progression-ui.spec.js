import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArenaServer } from '../server/index.js';
import { applyCommand, botCommand } from '../src/game/index.js';
import { MATCH_QUESTS, SHOP } from '../src/game/progression.js';

let server, address, profileDirectory;

test.beforeAll(async () => {
  profileDirectory = await mkdtemp(join(tmpdir(), 'rift-outfitter-'));
  server = createArenaServer({profileDirectory});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  address = 'http://127.0.0.1:' + server.address().port;
});
test.afterAll(async () => {
  server?.closeAllConnections();
  if (server) await new Promise(resolve => server.close(resolve));
  if (profileDirectory) await rm(profileDirectory,{recursive:true,force:true});
});

// Fund this browser through normal verified solo matches. The shop and lobby
// use the resulting wallet on their regular HTTP and page routes.
async function earn(request, key, required) {
  const headers = {'X-Rift-Profile':key};
  const players = [
    {id:'p1',classId:'guardian',name:'Warden',bot:false},
    {id:'p2',classId:'chronomancer',name:'Oracle',bot:true},
  ];
  let coins = 0;
  for (let game = 0; game < 16 && coins < required; game++) {
    const begin = await request.post(address + '/api/profile/solo',{headers,data:{players,seed:'outfitter-'+game}});
    expect(begin.ok()).toBeTruthy();
    let {state} = await begin.json();
    const journal = [];
    while (state.phase !== 'finished') {
      const command = botCommand(state);
      journal.push(command);
      state = applyCommand(state,state.activeId,command);
    }
    for (let from = 0; from < journal.length; from += 48) {
      const sync = await request.post(address + '/api/profile/solo/' + state.career.runId,
        {headers,data:{from,commands:journal.slice(from,from+48)}});
      expect(sync.ok()).toBeTruthy();
      coins = (await sync.json()).profile.coins;
    }
  }
  expect(coins).toBeGreaterThanOrEqual(required);
  return coins;
}

test('a fresh journal explains objectives and lets the player inspect their mastery reward at 720p', async ({page}) => {
  await page.setViewportSize({width:1280,height:720});
  await page.goto(address);
  await page.getByRole('button',{name:'Quest journal',exact:true}).click();
  const lastMastery = page.getByRole('button',{name:/Alchemist.*Nightshade Apothecary/});
  const lastRow = page.locator('.pg-mastery-row').last();
  await expect(lastRow).toBeVisible();
  const box = await lastRow.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(720);
  const pool = page.getByText('View objective pool');
  await pool.click();
  await expect(page.locator('.pg-pool li')).toHaveCount(MATCH_QUESTS.length);
  await pool.click();
  await lastMastery.click();
  await expect(page.getByRole('heading',{level:2,name:'Nightshade Apothecary'})).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'Class mastery',exact:true})).toHaveAttribute('value','0');
  await expect(page.getByRole('button',{name:'Unlock for 260 coins'})).toBeDisabled();
  await page.getByRole('button',{name:'Critical',exact:true}).click();
  const fighter = page.locator('.pg-mannequin .arena-sprite');
  await expect(fighter).toHaveAttribute('data-skin','nightshade-apothecary');
  await expect(fighter).toHaveAttribute('data-tier','critical');
  await page.getByRole('button',{name:'Scavenge',exact:true}).click();
  await expect(page.locator('.pg-fitting [data-prop="cache"]')).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Quest journal',exact:true})).toBeFocused();
});

test('coins earned in completed matches buy one reward and an outfit that survives reload into the arena', async ({page, request}) => {
  const key = randomBytes(32).toString('hex');
  const skin = SHOP.find(i => i.id === 'harbor-warden');
  const reward = SHOP.find(i => i.id === 'glass-orchard');
  const balance = await earn(request,key,skin.price + reward.price);
  await page.addInitScript(key => localStorage.setItem('rift-career-key',key),key);
  await page.goto(address);
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  await expect(page.locator('.pg-wallet')).toHaveAccessibleName(balance + ' coins');
  await page.getByRole('button',{name:/Harbor Warden/}).click();
  await page.getByRole('button',{name:'Unlock for ' + skin.price + ' coins'}).click();
  const feedback = page.locator('.pg-screen').getByRole('status');
  await expect(feedback).toHaveText('Harbor Warden unlocked.');
  await page.getByRole('button',{name:'Equip outfit'}).click();
  await expect(feedback).toHaveText('Harbor Warden equipped.');
  await page.getByRole('button',{name:'Reward unlocks'}).click();
  await page.getByRole('button',{name:'Unlock for ' + reward.price + ' coins'}).click();
  await expect(page.locator('.pg-acquired')).toHaveText('Unlocked for future drafts');
  await expect(page.locator('.pg-wallet')).toHaveAccessibleName((balance - skin.price - reward.price) + ' coins');
  await page.reload();
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  await expect(page.getByRole('button',{name:'Harbor Warden Equipped'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.getByRole('button',{name:'Enter the arena'}).click();
  await expect(page.getByRole('combobox',{name:'Skin',exact:true})).toHaveValue(skin.id);
  await page.getByRole('button',{name:'Start match'}).click();
  await expect(page.locator('[data-seat="p1"] .arena-sprite')).toHaveAttribute('data-skin',skin.id);
  await page.getByRole('button',{name:/Objectives [0-2]\/2/}).click();
  await expect(page.getByRole('dialog').locator('.pg-objective')).toHaveCount(2);
});

test('an unavailable wallet remains readable and reconnects without leaving the shop', async ({page}) => {
  await page.route('**/api/profile',route => route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto(address);
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  await expect(page.locator('.pg-connection')).toContainText('Showing saved progress');
  await page.getByRole('button',{name:/Harbor Warden/}).click();
  await expect(page.getByRole('button',{name:'Unlock for 85 coins'})).toBeDisabled();
  await page.unroute('**/api/profile');
  await page.getByRole('button',{name:'Reconnect'}).click();
  await expect(page.locator('.pg-connection')).toHaveCount(0);
  await expect(page.getByRole('heading',{level:2,name:'Harbor Warden'})).toBeVisible();
});
