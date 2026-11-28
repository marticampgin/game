import { test, expect } from '@playwright/test';
import { applyCommand, createMatch } from '../src/game/index.js';

test('both braziers rise from painted fire through the desktop camera and both motion preferences',async ({page}) => {
  let state = createMatch({seed:'brazier-camera',players:[
    {id:'p1',name:'Aster',classId:'guardian'}, {id:'p2',name:'Rose',classId:'berserker'},
  ]});
  state = applyCommand(state,state.activeId,{type:'pick',rewardId:state.offers[0]});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await page.evaluate(save => sessionStorage.setItem('rift-solo',JSON.stringify(save)),{state,viewerId:state.activeId});
  await page.reload();
  const fires = page.locator('.torch-embers');
  await expect(fires).toHaveCount(2);
  for (const [width,height] of [[1024,768],[1280,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    const samples = await page.evaluate(async () => {
      const field = document.querySelector('.arena-world');
      const painting = new Image();
      painting.src = '/assets/ring-wide.webp';
      await painting.decode();
      const canvas = document.createElement('canvas');
      canvas.width = painting.naturalWidth;
      canvas.height = painting.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(painting,0,0);
      const arena = field.getBoundingClientRect();
      const imageHeight = parseFloat(getComputedStyle(field).backgroundSize.split(' ').at(-1));
      return Array.from(field.querySelectorAll('.torch-embers'),el => {
        const patch = el.getBoundingClientRect();
        const plume = getComputedStyle(el,'::before'), ember = getComputedStyle(el,'::after');
        const x = patch.left - arena.left + parseFloat(ember.left) + parseFloat(ember.width)/2;
        const y = patch.top - arena.top + parseFloat(ember.top) + parseFloat(ember.height)/2;
        const pixel = ctx.getImageData(Math.round(x * canvas.width / arena.width),Math.round(y * canvas.height / imageHeight),1,1).data;
        return {rgb:[...pixel],motion:plume.animationName,texture:plume.backgroundImage,duration:plume.animationDuration};
      });
    });
    for (const {rgb,motion,texture} of samples) {
      expect(motion).toBe('brazier-flicker');
      expect(texture).toContain('arena-braziers.webp');
      expect(rgb[0]).toBeGreaterThan(225);
      expect(rgb[1]).toBeGreaterThan(125);
      expect(rgb[0] - rgb[2]).toBeGreaterThan(60);
    }
    expect(samples[0].duration).not.toBe(samples[1].duration);
  }
  await page.getByRole('button',{name:'Settings and rules'}).click();
  await page.getByLabel('Reduce motion').check();
  await expect(fires.first()).toBeHidden();
  await page.getByLabel('Reduce motion').uncheck();
  await expect(fires.first()).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(fires.first()).toBeHidden();
  await expect(fires.last()).toBeHidden();
});
