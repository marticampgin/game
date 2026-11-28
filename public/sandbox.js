import { applyCommand, botCommand, CLASSES, createMatch, eligible, EVENTS, REWARDS, sandboxEdit, STATUSES, viewMatch } from '../src/game/index.js';
import { rewardIcon } from './art.js';
import { fighterPortrait, fighterSkins, fighterLayout, healthBand, resolveFighterSkin } from './fighter-kit.js';
import { createSkinPreview } from './skin-preview.js';
import { wornGear } from './worn-gear.js';
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
  deck: { name: 'Loaded deck', classId: 'gambler', rival: 'guardian', edits: [
    { type: 'stat', stat: 'rerolls', value: 3 }, { type: 'grant', rewardId: 'echo-rune' },
  ] },
  rites: { name: 'Funeral rites', classId: 'necromancer', rival: 'berserker', edits: [
    { type: 'stat', stat: 'hp', value: 280 }, { type: 'status', status: 'curse', value: 3, playerId: rivalId },
    { type: 'grant', rewardId: 'grave-bell' },
  ] },
  mirror: { name: 'Borrowed venom', classId: 'trickster', rival: 'alchemist', edits: [
    { type: 'stat', stat: 'shield', value: 12 }, { type: 'grant', rewardId: 'ward-lantern' },
    { type: 'grant', rewardId: 'whiteout', playerId: rivalId },
  ] },
  forge: { name: 'Piston workshop', classId: 'artificer', rival: 'chronomancer', edits: [
    { type: 'grant', rewardId: 'ward-lantern' }, { type: 'grant', rewardId: 'amplify' },
    { type: 'grant', rewardId: 'vial-sash' },
  ] },
};
const choices = object => Object.entries(object).map(([key, value]) => option(key, value.name || value)).join('');
const select = (name, label, markup) => `<label>${label}<select name="${name}" aria-label="${label}">${markup}</select></label>`;
const numeric = (label, value, min, max) => `<label>${label}<input type="number" name="value" value="${value}" min="${min}" max="${max}" step="1" required></label>`;
const itemNames = list => list.map(id => REWARDS[id].name).join(', ');

export function makeExperiment(presetId, seed, count = 2, fitting) {
  const preset = experiments[presetId];
  if (!preset) throw Error('Choose a starting build.');
  if (!Number.isInteger(count) || count < 2 || count > 8) throw Error('Choose 2–8 contenders.');
  const heroClass = fitting?.classId ?? preset.classId;
  const rivalClass = heroClass === preset.rival ? preset.classId : preset.rival;
  const roster = [
    { id: heroId, name: 'Aster', classId: heroClass, skinId: fitting?.skinId, bot: false },
    { id: rivalId, name: 'Sparring rival', classId: rivalClass, bot: true },
  ];
  const names = ['Finch', 'Iris', 'Flint', 'Rowan', 'Moss', 'Vale'];
  const roles = [...Object.keys(CLASSES).filter(id => ![heroClass,rivalClass].includes(id)),heroClass,rivalClass];
  for (let index = 0; index < count - 2; index++) {
    roster.push({id:'sparring-' + index, name:names[index], classId:roles[index % roles.length], bot:true});
  }
  let state = createMatch({seed, players:roster});
  for (const edit of preset.edits) state = sandboxEdit(state, { playerId: heroId, ...edit });
  if (fitting) {
    const hero = state.players.find(p => p.id === heroId);
    const tier = Object.hasOwn(conditions,fitting.tier) ? fitting.tier : 'healthy';
    if (healthBand(hero) !== tier) {
      const hp = Math.max(1,Math.round(hero.maxHp * conditions[tier].previewRatio));
      state = sandboxEdit(state,{type:'stat',playerId:heroId,stat:'hp',value:hp});
    }
  }
  return state;
}

const conditions = Object.fromEntries(fighterLayout.health.map(band => [band.id,band]));
const saveKey = 'rift-practice-bench-v1';

function initialBench(fitting) {
  const fresh = {presetId:'fresh', seed:'starfall', count:2, edits:[], subject:heroId};
  if (fitting) return fresh;
  try { return JSON.parse(sessionStorage.getItem(saveKey)) || fresh; }
  catch { return fresh; }
}

