import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createArenaServer } from '../server/index.js';
import { CLASSES } from '../src/game/index.js';
import { registerFighterSkin } from '../public/fighter-kit.js';

let server;
let base;

before(async () => {
  server = createArenaServer({ botDelay: 3 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  const closed = once(server, 'close');
  server.close();
  await closed;
});

async function request(path, token, body, expected = 200) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, expected, path + ': ' + JSON.stringify(result.error));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return result;
}

function create(options = {}) {
  return request('/api/rooms', null, { name: 'Moss', classId: 'guardian', ...options }, 201);
}

function pathFor(player, operation = '') {
  return '/api/rooms/' + player.code + (operation && '/' + operation);
}

function join(host, options = {}, status = 201) {
  return request(pathFor(host, 'join'), null, { name: 'Ember', classId: 'berserker', ...options }, status);
}

function interact(player, operation, body, status) {
  return request(pathFor(player, operation), player.token, body, status);
}

test('two distinct seats can reconnect to a private room, change classes, and see the same roster', async () => {
  const host = await create({ fillBots: false, capacity: 2 });
  assert.match(host.code, /^[A-Z2-9]{6}$/);
  const guest = await join(host);
  assert.notEqual(guest.token, host.token);
  assert.notEqual(guest.playerId, host.playerId);
  assert.equal(guest.room.hostId, host.playerId);
  const updated = await interact(guest, 'class', { classId: 'guardian' });
  const reconnected = await interact(host);
  assert.deepEqual(reconnected.room.seats, updated.room.seats);
  assert.deepEqual(updated.room.seats.map(s => s.classId), ['guardian', 'guardian']);
  assert.equal(updated.revision, reconnected.revision);
  assert.equal(Object.hasOwn(reconnected, 'token'), false);
  assert.equal(JSON.stringify(reconnected).includes(guest.token), false);
  await join(host, {}, 409);
  await interact(guest, 'start', {}, 403);
  await request(pathFor(host), null, undefined, 401);
  await interact({ ...host, token: guest.token + 'X' }, '', undefined, 401);
});

test('free, random, and three-class draft enforce their selection rules', async () => {
  const random = await create({ mode: 'random' });
  assert.ok(Object.hasOwn(CLASSES, random.room.seats[0].classId));
  await interact(random, 'class', { classId: 'alchemist' }, 409);
  const draft = await create({ mode: 'draft' });
  const guest = await join(draft);
  assert.equal(draft.room.draft.length, 3);
  assert.equal(new Set(draft.room.draft).size, 3);
  assert.equal(guest.room.draft.length, 3);
  const absent = Object.keys(CLASSES).find(id => !draft.room.draft.includes(id));
  await interact(draft, 'class', { classId: absent }, 400);
  const chosen = await interact(draft, 'class', { classId: draft.room.draft[2] });
  assert.equal(chosen.room.seats[0].classId, draft.room.draft[2]);
  assert.equal(guest.room.seats.some(seat => 'draft' in seat), false);
  const free = await create({ fillBots: false });
  await interact(free, 'start', {}, 409);
  await interact(free, 'class', { classId: 'missing' }, 400);
});

test('validates settings, JSON and invitation codes without changing the lobby', async () => {
  for (const input of [{ capacity: 9 }, { capacity: 1 }, { capacity: 2.5 }, { mode: 'other' },
    { fillBots: 'true' }, { name: '  ' }, { name: 'x'.repeat(25) }, { classId: 'unknown' }]) {
    await request('/api/rooms', null, { name: 'Moss', ...input }, 400);
  }
  await request('/api/rooms', null, [], 400);
  const malformed = await fetch(base + '/api/rooms', { method: 'POST', body: '{' });
  assert.equal(malformed.status, 400);
  const host = await create();
  const guest = await request(pathFor(host).toLowerCase() + '/join', null, { name: 'River' }, 201);
  assert.equal(guest.code, host.code);
  const other = await create();
  await request(pathFor(host), other.token, undefined, 401);
  await request('/api/rooms/notacode', host.token, undefined, 404);
});

