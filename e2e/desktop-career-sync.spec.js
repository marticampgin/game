import { expect, test } from '@playwright/test';

test('two new desktop tabs share their anonymous career and a lost reply survives reload', async ({context,page})=>{
  const other=await context.newPage();
  await Promise.all([page.goto('/'),other.goto('/')]);
  async function deviceKey(tab) {
    return tab.evaluate(async()=>{
      const career=await import('/career-client.js');
      await career.initCareer();
      return career.profileHeaders()['X-Rift-Profile'];
    });
  }
  const [one,two]=await Promise.all([deviceKey(page),deviceKey(other)]);
  expect(one===two && one.length===64).toBe(true);

  let acknowledged=false;
  await page.route('**/api/profile/solo/*',async route=>{
    // The server commits a real batch before its HTTP acknowledgement disappears.
    if (!acknowledged) {
      const result=await route.fetch();
      acknowledged=result.status()===200;
    }
    await route.abort('failed');
  });
  const damage=await page.evaluate(async()=>{
    const {startCareerSolo,syncCareerSolo}=await import('/career-client.js');
    const {botCommand,applyCommand}=await import('/src/game/index.js');
    const players=[{id:'p1',name:'Moss',classId:'guardian',bot:false},{id:'p2',name:'Cinder',classId:'alchemist',bot:true}];
    let state=await startCareerSolo({seed:'career-durable',players});
    while(state.phase!=='finished') state=applyCommand(state,state.activeId,botCommand(state));
    sessionStorage.setItem('test-saved-journal',JSON.stringify(state));
    await syncCareerSolo(state);
    return state.career.seats.p1.metrics.damage;
  });
  expect(acknowledged).toBe(true);
  await page.unroute('**/api/profile/solo/*');
  await page.reload();
  await page.evaluate(async()=>{await (await import('/career-client.js')).loadProfile();});
  async function ledger(tab) {
    return tab.evaluate(async()=>{const career=await import('/career-client.js'); return career.readProfile();});
  }
  await expect.poll(async()=>(await ledger(page)).totals.matches).toBe(1);
  const first=await ledger(page);
  expect(first.coins).toBeGreaterThanOrEqual(35);
  expect(first.totals.damage).toBe(damage);
  expect(first.classes.guardian.matches).toBe(1);
  await expect.poll(async()=>(await ledger(other)).revision).toBe(first.revision);
  await page.evaluate(async()=>{
    const career=await import('/career-client.js');
    await career.syncCareerSolo(JSON.parse(sessionStorage.getItem('test-saved-journal')));
    await career.loadProfile();
  });
  expect(await ledger(page)).toEqual(first);
});

test('a solo match started offline still plays and exposes no payable objectives', async({page})=>{
  await page.goto('/');
  await page.route('**/api/profile/solo',route=>route.abort('failed'));
  const result=await page.evaluate(async()=>{
    const career=await import('/career-client.js');
    const {viewMatch,applyCommand,botCommand}=await import('/src/game/index.js');
    const players=[{id:'p1',name:'Flint',classId:'guardian',bot:false},{id:'p2',name:'Moon',classId:'chronomancer',bot:true}];
    let state=await career.startCareerSolo({seed:'offline',players});
    const offline=career.readCareerStatus();
    while(state.phase!=='finished') state=applyCommand(state,state.activeId,botCommand(state));
    await career.syncCareerSolo(state);
    return {offline,unavailable:state.careerUnavailable,objectives:viewMatch(state,'p1').career,coins:career.readProfile().coins};
  });
  expect(result).toEqual({offline:'offline',unavailable:true,objectives:undefined,coins:0});
});

test('a duplicate solo tab can finish as practice while its verified sibling keeps the wallet', async({context,page})=>{
  const copy=await context.newPage();
  const tabs=[page,copy];
  await Promise.all(tabs.map(tab=>tab.goto('/')));
  const initial=await page.evaluate(async()=>{
    const {startCareerSolo}=await import('/career-client.js');
    const {applyCommand,botCommand}=await import('/src/game/index.js');
    const players=[{id:'p1',name:'Moss',classId:'guardian',bot:false},{id:'p2',name:'Ash',classId:'alchemist',bot:true}];
    let state=await startCareerSolo({seed:'duplicate-window',players});
    while(state.activeId!=='p1') state=applyCommand(state,state.activeId,botCommand(state));
    return state;
  });
  await Promise.all(tabs.map(async tab=>{
    await tab.evaluate(state=>sessionStorage.setItem('rift-solo',JSON.stringify({state,viewerId:'p1'})),initial);
    await tab.reload();
    await expect(tab.locator('[data-ui="objectives"]')).toBeVisible();
  }));
  async function pick(tab,index) {
    const id=initial.offers[index];
    await tab.locator('[data-draft-select="'+id+'"]').click();
    await tab.locator('[data-pick="'+id+'"]').click();
  }
  const url='/api/profile/solo/'+initial.career.runId;
  const saved=page.waitForResponse(r=>r.url().endsWith(url) && r.ok() && r.request().postData()?.includes(initial.offers[0]));
  await pick(page,0);
  await saved;
  // Both branches now accrue unsent turns. Whichever tab flushes the shared
  // outbox must keep the journal that matches the already-verified choice.
  await context.route('**'+url,route=>route.abort('failed'));
  await pick(copy,1);
  await copy.locator('[data-ui="objectives"]').click();
  const damage=await page.evaluate(async()=>{
    const {syncCareerSolo}=await import('/career-client.js');
    const {applyCommand,botCommand}=await import('/src/game/index.js');
    let {state}=JSON.parse(sessionStorage.getItem('rift-solo'));
    while(state.phase!=='finished') state=applyCommand(state,state.activeId,botCommand(state));
    await syncCareerSolo(state);
    return state.career.seats.p1.metrics.damage;
  });
  await context.unroute('**'+url);
  await page.evaluate(async()=>{ await (await import('/career-client.js')).loadProfile(); });
  await expect(copy.locator('[data-ui="objectives"]')).toHaveCount(0);
  await expect(copy.getByRole('dialog')).toHaveCount(0);
  await expect(copy.locator('#notice')).toContainText('Another copy advanced');
  await copy.reload();
  await expect(copy.locator('#notice')).toContainText('Another copy advanced');
  await expect(copy.locator('[data-execute="attack"]')).toBeVisible();
  await expect(copy.locator('[data-ui="objectives"]')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(async()=>(await import('/career-client.js')).readProfile().totals)).toMatchObject({damage,matches:1});
  await expect(page.locator('[data-ui="objectives"]')).toBeVisible();
});

test('a missing solo checkpoint removes payable objectives and explains the saved practice match',async({page})=>{
  await page.goto('/');
  await page.route('**/api/profile/solo/*',r=>r.fulfill({status:404,json:{error:'This match checkpoint is unavailable.'}}));
  await page.evaluate(async()=>{
    const {startCareerSolo}=await import('/career-client.js');
    const {applyCommand,botCommand}=await import('/src/game/index.js');
    const players=[{id:'p1',name:'Moss',classId:'guardian',bot:false},{id:'p2',name:'Ash',classId:'alchemist',bot:true}];
    const state=await startCareerSolo({seed:'expired-copy',players});
    const next=applyCommand(state,state.activeId,botCommand(state));
    sessionStorage.setItem('rift-solo',JSON.stringify({state:next,viewerId:'p1'}));
  });
  await page.reload();
  await expect(page.locator('#notice')).toContainText('could not be verified');
  await expect(page.locator('[data-ui="objectives"]')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('rift-solo')).state.careerUnavailable)).toBe('checkpoint');
});
