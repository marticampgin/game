import { expect, test } from '@playwright/test';
import { createMatch, applyCommand } from '../src/game/index.js';
import { executeEffects } from '../src/game/combat.js';
import { STATUSES } from '../src/game/catalog.js';

const names = ['Ash', 'Ember', 'Flint', 'Rue', 'Birch', 'Nyx', 'Dusk', 'Yew'];
const classes = ['guardian', 'berserker', 'alchemist', 'chronomancer'];

function ready(count) {
  const players = names.slice(0, count).map((id, i) => ({ id, name:id, classId:classes[i % classes.length], bot:false }));
  const state = createMatch({ seed:'status-art', players });
  return applyCommand(state, state.activeId, { type:'pick', rewardId:state.offers[0] });
}

async function mount(page, state) {
  await page.addInitScript(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), {
    state, viewerId:state.activeId,
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name:'The Shattered Ring' })).toBeVisible();
}

test('absorbed Burn and Poison ticks retain their own art, source and exact shield loss in a real duel', async ({ page }) => {
  const state = ready(2);
  const caster = state.players.find(p => p.id === state.activeId);
  const receiver = state.players.find(p => p !== caster);
  receiver.shield = 30;
  executeEffects(state, caster, receiver, [
    { kind:'status', key:'burn', amount:2 }, { kind:'status', key:'poison', amount:3 },
  ], { label:'Test spell' });
  await mount(page, state);
  await page.locator('[data-action="defend"]').click();
  await page.evaluate(() => {
    const world = document.querySelector('.arena-world');
    window.statusReadouts = {};
    new MutationObserver(() => {
      for (const label of world.querySelectorAll('.arena-status-label[data-change="tick"]')) {
        const id = label.dataset.status;
        const burst = world.querySelector('.arena-status-burst[data-status="' + id + '"]');
        const row = window.statusReadouts[id] ||= {
          text:label.innerText, icon:label.querySelector('.status-icon')?.dataset.statusIcon, decorated:false, ward:false,
        };
        row.decorated ||= !!burst && getComputedStyle(burst).backgroundImage.includes('status-effects.png');
        row.ward ||= !!world.querySelector('.arena-fx-burst[data-effect="guard"]');
      }
    }).observe(world, { childList:true, subtree:true });
  });
  await page.locator('[data-execute="defend"]').click();
  for (const [id, amount] of [['burn', 2], ['poison', 3]]) {
    await expect.poll(() => page.evaluate(id => window.statusReadouts[id], id)).toEqual({
      text:STATUSES[id].name + '\n−' + amount + ' shield\nFrom ' + caster.name,
      icon:id, decorated:true, ward:true,
    });
  }
});

test('all eight status shapes remain readable and stationary in reduced motion on a full ring', async ({ page }) => {
  const state = ready(8);
  await page.emulateMedia({ reducedMotion:'reduce' });
  await mount(page, state);
  const rows = await page.evaluate(async ({ ids, actor, target, players }) => {
    const { playArenaAction } = await import('/animation.js');
    const world = document.querySelector('.arena-world');
    const event = (cause, i) => ({
      id:i + 1, type:'status', cause, actorId:actor, targetId:players[i], statusChange:cause === 'freeze' ? 'frozen' : 'applied', amount:1,
    });
    const results = [];
    const handle = playArenaAction(world, { actorId:actor, targetId:target, actionId:'defend', events:ids.map(event) }, {
      speed:2,
      onImpact(event) {
        const burst = world.querySelector('.arena-status-burst[data-status="' + event.cause + '"]');
        const label = world.querySelector('.arena-status-label[data-status="' + event.cause + '"]');
        const art = world.querySelector('[data-seat="' + event.targetId + '"] .fighter-art').getBoundingClientRect();
        const bounds = world.getBoundingClientRect(), rect = label.getBoundingClientRect(), fx = burst.getBoundingClientRect();
        results.push({
          id:event.cause, text:label.innerText, row:parseFloat(getComputedStyle(burst).backgroundPositionY),
          animating:burst.getAnimations().length, visible:rect.top >= bounds.top && rect.left >= bounds.left && rect.right <= bounds.right,
          anchored:Math.abs(fx.x + fx.width / 2 - art.x - art.width / 2) <= 4,
        });
      },
    });
    await handle.finished;
    return results;
  }, { ids:Object.keys(STATUSES), actor:state.activeId, target:names[0], players:names });
  expect(rows).toHaveLength(8);
  rows.forEach((row, i) => {
    expect(row.text).toContain(row.id === 'freeze' ? 'Frozen' : STATUSES[row.id].name);
    expect(row.row).toBeCloseTo(i * 100 / 7, 3);
    expect(row.animating).toBe(0);
    expect(row.visible).toBe(true);
    expect(row.anchored).toBe(true);
  });
});
