import { CLASSES, REWARDS } from '/src/game/index.js';
import { fighterKit, fighterPortrait, fighterSkins } from './fighter-kit.js';
import { classArt, esc, glyph, rewardIcon } from './art.js';

import { SHOP, owns } from '/src/game/progression.js';
import { initCareer, profileHeaders, loadProfile, acceptProfile, readProfile, startCareerSolo } from './career-client.js';

const preferredSkin = classId => readProfile()?.equipped?.[classId];
const classes = Object.values(CLASSES);
const botNames = ['Morrow', 'Sable', 'Brasswick', 'Vesper', 'Belladonna', 'Orin', 'Holloway'];

async function jsonRequest(path, token, body) {
  await initCareer();
  const headers = { ...profileHeaders() };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'The room could not be reached.');
    error.status = response.status;
    throw error;
  }
  if (data.profile) acceptProfile(data.profile);
  return data;
}

export function roomRequest(session, operation = '', body) {
  return jsonRequest('/api/rooms/' + encodeURIComponent(session.code) + (operation && '/' + operation), session.token, body);
}

function classGallery(picked, allowed, locked, skinId) {
  return '<div class="lobby-classes" aria-label="Character classes">' + classes.filter(c => allowed.includes(c.id)).map(c =>
    '<button type="button" class="lobby-class" data-lobby-class="' + c.id + '" aria-pressed="' + (c.id === picked) +
    '" aria-label="' + c.name + '"' + (locked ? ' disabled' : '') + '><img class="class-portrait" src="' + fighterPortrait({classId:c.id,skinId:c.id === picked ? skinId : preferredSkin(c.id)}) +
    '" alt=""><span class="class-plaque">' + rewardIcon({ icon: fighterKit(c.id).emblem }) + c.name + '</span></button>'
  ).join('') + '</div>';
}

function classDetail(picked, skinId) {
  const c = CLASSES[picked], ability = REWARDS[c.ability];
  const separator = c.innate.indexOf(': ');
  const innateName = separator < 0 ? 'Innate' : c.innate.slice(0, separator);
  const innateEffect = separator < 0 ? c.innate : c.innate.slice(separator + 2);
  const stats = [['Health', c.stats.maxHp, 'heart'], ['Attack', c.stats.attack, 'sword'],
    ['Armor', c.stats.armor, 'shield'], ['Spell power', c.stats.spellPower, 'crystal']];
  return '<section class="lobby-detail" aria-label="Selected class details">' +
    '<div class="lobby-identity"><h2>' + c.name + '</h2><p>' + esc(fighterKit(c.id).title || c.name) + '</p><img src="' + classArt({classId:c.id,skinId}) + '" alt=""></div>' +
    '<div class="lobby-skills"><p>' + esc(c.description) + '</p><div>' + rewardIcon({ icon: fighterKit(c.id).emblem }) +
    '<p><strong>' + esc(innateName) + '</strong><span>' + esc(innateEffect.charAt(0).toUpperCase() + innateEffect.slice(1)) + '</span></p></div>' +
    '<div>' + rewardIcon(ability) + '<p><strong>' + esc(ability.name) + '</strong><span>' + esc(ability.description) + '</span></p></div></div>' +
    '<dl class="lobby-stats">' + stats.map(([label, value, icon]) => '<div><dt>' + rewardIcon({ icon }) + label +
    '</dt><dd>' + value + '</dd></div>').join('') + '</dl></section>';
}

function options(values, selected) {
  return values.map(([value,label]) => '<option value="' + value + '"' + (value === selected ? ' selected' : '') +
    '>' + esc(label) + '</option>').join('');
}

function skinPicker(classId, selected, busy) {
  const choices = fighterSkins(classId).filter(skin => {
    const offer = SHOP.find(item => item.kind === 'skin' && item.classId === classId && item.skinId === skin.id);
    return !offer || owns(readProfile(), offer);
  });
  if (choices.length < 2) return '';
  return '<label class="lobby-skin">Skin<select name="skinId"' + (busy ? ' disabled' : '') + '>' +
    options(choices.map(skin => [skin.id, skin.name]), selected || 'founder') + '</select></label>';
}

