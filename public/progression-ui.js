import { CLASSES, REWARDS } from '../src/game/catalog.js';
import { SHOP, MASTERY_TARGET, MATCH_QUESTS, LIFETIME_QUESTS, newProfile, owns } from '../src/game/progression.js';
import { readProfile, loadProfile, subscribeProfile, buyItem, equipSkin } from './career-client.js';
import { esc, glyph, rewardIcon } from './art.js';
import { fighterPortrait, fighterKit } from './fighter-kit.js';
import { fighterSpriteHTML, playArenaAction, preloadArenaSkins } from './animation.js';
import { coin, number, objectiveRows } from './progression-objectives.js';
export { objectiveRows };

const roles = Object.values(CLASSES);
const rewards = SHOP.filter(item => item.kind === 'reward');
const starterCount = Object.keys(REWARDS).length - rewards.length;
const tabs = [['quests', 'Quests', 'atlas'], ['skins', 'Skins', 'mail'], ['rewards', 'Reward unlocks', 'chest']];
const conditions = [['healthy', 'Healthy', 100], ['wounded', 'Wounded', 48], ['critical', 'Critical', 18]];
const icon = id => '<img class="pg-icon" src="/assets/i-' + esc(id) + '.png" alt="">';
const paid = (profile, item) => item.skinId === 'founder' || owns(profile, item);
const button = (text, action, value, attrs = '') =>
  '<button type="button" data-pg="' + esc(action) + '" data-value="' + esc(value) + '" ' + attrs + '>' + text + '</button>';
const chip = (text, active = false) => '<span class="pg-tag' + (active ? ' is-owned' : '') + '">' + esc(text) + '</span>';
const price = amount => coin() + '<span>' + number(amount) + ' coins</span>';

function outfits(classId) {
  return [{id:'founder', skinId:'founder', classId, name:'Founder', price:0},
    ...SHOP.filter(item => item.kind === 'skin' && item.classId === classId)];
}

function matchQuests(career) {
  if (career?.objectives?.length) return `<section class="pg-match pg-panel">
    <div class="pg-section-head"><h2>Match objectives</h2><span class="pg-coin-label">${price(career.earnedCoins)} earned</span></div>
    ${objectiveRows(career.objectives)}</section>`;
  return `<section class="pg-match pg-next pg-panel"><div class="pg-book">${icon('atlas')}</div><div>
    <h2>Match objectives</h2><p>Each match deals you two personal objectives. Complete them to earn coins.</p>
    <details class="pg-pool"><summary>View objective pool <span>${MATCH_QUESTS.length}</span></summary><ul>${MATCH_QUESTS.map(q =>
      '<li><div><strong>' + esc(q.name) + '</strong><p>' + esc(q.description) + '</p></div><span class="pg-coin-label">' + price(q.coins) + '</span></li>').join('')}</ul></details></div></section>`;
}

function masteryRow(role, profile) {
  const matches = profile.classes[role.id]?.matches || 0;
  const outfit = SHOP.find(i => i.classId === role.id && i.mastery);
  const goal = outfit?.mastery ?? MASTERY_TARGET;
  const tally = Math.min(matches, goal);
  const portrait = fighterPortrait({classId:role.id,skinId:profile.equipped[role.id]});
  const prize = outfit && (owns(profile, outfit) ? outfit.name + ' owned' : outfit.name);
  return `<button type="button" class="pg-mastery-row" data-pg="mastery" data-value="${esc(role.id)}" title="View ${esc(prize || role.name)}">
    <img class="pg-portrait" src="${esc(portrait)}" alt=""><span class="pg-mastery-body">
    <span><strong>${esc(role.name)}</strong><small>${number(tally)} / ${number(goal)} matches</small></span>
    <progress aria-label="${esc(role.name)} mastery" max="${goal}" value="${tally}"></progress>
    <span class="pg-prize">${esc(prize || '')}</span></span>${glyph('right')}</button>`;
}