function restoreBench(bench, fitting) {
  let state = makeExperiment(bench.presetId,bench.seed,bench.count,fitting);
  for (const edit of bench.edits) {
    state = edit.type === 'step' ? applyCommand(state,state.activeId,botCommand(state)) : sandboxEdit(state,edit);
  }
  return state;
}

function combatant(player, selected) {
  return `<button class="bench-seat" type="button" data-pick="${player.id}" aria-pressed="${selected}" aria-label="${escapeHTML(player.name)} · ${CLASSES[player.classId].name}${player.bot ? '' : ' · Your fighter'}">
    <img src="${fighterPortrait(player)}" alt="" draggable="false">
    <span><strong>${escapeHTML(player.name)}</strong><small>${CLASSES[player.classId].name}</small></span>
    ${!player.bot ? '<i class="bench-pilot" aria-hidden="true"></i>' : ''}</button>`;
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

export function mountSandbox(host, {onClose, onPlay, initialFighter} = {}) {
  const {root, destroy, signal} = toolPage(host,'Sandbox',onClose);
  let fitting = initialFighter && Object.hasOwn(CLASSES,initialFighter.classId)
    ? {...initialFighter,skinId:resolveFighterSkin(initialFighter.classId,initialFighter.skinId).id} : null;
  let bench = initialBench(fitting), state;
  try { state = restoreBench(bench,fitting); }
  catch {
    bench = {presetId:'fresh', seed:'starfall', count:2, edits:[], subject:heroId};
    state = restoreBench(bench,fitting);
  }
  let subject = state.players.some(p => p.id === bench.subject) ? bench.subject : heroId;

  root.classList.add('rb-sandbox');
  root.querySelector('.rb-head-extra').innerHTML = '<button type="button" data-step>Step phase</button>' +
    (onPlay ? '<button type="button" data-play>Play match <span aria-hidden="true">›</span></button>' : '');
  root.insertAdjacentHTML('beforeend', `<form class="rb-preset">
    ${select('preset','Starting build',choices(experiments))}
    <label>Match seed<input name="seed" maxlength="80" required></label>
    ${select('count','Seats',[2,3,4,5,6,7,8].map(i => option(i,i)).join(''))}
    <button type="submit">Load experiment</button></form>
    <div class="bench-layout">
      <aside class="bench-roster bench-panel" aria-label="Practice roster"><header class="bench-panel-head"><h2>Contenders</h2><small class="bench-count"></small></header>
        <div class="rb-contenders"></div></aside>
      <section class="bench-stage-panel bench-panel" aria-label="Selected fighter">
        <header class="bench-panel-head"><div><small class="bench-class"></small><h2 class="bench-name"></h2></div>
          <div class="bench-vitals"><strong></strong><span class="bench-life"><i></i></span></div></header>
        <div class="bench-yard" role="img"><div class="bench-body"></div></div><div class="bench-art-error" hidden role="status"><span></span> <button type="button" data-retry-skin>Retry preview</button></div>
        <div class="bench-outfits" role="group" aria-label="Practice outfits"></div>
        <div class="bench-vital-controls"><span>Condition</span><div role="group" aria-label="Practice health"></div></div>
        <div class="bench-pilot-controls"><span class="bench-pilot-info"></span><div><button type="button" data-choose-class>Choose class</button><button type="button" data-pilot>Control this fighter</button></div></div>
      </section>
      <div class="bench-workshop bench-panel"><header class="bench-panel-head"><h2>Workbench</h2></header>
        <form class="rb-edit">${select('operation','Operation',choices(operations))}
          <div class="rb-edit-fields"></div><button type="submit" class="rb-gold-button">Grant reward</button></form>
        <p class="rb-feedback" role="status"></p>
        <details class="bench-details"><summary>Fighter build</summary><div class="rb-build"></div></details>
        <details class="bench-details"><summary>Effect history</summary><div class="rb-history"><ol></ol></div></details>
      </div>
    </div><footer class="bench-turn"><strong class="bench-round"></strong><span class="rb-phase"></span><span class="bench-practice">Practice · All outfits available</span></footer>`);
  const get = selector => root.querySelector(selector);
  const edit = get('.rb-edit');
  const preset = get('.rb-preset');
  const fields = get('.rb-edit-fields');
  const feedback = get('.rb-feedback');
  preset.elements.preset.value = bench.presetId;
  preset.elements.seed.value = bench.seed;
  preset.elements.count.value = String(bench.count);
  let selectedField = {};
  const yard = get('.bench-yard');
  const model = createSkinPreview(yard,get('.bench-body'),'bench-previous');
  signal.addEventListener('abort',() => model.dispose(),{once:true});
  const save = () => {
    // An Outfitter trial is disposable. The ordinary Sandbox owns the saved bench.
    if (fitting) return;
    bench.subject = subject;
    try { sessionStorage.setItem(saveKey,JSON.stringify(bench)); } catch { /* Play also works without storage. */ }
  };
  function applyEdit(command) {
    state = sandboxEdit(state,command);
    bench.edits.push(command);
  }
  const selectedPlayer = () => state.players.find(p => p.id === subject);

  function setFeedback(message, error = false) {
    feedback.textContent = message;
    feedback.classList.toggle('rb-error', error);
  }
  function renderFields() {
    const op = edit.elements.operation.value;
    const player = selectedPlayer();
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
    if (op === 'class') {
      html = field('Class', choices(CLASSES), chosen || player.classId) + '<p class="rb-field-note">Changing class restores this contender’s starting build.</p>';
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
    edit.querySelector('[type=submit]').disabled = state.phase === 'finished' || (!player.alive && !['event','round'].includes(op));
  }
  async function showModel(player, skin, band) {
    const key = [player.id,player.classId,skin.id,band,player.alive,wornGear(player)].join('/');
    if (key === yard.dataset.requested) return;
    const error = get('.bench-art-error');
    error.hidden = true;
    const result = await model.show(player,key,skin.name + ' outfit, ' + conditions[band].name.toLowerCase());
    if (result === 'failed') {
      error.querySelector('span').textContent = skin.name + ' could not load.';
      error.hidden = false;
    }
  }
  function paintWardrobe(player) {
    const skin = resolveFighterSkin(player.classId,player.skinId), band = healthBand(player);
    const frozen = state.phase === 'finished' || !player.alive;
    get('.bench-name').textContent = skin.name;
    get('.bench-class').textContent = player.name + ' · ' + CLASSES[player.classId].name;
    get('.bench-vitals strong').textContent = player.hp + ' / ' + player.maxHp + ' HP';
    get('.bench-life i').style.width = Math.min(100,100*player.hp/player.maxHp) + '%';
    get('.bench-outfits').innerHTML = fighterSkins(player.classId).map(outfit =>
      '<button type="button" data-outfit="' + outfit.id + '" aria-pressed="' + (outfit.id === skin.id) + '"' + (frozen ? ' disabled' : '') +
      '><img src="' + fighterPortrait({classId:player.classId,skinId:outfit.id}) + '" alt=""><span>' + escapeHTML(outfit.name) + '</span></button>').join('');
    get('.bench-vital-controls [role="group"]').innerHTML = fighterLayout.health.map(({id,name}) =>
      '<button type="button" data-health="' + id + '" aria-pressed="' + (id === band) + '"' + (frozen ? ' disabled' : '') + '>' + name + '</button>').join('');
    get('.bench-pilot-info').textContent = player.bot ? 'Bot-controlled rival' : 'Your fighter';
    get('[data-choose-class]').disabled = frozen;
    get('[data-pilot]').hidden = !player.bot;
    get('[data-pilot]').disabled = frozen;
    void showModel(player,skin,band);
  }
  function paint() {
    const player = selectedPlayer();
    const current = state.players.find(p => p.id === state.activeId);
    const isFinished = state.phase === 'finished';
    get('.bench-round').textContent = 'Round ' + state.round;
    get('.bench-count').textContent = state.players.length + ' seats';
    get('.rb-phase').textContent = isFinished ? 'Match complete' : `${state.age} · ${current.name} · ${state.phase === 'acquire' ? 'Acquisition' : 'Action'}`;
    get('[data-step]').disabled = isFinished;
    if (onPlay) get('[data-play]').disabled = isFinished;
    get('.rb-contenders').innerHTML = state.players.map(p => combatant(p, p.id === subject)).join('');
    get('.rb-build').innerHTML = buildSummary(player);
    get('.rb-history ol').innerHTML = state.log.slice(-12).reverse().map(line =>
      `<li><span>R${line.round}</span><p>${escapeHTML(line.text)}</p></li>`).join('');
    paintWardrobe(player);
    save();
    renderFields();
  }
  preset.addEventListener('submit', event => {
    event.preventDefault();
    if (fitting) {
      const hero = state.players.find(p => p.id === heroId);
      fitting = {classId:hero.classId,skinId:hero.skinId,tier:healthBand(hero)};
    }
    bench = {presetId:preset.elements.preset.value,seed:preset.elements.seed.value,count:Number(preset.elements.count.value),edits:[],subject:heroId};
    state = restoreBench(bench,fitting);
    subject = heroId;
    selectedField = {};
    paint();
    setFeedback('Loaded ' + experiments[preset.elements.preset.value].name + ' with seed ' + state.seed + '.');
  }, { signal });
  edit.addEventListener('change', event => {
    const field = event.target.name;
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
    const property = { class:'classId', grant: 'rewardId', stat: 'stat', status: 'status', cooldown: 'abilityId', event: 'eventId' }[operation];
    if (property) command[property] = key;
    if ('value' in values) command.value = Number(values.value);
    if ('replaceIndex' in values) command.replaceIndex = Number(values.replaceIndex);
    try {
      applyEdit(command);
      paint();
      const detail = CLASSES[key]?.name || REWARDS[key]?.name || stats[key] || STATUSES[key]?.name || EVENTS[key]?.name || 'Round';
      setFeedback(detail + ('value' in values ? ' set to ' + values.value : ' applied') + '.');
    } catch (error) { setFeedback(error.message, true); }
  }, { signal });
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-retry-skin')) { delete yard.dataset.requested; paintWardrobe(selectedPlayer()); }
    if (button.dataset.pick) { subject = button.dataset.pick; selectedField = {}; setFeedback(''); paint(); get(`[data-pick="${subject}"]`).focus({ preventScroll: true }); }
    if (button.hasAttribute('data-choose-class')) {
      edit.elements.operation.value = 'class';
      selectedField.class = selectedPlayer().classId;
      renderFields();
      edit.elements.key.focus();
    }
    const skinId = button.dataset.outfit, tier = button.dataset.health;
    if (skinId || tier || button.hasAttribute('data-pilot')) {
      const player = selectedPlayer();
      if (skinId && yard.dataset.failed) delete yard.dataset.requested;
      if (skinId && resolveFighterSkin(player.classId,skinId).id === skinId) {
        applyEdit({type:'skin',playerId:subject,skinId});
      } else if (Object.hasOwn(conditions,tier)) {
        applyEdit({type:'stat',playerId:subject,stat:'hp',value:Math.max(1,Math.round(player.maxHp*conditions[tier].previewRatio))});
      } else if (button.hasAttribute('data-pilot')) applyEdit({type:'pilot',playerId:subject});
      setFeedback('');
      paint();
      const selector = skinId ? '[data-outfit="' + skinId + '"]' : tier ? '[data-health="' + tier + '"]' : '[data-pick="' + subject + '"]';
      get(selector)?.focus({preventScroll:true});
    }
    if (button.hasAttribute('data-step') && state.phase !== 'finished') {
      state = applyCommand(state, state.activeId, botCommand(state));
      bench.edits.push({type:'step'});
      paint();
      setFeedback(state.log.at(-1)?.text || 'Phase advanced.');
    }
    if (button.hasAttribute('data-play') && onPlay) { destroy(); onPlay(state, state.players.find(p => !p.bot).id); }
  }, { signal });
  paint();
  return destroy;
}