test('installed class skins survive room creation, joining, class selection and match projection', async () => {
  const id = 'tourney-fixture';
  registerFighterSkin('guardian', id, '/assets/skins/guardian-founder.png');
  await request('/api/rooms', null, { name:'Moss', classId:'berserker', skinId:id }, 400);
  const host = await create({ capacity:2, fillBots:false, skinId:id });
  assert.equal(host.room.seats[0].skinId, id);
  await join(host, { classId:'guardian', skinId:'missing' }, 400);
  const guest = await join(host, { classId:'guardian', skinId:id });
  assert.deepEqual(guest.room.seats.map(p => p.skinId), [id, id]);
  const unchanged = await interact(guest, 'class', { classId:'guardian' });
  assert.equal(unchanged.room.seats[1].skinId, id);
  await interact(guest, 'class', { classId:'berserker', skinId:id }, 400);
  assert.deepEqual((await interact(host)).room.seats, unchanged.room.seats);
  const changed = await interact(guest, 'class', { classId:'berserker' });
  assert.equal(Object.hasOwn(changed.room.seats[1], 'skinId'), false);
  await interact(guest, 'class', { classId:'guardian', skinId:id });
  const reset = await interact(guest, 'class', { classId:'guardian', skinId:'founder' });
  assert.equal(Object.hasOwn(reset.room.seats[1], 'skinId'), false);
  await interact(host, 'start', { fastBots:true });
  const resumed = await interact(guest);
  assert.equal(resumed.room.fastBots,true);
  assert.deepEqual(resumed.game.players.map(p => p.skinId), [id, undefined]);
  await interact(host, 'class', { classId:'guardian', skinId:'founder' }, 409);
});

test('random and draft class assignments constrain the available cosmetics', async () => {
  const id = 'ceremonial-fixture';
  for (const cls of Object.keys(CLASSES)) registerFighterSkin(cls, id, '/assets/skins/' + cls + '-founder.png');
  for (const mode of ['random', 'draft']) {
    const host = await create({ mode, skinId:id });
    const seat = host.room.seats[0];
    assert.equal(seat.skinId, seat.classId === 'guardian' ? id : undefined);
    const allowed = mode === 'random' ? seat.classId : host.room.draft[2];
    const forbidden = Object.keys(CLASSES).find(cls => mode === 'random' ? cls !== allowed : !host.room.draft.includes(cls));
    const changed = await interact(host, 'class', { classId:allowed, skinId:id });
    assert.equal(changed.room.seats[0].skinId,id);
    await interact(host, 'class', { classId:forbidden, skinId:id }, mode === 'random' ? 409 : 400);
    await interact(host, 'class', { classId:allowed, skinId:{} }, 400);
    assert.deepEqual((await interact(host)).room.seats, changed.room.seats);
    await interact(host, 'leave', {});
  }
});

test('eight clients racing for seven vacancies cannot overfill a room', async () => {
  const host = await create({ capacity: 8, fillBots: false });
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(base + pathFor(host, 'join'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Duelist ' + i }),
  })));
  assert.equal(attempts.filter(r => r.status === 201).length, 7);
  assert.equal(attempts.filter(r => r.status === 409).length, 1);
  await Promise.all(attempts.map(r => r.text()));
  const view = await interact(host, 'start', {});
  assert.equal(view.game.players.length, 8);
  assert.equal(view.room.seats.filter(s => s.bot).length, 0);
  await interact(host, 'class', { classId: 'alchemist' }, 409);
  await interact(host, 'start', {}, 409);
});

test('leaving releases a lobby seat, transfers hosting, and revokes the departed token', async () => {
  const host = await create({ capacity: 2, fillBots: false });
  const guest = await join(host);
  assert.deepEqual(await interact(host, 'leave', {}), { ok: true });
  await interact(host, '', undefined, 401);
  const successor = await interact(guest);
  assert.equal(successor.room.hostId, guest.playerId);
  assert.deepEqual(successor.room.seats.map(seat => seat.id), [guest.playerId]);
  const replacement = await join(guest);
  assert.notEqual(replacement.playerId, host.playerId);
  await interact(replacement, 'leave', {});
  await interact(guest, 'leave', {});
  await interact(guest, '', undefined, 404);
});

test('leaving an active turn hands it to a bot and the remaining human can continue', async () => {
  const host = await create({ capacity: 2, fillBots: false });
  const guest = await join(host);
  const start = await interact(host, 'start', {});
  const departing = start.game.activeId === host.playerId ? host : guest;
  const remaining = departing === host ? guest : host;
  await interact(departing, 'leave', {});
  let view = await interact(remaining);
  const deadline = Date.now() + 3000;
  while (view.game.activeId !== remaining.playerId && Date.now() < deadline) {
    await delay(15);
    view = await interact(remaining);
  }
  assert.equal(view.game.activeId, remaining.playerId);
  assert.equal(view.game.phase, 'acquire');
  assert.equal(view.game.players.find(p => p.id === departing.playerId).bot, true);
  assert.equal(view.room.hostId, remaining.playerId);
  await interact(remaining, 'leave', {});
});

