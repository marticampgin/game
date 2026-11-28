import { expect, test } from '@playwright/test';
import { createMatch, applyCommand } from '../src/game/index.js';
import { executeEffects } from '../src/game/combat.js';
import { STATUSES } from '../src/game/catalog.js';

const names = ['Ash', 'Ember', 'Flint', 'Rue', 'Birch', 'Nyx', 'Dusk', 'Yew'];
const classes = ['guardian', 'berserker', 'alchemist', 'chronomancer'];

function ready(count, seed = 'status-art') {
  const players = names.slice(0, count).map((id, i) => ({ id, name:id, classId:classes[i % classes.length], bot:false }));
  const state = createMatch({ seed, players });
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

test('a crowded round keeps a single named result on each affected fighter, including shield changes and last stands', async ({ page }) => {
  const state = ready(8);
  await mount(page, state);
  const results = await page.evaluate(async names => {
    const { playArenaAction } = await import('/animation.js');
    const { mountEffectStrip } = await import('/effect-strip.js');
    const world = document.querySelector('.arena-world');
    const packet = (type, targetId, fields) => ({ type, targetId, timing:'round', round:4, ...fields });
    const events = [
      packet('damage', 'Ember', { cause:'burn', amount:5, healthDamage:3, shieldDamage:2 }),
      packet('damage', 'Ember', { cause:'poison', amount:4, healthDamage:4 }),
      packet('heal', 'Ember', { amount:6 }), packet('shield', 'Ember', { amount:3 }),
      ...names.flatMap((id, i) => [packet('damage', id, { cause:'burn', amount:8, healthDamage:8 }),
        i % 2 ? packet('revival', id, { amount:3 }) : packet('elimination', id)]),
    ].map((e, i) => ({ ...e, id:i + 1 }));
    const action = { actorId:'Yew', actorName:'Yew', targetId:'Yew', actionId:'defend', actionName:'Defend', events };
    const strip = mountEffectStrip(document.querySelector('.turn-resolution'), action, names.map(id => ({ id, name:id })));
    const beats = [], order = [];
    await playArenaAction(world, action, {
      effectsOnly:true, speed:4,
      onBeat(beat, i, total) {
        strip(beat, i, total);
        beats.push({ cues:0, mixed:!beat.event });
      },
      onCue() { beats.at(-1).cues++; },
      onImpact(event) {
        order.push(event.id);
        const beat = beats.at(-1);
        if (beat.labels) return;
        beat.labels = Object.fromEntries([...world.querySelectorAll('[data-group-target]')].map(el => [
          el.dataset.groupTarget, { text:el.innerText, icons:[...el.querySelectorAll('.status-icon')].map(icon => icon.dataset.statusIcon) },
        ]));
        beat.strip = document.querySelector('.effect-receipt:last-child').innerText;
        beat.ashPose = world.querySelector('[data-seat="Ash"] .arena-sprite').dataset.pose;
        beat.emberPose = world.querySelector('[data-seat="Ember"] .arena-sprite').dataset.pose;
      },
    }).finished;
    return { beats, order };
  }, names);
  expect(results.order).toEqual(Array.from({ length:20 }, (_, i) => i + 1));
  expect(results.beats).toHaveLength(8);
  expect(results.beats.every(b => b.cues === 1)).toBe(true);
  const [opening, revival] = results.beats;
  expect(Object.keys(opening.labels)).toEqual(['Ember', 'Ash']);
  expect(opening.labels.Ember.icons).toEqual(['burn', 'poison']);
  expect(opening.labels.Ember.text).toContain('−7 HP · −2 shield');
  expect(opening.labels.Ember.text).toContain('+6 HP · +3 shield');
  expect(opening.labels.Ash.text).toContain('Fallen');
  expect(opening.strip).toContain('Ember · Burn · Poison · −7 HP · −2 shield · +6 HP · +3 shield');
  expect(opening.ashPose).toBe('fallen');
  expect(revival.labels.Ember.text).toContain('Revived at 3 HP');
  expect(revival.emberPose).toBe('breathe');
});

test('Blood Moon reaches all eight seats in one readable round beat before the personal turn', async ({ page }) => {
  await page.setViewportSize({ width:1280, height:720 });
  const state = ready(8);
  state.round = 11;
  state.queue = [];
  state.nextEvent = { id:'blood-moon', name:'Blood Moon', round:12 };
  await mount(page, state);
  await page.locator('[data-action="defend"]').click();
  await page.locator('[data-execute="defend"]').click();
  const labels = page.locator('.arena-group-label');
  await expect(labels).toHaveCount(8);
  const read = await labels.evaluateAll(labels => {
    const obstacles = [...document.querySelectorAll('.turn-rail, .scene-callout, .round-meta')].map(e => e.getBoundingClientRect());
    const covered = [];
    for (const label of labels) {
      const a = label.getBoundingClientRect();
      if (obstacles.some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)) covered.push(label.dataset.groupTarget);
      obstacles.push(a);
    }
    return {
      covered, receipts:labels.map(el => [el.dataset.groupTarget, el.querySelector('.arena-status-title')?.textContent]),
      indicator:document.querySelector('.effect-receipt:last-child').innerText,
    };
  });
  expect(read.covered).toEqual([]);
  expect(read.receipts).toEqual(names.map(name => [name, '+2 Curse']));
  expect(read.indicator).toMatch(/\+2 Curse\s+8 contenders/);
});

for (const [width, height, receiverId, seed] of [
  [1280, 720, 'Rue', 'rear-status-9'],
  [1280, 720, 'Birch', 'rear-status-5'],
  [1440, 900, 'Rue', 'rear-status-9'],
]) {
  test('turn-start damage stays clear of the live HUD at rear seat ' + receiverId + ' on ' + width + 'px PC', async ({page}) => {
    await page.setViewportSize({width, height});
    const state = ready(8, seed);
    expect(state.queue[0]).toBe(receiverId);
    const caster = state.players.find(p => p.id === state.activeId);
    const receiver = state.players.find(p => p.id === receiverId);
    executeEffects(state, caster, receiver, [{kind:'status', key:'burn', amount:5}], {label:'Ember'});
    await mount(page, state);
    await page.locator('[data-action="defend"]').click();
    await page.locator('[data-execute="defend"]').click();
    const read = await page.locator('.arena-status-label[data-status="burn"]').evaluate(label => {
      const rect = label.getBoundingClientRect();
      const blockedBy = ['.scene-callout', '.turn-rail'].filter(selector => {
        const hud = document.querySelector(selector).getBoundingClientRect();
        return rect.left < hud.right && rect.right > hud.left && rect.top < hud.bottom && rect.bottom > hud.top;
      });
      return {blockedBy, text:label.innerText, phase:document.querySelector('.scene-callout').innerText};
    });
    expect(read.phase).toBe(receiverId + ' · Turn start');
    expect(read.text).toContain('−5 HP');
    expect(read.blockedBy).toEqual([]);
  });
}