function journal(profile, career) {
  const quests = LIFETIME_QUESTS.map(q => ({...q,value:profile.totals[q.metric] || 0,complete:profile.claimed.includes(q.id)}));
  return `${matchQuests(career)}
    <div class="pg-journal-grid"><section class="pg-panel pg-lifetimes">
    <div class="pg-section-head"><h2>Lifetime quests</h2><small>${quests.filter(q => q.complete).length} / ${quests.length} complete</small></div>
    ${objectiveRows(quests)}</section>
    <section class="pg-panel pg-mastery"><div class="pg-section-head"><h2>Class mastery</h2>${icon('crown')}</div>
    <p>Finish matches with a class to earn its mastery outfit.</p>${roles.map(role => masteryRow(role,profile)).join('')}</section></div>`;
}

function availability(item, profile) {
  if (item.classId && (profile.equipped[item.classId] || 'founder') === item.skinId) return 'Equipped';
  if (paid(profile,item)) return 'Owned';
  return number(item.price) + ' coins';
}

function purchase(item, profile, busy) {
  const owned = paid(profile,item);
  const equipped = item.skinId && (profile.equipped[item.classId] || 'founder') === item.skinId;
  if (owned && !item.skinId) return '<p class="pg-acquired">' + glyph('check') + ' Unlocked for future drafts</p>';
  if (equipped) return '<p class="pg-acquired">' + glyph('check') + ' Equipped</p>';
  if (owned) return button('Equip outfit','equip',item.skinId, 'class="pg-primary"' + (busy ? ' disabled' : ''));
  const short = Math.max(0,item.price - profile.coins);
  return button('Unlock for ' + price(item.price), 'buy', item.id, 'class="pg-primary"' + (short || busy ? ' disabled' : '')) +
    (short ? '<p class="pg-short">' + number(short) + ' more coins needed</p>' : '');
}

function classRail(state, profile) {
  return '<section class="pg-class-panel"><h2>Classes</h2><div class="pg-class-list" role="group" aria-label="Choose a class">' + roles.map(role =>
    button('<img class="pg-portrait" src="' + esc(fighterPortrait({classId:role.id,skinId:profile.equipped[role.id]})) +
      '" alt=""><span>' + esc(role.name) + '</span>', 'class', role.id, 'class="pg-class" aria-pressed="' + (role.id === state.classId) + '"')).join('') + '</div></section>';
}

function skinPage(state, profile) {
  const options = outfits(state.classId);
  const item = options.find(s => s.skinId === state.skinId) || options[0];
  const className = CLASSES[state.classId].name;
  const condition = conditions.find(c => c[0] === state.tier);
  const player = {id:'preview',classId:state.classId,skinId:item.skinId,hp:condition[2],maxHp:100,alive:true};
  const current = availability(item,profile);
  const matches = Math.min(profile.classes[state.classId]?.matches || 0, item.mastery || MASTERY_TARGET);
  return `<div class="pg-shop-layout">${classRail(state,profile)}
    <section class="pg-showcase pg-panel" aria-label="Costume preview">
      <div class="pg-skin-stage"><div class="pg-stage-heading"><small>${esc(className)}</small><h2>${esc(item.name)}</h2></div>
        <div class="pg-fitting" role="img" aria-label="${esc(item.name + ' ' + className + ', ' + condition[1].toLowerCase())}">
          <div class="pg-mannequin" data-seat="preview" data-facing="right"><span class="fighter-art">${fighterSpriteHTML(player)}</span></div>
        </div></div>
      <div class="pg-preview-controls"><div class="pg-control-line"><span>Condition</span><div role="group" aria-label="Preview condition">${conditions.map(([id,label]) =>
        button(label, 'condition', id, 'aria-pressed="' + (id === state.tier) + '"')).join('')}</div></div>
      <div class="pg-control-line"><span>Gesture</span><div role="group" aria-label="Preview gesture">${button('Scavenge','gesture','scavenge')}${button('Drink','gesture','red-tonic')}</div></div></div>
    </section><section class="pg-panel pg-wardrobe"><div class="pg-section-head"><h2>Wardrobe</h2><small>${options.filter(i => paid(profile,i)).length} / ${options.length} owned</small></div>
      <div class="pg-outfits" role="group" aria-label="${esc(className)} outfits">${options.map(outfit =>
        button('<img class="pg-portrait" src="' + esc(fighterPortrait({classId:state.classId,skinId:outfit.skinId})) + '" alt=""><span><strong>' + esc(outfit.name) +
          '</strong><small>' + esc(availability(outfit,profile)) + '</small></span>' + glyph('right'), 'outfit', outfit.skinId,
          'class="pg-outfit" aria-pressed="' + (outfit.skinId === item.skinId) + '"')).join('')}</div>
      <div class="pg-outfit-order"><div class="pg-section-head"><h3>${esc(item.name)}</h3>${item.mastery ? chip('Mastery') : ''}</div>
      ${item.mastery ? '<p>Earn by finishing ' + item.mastery + ' matches as ' + esc(className) + ', or unlock with coins.</p><div class="pg-meter-row"><progress aria-label="Class mastery" value="' + matches + '" max="' + item.mastery + '"></progress><span>' + matches + ' / ' + item.mastery + '</span></div>' :
        '<p>' + (item.skinId === 'founder' ? esc(fighterKit(state.classId).title) + ' · Original class outfit.' : 'A permanent outfit for your ' + esc(className) + '.') + '</p>'}
      ${purchase(item,profile,state.busy)}</div></section></div>`;
}

