import { applyCommand, botCommand, CLASSES, createMatch, eligible, EVENTS, REWARDS, sandboxEdit, STATUSES, viewMatch } from '../src/game/index.js';
import { classArt, rewardIcon } from './art.js';
import { escapeHTML, option, titleCase, toolPage } from './atlas-ui.js';

const heroId = 'experimenter';
const rivalId = 'rival';
const stats = { hp: 'Health', maxHp: 'Maximum health', armor: 'Armor', attack: 'Attack', spellPower: 'Spell power', shield: 'Shield', regen: 'Regeneration', rerolls: 'Rerolls' };
const operations = { grant: 'Grant reward', stat: 'Set attribute', status: 'Apply status', cooldown: 'Set cooldown', round: 'Set round', event: 'Trigger event', class: 'Change class' };
const experiments = {
  fresh: { name: 'Fresh match', classId: 'guardian', rival: 'alchemist', edits: [] },
  molten: { name: 'Molten bulwark', classId: 'guardian', rival: 'berserker', edits: [
    { type: 'stat', stat: 'armor', value: 28 }, { type: 'grant', rewardId: 'molten-mail' },
    { type: 'grant', rewardId: 'phoenix-heart' }, { type: 'stat', stat: 'hp', value: 75 },
  ] },
  flame: { name: 'Borrowed flame', classId: 'chronomancer', rival: 'guardian', edits: [
    { type: 'grant', rewardId: 'cinder-orb' }, { type: 'grant', rewardId: 'combustion' },
    { type: 'grant', rewardId: 'borrowed-time' }, { type: 'status', status: 'burn', value: 5, playerId: rivalId },
  ] },
  venom: { name: 'Venom engine', classId: 'alchemist', rival: 'chronomancer', edits: [
    { type: 'grant', rewardId: 'reverse-polarity' }, { type: 'grant', rewardId: 'quicksilver-lung' },
    { type: 'grant', rewardId: 'widows-brew' }, { type: 'status', status: 'poison', value: 4 },
  ] },
};
const choices = object => Object.entries(object).map(([key, value]) => option(key, value.name || value)).join('');
const select = (name, label, markup) => `<label>${label}<select name="${name}" aria-label="${label}">${markup}</select></label>`;
const numeric = (label, value, min, max) => `<label>${label}<input type="number" name="value" value="${value}" min="${min}" max="${max}" step="1" required></label>`;
const itemNames = list => list.map(id => REWARDS[id].name).join(', ');

export function makeExperiment(presetId, seed, count = 2) {
  const preset = experiments[presetId];
  if (!preset) throw Error('Choose a starting build.');
  if (!Number.isInteger(count) || count < 2 || count > 8) throw Error('Choose 2–8 contenders.');
  const roster = [
    { id: heroId, name: 'Aster', classId: preset.classId, bot: false },
    { id: rivalId, name: 'Sparring rival', classId: preset.rival, bot: true },
  ];
  const names = ['Finch', 'Iris', 'Flint', 'Rowan', 'Moss', 'Vale'];
  const roles = [...Object.keys(CLASSES).filter(id => ![preset.classId,preset.rival].includes(id)),preset.classId,preset.rival];
  for (let index = 0; index < count - 2; index++) {
    roster.push({id:'sparring-' + index, name:names[index], classId:roles[index % roles.length], bot:true});
  }
  let state = createMatch({seed, players:roster});
  for (const edit of preset.edits) state = sandboxEdit(state, { playerId: heroId, ...edit });
  return state;
}

function combatant(player, selected) {
  const role = CLASSES[player.classId];
  return `<button class="rb-combatant" type="button" data-pick="${player.id}" aria-pressed="${selected}"
    style="--role-color:${role.color}">
    <img src="${classArt(role.id)}" alt="" draggable="false">
    <span class="rb-combatant-info"><small>${escapeHTML(player.name)}</small><strong>${role.name}</strong>
      <span>${player.hp} / ${player.maxHp} HP</span><span class="rb-hp" aria-hidden="true"><i style="width:${100 * player.hp / player.maxHp}%"></i></span>
    </span>
  </button>`;
}

