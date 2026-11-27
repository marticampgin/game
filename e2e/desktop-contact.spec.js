import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit, viewMatch } from '../src/game/index.js';

test('an actor bleeding on the way in still damages the target on the shield contact frame', async ({page}) => {
  const players = ['Moss', 'Rowan'].map(name => ({ id: name, name, classId: 'guardian', bot: false }));
  let state = createMatch({ seed: 'bleeding-bash', players });
  const actor = state.activeId, target = players.find(p => p.id !== actor).id;
  state = sandboxEdit(state, { type: 'status', playerId: actor, status: 'bleed', value: 4 });
  state = applyCommand(state, actor, { type: 'pick', rewardId: state.offers[0] });
  const outcome = applyCommand(state, actor, { type: 'act', actionId: 'bastion-bash', targetId: target });
  expect(viewMatch(outcome, actor).lastAction.events[0].cause).toBe('bleed');
  await page.goto('/');
  await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), { state, viewerId: actor });
  await page.reload();
  await page.evaluate(async players => (await import('/animation.js')).preloadArenaSkins(players),state.players);
  await page.locator('[data-action="bastion-bash"]').click();
  await page.evaluate(({ actor, target }) => {
    const hp = id => document.querySelector('[data-seat="' + id + '"] .fighter-hp').textContent;
    const initial = hp(actor);
    let bledDuringWindup = false, stalled = false;
    const reactions = new MutationObserver(() => {
      const scene = document.querySelector('.arena-fx');
      if (!bledDuringWindup && scene?.dataset.stage === 'windup' && initial !== hp(actor)) {
        bledDuringWindup = true;
        // Bleed is shown 180ms before the bash. Occupy the main thread across the
        // strike so the next paint must recover the drawing that delivered it.
        setTimeout(() => {
          const end = performance.now() + 180;
          while (performance.now() < end) { /* Deliberately miss several frames. */ }
          stalled = true;
        }, 100);
      }
      if (scene?.dataset.stage === 'impact') {
        const cel=scene.querySelector('.arena-fx-actor .arena-cel');
        const contactFrame=Math.round(parseFloat(getComputedStyle(cel).backgroundPositionX) * 11 / 100);
        window.contactRead = { bledDuringWindup, stalled, contactFrame, targetHP: hp(target) };
        reactions.disconnect();
      }
    });
    reactions.observe(document.querySelector('.arena-world'), {
      subtree: true, childList: true, attributes: true, attributeFilter: ['data-stage'],
    });
  }, { actor, target });
  await page.locator('[data-execute="bastion-bash"]').click();
  const after = outcome.players.find(p => p.id === target);
  await expect.poll(() => page.evaluate(() => window.contactRead)).toEqual({
    bledDuringWindup: true, stalled: true, contactFrame: 7, targetHP: after.hp + ' / ' + after.maxHp,
  });
});
