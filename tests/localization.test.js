import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, EVENTS, REWARDS, STATUSES } from '../src/game/catalog.js';
import { SHOP, MATCH_QUESTS, LIFETIME_QUESTS } from '../src/game/progression.js';
import { applyCommand, botCommand, createMatch } from '../src/game/index.js';
import { translate } from '../public/i18n.js';

const ru = value => translate(value, 'ru');

test('each playable definition has a translated name and rules, including short action previews', () => {
  for (const collection of [CLASSES, EVENTS, REWARDS, STATUSES, SHOP, MATCH_QUESTS, LIFETIME_QUESTS]) {
    for (const entry of Object.values(collection)) {
      for (const value of [entry.name, entry.description, entry.summary, entry.innate].filter(Boolean)) {
        assert.match(ru(value), /[А-Яа-яЁё]/, entry.id + ' — ' + value);
        assert.doesNotMatch(ru(value), /[A-Za-z]/, entry.id + ' — ' + value);
        assert.equal(translate(value,'en'), value);
      }
    }
  }
});

test('Russian combat text preserves player handles and hidden consumables', () => {
  assert.equal(ru('Burn used Basic Attack on Iron Shard.'), 'Burn применяет «Обычная атака». Цель — Iron Shard.');
  assert.equal(ru('Basic Attack dealt 12 to $& (2 to shield).'), 'Обычная атака наносит 12 урона. Цель — $&. Щит поглощает 2.');
  assert.equal(ru('Inventory acquired a concealed consumable.'), 'Inventory получает награду «скрытый расходник».');
  assert.equal(ru('Solo seed · Guardian'), 'Зерно матча · Guardian');
  assert.equal(ru('1 coins'), '1 монета');
  assert.equal(ru('22 coins'), '22 монеты');
  assert.equal(ru('12,000 coins'), '12\u00a0000 монет');
});

test('the public journal of an eight-class match renders in Russian from the first turn through elimination', () => {
  const players = Object.keys(CLASSES).map((classId,i) => ({classId,id:'p'+i, name:'#'+i, bot:true}));
  let state = createMatch({players,seed:'journal-locale'});
  let lastId = 0;
  for (let step = 0; step < 1500; step++) {
    for (const event of state.log.filter(e => e.id > lastId)) {
      assert.doesNotMatch(ru(event.text), /[A-Za-z]/, event.text);
      lastId = event.id;
    }
    if (state.phase === 'finished') return;
    state = applyCommand(state,state.activeId,botCommand(state));
  }
  assert.fail('Match did not finish');
});

