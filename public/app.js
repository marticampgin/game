import { applyCommand, REWARDS, viewMatch } from '/src/game/index.js';
import { mountEffectStrip, statusBankHTML } from './effect-strip.js';
import { bonusDraftContinuation } from './combat-timing.js';
import { statusCue } from './status-effects.js';
import { renderArena } from './arena-render.js';
import { clearRewardFlight, dealOffers, deliverReward, pickedEmblem } from './draft-motion.js';
import { battleHTML, buildHTML, nextEventButton, roundCaption, turnRail } from './battle.js';
import { historyHTML, filterHistory, refreshHistory } from './history.js';
import { planBotStep } from './pacing.js';
import { actionVisual, healthBand, playArenaAction, preloadArenaSkins } from './animation.js';
import { glyph, esc } from './art.js';
import { playContactSound } from './combat-sound.js';
import { mountLobby, resumeLobby, roomRequest as request } from './lobby.js';

import { loadProfile, onSoloRejected, readProfile, subscribeProfile, syncCareerSolo } from './career-client.js';
import { objectiveRows } from './progression-objectives.js';

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
  audioGain,
  match,
  busy = false,
  toolOrigin = 'menu',
  epoch = 0;
let choice = 'attack',
  target = '',
  selectedDraft = '',
  acquiredReward = '',
  actionPage = 0,
  pinnedAction = null,
  turnKey = '',
  shownView = null,
  playback = null,
  draftHidden = false,
  pendingFocus = '',
  planCache = null,
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
  if (audioGain) audioGain.gain.setTargetAtTime(pref.sound ? 1 : 0, audio.currentTime, .008);
  localStorage.setItem('rift-preferences', JSON.stringify(pref));
}
function gameAudio() {
  if (!pref.sound || !window.AudioContext) return;
  if (!audio) {
    audio = new AudioContext();
    audioGain = audio.createGain();
    audioGain.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}
function chime(kind) {
  if (!pref.sound) return;
  try {
    if (!gameAudio()) return;
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
      osc.connect(volume).connect(audioGain);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  } catch {
    /* Audio may be unavailable in embedded browsers. */
  }
}
function impactSound(cue) {
  if (!pref.sound) return;
  try {
    const context = gameAudio();
    if (context) playContactSound(context, cue, audioGain);
  } catch {
    /* An unavailable audio device must never interrupt the turn. */
  }
}
function setScreen(next) {
  clearRewardFlight();
  const oldPlayback = playback;
  playback = null;
  oldPlayback?.cancel();
  shownView = null;
  pendingFocus = '';
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
  shownView = null;
  app.innerHTML = `<section class="menu"><div class="menu-inner"><h1 class="menu-title"><img src="/assets/wordmark.png" alt="Riftbound"></h1>
  <div class="menu-sub"><span class="title-rule" aria-hidden="true"><i></i></span>A roguelike battle arena</div>
  <nav class="menu-nav" aria-label="Game menu">${[
    ['lobby', 'Enter the arena', 'sword'],
    ['quests', 'Quest journal', 'grimoire'],
    ['outfitter', 'Outfitter', 'sash'],
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
      app.querySelector('[data-ui="lobby"]')?.focus();
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
function careerUnavailableMessage(reason) {
  if (reason === 'diverged') return 'Another copy advanced this match. You can keep playing here without earning coins or mastery.';
  if (reason === 'checkpoint') return 'This match could not be verified. You can keep playing without earning coins or mastery.';
  return 'Playing offline. Career progress is unavailable for this match.';
}
onSoloRejected((id,reason) => {
  if (match?.state?.career?.runId !== id || match.state.careerUnavailable) return;
  match.state = {...match.state,careerUnavailable:reason};
  delete match.state.careerJournal;
  sessionStorage.setItem('rift-solo', JSON.stringify({state:match.state, viewerId:match.viewerId}));
  if (screen === 'battle') {
    if (modal.open && contents.querySelector('.live-objectives')) modal.close();
    refreshBattle();
    notice(careerUnavailableMessage(reason));
  }
});
function startBattle(payload) {
  setScreen('battle');
  match = payload;
  if (payload.session) {
    match.viewerId = payload.session.playerId;
    clearInvite();
  }
  turnKey = '';
  pinnedAction = null;
  draftHidden = false;
  planCache = null;
  preloadArenaSkins(current().players);
  if (match.state?.careerUnavailable) notice(careerUnavailableMessage(match.state.careerUnavailable));
  busy = false;
  shownView = null;
  pollFailed = false;
  refreshBattle();
  schedule();
}
function current() {
  return match?.state ? viewMatch(match.state, match.viewerId) : match?.view?.game;
}
function localBotPlan() {
  if (!match?.state) return null;
  if (!planCache || planCache.state !== match.state || planCache.fast !== !!pref.fast)
    planCache = {
      state: match.state,
      fast: !!pref.fast,
      plan: planBotStep(match.state, { fast: !!pref.fast }),
    };
  return planCache.plan;
}

function refreshBattle() {
  if (screen !== 'battle' || !match) return;
  const v = current();
  if (!v) return;
  if (match.state?.career) void syncCareerSolo(match.state);
  if (match.state)
    sessionStorage.setItem('rift-solo', JSON.stringify({ state: match.state, viewerId: match.viewerId }));
  if (modal.open) {
    refreshHistory(contents, v);
    const ledger = contents.querySelector('.live-objectives');
    if (ledger && v.career) {
      const rows = objectiveRows(v.career.objectives);
      if (ledger.dataset.progress !== rows) { ledger.innerHTML = rows; ledger.dataset.progress = rows; }
    }
  }
  if (playback) return;
  const arena = app.querySelector('.arena-world');
  const continuation = bonusDraftContinuation(shownView, v);
  const action = continuation || v.lastAction;
  // A restored game or a client returning from a background tab starts at the
  // authoritative state. Only animate when the before and after states are adjacent.
  const consecutive = arena && shownView && action && (continuation || action.id === shownView.globalAction + 1) && !document.hidden;
  const reduced = pref.reduce || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasConditions = consecutive && action.events.some(event => statusCue(event));
  if (consecutive && reduced && !hasConditions && pref.sound) {
    const role = shownView.players.find((p) => p.id === action.actorId)?.classId;
    const profile = actionVisual(action.actionId, role, action.actorId === action.targetId);
    impactSound({ action: action.actionId, role, effect: profile.effect, event: action.events?.[0], first: true });
  }
  if (consecutive && (!reduced || hasConditions)) {
    clearRewardFlight();
    const old = shownView;
    const shell = app.querySelector('.battle-shell');
    shell.classList.add('resolving');
    for (const region of shell.querySelectorAll('.turn-controls,.draft-stage,.fighter-main,.draft-handle'))
      region.inert = true;
    const callout = document.createElement('div');
    callout.className = 'scene-callout';
    callout.textContent = action.actorName + ' · ' + action.actionName;
    arena.append(callout);
    if (innerWidth <= 700 && arena.getBoundingClientRect().bottom < innerHeight / 2)
      arena.scrollIntoView({ block: 'center', behavior: 'instant' });
    const hp = new Map(old.players.map((p) => [p.id, p.hp]));
    const conditions = new Map(old.players.map(p => [p.id, { ...p.statuses }]));
    const showBeat = continuation || hasConditions || action.events.length > 6
      ? mountEffectStrip(shell.querySelector('.turn-resolution'), action, old.players) : undefined;
    if (showBeat) {
      const heading = shell.querySelector('.command-heading h2');
      const confirm = shell.querySelector('.confirm-action');
      if (heading) heading.textContent = 'Action played';
      if (confirm) confirm.textContent = action.actionName;
    }
    let shownOwner = old.activeId, shownRound = old.round;
    const handle = playArenaAction(arena, action, {
      effectsOnly: !!continuation,
      onBeat(beat, index, total) {
        if (!showBeat) return;
        showBeat(beat, index, total);
        const event = beat.events[0];
        if (event.round === v.round && shownRound !== event.round) {
          shownRound = event.round;
          shell.querySelector('.round-meta').innerHTML = roundCaption(v);
          shell.querySelector('.battle-bottom > div').innerHTML = nextEventButton(v);
        }
        if (event.timing === 'round') callout.textContent = 'Round ' + event.round + ' begins';
        if (event.timing !== 'turn') return;
        const owner = old.players.find(p => p.id === event.turnOwnerId);
        if (!owner) return;
        callout.textContent = owner.name + ' · Turn start';
        if (shownOwner === owner.id) return;
        shownOwner = owner.id;
        for (const seat of arena.querySelectorAll('[data-seat]'))
          seat.classList.toggle('acting', seat.dataset.seat === owner.id);
        if (owner.id === v.activeId && v.phase !== 'finished')
          shell.querySelector('.turn-rail').outerHTML = turnRail(v, match.viewerId);
      },
      reducedMotion: reduced,
      speed:
        old.players.find((p) => p.id === action.actorId)?.bot &&
        (match.session ? match.view.room.fastBots : pref.fast)
          ? 2.3
          : 1,
      onCue: impactSound,
      onImpact(event) {
        const p = old.players.find((p) => p.id === event.targetId);
        if (!p) return;
        let value = hp.get(p.id);
        if (event.type === 'damage') value = Math.max(0, value - (event.healthDamage || 0));
        else if (event.type === 'heal') value = Math.min(p.maxHp, value + event.amount);
        else if (event.type === 'revival') value = event.amount;
        else if (event.type === 'elimination') value = 0;
        hp.set(p.id, value);
        const option = shell.querySelector('#target-select option[value="' + CSS.escape(p.id) + '"]');
        if (option) option.textContent = p.name + ' (' + value + ' / ' + p.maxHp + ')';
        if (p.id === old.activeId) {
          const station = shell.querySelector('.command-player');
          if (station) {
            station.querySelector('.command-hp b').textContent = value + ' / ' + p.maxHp;
            station.querySelector('.command-health i').style.width = (100 * value) / p.maxHp + '%';
          }
        }
        const seat = arena.querySelector('[data-seat="' + CSS.escape(p.id) + '"]');
        if (seat) {
          const cue = statusCue(event);
          if (cue && Number.isInteger(cue.remaining)) {
            const stacks = conditions.get(p.id);
            stacks[cue.id] = cue.remaining;
            if (Number.isInteger(event.chillRemaining)) stacks.chill = event.chillRemaining;
            seat.querySelector('.seat-conditions').innerHTML = statusBankHTML(stacks);
          }
          seat.querySelector('.vital-bar i').style.width = (100 * value) / p.maxHp + '%';
          seat.querySelector('.fighter-hp').textContent = value + ' / ' + p.maxHp;
          const tier = healthBand({ hp: value, maxHp: p.maxHp, alive: value > 0 });
          seat.querySelector('.arena-sprite').dataset.tier = tier;
          if (p.id === action.actorId) arena.querySelector('.arena-fx-actor .arena-sprite').dataset.tier = tier;
        }
      },
    });
    playback = handle;
    handle.finished.finally(() => {
      if (playback !== handle) return;
      const returnFocus = document.activeElement?.matches('[data-ui="skip-effects"]');
      playback = null;
      renderBattle(v);
      // Polling can advance during a cinematic; only stage a subsequent action
      // when its own starting positions and health have actually been shown.
      if (current().globalAction !== v.globalAction || match.session) refreshBattle();
      if (returnFocus) app.querySelector('[data-draft-select], [data-action]:enabled, [data-ui="toggle-recap"]')?.focus({preventScroll:true});
      schedule();
    });
    return;
  }
  renderBattle(v);
}

function renderBattle(v) {
  // Verification can finish while a cinematic still holds its earlier view.
  if (v.career && match.state?.careerUnavailable) v = current();
  const freshOffers = v.offers.length && (shownView?.globalTurn !== v.globalTurn ||
    shownView?.offers.join('|') !== v.offers.join('|'));
  if (v.career && shownView?.career?.runId === v.career.runId) {
    const completed = v.career.objectives.filter(q => q.complete && shownView.career.objectives.some(old => old.id === q.id && !old.complete));
    if (completed.length) notice(completed.map(q => q.name + ' complete · +' + q.coins + ' coins').join('   ◆   '));
  }
  shownView = v;
  const key = v.globalTurn + '/' + v.activeId;
  if (key !== turnKey) {
    choice = 'attack';
    target = '';
    selectedDraft = '';
    acquiredReward = '';
    actionPage = 0;
    draftHidden = false;
    turnKey = key;
  }
  if (!v.offers.includes(selectedDraft)) selectedDraft = '';
  const focused = app.contains(document.activeElement) ? document.activeElement : null;
  const identities = [
    'data-draft-select',
    'data-aim',
    'data-action',
    'data-recap-id',
    'data-pick',
    'data-execute',
    'data-action-page',
    'data-ui',
    'data-inspect',
    'id',
  ];
  const identity = identities.find((key) => focused?.hasAttribute(key));
  const focusSelector = identity
    ? '[' + identity + '="' + CSS.escape(focused.getAttribute(identity)) + '"]'
    : '';
  const railScroll = app.querySelector('.turn-rail ol')?.scrollLeft || 0;
  const chainScroll = app.querySelector('.recap-events')?.scrollTop || 0;
  renderArena(
    app,
    battleHTML(v, match.viewerId, {
      settlement: v.career && readProfile().lastSettlement?.runId === v.career.runId ? readProfile().lastSettlement : null,
      action: choice,
      actionPage,
      target,
      selectedDraft,
      acquiredReward,
      sound: !!pref.sound,
      draftHidden,
      botIntent: match.state ? localBotPlan()?.intent : v.botIntent,
      recap: { expanded: !!pinnedAction, actionId: pinnedAction?.id, pinnedAction },
    }),
  );
  if (freshOffers) dealOffers(app);
  app.querySelector('.turn-rail ol').scrollLeft = railScroll;
  const chain = app.querySelector('.recap-events');
  if (chain) chain.scrollTop = chainScroll;
  if (identity) {
    (
      app.querySelector(focusSelector) ||
      (identity === 'data-recap-id' && app.querySelector('[data-ui="toggle-recap"]'))
    )?.focus?.({ preventScroll: true });
  }
  const actor = v.players.find((p) => p.id === v.activeId);
  const phase = { acquire: 'choosing a reward', action: 'choosing an action' };
  const handoff =
    v.phase === 'finished'
      ? 'Match complete.'
      : (v.activeId === match.viewerId ? 'Your turn' : actor.name + ' is up') + ' · ' + phase[v.phase];
  const resolved = v.lastAction;
  const announcement = resolved
    ? resolved.actorName +
      ' used ' +
      resolved.actionName +
      '. ' +
      (app.querySelector('.recap-outcome p')?.textContent || '') +
      '. ' +
      handoff
    : handoff;
  const live = document.querySelector('#battle-announcement');
  if (live.textContent !== announcement) live.textContent = announcement;
  if (pendingFocus) {
    const node = app.querySelector(pendingFocus);
    if (node?.tagName === 'H2') node.tabIndex = -1;
    node?.focus({ preventScroll: true });
    pendingFocus = '';
  }
}
function schedule() {
  clearTimeout(timer);
  if (screen !== 'battle' || !match || current()?.phase === 'finished') return;
  if (match.session) {
    timer = setTimeout(poll, 800);
    return;
  }
  if (playback) return;
  const plan = localBotPlan();
  if (!plan) return;
  const before = match.state;
  timer = setTimeout(() => {
    if (screen !== 'battle' || match.state !== before) return;
    try {
      match.state = applyCommand(before, before.activeId, plan.command);
      refreshBattle();
      schedule();
    } catch (e) {
      notice(e.message);
    }
  }, plan.delayMs);
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
  if (busy || playback || screen !== 'battle') return;
  const start = epoch;
  const emblem = cmd.type === 'pick' ? pickedEmblem(app, cmd.rewardId) : null;
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
    if (cmd.type === 'pick') {
      acquiredReward = REWARDS[cmd.rewardId].name;
      chime('reward');
    }
    if (modal.open) modal.close();
    pendingFocus = cmd.type === 'pick' ? '.turn-controls h2' : cmd.type === 'act' ? '.recap-toggle' : '';
    refreshBattle();
    if (emblem) deliverReward(app, match.viewerId, emblem);
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
    '</button></div><div class="dialog-body">' + html + '</div>';
  const heading = contents.querySelector('h2');
  heading.id = 'dialog-title';
  contents.querySelector('.dialog-head').prepend(heading);
  modal.setAttribute('aria-labelledby', heading.id);
  if (!modal.open) modal.showModal();
}
function settings() {
  dialog(`<h2>Settings &amp; rules</h2><label class="setting-line">Sound effects<input type="checkbox" data-pref="sound" ${pref.sound ? 'checked' : ''}></label>
  <label class="setting-line">Faster bots in solo and hosted rooms<input type="checkbox" data-pref="fast" ${pref.fast ? 'checked' : ''}></label>
  <label class="setting-line">Reduce motion<input type="checkbox" data-pref="reduce" ${pref.reduce ? 'checked' : ''}></label>
  <h3>How to play</h3><p>Pick one of three rewards, then take one action. Strike any living rival, use equipment, defend for a shield, or scavenge for another reward. The last contender standing wins.</p>
  <p>Armor reduces incoming damage before shields absorb it. Abilities recover at the start of your personal turn. Inspect a contender to see their build and status effects. Carried consumables stay secret until used.</p>
  <p>Every round gives each living contender a turn. Watch for announced arena events and increasing pressure in the Age of Chaos.</p>`);
}
async function openProgression(tab, origin = screen, fitting) {
  const view = origin === 'battle' ? current() : undefined;
  const career = view?.career;
  const fighter = view?.players.find(p => p.id === match.viewerId);
  const settlement = readProfile().lastSettlement;
  const masterySkinId = career && settlement?.runId === career.runId ? settlement.masterySkinId : undefined;
  const opener = tab === 'skins' ? 'outfitter' : 'quests';
  const back = () => {
    if (origin === 'battle' && match) { setScreen('battle'); refreshBattle(); schedule(); }
    else menu();
    app.querySelector('[data-ui="' + opener + '"]')?.focus({preventScroll:true});
  };
  setScreen('progression');
  const start = epoch;
  try {
    const {mountProgression} = await import('./progression-ui.js');
    if (epoch === start) dispose = mountProgression(app,{
      initialTab:tab, initialClassId:fitting?.classId || fighter?.classId, initialSkinId:fitting?.skinId || masterySkinId,
      initialTier:fitting?.tier, returnToPractice:!!fitting, career, onBack:back, onCue:impactSound,
      onPractice: initialFighter => openTool('sandbox',{
        initialFighter, onClose:() => openProgression('skins',origin,initialFighter),
      }),
    });
  } catch (error) { if (epoch === start) { back(); notice(error.message); } }
}
async function openTool(tool, options = {}) {
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
      } else menu();
      app.querySelector('[data-ui="' + tool + '"]')?.focus({ preventScroll: true });
    };
    dispose = (tool === 'atlas' ? mod.mountAtlas : mod.mountSandbox)(app, {
      onClose: close,
      readProfile, subscribeProfile,
      onPlay: (state, viewerId) => startBattle({ state, viewerId }),
      ...options,
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
  if (screen === 'progression') {
    app.querySelector('[data-pg="back"]')?.click();
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
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-history-search]')) filterHistory(contents, event.target.value);
});
document.addEventListener('change', (event) => {
  if (event.target.dataset.pref) {
    pref[event.target.dataset.pref] = event.target.checked;
    preferences();
    if (event.target.dataset.pref === 'sound') chime('select');
    if (screen === 'battle') {
      if (event.target.dataset.pref === 'reduce' && pref.reduce) playback?.cancel();
      refreshBattle();
      schedule();
    }
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
  } else if (d.execute && screen === 'battle') {
    // Browsers unlock the audio device during the trusted mouse/keyboard action.
    try { gameAudio(); } catch { /* Playback is optional. */ }
    command({ type: 'act', actionId: d.execute, targetId: d.target });
  } else if (d.ui) {
    switch (d.ui) {
      case 'skip-effects':
        playback?.cancel();
        break;
      case 'battle-settings':
        settings();
        break;
      case 'battle-sound':
        soundButton.click();
        refreshBattle();
        break;
      case 'toggle-draft':
        draftHidden = !draftHidden;
        refreshBattle();
        break;
      case 'close':
        modal.close();
        break;
      case 'lobby':
        chime('select');
        showLobby();
        break;
      case 'objectives': {
        const career = current()?.career;
        if (career) dialog('<h2>Match objectives</h2><p>Personal to you. Completed objectives earn coins for the Outfitter.</p><div class="live-objectives">' + objectiveRows(career.objectives) + '</div>');
        break;
      }
      case 'quests':
      case 'outfitter':
        chime('select');
        openProgression(d.ui === 'quests' ? 'quests' : 'skins');
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
subscribeProfile(() => {
  if (screen === 'battle' && !playback && current()?.phase === 'finished') refreshBattle();
});
void loadProfile();
restore();