function rewardPage(state, profile) {
  const item = rewards.find(i => i.id === state.rewardId) || rewards[0];
  if (!item) return '<section class="pg-panel"><h2>All rewards are available</h2></section>';
  const def = REWARDS[item.rewardId];
  return `<div class="pg-reward-layout"><section class="pg-panel pg-reward-list">
    <div class="pg-section-head"><h2>Draft collection</h2><small>${rewards.filter(i => paid(profile,i)).length} / ${rewards.length} unlocked</small></div>
    <p>${starterCount} rewards are available from the start. Unlock more for your future drafts.</p>
    <div class="pg-reward-grid" role="group" aria-label="Choose a reward">${rewards.map(r =>
      button(rewardIcon(REWARDS[r.rewardId]) + '<strong>' + esc(r.name) + '</strong><small>' + esc(availability(r,profile)) + '</small>',
        'reward', r.id, 'aria-pressed="' + (r.id === item.id) + '"')).join('')}</div>
    </section><section class="pg-panel pg-reward-detail" aria-label="Reward details">
      <div class="pg-relic-stage">${rewardIcon(def)}</div><div class="pg-relic-information">
      <small class="pg-category">${esc(def.rarity)} · ${esc(def.category)}</small><h2>${esc(item.name)}</h2><p>${esc(def.description)}</p>
      ${purchase(item,profile,state.busy)}</div></section></div>`;
}

