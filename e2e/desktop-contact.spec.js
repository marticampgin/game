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
  await page.locator('[data-action="bastion-bash"]').click();
  await page.evaluate(({ actor, target }) => {
    const hp = id => document.querySelector('[data-seat="' + id + '"] .fighter-hp').textContent;
    const initial = hp(actor);
    let bledDuringWindup = false;
    function sample() {
      const scene = document.querySelector('.arena-fx');
      if (scene?.dataset.stage === 'windup' && initial !== hp(actor)) bledDuringWindup = true;
      if (scene?.dataset.stage === 'impact') window.contactRead = { bledDuringWindup, targetHP: hp(target) };
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, { actor, target });
  await page.locator('[data-execute="bastion-bash"]').click();
  const after = outcome.players.find(p => p.id === target);
  await expect.poll(() => page.evaluate(() => window.contactRead)).toEqual({
    bledDuringWindup: true, targetHP: after.hp + ' / ' + after.maxHp,
  });
});