test('each seat gets a private view and concurrent duplicate commands can only advance the turn once', async () => {
  const host = await create({ capacity: 2, fillBots: false });
  const guest = await join(host);
  const start = await interact(host, 'start', {});
  const active = start.game.activeId === host.playerId ? host : guest;
  const inactive = active === host ? guest : host;
  const before = await interact(active);
  const opponent = await interact(inactive);
  assert.equal(before.game.offers.length, 3);
  assert.deepEqual(opponent.game.offers, []);
  assert.equal(Object.hasOwn(before.game, 'seed'), false);
  const command = { type: 'pick', rewardId: before.game.offers[0] };
  await interact(inactive, 'command', { revision: before.revision, command }, 403);
  await interact(active, 'command', { revision: before.revision, command: { type: 'pick', rewardId: 'absent' } }, 400);
  const submit = () => fetch(base + pathFor(active, 'command'), {
    method: 'POST', headers: { Authorization: 'Bearer ' + active.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: before.revision, command }),
  });
  const replies = await Promise.all([submit(), submit()]);
  assert.deepEqual(replies.map(r => r.status).sort(), [200, 409]);
  await Promise.all(replies.map(r => r.text()));
  const current = await interact(active);
  assert.equal(current.game.phase, 'action');
  assert.equal(current.revision, before.revision + 1);
  const afterAction = await interact(active, 'command', {
    revision: current.revision, command: { type: 'act', actionId: 'attack', targetId: inactive.playerId },
  });
  const peer = await interact(inactive);
  assert.equal(peer.game.activeId, inactive.playerId);
  assert.deepEqual(peer.game.players.map(p => p.hp), afterAction.game.players.map(p => p.hp));
  assert.equal(peer.game.offers.length, 3);
  assert.deepEqual(afterAction.game.offers, []);
  await join(host, {}, 409);
});

test('bot-filled rooms advance on the server while the human is away', async () => {
  const host = await create({ capacity: 8, fillBots: true });
  let view = await interact(host, 'start', {});
  assert.equal(view.room.seats.filter(s => s.bot).length, 7);
  assert.deepEqual(view.game.players.map(p=>p.classId).sort(),Object.keys(CLASSES).sort());
  const deadline = Date.now() + 6000;
  async function waitForHuman() {
    while (view.game.activeId !== host.playerId && view.game.phase !== 'finished' && Date.now() < deadline) {
      await delay(20);
      view = await interact(host);
    }
    assert.equal(view.game.activeId, host.playerId);
  }
  await waitForHuman();
  view = await interact(host, 'command', { revision: view.revision, command: { type: 'pick', rewardId: view.game.offers[0] } });
  view = await interact(host, 'command', { revision: view.revision, command: { type: 'act', actionId: 'defend' } });
  const personalEnd = view.revision;
  await waitForHuman();
  assert.ok(view.revision > personalEnd, 'server processed automatic opponents');
  assert.equal(view.game.phase, 'acquire');
});

test('two authenticated players can finish a complete duel over HTTP and reconnect to its outcome', async () => {
  const host = await create({ capacity: 2, fillBots: false });
  const guest = await join(host);
  let view = await interact(host, 'start', {});
  let commands = 0;
  while (view.game.phase !== 'finished' && commands < 600) {
    const acting = view.game.activeId === host.playerId ? host : guest;
    const opponent = acting === host ? guest : host;
    if (view.playerId !== acting.playerId) view = await interact(acting);
    const command = view.game.phase === 'acquire'
      ? { type: 'pick', rewardId: view.game.offers.includes('fang-shard') ? 'fang-shard' : view.game.offers[0], replaceIndex: 0 }
      : { type: 'act', actionId: 'attack', targetId: opponent.playerId };
    view = await interact(acting, 'command', { revision: view.revision, command });
    commands++;
  }
  assert.equal(view.game.phase, 'finished');
  const again = await interact(guest);
  assert.equal(again.game.winnerId, view.game.winnerId);
  assert.ok(view.game.players.filter(p => p.alive).length <= 1);
  assert.deepEqual(again.game.log, view.game.log);
  await interact(host, 'command', { revision: again.revision, command: { type: 'reroll' } }, 409);
  await interact(host, 'leave', {});
  await interact(guest, 'leave', {});
});

test('serves browser modules with the correct content type and rejects unknown paths', async () => {
  const module = await fetch(base + '/src/game/index.js', { method: 'HEAD' });
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.equal(await module.text(), '');
  for (const path of ['/server/index.js', '/package.json', '/.git/config', '/api/missing']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    await response.text();
  }
});