function settings(model) {
  const isHost = model.tab === 'host', joining = model.tab === 'join';
  const name = '<label>Your name<input name="name" required maxlength="24" autocomplete="off" value="' + esc(model.name) + '"></label>';
  const capacity = '<label>Contenders<select name="capacity">' + options(Array.from({length:7}, (_,i) => [i+2,i+2]), model.capacity) + '</select></label>';
  const selection = '<label>Class selection<select name="mode">' + options([['free','Free choice'],['random','Random assignment'],
    ['draft','Three-class draft']],model.mode) + '</select></label>';
  const code = '<label>Room code<input name="code" required minlength="6" maxlength="6" autocapitalize="characters" spellcheck="false" autocomplete="off" placeholder="ABCDEF" value="' + esc(model.code) + '"></label>';
  const bots = '<label class="lobby-check"><input type="checkbox" name="fillBots"' + (model.fillBots ? ' checked' : '') + '>Fill empty seats with bots</label>';
  const seed = '<label>Match seed (optional)<input name="seed" maxlength="64" placeholder="Random" value="' + esc(model.seed) + '"></label>';
  const modeHint = model.mode === 'draft' ? 'Choose from three classes once the room opens.' :
    model.mode === 'random' ? 'Your class is assigned when the room opens.' : '';
  return '<div class="lobby-fields">' + name + (joining ? code : capacity) + (isHost ? selection + bots : '') + (model.tab === 'solo' ? seed : '') + '</div>' +
    (isHost ? '<p class="lobby-mode-hint" role="status">' + modeHint + '</p>' : '');
}

function roster(view) {
  const { room, playerId } = view;
  return '<section class="lobby-roster"><div class="lobby-invite"><div><span>Room code</span><strong data-room-code>' +
    room.code + '</strong></div><button type="button" data-lobby="copy">' + glyph('copy') +
    '<span>Copy invite</span></button></div><div class="lobby-seats" aria-label="Room roster">' +
    room.seats.map(s => '<div class="lobby-seat"><img src="' + classArt(s) + '" alt=""><span>' + esc(s.name) +
      '<small>' + CLASSES[s.classId].name + (s.id === room.hostId ? ' · Host' : '') + (s.id === playerId ? ' · You' : '') +
      '</small></span></div>').join('') + '</div><p>' + room.seats.length + ' / ' + room.capacity + ' seats' +
    (room.fillBots && room.seats.length < room.capacity ? ' · Bots fill open seats at start' : '') + '</p></section>';
}

