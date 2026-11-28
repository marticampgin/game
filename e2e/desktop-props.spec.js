import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

const classes = ['guardian', 'berserker', 'chronomancer', 'alchemist'];

function turn(count, index, role, action, band, skinId) {
  const players = Array.from({ length: count }, (_, i) => ({
    id: 'seat-' + i, name: 'Fighter ' + i, classId: i === index ? role : classes[i % 4], bot: false,
  }));
  const viewerId = players[index].id;
  let state;
  for (let seed = 0; seed < 200; seed++) {
    state = createMatch({ players, seed: 'staged-props-' + seed });
    if (state.activeId === viewerId) break;
  }
  if (action !== 'scavenge') state = sandboxEdit(state, { type: 'grant', playerId: viewerId, rewardId: action });
  if (skinId) state = sandboxEdit(state, { type: 'skin', playerId: viewerId, skinId });
  const fighter = state.players.find(p => p.id === viewerId);
  const hp = Math.round(fighter.maxHp * ({ healthy: 1, wounded: .49, critical: .2 })[band]);
  state = sandboxEdit(state, { type: 'stat', playerId: viewerId, stat: 'hp', value: hp });
  return { viewerId, state: applyCommand(state, viewerId, { type: 'pick', rewardId: state.offers[0] }) };
}

// Observe the impact on the game's own paint clock. The browser driver can
// arrive well after the chest, shared consumable strip and bottle are removed.
async function play(page, save, action) {
  await page.addInitScript(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), save);
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-action="' + action + '"]').click();
  const actor = save.state.players.find(player => player.id === save.viewerId);
  const layers = action === 'scavenge' ? ['sheet','motions'] : ['sheet','motions','consume'];
  const loaded = await page.evaluate(async ({actor,layers}) => {
    const {preloadArenaSkins} = await import('/animation.js');
    return (await preloadArenaSkins([actor],{layers,withEffects:true})).every(Boolean);
  },{actor,layers});
  expect(loaded).toBe(true);
  await page.evaluate(async () => {
    const {fighterAnchors, resolveFighterSkin} = await import('/fighter-kit.js');
    const world = document.querySelector('.arena-world');
    const data = window.propSample = { lid: [], pickedUp: false, legacyProps: false, gripFrames: [], gripError: 0 };
    function sampleGrip() {
      const bottle = world.querySelector('.arena-fx [data-prop="bottle"]');
      if (bottle) {
        const actor = bottle.parentElement, sprite = actor.querySelector('.arena-sprite');
        const cel = getComputedStyle(sprite.querySelector('.arena-cel'));
        const frame = Math.round(parseFloat(cel.backgroundPositionX) * .11);
        const style = getComputedStyle(bottle), matrix = new DOMMatrix(style.transform);
        const [shiftX, shiftY] = style.translate.split(' ').map(parseFloat);
        const {class: role, skin, tier} = sprite.dataset;
        const {hand, mouth} = fighterAnchors(role, tier, resolveFighterSkin(role, skin).anchors);
        const reach = [0,0,0,.25,.5,.75,1,1,1,.5,0,0][frame];
        const dir = actor.dataset.facing === 'left' ? -1 : 1;
        const x = ((shiftX || 0) + matrix.e) * dir * 120 / parseFloat(actor.style.width);
        const y = ((shiftY || 0) + matrix.f) * 120 / parseFloat(actor.style.height);
        if (!data.gripFrames.includes(frame)) data.gripFrames.push(frame);
        data.gripError = Math.max(data.gripError, Math.abs(x - (mouth[0]-hand[0])*reach),
          Math.abs(y - (mouth[1]-hand[1])*reach));
      }
      if (!data.done) requestAnimationFrame(sampleGrip);
    }
    requestAnimationFrame(sampleGrip);
    const observer = new MutationObserver(() => {
      const scene = world.querySelector('.arena-fx');
      if (!scene) {
        if (data.impact) { data.done = true; observer.disconnect(); }
        return;
      }
      const coffer = scene.querySelector('[data-prop="cache"]');
      if (coffer && data.lid.at(-1) !== coffer.dataset.lid) data.lid.push(coffer.dataset.lid);
      data.pickedUp ||= !!scene.querySelector('[data-prop="parcel"]');
      data.legacyProps ||= [...scene.querySelectorAll('[data-prop]')].some(node =>
        getComputedStyle(node).backgroundImage.includes('/assets/i-') || node.dataset.prop === 'coin');
      if (scene.dataset.stage !== 'impact' || data.impact) return;
      const actor = scene.querySelector('.arena-fx-actor');
      const sprite = actor.querySelector('.arena-sprite');
      const element = scene.querySelector('[data-prop]:not([data-prop="coin"])');
      const bounds = element.getBoundingClientRect();
      const feet = actor.getBoundingClientRect();
      const cel = getComputedStyle(sprite.querySelector('.arena-cel'));
      const style = getComputedStyle(element);
      data.impact = {
        kind: element.dataset.prop, icon: element.dataset.icon, propArt: style.backgroundImage,
        inHand: element.parentElement === actor, facing: actor.dataset.facing,
        band: sprite.dataset.tier, clip: sprite.dataset.track, sheet: cel.backgroundImage,
        exposure: Math.round(parseFloat(cel.backgroundPositionX) * .11),
        cellY: parseFloat(cel.backgroundPositionY), z: Number(style.zIndex) - Number(getComputedStyle(actor).zIndex),
        x: (bounds.x + bounds.width / 2 - feet.x) / feet.width,
        bottom: (bounds.bottom - feet.y) / feet.height, size: bounds.width / feet.height,
        rotation: new DOMMatrix(style.transform).b,
      };
    });
    observer.observe(world, { attributes: true, subtree: true, childList: true, attributeFilter: ['data-stage','data-lid'] });
  });
  await page.locator('[data-execute="' + action + '"]').click();
  await expect.poll(() => page.evaluate(() => !!window.propSample.done)).toBe(true);
  return page.evaluate(() => window.propSample);
}

