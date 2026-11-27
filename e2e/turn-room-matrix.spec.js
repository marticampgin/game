import { expect, test } from '@playwright/test';
import { REWARDS } from '../src/game/catalog.js';

const classes = ['guardian', 'berserker', 'chronomancer', 'alchemist'];
const screens = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
];
const headersFor = seat => ({ Authorization: 'Bearer ' + seat.token });

async function asJSON(response) {
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function openHumanRoom(request, count) {
  const host = await asJSON(await request.post('/api/rooms', {
    data: { name: 'Lantern', classId: classes[0], capacity: count, fillBots: false },
  }));
  const path = '/api/rooms/' + host.code;
  // In the large room, eight human guests contend for the seven vacancies.
  const guests = await Promise.all(Array.from({ length: count === 8 ? 8 : 1 }, (_, i) =>
    request.post(path + '/join', { data: { name: 'Rival ' + (i + 1), classId: classes[(i + 1) % 4] } })));
  expect(guests.filter(response => response.status() === 409)).toHaveLength(count === 8 ? 1 : 0);
  const seats = [host, ...await Promise.all(guests.filter(response => response.ok()).map(asJSON))];
  expect(new Set(seats.map(seat => seat.playerId)).size).toBe(count);
  const start = await asJSON(await request.post(path + '/start', { headers: headersFor(host), data: {} }));
  expect(start.game.players).toHaveLength(count);
  expect(start.game.players.every(player => !player.bot)).toBe(true);
  return { path, seats, start };
}

async function openClient(browser, baseURL, screen, seat, contexts, errors) {
  const context = await browser.newContext({
    baseURL, viewport: screen.viewport, hasTouch: screen.touch, isMobile: screen.touch,
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const { code, token, playerId } = seat;
  await page.addInitScript(session => sessionStorage.setItem('rift-room', JSON.stringify(session)), { code, token, playerId });
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Battlefield' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('rift-solo'))).toBeNull();
  return page;
}

async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

function expectProjection(snapshot, viewer, activeId, expectedOffers) {
  const view = snapshot.game;
  expect(view.activeId).toBe(activeId);
  expect(view.offers).toHaveLength(expectedOffers);
  expect(view).not.toHaveProperty('seed');
  expect(view).not.toHaveProperty('rng');
  for (const p of view.players) {
    if (p.id === viewer.playerId) expect(p.consumables).toEqual(expect.any(Array));
    else expect(p).not.toHaveProperty('consumables');
  }
}

for (const count of [2, 8]) {
  for (const screen of screens) {
    test(count + ' human seats on ' + screen.name + ' share the board target, result, and private draft handoff', async ({ browser, request, baseURL }) => {
      const { path, seats, start } = await openHumanRoom(request, count);
      const contexts = [];
      const errors = [];
      const current = seat => request.get(path, { headers: headersFor(seat) }).then(asJSON);
      const activate = locator => screen.touch ? locator.tap() : locator.click();
      const actor = seats.find(s => s.playerId === start.game.activeId);
      const next = seats.find(s => s.playerId === start.game.upcoming[1]);
      // Aim at someone other than the next player when the table permits it.
      const targetId = count === 2 ? next.playerId : start.game.order.at(-1);
      const target = start.game.players.find(p => p.id === targetId);
      const character = start.game.players.find(p => p.id === actor.playerId);
      const starter = character.abilities[0].id;
      try {
        const [acting, watching] = await Promise.all([actor, next].map(
          seat => openClient(browser, baseURL, screen, seat, contexts, errors)));
        for (const page of [acting, watching]) {
          await expect(page.locator('[data-seat]')).toHaveCount(count);
          await expect(page.locator('.turn-rail li').first().getByRole('button')).toHaveAttribute('aria-label', 'Acting · ' + character.name);
          await expectNoOverflow(page);
        }
        await expect(acting.getByRole('heading', { name: 'Choose a reward' })).toBeVisible();
        await expect(watching.locator('[data-draft-select], [data-execute]')).toHaveCount(0);
        const opening = await current(actor);
        expectProjection(opening, actor, actor.playerId, 3);
        expectProjection(await current(next), next, actor.playerId, 0);
        // Prefer a concealed acquisition whenever offered, while also working for
        // all other legitimate openings from the server's freshly generated seed.
        const rewardId = opening.game.offers.find(id => REWARDS[id].category === 'consumable') || opening.game.offers[0];
        await activate(acting.locator('[data-draft-select="' + rewardId + '"]'));
        await expect(acting.getByRole('region', { name: 'Selected reward' })).toContainText(REWARDS[rewardId].name);
        expect((await current(actor)).revision).toBe(opening.revision);
        await expectNoOverflow(acting);
        await activate(acting.locator('[data-pick="' + rewardId + '"]'));
        await expect(acting.getByRole('heading', { name: 'Choose an action' })).toBeVisible();
        const actionState = await current(actor);
        expect(actionState.revision).toBe(opening.revision + 1);
        if (REWARDS[rewardId].category === 'consumable') {
          const otherView = await current(next);
          expect(otherView.game.players.find(p => p.id === actor.playerId).consumableCount).toBe(1);
          expect(otherView.game.log.at(-1).text).toContain('concealed consumable');
        }
        await activate(acting.locator('[data-action="' + starter + '"]'));
        const confirm = acting.locator('[data-execute="' + starter + '"]');
        if (count === 8) await expect(confirm).toBeDisabled();
        await activate(acting.getByRole('button', { name: 'Target ' + target.name, exact: true }));
        await expect(acting.locator('#target-select')).toHaveValue(target.id);
        await expect(acting.locator('[data-seat="' + target.id + '"] [data-aim]')).toHaveAttribute('aria-pressed', 'true');
        await expect(acting.locator('.preview')).toContainText('health damage');
        await expect(confirm).toBeEnabled();
        await expectNoOverflow(acting);

        // A bystander's competing command may reach the server on either side of
        // the genuine action. Neither authorization nor revision checks may let it through.
        if (count === 8) {
          const bystander = seats.find(seat => seat !== actor && seat !== next);
          const [rejected] = await Promise.all([
            request.post(path + '/command', {
              headers: headersFor(bystander), data: { revision: actionState.revision, command: { type: 'act', actionId: 'defend' } },
            }),
            activate(confirm),
          ]);
          expect([403, 409]).toContain(rejected.status());
        } else await activate(confirm);
        await expect(watching.getByRole('heading', { name: 'Choose a reward' })).toBeVisible();
        await expect(acting.locator('[data-draft-select], [data-execute]')).toHaveCount(0);
        await expect(watching.locator('[data-draft-select]')).toHaveCount(3);

        const snapshots = await Promise.all(seats.map(current));
        const resolved = snapshots[0];
        expect(resolved.revision).toBe(actionState.revision + 1);
        expect(resolved.game.globalAction).toBe(1);
        const recap = resolved.game.lastAction;
        expect([recap.actorId, recap.actionId, recap.targetId]).toEqual([actor.playerId, starter, target.id]);
        for (const [i, snapshot] of snapshots.entries()) {
          expectProjection(snapshot, seats[i], next.playerId, seats[i] === next ? 3 : 0);
          expect(snapshot.revision).toBe(resolved.revision);
          expect(snapshot.game.lastAction).toEqual(recap);
        }
        const targetAfter = resolved.game.players.find(p => p.id === target.id);
        expect(targetAfter.hp).toBeLessThan(target.hp);
        const targetVitals = new RegExp('^' + targetAfter.hp + '\\s*/\\s*' + targetAfter.maxHp + '$');
        for (const page of [acting, watching]) {
          const region = page.getByRole('region', { name: 'Last action' });
          await expect(region.locator('.recap-who')).toContainText(REWARDS[starter].name);
          await expect(region.locator('.recap-route')).toContainText(target.name);
          await expect(region.locator('.recap-handoff')).toContainText(page === watching ? 'Your turn' : 'Choosing a reward');
          await expect(page.locator('[data-seat="' + target.id + '"] .fighter-hp')).toHaveText(targetVitals);
          await activate(region.getByRole('button', { name: 'Effects', exact: true }));
          await expect(region.getByRole('list', { name: 'Effects in resolution order' })).toBeVisible();
          await expect(region.locator('[data-event-type="damage"]').first()).toContainText(REWARDS[starter].name);
          await expectNoOverflow(page);
        }
        expect(errors).toEqual([]);
      } finally {
        await Promise.all(contexts.map(context => context.close()));
        await Promise.all(seats.map(seat => request.post(path + '/leave', { headers: headersFor(seat), data: {} })));
      }
    });
  }
}