function lobbyController(host, callbacks, initialSession, initialView) {
  const model = { tab: callbacks.initialCode ? 'join' : 'solo', name:'Wanderer', selected:classes[0].id, skinId:preferredSkin(classes[0].id), capacity:4,
    mode:'free', fillBots:true, seed:'', code:String(callbacks.initialCode || '').toUpperCase(), showSettings:false };
  let session = initialSession, view = initialView;
  let disposed = false, busy = false, polling = false, timer;
  let connectionError = '', formError = '';
  let choseSkin = false;

  function cleanup() {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    host.removeEventListener('click', click);
    host.removeEventListener('input', input);
    host.removeEventListener('change', input);
    host.removeEventListener('submit', submit);
  }

  function update(next) {
    if (disposed || (view && next.revision < view.revision)) return;
    connectionError = '';
    view = next;
    if (view.game) {
      cleanup();
      callbacks.onMatch({ session, view });
    } else {
      const ownSeat = view.room.seats.find(s => s.id === session.playerId);
      model.selected = ownSeat.classId;
      model.skinId = ownSeat.skinId;
      render();
    }
  }

  async function poll() {
    if (busy || disposed || polling) return;
    polling = true;
    try {
      const next = await roomRequest(session);
      if (!disposed && !busy && (next.revision > view.revision || connectionError)) update(next);
    } catch (error) {
      if (!disposed && !busy && !connectionError) {
        connectionError = error.status === 404 ? 'This room has closed.' : 'Reconnecting to room…';
        render();
      }
    } finally { polling = false; }
  }

  function render() {
    if (disposed) return;
    const room = view?.room;
    const waiting = Boolean(room);
    const activeClass = model.selected;
    const allowed = waiting && room.mode === 'draft' ? room.draft : classes.map(c => c.id);
    const locked = waiting && room.mode === 'random';
    const isHost = waiting && room.hostId === session.playerId;
    const canStart = !waiting || (isHost && (room.fillBots || room.seats.length >= 2));
    const label = waiting ? 'Start match' : { solo:'Start match',host:'Create room',join:'Join room' }[model.tab];
    const open = model.tab !== 'solo' || model.showSettings;
    const feedback = formError || connectionError;
    const canPickSkin = waiting || model.tab !== 'host' || model.mode === 'free';
    const previewSkin = canPickSkin ? model.skinId : undefined;
    const nav = waiting ? '' : '<nav class="lobby-tabs" aria-label="Play mode">' +
      [['solo','Solo'],['host','Host room'],['join','Join room']].map(([id,name]) =>
        '<button type="button" data-lobby-tab="' + id + '" aria-pressed="' + (model.tab === id) + '">' + name + '</button>').join('') + '</nav>';
    const action = waiting && !isHost ? '<p class="lobby-wait">Waiting for the host to start…</p>' :
      '<button class="lobby-primary" type="submit"' + (busy || !canStart ? ' disabled' : '') + '>' +
      (busy ? 'Please wait…' : label) + glyph('right') + '</button>';
    host.innerHTML = '<div class="lobby-screen"><div class="lobby-wrap"><header class="lobby-heading"><h1>' +
      (waiting ? 'Room lobby' : 'Enter the arena') + '</h1>' + nav + '</header>' + (waiting ? roster(view) : '') +
      classGallery(activeClass, allowed, locked || busy, previewSkin) + classDetail(activeClass, previewSkin) + '<form class="lobby-controls">' +
      (!waiting && open ? settings(model) : '') + '<div class="lobby-bottom"><button type="button" data-lobby="back" class="lobby-back"' + (busy ? ' disabled' : '') + '>' +
      glyph('back') + (waiting ? 'Leave room' : 'Main menu') + '</button>' +
      (!waiting && model.tab === 'solo' ? '<button type="button" class="lobby-setup" data-lobby="setup" aria-expanded="' +
        open + '">' + glyph('settings') + 'Match setup<span> · ' + model.capacity + ' contenders</span></button>' : '') +
      (canPickSkin ? skinPicker(activeClass, model.skinId, busy) : '') + action + '</div>' + (waiting && isHost && !canStart ? '<p class="lobby-wait">Invite another contender to start.</p>' : '') +
      '<p class="lobby-error" role="status">' + esc(feedback) + '</p></form></div></div>';
  }

  async function input(event) {
    const { name, type, value, checked } = event.target;
    if (name === 'skinId') {
      if (event.type !== 'change' || busy) return;
      choseSkin = true;
      const previous = model.skinId;
      model.skinId = value;
      if (session) await perform(async () => {
        try { update(await roomRequest(session, 'class', { classId:model.selected, skinId:value })); }
        catch (error) { model.skinId = previous; throw error; }
      });
      else render();
      host.querySelector('[name="skinId"]')?.focus({preventScroll:true});
      return;
    }
    if (!['name','code','capacity','mode','fillBots','seed'].includes(name)) return;
    model[name] = type === 'checkbox' ? checked : name === 'capacity' ? Number(value) : name === 'code' ? value.trim().toUpperCase() : value;
    if (name === 'code') event.target.value = model.code;
    if (name === 'capacity') {
      const count = host.querySelector('.lobby-setup span');
      if (count) count.textContent = ' · ' + model.capacity + ' contenders';
    }
    if (name === 'mode') {
      render();
      host.querySelector('[name="mode"]')?.focus({ preventScroll: true });
    }
  }

  async function perform(work) {
    if (busy || disposed) return;
    busy = true;
    formError = '';
    render();
    try { await work(); }
    catch (error) { formError = error.message || 'Could not reach the arena.'; }
    finally { busy = false; render(); }
  }

  async function submit(event) {
    event.preventDefault();
    if (!session && !model.name.trim()) {
      model.showSettings = true;
      formError = 'Enter your name to continue.';
      render();
      host.querySelector('[name="name"]')?.focus();
      return;
    }
    await perform(async () => {
      if (session) {
        let fastBots = false;
        try { fastBots = JSON.parse(localStorage.getItem('rift-preferences'))?.fast === true; }
        catch { /* A stale preference falls back to the room's normal pace. */ }
        return update(await roomRequest(session, 'start', { fastBots }));
      }
      const fighter = { classId:model.selected };
      if (model.skinId && (model.tab !== 'host' || model.mode === 'free')) fighter.skinId = model.skinId;
      if (model.tab === 'solo') {
        const rivals = classes.filter(c => c.id !== model.selected).concat(CLASSES[model.selected]);
        const players = [{ id:'p1', name:model.name.trim(), ...fighter, bot:false }];
        for (let i = 0; i < model.capacity - 1; i++) players.push({ id:'p' + (i+2), name:botNames[i], classId:rivals[i % rivals.length].id, bot:true });
        const seed = model.seed.trim() || crypto.getRandomValues(new Uint32Array(1))[0];
        const state = await startCareerSolo({seed,players});
        if (disposed) return;
        cleanup();
        return callbacks.onMatch({state,viewerId:players[0].id});
      }
      const joining = model.tab === 'join';
      const path = '/api/rooms' + (joining ? '/' + encodeURIComponent(model.code) + '/join' : '');
      const next = await jsonRequest(path, null, { name:model.name.trim(), ...fighter,
        capacity:model.capacity, mode:model.mode, fillBots:model.fillBots });
      const credentials = { code:next.code, token:next.token, playerId:next.playerId };
      if (disposed) { await roomRequest(credentials, 'leave', {}); return; }
      session = credentials;
      sessionStorage.setItem('rift-room', JSON.stringify(session));
      update(next);
      timer = setInterval(poll, 750);
    });
  }

  async function click(event) {
    const button = event.target.closest('button');
    if (!button || !host.contains(button) || busy) return;
    const {lobbyTab, lobbyClass, lobby} = button.dataset;
    if (lobbyTab) {
      model.tab = lobbyTab;
      formError = '';
      render();
      host.querySelector('[data-lobby-tab="' + lobbyTab + '"]')?.focus({preventScroll:true});
    } else if (lobbyClass) {
      if (model.selected === lobbyClass) return;
      if (session) await perform(async () => update(await roomRequest(session, 'class', {classId:lobbyClass,skinId:preferredSkin(lobbyClass)})));
      else { choseSkin = false; model.selected = lobbyClass; model.skinId = preferredSkin(lobbyClass); render(); }
      host.querySelector('[data-lobby-class="' + lobbyClass + '"]')?.focus({preventScroll:true});
    } else if (lobby === 'setup') {
      model.showSettings = !model.showSettings;
      render();
      host.querySelector(model.showSettings ? '[name="name"]' : '[data-lobby="setup"]')?.focus({preventScroll:true});
    } else if (lobby === 'back') {
      await perform(async () => {
        if (session) {
          try { await roomRequest(session, 'leave', {}); }
          catch (error) { if (![401,404].includes(error.status)) throw error; }
          sessionStorage.removeItem('rift-room');
        }
        cleanup();
        callbacks.onBack();
      });
    } else if (lobby === 'copy') {
      const url = new URL('/', location.href);
      url.searchParams.set('room', session.code);
      try {
        await navigator.clipboard.writeText(url.toString());
        if (!disposed) button.querySelector('span').textContent = 'Invite copied';
      } catch {
        formError = 'Invite friends with room code ' + session.code + '.';
        render();
      }
    }
  }

  host.addEventListener('click', click);
  host.addEventListener('input', input);
  host.addEventListener('change', input);
  host.addEventListener('submit', submit);
  void loadProfile().then(() => {
    if (disposed || session || busy || choseSkin) return;
    const preferred = preferredSkin(model.selected);
    if (model.skinId !== preferred) { model.skinId = preferred; render(); }
  });
  if (view) {
    update(view);
    if (!disposed) timer = setInterval(poll, 750);
  } else render();
  return cleanup;
}

export function mountLobby(host, callbacks) { return lobbyController(host, callbacks); }
export function resumeLobby(host, callbacks, session, view) { return lobbyController(host, callbacks, session, view); }
