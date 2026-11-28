import { expect, test } from '@playwright/test';

test('Berserker keeps consistent stature and footing through each outfit’s victory salute', async ({page}) => {
  await page.goto('/');
  const salutes = await page.evaluate(async () => {
    const {fighterLayout, fighterSkins} = await import('/fighter-kit.js');
    const {width,height} = fighterLayout.cell;
    const {sheet,celebrate} = fighterLayout.layers;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d',{willReadFrequently:true});
    async function load(url) {
      const image = new Image();
      image.src = url;
      await image.decode();
      return image;
    }
    function cel(image,column,row) {
      ctx.clearRect(0,0,width,height);
      ctx.drawImage(image,column*width,row*height,width,height,0,0,width,height);
      return ctx.getImageData(0,0,width,height).data;
    }
    function stature(pixels) {
      const rows = Array(height).fill(0);
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] >= 128) rows[Math.floor(i/4/width)]++;
      }
      // A thin raised saber can be the highest pixel. Measure from the first
      // substantial part of the silhouette, relative to this outfit's width.
      const crownWidth = Math.max(...rows)*.20;
      const crown = rows.findIndex(count => count >= crownWidth);
      const sole = rows.findLastIndex(count => count >= 2);
      return {height:sole-crown, sole};
    }
    const results = [];
    for (const skin of fighterSkins('berserker').filter(skin => skin.celebrate)) {
      const [standing,strip] = await Promise.all([load(skin.sheet),load(skin.celebrate)]);
      for (const [band,condition] of fighterLayout.health.entries()) {
        function pose(name) {
          const index = sheet.poses.indexOf(name);
          return cel(standing,index % sheet.columns,Math.floor((band*sheet.poses.length+index)/sheet.columns));
        }
        const idle = stature(pose('idle'));
        const frames = Array.from({length:celebrate.columns},(_,column) => cel(strip,column,band));
        const final = pose('victory');
        const sizes = frames.map(stature);
        results.push({
          name:skin.name+' · '+condition.name,
          relativeSizeChange:Math.max(...sizes.map(frame => Math.abs(frame.height-idle.height)/idle.height)),
          soleTravel:Math.max(...sizes.map(frame => Math.abs(frame.sole-idle.sole))),
          holdsLastFrame:frames.at(-1).every((value,i) => value===final[i]),
        });
      }
    }
    return results;
  });
  expect(salutes.length).toBeGreaterThan(0);
  for (const salute of salutes) {
    expect(salute.relativeSizeChange,salute.name+' body height').toBeLessThan(.075);
    expect(salute.soleTravel,salute.name+' sole').toBeLessThanOrEqual(2);
    expect(salute.holdsLastFrame,salute.name+' held frame').toBe(true);
  }
});