/** Full-screen journal and shop. The live match displays objectiveRows directly. */
export function mountProgression(host, {initialTab='quests', initialClassId, initialSkinId, career, onBack} = {}) {
  const abort = new AbortController();
  const {signal} = abort;
  const root = document.createElement('section');
  root.className = 'pg-screen';
  root.setAttribute('aria-labelledby','pg-heading');
  const classId = Object.hasOwn(CLASSES,initialClassId) ? initialClassId : roles[0].id;
  let profile = readProfile() || newProfile();
  const state = {tab:tabs.some(t => t[0] === initialTab) ? initialTab : 'quests',classId,
    skinId:initialSkinId || profile.equipped[classId] || 'founder',tier:'healthy',rewardId:rewards[0]?.id,busy:false};
  let message = '', issue = false, preview, lastPreload = '';
  host.replaceChildren(root);

  function render() {
    if (signal.aborted) return;
    const focus = root.contains(document.activeElement) && document.activeElement.closest('[data-pg]');
    const openPool = !!root.querySelector('.pg-pool[open]');
    preview?.cancel();
    root.innerHTML = `<div class="pg-wrap"><header class="pg-header">${button(glyph('back') + ' Back','back','','class="pg-back"')}
      <h1 tabindex="-1" id="pg-heading">${state.tab === 'quests' ? 'Quest journal' : 'Outfitter'}</h1>
      <div class="pg-wallet" aria-label="${number(profile.coins)} coins">${coin()}<span><small>Coins</small><strong>${number(profile.coins)}</strong></span></div></header>
      <nav class="pg-tabs" aria-label="Progression sections">${tabs.map(([id,label,image]) =>
        button(icon(image) + label, 'tab', id, 'aria-current="' + (id === state.tab ? 'page' : 'false') + '"')).join('')}</nav>
      <div class="pg-content">${state.tab === 'quests' ? journal(profile,career) : state.tab === 'skins' ? skinPage(state,profile) : rewardPage(state,profile)}</div>
      <p class="pg-feedback${issue ? ' pg-error' : ''}" role="status">${esc(message)}</p></div>`;
    if (openPool && root.querySelector('.pg-pool')) root.querySelector('.pg-pool').open = true;
    if (focus) {
      const same = [...root.querySelectorAll('[data-pg]')].find(el => el.dataset.pg === focus.dataset.pg && el.dataset.value === focus.dataset.value && !el.disabled);
      (same || root.querySelector('.pg-outfit[aria-pressed=true], .pg-reward-grid [aria-pressed=true]'))?.focus({preventScroll:true});
    }
    if (state.tab === 'skins' && lastPreload !== state.classId + '/' + state.skinId) {
      lastPreload = state.classId + '/' + state.skinId;
      preloadArenaSkins([{classId:state.classId,skinId:state.skinId}]);
    }
  }
  function pickClass(id, skinId = profile.equipped[id] || 'founder') {
    state.classId = id; state.skinId = skinId;
  }
  const unsubscribe = subscribeProfile(next => {
    if (next) profile = next;
    render();
  });
  function destroy() {
    abort.abort();
    unsubscribe?.();
    preview?.cancel();
    root.remove();
  }
  function back() { destroy(); onBack?.(); }
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); back(); }
  }, {signal});
  root.addEventListener('click', async event => {
    const el = event.target.closest('[data-pg]');
    if (!el || !root.contains(el)) return;
    const {pg, value} = el.dataset;
    if (pg === 'back') return back();
    if (state.busy) return;
    message = ''; issue = false;
    if (pg === 'tab') state.tab = value;
    if (pg === 'class') pickClass(value);
    if (pg === 'outfit') state.skinId = value;
    if (pg === 'condition') state.tier = value;
    if (pg === 'reward') state.rewardId = value;
    if (pg === 'mastery') {
      state.tab = 'skins';
      pickClass(value, SHOP.find(i => i.classId === value && i.mastery)?.skinId);
    }
    if (pg === 'gesture') {
      preview?.cancel();
      preview = playArenaAction(root.querySelector('.pg-fitting'),{actorId:'preview',targetId:'preview',actionId:value,events:[]});
      return;
    }
    if (pg === 'buy' || pg === 'equip') {
      state.busy = true;
      const name = pg === 'buy' ? SHOP.find(i => i.id === value)?.name : outfits(state.classId).find(i => i.skinId === value)?.name;
      render();
      try {
        profile = await (pg === 'buy' ? buyItem(value) : equipSkin(state.classId,value));
        message = name + (pg === 'buy' ? ' unlocked.' : ' equipped.');
      } catch (error) { message = error.message; issue = true; }
      finally { state.busy = false; }
    }
    render();
  }, {signal});
  render();
  root.querySelector('h1').focus({preventScroll:true});
  loadProfile().then(next => { if (next && next !== profile) { profile = next; render(); } })
    .catch(error => { message = error.message; issue = true; render(); });
  return destroy;
}
