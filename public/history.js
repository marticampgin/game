import { esc } from './art.js';
import { effectTextHTML } from './resolution.js';

function liveTurn(view) {
  const active = view.players.find(p => p.id === view.activeId);
  if (!active) {
    const winner = view.players.find(p => p.id === view.winnerId);
    return winner ? winner.name + ' won' : 'Match drawn';
  }
  const step = view.phase === 'acquire' ? (view.bonusDraft ? 'chooses bonus loot' : 'chooses a reward') : 'chooses an action';
  return active.name + ' ' + step;
}

function logRounds(view) {
  const names = new Map(view.players.map(p => [p.id, p.name]));
  const rounds = [];
  for (const event of view.log) {
    let round = rounds.at(-1);
    if (round?.number !== event.round) {
      round = { number: event.round, groups: [] };
      rounds.push(round);
    }
    let group = round.groups.at(-1);
    if (event.type === 'turn') {
      const name = names.get(event.actorId);
      group = {title:name ? name + '’s turn' : event.text, actorId:event.actorId, rows:[]};
      round.groups.push(group);
      continue;
    }
    if (!group || (event.type === 'event' && !group.arena)) {
      group = {title:event.type === 'event' ? 'Arena effects' : 'Earlier effects', arena:event.type === 'event', rows:[]};
      round.groups.push(group);
    }
    group.rows.push(event);
  }
  return rounds.reverse();
}

function eventRow(event, group, view) {
  const primary = event.type === 'action' && event.targetId != null;
  return '<li class="journal-row' + (primary ? ' main-action' : '') + '" data-kind="' + esc(event.type) +
    '" data-event-id="' + esc(event.id) + '"><span>' + effectTextHTML(event,view,group.actorId) + '</span></li>';
}

function roundsHTML(view) {
  return logRounds(view).map((round,index) => '<details class="journal-round" data-round="' + esc(round.number) +
    '"' + (index === 0 ? ' open' : '') + '><summary>Round ' + esc(round.number) + '</summary>' +
    round.groups.reverse().map(group => '<section class="journal-turn"><h4>' + esc(group.title) +
      '</h4><ol>' + group.rows.map(e => eventRow(e,group,view)).join('') + '</ol></section>').join('') +
    '</details>').join('');
}

function signature(view) {
  return [view.log[0]?.id,view.log.at(-1)?.id,view.globalTurn,view.phase,view.activeId,view.winnerId].join('/');
}

function retainedNote(view) {
  const first = view.log[0];
  return first && first.id > 1 ? 'Showing the latest ' + view.log.length + ' events, starting in round ' + first.round + '.' : '';
}

export function historyHTML(view, soloSeed) {
  return '<section class="battle-journal" data-history-snapshot="' + esc(signature(view)) +
    '"><h2>Battle log</h2><p class="journal-handoff">' + esc(liveTurn(view)) + '</p>' +
    (soloSeed === undefined ? '' : '<p class="journal-seed">Solo seed · ' + esc(soloSeed) + '</p>') +
    '<label class="journal-search">Search the log<input type="search" data-history-search placeholder="Contender, effect or ability" autocomplete="off"></label>' +
    '<p class="journal-limit">' + esc(retainedNote(view)) + '</p>' +
    '<p class="journal-empty" role="status" hidden>No matching events.</p><div class="history journal-rounds">' +
    roundsHTML(view) + '</div></section>';
}

function journalRoot(root) {
  return root?.matches?.('.battle-journal') ? root : root?.querySelector('.battle-journal');
}

export function filterHistory(root, query) {
  const journal = journalRoot(root);
  if (!journal) return;
  const text = query.trim().toLowerCase();
  let found = false;
  for (const round of journal.querySelectorAll('.journal-round')) {
    if (text && !('beforeSearch' in round.dataset)) round.dataset.beforeSearch = String(round.open);
    const roundMatch = round.querySelector('summary').textContent.toLowerCase().includes(text);
    let any = false;
    for (const turn of round.querySelectorAll('.journal-turn')) {
      const ownerMatch = roundMatch || turn.querySelector('h4').textContent.toLowerCase().includes(text);
      let visible = ownerMatch;
      for (const row of turn.querySelectorAll('.journal-row')) {
        row.hidden = !(ownerMatch || row.textContent.toLowerCase().includes(text) || row.dataset.kind.includes(text));
        if (!row.hidden) visible = true;
      }
      turn.hidden = !visible;
      if (visible) any = true;
    }
    round.hidden = !any;
    if (text) round.open = any;
    else if ('beforeSearch' in round.dataset) {
      round.open = round.dataset.beforeSearch === 'true';
      delete round.dataset.beforeSearch;
    }
    if (any) found = true;
  }
  journal.querySelector('.journal-empty').hidden = !text || found;
}

/** Keep the live journal current while preserving the reader's search and place. */
export function refreshHistory(root, view) {
  const journal = journalRoot(root);
  if (!journal || journal.dataset.historySnapshot === signature(view)) return;
  const scroller = journal.querySelector('.journal-rounds');
  const top = scroller.scrollTop;
  const bounds = scroller.getBoundingClientRect();
  const anchor = top ? [...scroller.querySelectorAll('.journal-row')].find(row => {
    const box = row.getBoundingClientRect();
    return box.height && box.bottom > bounds.top && box.top < bounds.bottom;
  }) : null;
  const offset = anchor?.getBoundingClientRect().top;
  const open = new Map([...scroller.querySelectorAll('.journal-round')].map(r =>
    [r.dataset.round, 'beforeSearch' in r.dataset ? r.dataset.beforeSearch === 'true' : r.open]));
  const focused = journal.ownerDocument.activeElement;
  const focusRound = focused?.tagName === 'SUMMARY' ? focused.closest('.journal-round')?.dataset.round : null;
  scroller.innerHTML = roundsHTML(view);
  for (const round of scroller.querySelectorAll('.journal-round')) {
    if (open.has(round.dataset.round)) round.open = open.get(round.dataset.round);
  }
  journal.dataset.historySnapshot = signature(view);
  journal.querySelector('.journal-handoff').textContent = liveTurn(view);
  journal.querySelector('.journal-limit').textContent = retainedNote(view);
  filterHistory(journal,journal.querySelector('[data-history-search]').value);
  if (focusRound) scroller.querySelector('[data-round="' + CSS.escape(focusRound) + '"] summary')?.focus({preventScroll:true});
  scroller.scrollTop = top;
  const replacement = anchor && scroller.querySelector('[data-event-id="' + CSS.escape(anchor.dataset.eventId) + '"]');
  if (replacement?.getClientRects().length) scroller.scrollTop += replacement.getBoundingClientRect().top - offset;
}
