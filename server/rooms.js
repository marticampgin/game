import { randomBytes, randomInt } from 'node:crypto';
import { applyCommand, CLASSES, createMatch, viewMatch } from '../src/game/index.js';
import { planBotStep } from '../public/pacing.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BOT_NAMES = ['Brasswick', 'Morrow', 'Belladonna', 'Holloway', 'Orin', 'Sable', 'Vesper'];
const CLASS_IDS = Object.keys(CLASSES);

export class RoomError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function playerName(value) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > 24 ||
      /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new RoomError(400, 'Enter a name between 1 and 24 characters.');
  }
  return value.trim();
}

function chooseClass(value) {
  if (!CLASS_IDS.includes(value)) throw new RoomError(400, 'Choose an available class.');
  return value;
}

function sampleClasses(count) {
  const pool = [...CLASS_IDS];
  return Array.from({ length: Math.min(count, pool.length) }, () => pool.splice(randomInt(pool.length), 1)[0]);
}

function addSeat(room, name, requestedClass, bot = false) {
  const draft = room.mode === 'draft' ? sampleClasses(3) : [];
  const classId = room.mode === 'free'
    ? chooseClass(requestedClass ?? CLASS_IDS[0])
    : draft[0] ?? sampleClasses(1)[0];
  const id = 'p' + (room.nextSeat++);
  const seat = { id, name, classId, bot };
  const token = bot ? null : randomBytes(32).toString('base64url');
  room.seats.push(seat);
  if (token) room.sessions.set(token, { id, draft });
  return { seat, token };
}

function roomView(room, session) {
  const game = room.game && viewMatch(room.game, session.id);
  if (game) game.botIntent = room.pendingBot ? { ...room.pendingBot.intent } : null;
  return {
    code: room.code,
    revision: room.revision,
    playerId: session.id,
    room: {
      code: room.code, hostId: room.hostId, capacity: room.capacity, mode: room.mode,
      fillBots: room.fillBots, fastBots: room.fastBots, started: room.game !== null,
      seats: room.seats.map(seat => ({ ...seat })), draft: [...session.draft],
    },
    game,
  };
}

function createdView(room, token) {
  return { ...roomView(room, room.sessions.get(token)), token };
}

function playerCommand(input) {
  if (!input || typeof input !== 'object') throw new RoomError(400, 'Choose a valid move.');
  if (input.type === 'reroll') return { type: 'reroll' };
  if (input.type === 'pick' && typeof input.rewardId === 'string') {
    if (input.replaceIndex !== undefined && !Number.isInteger(input.replaceIndex)) {
      throw new RoomError(400, 'Choose a valid replacement slot.');
    }
    return { type: input.type, rewardId: input.rewardId, replaceIndex: input.replaceIndex };
  }
  if (input.type === 'act' && typeof input.actionId === 'string' &&
      (input.targetId === undefined || typeof input.targetId === 'string')) {
    return { type: input.type, actionId: input.actionId, targetId: input.targetId };
  }
  throw new RoomError(400, 'Choose a valid move.');
}