for (const [count, index, role, band] of [[2, 0, 'guardian', 'healthy'], [8, 6, 'berserker', 'wounded']]) {
  test('scavenge sets a reachable foreground cache on the floor in a ' + count + '-seat arena', async ({ page }) => {
    const trace = await play(page, turn(count, index, role, 'scavenge', band), 'scavenge');
    expect(trace.pickedUp).toBe(true);
    expect(trace.lid).toEqual(expect.arrayContaining(['1','5','0']));
    expect(trace.lid.at(-1)).toBe('0');
    expect(trace.legacyProps).toBe(false);
    expect(trace.impact.propArt).toContain('/skins/field-coffer.png');
    expect(trace.impact).toMatchObject({ kind: 'cache', inHand: false, band, clip: 'utility', facing: index ? 'left' : 'right' });
    expect(trace.impact.z).toBeGreaterThan(0);
    expect(trace.impact.bottom).toBeGreaterThan(.90);
    expect(trace.impact.bottom).toBeLessThan(1.12);
    const forward = trace.impact.facing === 'left' ? 1 - trace.impact.x : trace.impact.x;
    expect(forward).toBeGreaterThan(.76);
    expect(forward).toBeLessThan(1.2);
  });
}

for (const [role,band,seat,action,icon,skin] of [
  ['guardian','healthy',0,'red-tonic','tonic'],
  ['berserker','critical',1,'antidote','antidote'],
  ['chronomancer','wounded',0,'red-tonic','tonic'],
  ['alchemist','critical',1,'antidote','antidote'],
  ['artificer','healthy',0,'red-tonic','tonic'],
  ['artificer','critical',1,'red-tonic','tonic','stormglass-engineer'],
]) {
  test((skin || role) + ' lifts and tips its ' + action + ' bottle', async ({page}) => {
    const trace = await play(page, turn(2, seat, role, action, band, skin), action);
    const sample = trace.impact;
    expect(sample).toMatchObject({ kind: 'bottle', icon, clip: 'consume', inHand: true, band });
    expect(sample.sheet).toContain(skin ? skin + '/consume.webp' : role + '-consume.webp');
    expect(sample.cellY).toBe(({ healthy: 0, wounded: 50, critical: 100 })[band]);
    expect(sample.exposure).toBeGreaterThanOrEqual(6);
    expect(sample.bottom).toBeLessThan(.48);
    expect(sample.size).toBeLessThan(.22);
    expect(sample.rotation * (seat === 0 ? -1 : 1)).toBeGreaterThan(.85);
    expect(trace.gripFrames).toEqual(expect.arrayContaining([4, 6, 9, 10]));
    expect(trace.gripError).toBeLessThan(1);
  });
}

test('critical alchemist uses a bell below the mouth in an eight-seat arena', async ({page}) => {
  const bell = (await play(page, turn(8, 7, 'alchemist', 'menders-bell', 'critical'), 'menders-bell')).impact;
  expect(bell).toMatchObject({ kind: 'held', icon: 'bell', clip: 'consume', inHand: true, exposure: 4 });
  expect(bell.propArt).toContain('/skins/held-bell.png');
  expect(Math.abs(bell.rotation)).toBeLessThan(.32);
});