function buildSummary(player) {
  const effects = Object.entries(player.statuses).filter(([, n]) => n > 0);
  const attributes = Object.entries(stats).filter(([id]) => !['hp', 'maxHp'].includes(id));
  return `<h3>${CLASSES[player.classId].name} build</h3><dl class="rb-attribute-list">${attributes.map(([id, label]) =>
    `<div><dt>${label}</dt><dd>${player[id]}</dd></div>`).join('')}</dl>
    <div class="rb-loadout"><strong>Equipped</strong><div>${player.abilities.map(slot => `<span class="rb-slot">${rewardIcon(REWARDS[slot.id])}<span>${REWARDS[slot.id].name}${slot.modifiers.length ? ' · ' + slot.modifiers.map(titleCase).join(', ') : ''} <small>${slot.cooldown ? slot.cooldown + ' turns' : 'ready'}</small></span></span>`).join('')}</div></div>
    <dl class="rb-inventory"><div><dt>Artifacts</dt><dd>${escapeHTML(itemNames(player.artifacts)) || 'None'}</dd></div>
    <div><dt>Consumables</dt><dd>${escapeHTML(itemNames(player.consumables)) || 'None'}</dd></div>
    <div><dt>Statuses</dt><dd>${effects.map(([id, n]) => STATUSES[id].name + ' ' + n).join(' · ') || 'None'}</dd></div></dl>`;
}

