import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';
import { fighterLayout } from '../public/fighter-kit.js';

const gallery = [
  ['harbor-warden', 'Rook'], ['wolf-tracker', 'Fen'], ['star-cartographer', 'Lyra'], ['apiarist', 'Bram'],
  ['sunspire-paladin', 'Sol'], ['ash-dragon', 'Ash'], ['glass-oracle', 'Opal'], ['nightshade-apothecary', 'Morel'],
];
const newGallery = [
  ['riverboat-duelist', 'Chance'], ['marsh-medium', 'Morrow'], ['carnival-fox', 'Lark'], ['railway-smith', 'Sable'],
  ['gilded-jack', 'Jack'], ['ossuary-queen', 'Ida'], ['mirror-regent', 'Vesper'], ['stormglass-engineer', 'Gale'],
];
function reviewTurn(group) {
  const players = group.map(([id, name], index) => {
    const skin = fighterLayout.skins.find(entry => entry.id === id);
    return { id: 'seat-' + index, classId: skin.classId, name, skinId: id, bot: false };
  });
  let state = createMatch({ seed: 'costume-gallery-' + players.length, players });
  const actorId = state.activeId;
  state = sandboxEdit(state, { type: 'grant', playerId: actorId, rewardId: 'red-tonic' });
  state = applyCommand(state, actorId, { type: 'pick', rewardId: state.offers[0] });
  for (const [index, player] of state.players.entries()) {
    const fraction = player.id === actorId ? .23 : [1, .48, .24][index % 3];
    state = sandboxEdit(state, { type: 'stat', playerId: player.id, stat: 'hp', value: Math.round(player.maxHp * fraction) });
  }
  return { state, viewerId: actorId };
}

for (const [label, group] of [['duel', gallery.slice(0, 2)], ['full ring', gallery], ['expanded ring', newGallery]]) {
  const count = group.length;
  test('painted outfits keep their portraits, injuries and drink gesture in the desktop ' + label, async ({ page }, info) => {
    await page.setViewportSize(count === 2 ? { width: 1280, height: 720 } : { width: 1440, height: 900 });
    const save = reviewTurn(group);
    await page.addInitScript(data => sessionStorage.setItem('rift-solo', JSON.stringify(data)), save);
    await page.goto('/');
    const play = page.locator('[data-action="red-tonic"]');
    await expect(play).toBeVisible();
    expect(await page.evaluate(async players => (await (await import('/animation.js')).preloadArenaSkins(players)).every(Boolean),
      save.state.players)).toBe(true);
    for (const fighter of save.state.players) {
      const art = fighterLayout.skins.find(entry => entry.id === fighter.skinId);
      const sprite = page.locator('[data-seat="' + fighter.id + '"] .arena-sprite');
      await expect(sprite).toHaveAttribute('data-skin', art.id);
      await expect(sprite).toHaveAttribute('data-tier', fighter.hp / fighter.maxHp > .65 ? 'healthy' :
        fighter.hp / fighter.maxHp > .30 ? 'wounded' : 'critical');
      await expect(sprite).toHaveAttribute('data-motion-src', art.motions);
      await expect(sprite).toHaveAttribute('data-consume-src', art.consume);
      await expect(page.locator('.turn-rail [data-inspect="' + fighter.id + '"] img')).toHaveAttribute('src', art.portrait);
    }
    const screenshot = info.outputPath('arena-' + count + '.png');
    await page.screenshot({ path: screenshot });
    await info.attach('arena-' + count, { path: screenshot, contentType: 'image/png' });
    await play.click();
    await page.evaluate(() => {
      const world = document.querySelector('.arena-world');
      const observer = new MutationObserver(() => {
        const scene = world.querySelector('.arena-fx[data-stage="impact"]');
        const sprite = scene?.querySelector('.arena-fx-actor .arena-sprite');
        if (!sprite || !scene.querySelector('[data-prop="bottle"]')) return;
        window.drinkImpact = { id: sprite.dataset.skin, tier: sprite.dataset.tier, clip: sprite.dataset.track,
          sheet: getComputedStyle(sprite.querySelector('.arena-cel')).backgroundImage };
        observer.disconnect();
      });
      observer.observe(world, { attributes: true, subtree: true, childList: true });
    });
    await page.locator('[data-execute="red-tonic"]').click();
    const actor = save.state.players.find(player => player.id === save.viewerId);
    await expect.poll(() => page.evaluate(() => window.drinkImpact)).toMatchObject({
      id: actor.skinId, tier: 'critical', clip: 'consume', sheet: expect.stringContaining('/outfits/' + actor.skinId + '/consume.webp'),
    });
  });
}

test('a readable sheet survives a refused decode and an unreadable download can retry', async ({ page, baseURL }) => {
  const standing = '/assets/skins/outfits/harbor-warden/standing.webp';
  const retry = '/assets/skins/pressure-retry.webp';
  let attempts = 0;
  await page.route('**' + retry, async route => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 503, headers: { 'Cache-Control': 'no-store' }, body: 'unavailable' });
    return route.fulfill({ response: await route.fetch({ url: baseURL + standing }) });
  });
  await page.addInitScript(path => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      if (new URL(this.src).pathname === path) return Promise.reject(new DOMException('Busy', 'EncodingError'));
      return decode.call(this);
    };
  }, standing);
  await page.goto('/');
  const loads = await page.evaluate(async ({ standing, retry }) => {
    const { registerFighterSkin, preloadArenaSkins } = await import('/animation.js');
    registerFighterSkin('guardian', 'pressure-review', { sheet: standing, motions: retry });
    const players = [{ classId: 'guardian', skinId: 'pressure-review' }];
    const first = await preloadArenaSkins(players);
    const second = await preloadArenaSkins(players);
    return [first.slice(-2), second.slice(-2)];
  }, { standing, retry });
  expect(loads).toEqual([[true, false], [true, true]]);
});
