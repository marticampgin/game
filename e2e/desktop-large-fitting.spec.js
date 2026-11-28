import { expect, test } from '@playwright/test';
import { fighterLayout } from '../public/fighter-kit.js';

async function paintedHeight(layer) {
  return layer.evaluate(async (cel,{columns,rows}) => {
    const sprite = cel.closest('.arena-sprite');
    const height = cel.getBoundingClientRect().height;
    const image = new Image();
    image.src = sprite.style.getPropertyValue('--skin').match(/url\(["']?(.*?)["']?\)/)[1];
    await image.decode();
    const w = image.naturalWidth / columns, h = image.naturalHeight / rows;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Both rooms open on the healthy Guardian's standing drawing, the first cel.
    ctx.drawImage(image,0,0,w,h,0,0,w,h);
    const pixels = ctx.getImageData(0,0,w,h).data;
    let top = h, bottom = 0;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
      if (pixels[(y*w+x)*4+3] > 63) { top = Math.min(top,y); bottom = Math.max(bottom,y); break; }
    }
    return (bottom - top + 1) * height / h;
  },{columns:fighterLayout.layers.sheet.columns,
    rows:fighterLayout.health.length * fighterLayout.layers.sheet.poses.length / fighterLayout.layers.sheet.columns});
}

test('wide desktop fittings enlarge the painted figure and keep rehearsal controls within reach',async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.getByRole('button',{name:'Outfitter',exact:true}).click();
  for (const [stage,control] of [['.pg-mannequin','.pg-gesture-hand'],['.bench-body','.bench-pilot-controls']]) {
    const cel = page.locator(stage + ' .arena-cel');
    await cel.waitFor();
    await expect(cel.locator('..')).toHaveAttribute('data-pose','idle');
    let regular;
    await expect.poll(async () => regular = await paintedHeight(cel)).toBeGreaterThan(65);
    await page.setViewportSize({width:3440,height:1440});
    await expect.poll(() => paintedHeight(cel)).toBeGreaterThan(regular*1.5);
    if (stage === '.pg-mannequin') expect((await page.locator(control).boundingBox()).width).toBeLessThan(820);
    for (const [width,height] of [[3440,1440],[2560,1080],[1600,800],[1280,720],[1024,768]]) {
      await page.setViewportSize({width,height});
      const box = await page.locator(control).boundingBox();
      expect(box.y+box.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
    if (stage === '.pg-mannequin') {
      await page.setViewportSize({width:1440,height:900});
      await page.getByRole('button',{name:'Try in Sandbox'}).click();
    }
  }
});