export function mountSandbox(host, { onClose, onPlay } = {}) {
  const { root, destroy, signal } = toolPage(host, 'Mechanics Sandbox', onClose);
  let state = makeExperiment('fresh', 'starfall');
  let subject = heroId;
  root.classList.add('rb-sandbox');
  root.insertAdjacentHTML('beforeend', `<div class="rb-lab-body"><div class="rb-workbench">
    <h2>Experiment</h2><form class="rb-preset">${select('preset', 'Starting build', choices(experiments))}
      <label>Match seed<input name="seed" value="starfall" maxlength="80" required></label><button type="submit">Load experiment</button></form>
    <h2>Edit the arena</h2><form class="rb-edit">${select('player', 'Contender', '')}${select('operation', 'Operation', choices(operations))}
      <div class="rb-edit-fields"></div><button type="submit" class="rb-gold-button">Grant reward</button></form>
    <p class="rb-feedback" role="status" aria-live="polite"></p></div>
    <div class="rb-trial"><div class="rb-trial-top"><div><h2>Trial match</h2><p class="rb-phase"></p></div>
    <div class="rb-trial-actions"><button type="button" data-step>Step phase</button>${onPlay ? '<button type="button" data-play>Play match</button>' : ''}</div></div>
    <div class="rb-contenders"></div><div class="rb-build"></div>
    <div class="rb-history"><h3>Effect history</h3><ol></ol></div></div></div>`);
  const get = selector => root.querySelector(selector);
  const edit = get('.rb-edit');
  const preset = get('.rb-preset');
  const fields = get('.rb-edit-fields');
  const feedback = get('.rb-feedback');
  let selectedField = {};
  const selectedPlayer = () => state.players.find(p => p.id === subject);

  function setFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.classList.toggle('rb-error', error);
  }
  function renderFields() {
    const op = edit.elements.operation.value;
    const player = selectedPlayer();
    edit.elements.player.value = subject;
    edit.elements.player.closest('label').hidden = op === 'event' || op === 'round';
    edit.querySelector('[type=submit]').textContent = operations[op];
    const currentView = viewMatch(state, subject).players.find(p => p.id === subject);
    function field(label, choicesHTML, preferred) {
      const temp = document.createElement('div');
      temp.innerHTML = select('key', label, choicesHTML);
      const el = temp.querySelector('select');
      if ([...el.options].some(opt => opt.value === preferred)) {
        el.querySelector(`option[value="${CSS.escape(preferred)}"]`).setAttribute('selected', '');
      }
      return temp.innerHTML;
    }
    const chosen = selectedField[op];
    let html = '';
    if (op === 'grant') {
      const list = Object.values(REWARDS).filter(reward => eligible(player, reward)).sort((a, b) => a.name.localeCompare(b.name));
      const reward = list.find(entry => entry.id === chosen) || list[0];
      if (reward) {
        html = field('Reward', list.map(r => option(r.id, r.name)).join(''), reward.id);
        html += `<p class="rb-field-note">${escapeHTML(reward.description)}</p>`;
        const isConsumable = reward.category === 'consumable';
        const isEquipped = ['ability', 'item'].includes(reward.category);
        const items = isConsumable ? player.consumables : player.abilities.map(slot => slot.id);
        if ((isEquipped || isConsumable) && items.length >= (isConsumable ? currentView.consumableCapacity : currentView.abilityCapacity)) {
          html += select('replaceIndex', 'Replace slot', items.map((id, i) => option(i, REWARDS[id].name)).join(''));
        }
      }
    }
    if (op === 'stat') {
      const key = chosen || 'armor';
      html = field('Attribute', choices(stats), key) + numeric('Value', player[key], ['hp', 'maxHp'].includes(key) ? 1 : 0, 9999);
    }
    if (op === 'status') {
      const key = chosen || 'burn';
      html = field('Status', choices(STATUSES), key) + numeric('Stacks', player.statuses[key] || 0, 0, 999);
      html += `<p class="rb-field-note">${escapeHTML(STATUSES[key].description)}</p>`;
    }
    if (op === 'cooldown') {
      const slot = player.abilities.find(a => a.id === chosen) || player.abilities[0];
      html = field('Ability or item', player.abilities.map(a => option(a.id, REWARDS[a.id].name)).join(''), slot.id)
        + numeric('Turns remaining', slot.cooldown, 0, 99);
    }
    if (op === 'round') html = numeric('Round', state.round, 1, 999);
    if (op === 'event') {
      const key = chosen || Object.keys(EVENTS)[0];
      html = field('Arena event', choices(EVENTS), key) + `<p class="rb-field-note">${escapeHTML(EVENTS[key].description)}</p>`;
    }
    fields.innerHTML = html;
    edit.querySelector('[type=submit]').disabled = state.phase === 'finished';
  }
  function paint() {
    const player = selectedPlayer();
    const current = state.players.find(p => p.id === state.activeId);
    const isFinished = state.phase === 'finished';
    get('.rb-head-extra').textContent = 'Round ' + state.round;
    get('.rb-phase').textContent = isFinished ? 'Match complete' : `${state.age} · ${current.name} · ${state.phase === 'acquire' ? 'Acquisition' : 'Action'}`;
    get('[data-step]').disabled = isFinished;
    if (onPlay) get('[data-play]').disabled = isFinished;
    get('.rb-contenders').innerHTML = state.players.map(p => combatant(p, p.id === subject)).join('');
    get('.rb-build').innerHTML = buildSummary(player);
    get('.rb-history ol').innerHTML = state.log.slice(-12).reverse().map(line =>
      `<li><span>R${line.round}</span><p>${escapeHTML(line.text)}</p></li>`).join('');
    edit.elements.player.innerHTML = state.players.map(p => option(p.id, p.name)).join('');
    renderFields();
  }
  preset.addEventListener('submit', event => {
    event.preventDefault();
    state = makeExperiment(preset.elements.preset.value, preset.elements.seed.value);
    subject = heroId;
    selectedField = {};
    paint();
    setFeedback('Loaded ' + experiments[preset.elements.preset.value].name + ' with seed ' + state.seed + '.');
  }, { signal });
  edit.addEventListener('change', event => {
    const field = event.target.name;
    if (field === 'player') { subject = event.target.value; paint(); }
    if (field === 'operation') renderFields();
    if (field === 'key') {
      selectedField[edit.elements.operation.value] = event.target.value;
      renderFields();
      edit.elements.key?.focus({ preventScroll: true });
    }
  }, { signal });
  edit.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(edit));
    const { operation, key } = values;
    const command = { type: operation, playerId: subject };
    const property = { grant: 'rewardId', stat: 'stat', status: 'status', cooldown: 'abilityId', event: 'eventId' }[operation];
    if (property) command[property] = key;
    if ('value' in values) command.value = Number(values.value);
    if ('replaceIndex' in values) command.replaceIndex = Number(values.replaceIndex);
    try {
      state = sandboxEdit(state, command);
      paint();
      const detail = REWARDS[key]?.name || stats[key] || STATUSES[key]?.name || EVENTS[key]?.name || 'Round';
      setFeedback(detail + ('value' in values ? ' set to ' + values.value : ' applied') + '.');
    } catch (error) { setFeedback(error.message, true); }
  }, { signal });
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.pick) { subject = button.dataset.pick; paint(); get(`[data-pick="${subject}"]`).focus({ preventScroll: true }); }
    if (button.hasAttribute('data-step') && state.phase !== 'finished') {
      state = applyCommand(state, state.activeId, botCommand(state));
      paint();
      setFeedback(state.log.at(-1)?.text || 'Phase advanced.');
    }
    if (button.hasAttribute('data-play') && onPlay) { destroy(); onPlay(state, heroId); }
  }, { signal });
  paint();
  return destroy;
}