export function createRooms({ botDelay, idleTimeout = 24 * 60 * 60 * 1000 } = {}) {
  const rooms = new Map();

  function scheduleBot(room) {
    clearTimeout(room.timer);
    const plan = planBotStep(room.game, {fast: room.fastBots, delayOverride: botDelay, roomPlayback: true});
    room.pendingBot = plan;
    if (!plan) return;
    room.timer = setTimeout(() => {
      if (room.pendingBot !== plan) return;
      room.timer = null;
      room.pendingBot = null;
      room.game = applyCommand(room.game, plan.intent.actorId, plan.command);
      room.revision++;
      scheduleBot(room);
    }, plan.delayMs);
    room.timer.unref();
  }

  function prune() {
    const cutoff = Date.now() - idleTimeout;
    for (const [code, room] of rooms) {
      if (room.touched >= cutoff) continue;
      clearTimeout(room.timer);
      rooms.delete(code);
    }
  }
  const cleanup = setInterval(prune, Math.max(1000, Math.min(idleTimeout, 60_000)));
  cleanup.unref();

  function findRoom(code) {
    const room = rooms.get(code.toUpperCase());
    if (!room) throw new RoomError(404, 'Room not found. Check the invite code.');
    return room;
  }

  return {
    create(input) {
      const name = playerName(input.name);
      const { capacity = 4, mode = 'free', fillBots = true } = input;
      if (!Number.isInteger(capacity) || capacity < 2 || capacity > 8) {
        throw new RoomError(400, 'Choose between two and eight seats.');
      }
      if (!['free', 'random', 'draft'].includes(mode) || typeof fillBots !== 'boolean') {
        throw new RoomError(400, 'Choose valid lobby settings.');
      }
      let code;
      do {
        code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      } while (rooms.has(code));
      const room = {
        code, capacity, mode, fillBots, seats: [], nextSeat: 1, sessions: new Map(), game: null,
        revision: 1, timer: null, pendingBot: null, fastBots: false, touched: Date.now(),
      };
      const { token, seat } = addSeat(room, name, input.classId);
      room.hostId = seat.id;
      rooms.set(code, room);
      return createdView(room, token);
    },
    join(code, input) {
      const room = findRoom(code);
      if (room.game || room.seats.length >= room.capacity) throw new RoomError(409, 'This room has started or is full.');
      const { token } = addSeat(room, playerName(input.name), input.classId);
      room.revision++;
      room.touched = Date.now();
      return createdView(room, token);
    },
    interact(code, token, operation, input) {
      const room = findRoom(code);
      const session = room.sessions.get(token);
      if (!session) throw new RoomError(401, 'A valid seat token is required. Reopen the browser that joined this room.');
      room.touched = Date.now();
      if (operation === 'view') return roomView(room, session);
      if (operation === 'leave') {
        room.sessions.delete(token);
        if (!room.sessions.size) {
          clearTimeout(room.timer);
          rooms.delete(room.code);
          return { ok: true };
        }
        if (room.game) {
          room.seats.find(seat => seat.id === session.id).bot = true;
          room.game = {
            ...room.game,
            players: room.game.players.map(player => player.id === session.id ? { ...player, bot: true } : player),
          };
          if (room.game.activeId === session.id) scheduleBot(room);
        } else {
          room.seats = room.seats.filter(seat => seat.id !== session.id);
        }
        if (room.hostId === session.id) room.hostId = room.seats.find(seat => !seat.bot).id;
        room.revision++;
        return { ok: true };
      }
      if (operation === 'class') {
        if (room.game || room.mode === 'random') throw new RoomError(409, 'Class selection is locked.');
        const classId = chooseClass(input.classId);
        if (room.mode === 'draft' && !session.draft.includes(classId)) throw new RoomError(400, 'Choose one of your three drafted classes.');
        room.seats.find(seat => seat.id === session.id).classId = classId;
      } else if (operation === 'start') {
        if (room.hostId !== session.id) throw new RoomError(403, 'Only the host can start the match.');
        if (room.game) throw new RoomError(409, 'The match is already in progress.');
        if (!room.fillBots && room.seats.length < 2) throw new RoomError(409, 'Invite another player to start.');
        if (input.fastBots !== undefined && typeof input.fastBots !== 'boolean') throw new RoomError(400, 'Choose a valid bot speed.');
        room.fastBots = input.fastBots ?? false;
        let botIndex = 0;
        while (room.fillBots && room.seats.length < room.capacity) {
          addSeat(room, BOT_NAMES[botIndex++], sampleClasses(1)[0], true);
        }
        room.game = createMatch({ seed: randomInt(0x100000000), players: room.seats });
        scheduleBot(room);
      } else if (operation === 'command') {
        if (!room.game || room.game.phase === 'finished') throw new RoomError(409, 'There is no active match.');
        if (input.revision !== room.revision) throw new RoomError(409, 'The match has advanced. Refresh your move.');
        if (session.id !== room.game.activeId) throw new RoomError(403, 'Wait for your turn.');
        const command = playerCommand(input.command);
        try {
          room.game = applyCommand(room.game, session.id, command);
        } catch (error) {
          throw new RoomError(400, error.message);
        }
        scheduleBot(room);
      } else {
        throw new RoomError(404, 'Unknown room action.');
      }
      room.revision++;
      return roomView(room, session);
    },
    close() {
      clearInterval(cleanup);
      for (const room of rooms.values()) clearTimeout(room.timer);
      rooms.clear();
    },
  };
}
