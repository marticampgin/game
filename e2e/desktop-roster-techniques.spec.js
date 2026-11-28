import { expect, test } from '@playwright/test';
import { applyCommand, CLASSES, createMatch, previewAction, REWARDS, sandboxEdit, viewMatch } from '../src/game/index.js';
import { talentState } from '../src/game/talent-state.js';

function table(classId,count) {
  // Berserker provides a known public Bleed technique for the mirror and
  // a recognizable second seat across all four scenarios.
  const order=[classId,'berserker',...Object.keys(CLASSES).filter(id=>id!==classId && id!=='berserker')].slice(0,count);
  const players=order.map((id,i)=>({id:'p'+i,name:CLASSES[id].name,classId:id,bot:false}));
  let state;
  for(let seed=1; state?.activeId!=='p0'; seed++) state=createMatch({seed,players});
  if (classId==='necromancer') {
    state=sandboxEdit(state,{type:'status',playerId:'p1',status:'curse',value:2});
    state=sandboxEdit(state,{type:'stat',playerId:'p0',stat:'hp',value:380});
  }
  if (classId==='artificer') state=sandboxEdit(state,{type:'grant',playerId:'p0',rewardId:'ratchet-spring'});
  state.offers=['iron-shard','fang-shard','heartwood'];
  return state;
}

test('the Gambler can deliberately exchange a draft for a revealed high-card result',async ({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.emulateMedia({reducedMotion:'reduce'});
  const state=table('gambler',2);
  const rolled=applyCommand(state,'p0',{type:'reroll'}), chosen=rolled.offers[0];
  await page.addInitScript(save=>sessionStorage.setItem('rift-solo',JSON.stringify(save)),{state,viewerId:'p0'});
  await page.goto('/');
  await expect(page.locator('.draft-prompt')).toContainText('Reroll to load a high card');
  await page.locator('[data-ui="reroll"]').click();
  await expect(page.locator('.draft-prompt')).toContainText('High card loaded');
  await expect(page.locator('[data-ui="reroll"]')).toBeDisabled();
  await page.locator('[data-draft-select="'+chosen+'"]').click();
  await page.locator('[data-pick="'+chosen+'"]').click();
  await page.locator('[data-action="cut-the-deck"]').click();
  await expect(page.locator('.command-estimate .preview')).toContainText('guaranteed high card');
  await page.locator('[data-execute="cut-the-deck"]').click();
  await expect(page.locator('.recap-who')).toContainText('Cut the Deck');
  await page.locator('.recap-toggle').click();
  await expect(page.locator('.recap-events')).toContainText('(high card)');
});

for (const count of [2,8]) {
  for (const classId of ['gambler','necromancer','trickster','artificer']) {
    test(count+'-seat '+classId+' reads its signature forecast and reaches a public recap at 720p',async ({page},testInfo)=>{
      await page.setViewportSize({width:1280,height:720});
      await page.emulateMedia({reducedMotion:'reduce'});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',message=>{if (message.type()==='error') errors.push(message.text());});
      const state=table(classId,count);
      const id=CLASSES[classId].ability, name=REWARDS[id].name;
      const picked=applyCommand(state,'p0',{type:'pick',rewardId:'iron-shard'});
      const preview=previewAction(viewMatch(picked,'p0'),'p0',id,'p1');
      await page.addInitScript(save=>sessionStorage.setItem('rift-solo',JSON.stringify(save)),{state,viewerId:'p0'});
      await page.goto('/');
      await page.locator('[data-draft-select="iron-shard"]').click();
      await page.locator('[data-pick="iron-shard"]').click();
      await page.locator('[data-action="'+id+'"]').click();
      if (count>2) await page.locator('#target-select').selectOption('p1');
      await expect(page.locator('.command-estimate .preview')).toHaveText(preview.text);
      const ownView=viewMatch(picked,'p0');
      await page.locator('.command-player').click();
      const build=page.getByRole('dialog');
      await expect(build.locator('.talent-state')).toHaveText(talentState(ownView,ownView.players[0]));
      await build.getByRole('button',{name:'Close dialog'}).click();
      await expect(page.locator('.command-estimate .preview')).toHaveText(preview.text);
      const button=page.getByRole('button',{name:'Use '+name});
      await expect(button).toBeEnabled();
      const dimensions=await page.evaluate(()=>{
        const rect=document.querySelector('.confirm-action').getBoundingClientRect();
        return {bottom:Math.ceil(rect.bottom+scrollY),overflow:document.documentElement.scrollWidth-innerWidth};
      });
      expect(dimensions.overflow).toBe(0);
      expect(dimensions.bottom).toBeLessThanOrEqual(720);
      if (count===8) {
        const path=testInfo.outputPath('target-'+id+'.png');
        await page.screenshot({path});
        await testInfo.attach('Selected '+name,{path,contentType:'image/png'});
      }
      await button.click();
      await expect(page.locator('.turn-recap .recap-who')).toContainText(name);
      await page.locator('.recap-toggle').click();
      await expect(page.locator('.recap-events')).toContainText(
        classId==='gambler' ? /high card|low card/ : classId==='artificer' ? 'Rivet Drive dealt' : classId==='trickster' ? 'Bleed' : 'Curse');
      expect(errors).toEqual([]);
    });
  }
}
