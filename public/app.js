import { applyCommand, botCommand, REWARDS, viewMatch } from '/src/game/index.js';
import { battleHTML, buildHTML, historyHTML } from './battle.js';
import { glyph, esc } from './art.js';
import { mountLobby, resumeLobby, roomRequest as request } from './lobby.js';

const app = document.querySelector('#app');
const modal = document.querySelector('#dialog');
const contents = document.querySelector('#dialog-content');
const soundButton = document.querySelector('#sound');
const pref = read(localStorage, 'rift-preferences') || {};
let screen = 'menu',
  dispose,
  timer,
  notifyTimer,
  audio,
  match,
  busy = false,
  toolOrigin = 'menu',
  epoch = 0;
let choice = 'attack',
  target = '',
  selectedDraft = '',
  actionPage = 0,
  pinnedAction = null,
  turnKey = '',
  lastLog = 0,
  pollFailed = false;
function read(area, key) {
  try {
    return JSON.parse(area.getItem(key));
  } catch {
    return null;
  }
}
function notice(message) {
  clearTimeout(notifyTimer);
  const node = document.querySelector('#notice');
  node.textContent = message;
  notifyTimer = setTimeout(() => (node.textContent = ''), 4500);
}
function preferences() {
  document.body.classList.toggle('reduce-motion', !!pref.reduce);
  soundButton.innerHTML = glyph(pref.sound ? 'sound' : 'mute');
  soundButton.setAttribute('aria-label', pref.sound ? 'Mute sound' : 'Enable sound');
  soundButton.title = soundButton.getAttribute('aria-label');
  localStorage.setItem('rift-preferences', JSON.stringify(pref));
}
function chime(kind) {
  if (!pref.sound) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const notes = kind === 'reward' ? [392, 523, 659] : kind === 'hit' ? [163, 98] : [330, 440];
    notes.forEach((hz, i) => {
      const osc = audio.createOscillator(),
        volume = audio.createGain(),
        t = audio.currentTime + i * 0.06;
      osc.type = kind === 'hit' ? 'triangle' : 'sine';
      osc.frequency.value = hz;
      volume.gain.setValueAtTime(0.0001, t);
      volume.gain.exponentialRampToValueAtTime(0.055, t + 0.01);
      volume.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(volume).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  } catch {
    /* Audio may be unavailable in embedded browsers. */
  }
}
function setScreen(next) {
  dispose?.();
  dispose = null;
  clearTimeout(timer);
  epoch++;
  screen = next;
  document.body.dataset.screen = next;
  if (modal.open) modal.close();
  window.scrollTo(0, 0);
}
function menu() {
  setScreen('menu');
  match = null;
  busy = false;
  lastLog = 0;
  app.innerHTML = `<section class="menu"><div class="menu-inner"><h1 class="menu-title"><img src="/assets/wordmark.png" alt="Riftbound"></h1>
  <div class="menu-sub"><span class="title-rule" aria-hidden="true"><i></i></span>A roguelike battle arena</div>
  <nav class="menu-nav" aria-label="Game menu">${[
    ['lobby', 'Enter the arena', 'sword'],
    ['atlas', 'Reward Atlas', 'atlas'],
    ['sandbox', 'Sandbox', 'dice'],
  ]
    .map(
      ([id, label, icon], i) =>
        `<button class="menu-link ${i ? '' : 'main-choice'}" data-ui="${id}"><span class="menu-label"><img src="/assets/i-${icon}.png" alt="">${label}${i ? '' : glyph('right')}</span></button>`,
    )
    .join('')}</nav></div></section>
  <footer class="menu-footer"><span>2–8 PLAYERS <i></i> TURN-BASED</span><span>BUILD 0.1</span></footer>`;
}
function showLobby(code, session, view) {
  setScreen('lobby');
  match = null;
  busy = false;
  const options = {
    initialCode: code || '',
    onBack: () => {
      clearInvite();
      menu();
    },
    onMatch: startBattle,
    onError: notice,
  };
  dispose = session ? resumeLobby(app, options, session, view) : mountLobby(app, options);
}
function clearInvite() {
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
}
function startBattle(payload) {
  setScreen('battle');
  match = payload;
  if (payload.session) {
    match.viewerId = payload.session.playerId;
    clearInvite();
  }
  turnKey = '';
  pinnedAction = null;
  busy = false;
  lastLog = 0;
  pollFailed = false;
  refreshBattle();
  schedule();
}
function current() {
  return match?.state ? viewMatch(match.state, match.viewerId) : match?.view?.game;
}
function refreshBattle() {
  if (screen !== 'battle' || !match) return;
  const v = current();
  if (!v) return;
  const key = v.globalTurn + '/' + v.activeId;
  if (key !== turnKey) {
    choice = 'attack';
    target = '';
    selectedDraft = '';
    actionPage = 0;
    turnKey = key;
  }
  if (!v.offers.includes(selectedDraft)) selectedDraft = '';
  const recent = lastLog ? v.log.filter((e) => e.id > lastLog) : [];
  if (recent.some((e) => e.type === 'damage')) chime('hit');
  lastLog = v.log.at(-1)?.id || 0;
  const focused = app.contains(document.activeElement) ? document.activeElement : null;
  const identities = [
    'data-draft-select',
    'data-aim',
    'data-action',
    'data-recap-id',
    'data-ui',
    'data-inspect',
    'id',
  ];
  const identity = identities.find((key) => focused?.hasAttribute(key));
  const railScroll = app.querySelector('.turn-rail ol')?.scrollLeft || 0;
  const chainScroll = app.querySelector('.recap-events')?.scrollTop || 0;
  app.innerHTML = battleHTML(v, match.viewerId, {
    action: choice,
    actionPage,
    target,
    selectedDraft,
    feedback: recent,
    recap: { expanded: !!pinnedAction, actionId: pinnedAction?.id, pinnedAction },
  });
  app.querySelector('.turn-rail ol').scrollLeft = railScroll;
  const chain = app.querySelector('.recap-events');
  if (chain) chain.scrollTop = chainScroll;
  if (identity) {
    const selector = '[' + identity + '="' + CSS.escape(focused.getAttribute(identity)) + '"]';
    (
      app.querySelector(selector) ||
      (identity === 'data-recap-id' && app.querySelector('[data-ui="toggle-recap"]'))
    )?.focus?.({ preventScroll: true });
  }
  const actor = v.players.find((p) => p.id === v.activeId);
  const phase = { acquire: 'choosing a reward', action: 'choosing an action' };
  const announcement =
    v.phase === 'finished'
      ? 'Match complete.'
      : (v.activeId === match.viewerId ? 'Your turn' : actor.name + ' is up') + ' · ' + phase[v.phase];
  const live = document.querySelector('#battle-announcement');
  if (live.textContent !== announcement) live.textContent = announcement;
  if (match.state)
    sessionStorage.setItem('rift-solo', JSON.stringify({ state: match.state, viewerId: match.viewerId }));
}
function schedule() {
  clearTimeout(timer);
  if (screen !== 'battle' || !match || current()?.phase === 'finished') return;
  if (match.session) {
    timer = setTimeout(poll, 800);
    return;
  }
  const p = match.state.players.find((p) => p.id === match.state.activeId);
  if (p?.bot)
    timer = setTimeout(
      () => {
        if (screen !== 'battle') return;
        try {
          match.state = applyCommand(match.state, p.id, botCommand(match.state));
          refreshBattle();
          schedule();
        } catch (e) {
          notice(e.message);
        }
      },
      pref.fast ? 130 : 570,
    );
}
async function poll() {
  const start = epoch,
    session = match?.session;
  if (!session || screen !== 'battle') return;
  try {
    const next = await request(session);
    if (epoch !== start) return;
    if (next.revision > match.view.revision) {
      match.view = next;
      refreshBattle();
    }
    if (pollFailed) {
      notice('Reconnected to the room.');
      pollFailed = false;
    }
  } catch (e) {
    if (epoch !== start) return;
    if ([401, 404].includes(e.status)) {
      sessionStorage.removeItem('rift-room');
      menu();
      notice(e.message);
      return;
    }
    if (!pollFailed) {
      notice('Connection interrupted. Reconnecting…');
      pollFailed = true;
    }
  } finally {
    if (epoch === start) schedule();
  }
}
async function command(cmd) {
  if (busy || screen !== 'battle') return;
  const start = epoch;
  busy = true;
  clearTimeout(timer);
  try {
    if (match.state) match.state = applyCommand(match.state, match.viewerId, cmd);
    else {
      const next = await request(match.session, 'command', { revision: match.view.revision, command: cmd });
      if (epoch !== start) return;
      if (next.revision >= match.view.revision) match.view = next;
    }
    if (cmd.type === 'pick' || cmd.type === 'reroll') selectedDraft = '';
    if (cmd.type === 'pick') chime('reward');
    if (modal.open) modal.close();
    refreshBattle();
    const focusNext = cmd.type === 'pick' ? '.turn-controls h2' : cmd.type === 'act' ? '.recap-toggle' : '';
    if (focusNext) {
      const node = app.querySelector(focusNext);
      if (node?.tagName === 'H2') node.tabIndex = -1;
      node?.focus({ preventScroll: true });
    }
  } catch (e) {
    if (epoch === start) notice(e.message);
  } finally {
    if (epoch === start) {
      busy = false;
      schedule();
    }
  }
}
function pick(id) {
  const p = current().players.find((p) => p.id === match.viewerId),
    r = REWARDS[id];
  const abilities = ['ability', 'item'].includes(r.category);
  const inventory = abilities ? p.abilities.map((a) => a.id) : p.consumables;
  if (
    (abilities || r.category === 'consumable') &&
    inventory.length >= (abilities ? p.abilityCapacity : p.consumableCapacity)
  ) {
    dialog(
      '<h2>Replace a slot</h2><p>Choose which item to replace with ' +
        esc(r.name) +
        '.</p><div class="dialog-actions">' +
        inventory
          .map(
            (old, i) =>
              '<button class="tool-btn" data-pick="' +
              id +
              '" data-replace="' +
              i +
              '">' +
              esc(REWARDS[old].name) +
              '</button>',
          )
          .join('') +
        '</div>',
    );
  } else command({ type: 'pick', rewardId: id });
}
function dialog(html) {
  contents.innerHTML =
    '<div class="dialog-head"><button class="icon-button" aria-label="Close dialog" data-ui="close">' +
    glyph('close') +
    '</button></div>' +
    html;
  modal.setAttribute('aria-label', contents.querySelector('h2')?.textContent || 'Arena details');
  if (!modal.open) modal.showModal();
}
function settings() {
  dialog(`<h2>Settings &amp; rules</h2><label class="setting-line">Sound effects<input type="checkbox" data-pref="sound" ${pref.sound ? 'checked' : ''}></label>
  <label class="setting-line">Faster solo opponents<input type="checkbox" data-pref="fast" ${pref.fast ? 'checked' : ''}></label>
  <label class="setting-line">Reduce motion<input type="checkbox" data-pref="reduce" ${pref.reduce ? 'checked' : ''}></label>
  <h3>How to play</h3><p>Pick one of three rewards, then take one action. Strike any living rival, use equipment, defend for a shield, or scavenge for another reward. The last contender standing wins.</p>
  <p>Armor reduces incoming damage before shields absorb it. Abilities recover at the start of your personal turn. Inspect a contender to see their build and status effects. Carried consumables stay secret until used.</p>
  <p>Every round gives each living contender a turn. Watch for announced arena events and increasing pressure in the Age of Chaos.</p>`);
}
async function openTool(tool) {
  toolOrigin = screen === 'battle' ? 'battle' : 'menu';
  setScreen(tool);
  const start = epoch;
  try {
    const mod = tool === 'atlas' ? await import('./atlas.js') : await import('./sandbox.js');
    if (epoch !== start) return;
    const close = () => {
      if (toolOrigin === 'battle' && match) {
        setScreen('battle');
        refreshBattle();
        schedule();
      } else {
        menu();
        app.querySelector('[data-ui="' + tool + '"]')?.focus({ preventScroll: true });
      }
    };
    dispose = (tool === 'atlas' ? mod.mountAtlas : mod.mountSandbox)(app, {
      onClose: close,
      onPlay: (state, viewerId) => startBattle({ state, viewerId }),
    });
  } catch (e) {
    if (epoch === start) {
      if (match) startBattle(match);
      else menu();
      notice(e.message);
    }
  }
}
function leaveConfirmation(replay = false) {
  if (busy) return;
  const end = current()?.phase === 'finished';
  if (end) {
    leave(replay);
    return;
  }
  dialog(
    '<h2>Leave the match?</h2><p>' +
      (match.session
        ? 'A bot will take over your seat. The remaining contenders can keep playing.'
        : 'This solo match will end.') +
      '</p><div class="dialog-actions"><button class="primary" data-ui="close">Keep playing</button><button class="tool-btn" data-ui="confirm-leave">Leave match</button></div>',
  );
}
async function leave(replay) {
  if (busy) return;
  busy = true;
  clearTimeout(timer);
  try {
    if (match.session) await request(match.session, 'leave', {});
  } catch (e) {
    if (![401, 404].includes(e.status)) {
      notice(e.message);
      busy = false;
      schedule();
      return;
    }
  }
  sessionStorage.removeItem('rift-solo');
  sessionStorage.removeItem('rift-room');
  menu();
  if (replay) showLobby();
}
function mainMenu() {
  if (screen === 'battle') return leaveConfirmation();
  if (screen === 'atlas' && toolOrigin === 'battle') {
    app.querySelector('[data-back]')?.click();
    return;
  }
  if (screen === 'lobby') {
    app.querySelector('[data-lobby="back"]')?.click();
    return;
  }
  menu();
}
document.querySelector('#brand').addEventListener('click', mainMenu);
document.querySelector('#settings').innerHTML = glyph('settings');
document.querySelector('#settings').addEventListener('click', settings);
soundButton.addEventListener('click', () => {
  pref.sound = !pref.sound;
  preferences();
  chime('select');
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.close();
});
document.addEventListener('change', (event) => {
  if (event.target.dataset.pref) {
    pref[event.target.dataset.pref] = event.target.checked;
    preferences();
    if (event.target.dataset.pref === 'sound') chime('select');
    if (screen === 'battle') schedule();
  }
  if (event.target.id === 'target-select') {
    target = event.target.value;
    refreshBattle();
    document.querySelector('#target-select')?.focus({ preventScroll: true });
  }
});
document.addEventListener('click', (event) => {
  const b = event.target.closest('button');
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.draftSelect && screen === 'battle') {
    selectedDraft = d.draftSelect;
    refreshBattle();
    const review = app.querySelector('.draft-review');
    if (innerWidth <= 760 && review?.getBoundingClientRect().bottom > innerHeight)
      review.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  } else if (d.aim && screen === 'battle') {
    target = d.aim;
    refreshBattle();
    const preview = app.querySelector('.target-panel');
    if (innerWidth <= 760 && preview?.getBoundingClientRect().bottom > innerHeight)
      preview.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  } else if (d.recapId && screen === 'battle') {
    pinnedAction = current().recentActions.find((a) => String(a.id) === d.recapId) || pinnedAction;
    refreshBattle();
    app.querySelector('.recap-details h3')?.setAttribute('tabindex', '-1');
    app.querySelector('.recap-details h3')?.focus({ preventScroll: true });
  } else if (d.inspect && screen === 'battle') {
    const p = current().players.find((x) => x.id === d.inspect);
    dialog(buildHTML(p, p.id === match.viewerId));
  } else if (d.pick && screen === 'battle') {
    if (d.replace !== undefined) command({ type: 'pick', rewardId: d.pick, replaceIndex: Number(d.replace) });
    else pick(d.pick);
  } else if (d.actionPage !== undefined && screen === 'battle') {
    actionPage = Number(d.actionPage);
    refreshBattle();
    app.querySelector('.action-grid button:not(:disabled)')?.focus({ preventScroll: true });
  } else if (d.action && screen === 'battle') {
    choice = d.action;
    refreshBattle();
    app.querySelector('[data-action="' + CSS.escape(choice) + '"]')?.focus({ preventScroll: true });
  } else if (d.execute && screen === 'battle')
    command({ type: 'act', actionId: d.execute, targetId: d.target });
  else if (d.ui) {
    switch (d.ui) {
      case 'close':
        modal.close();
        break;
      case 'lobby':
        chime('select');
        showLobby();
        break;
      case 'atlas':
      case 'sandbox':
        chime('select');
        openTool(d.ui);
        break;
      case 'build':
        dialog(
          buildHTML(
            current().players.find((x) => x.id === match.viewerId),
            true,
          ),
        );
        break;
      case 'toggle-recap':
        pinnedAction = pinnedAction ? null : current().lastAction;
        refreshBattle();
        break;
      case 'event': {
        const next = current().nextEvent;
        if (next)
          dialog(
            '<h2>' +
              esc(next.name) +
              '</h2><p>Round ' +
              next.round +
              ' arena event</p><p>' +
              esc(next.description) +
              '</p>',
          );
        break;
      }
      case 'history':
        dialog(historyHTML(current(), match.state?.seed));
        break;
      case 'reroll':
        command({ type: 'reroll' });
        break;
      case 'leave':
        leaveConfirmation();
        break;
      case 'confirm-leave':
        leave(false);
        break;
      case 'replay':
        leaveConfirmation(true);
        break;
    }
  }
});
async function restore() {
  const session = read(sessionStorage, 'rift-room'),
    solo = read(sessionStorage, 'rift-solo');
  const code = new URLSearchParams(location.search).get('room');
  if (session) {
    try {
      const view = await request(session);
      if (view.game) startBattle({ session, view });
      else showLobby(null, session, view);
      return;
    } catch (e) {
      if ([401, 404].includes(e.status)) sessionStorage.removeItem('rift-room');
      else {
        app.innerHTML =
          '<div class="battle-shell"><h1>Reconnecting to your room…</h1><p>The server is temporarily unavailable.</p></div>';
        setTimeout(restore, 2000);
        return;
      }
    }
  }
  if (code) {
    showLobby(code);
    return;
  }
  if (solo?.state?.version === 1) {
    try {
      startBattle(solo);
      return;
    } catch {
      sessionStorage.removeItem('rift-solo');
    }
  }
  menu();
}
preferences();
restore();
