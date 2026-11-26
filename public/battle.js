import { CLASSES, REWARDS, STATUSES, currentAttack, getActions, previewAction } from '/src/game/index.js';
import { classArt, rewardIcon, glyph, esc } from './art.js';

const category = {
  shard: 'Stat shard',
  ability: 'Ability',
  artifact: 'Artifact',
  item: 'Active item',
  consumable: 'Consumable',
  chest: 'Chest',
  modifier: 'Modifier',
};
const img = (icon) => '<img src="/assets/i-' + icon + '.png" alt="" class="reward-art">';
const btn = (name, label, icon) =>
  '<button class="tool-btn" data-ui="' + name + '">' + glyph(icon) + esc(label) + '</button>';
const hpPercent = (p) => Math.max(0, Math.min(100, (100 * p.hp) / p.maxHp));

function statue(p, active, viewerId, selected, feedback, winner) {
  const status = Object.entries(p.statuses || {}).filter(([, v]) => v > 0);
  const hit = feedback?.findLast(
    (e) => e.targetId === p.id && ['damage', 'heal', 'shield', 'revival'].includes(e.type),
  );
  const cast = feedback?.some((e) => e.actorId === p.id && e.type === 'action');
  const crown = p.id === active && p.alive;
  const aura = ['freeze', 'burn', 'poison', 'shock'].find((id) => p.statuses[id] > 0) || '';
  const icon = p.id === viewerId ? 'You' : p.bot ? 'Bot' : 'Player';
  return `<button class="combatant aura-${aura} ${p.id === winner ? 'champion' : ''} ${p.alive ? '' : 'fallen'} ${selected ? 'marked' : ''} ${crown ? 'current' : ''} ${cast ? 'casting' : ''} ${hit ? 'reaction-' + esc(hit.type) : ''}" data-inspect="${esc(p.id)}" aria-label="Inspect ${esc(p.name)}">
    <span class="sprite-wrap">${crown ? '<span class="turn-arrow"></span>' : ''}<img class="character" src="${classArt(p.classId)}" alt="">
    ${hit ? `<b class="impact ${esc(hit.type)}">${hit.type === 'revival' ? 'Revived' : (hit.type === 'damage' ? '−' : '+') + esc(hit.amount ?? '')}</b>` : ''}</span>
    <span class="fighter-plate"><span class="fighter-name">${esc(p.name)}</span><span class="fighter-class">${esc(CLASSES[p.classId].name)} · ${icon}</span>
    <span class="hp-meter"><i style="width:${hpPercent(p)}%"></i></span><span class="hp-stat">${p.alive ? p.hp + ' / ' + p.maxHp : 'Eliminated'}${p.shield ? ' · ' + p.shield + ' shield' : ''}</span></span>
    ${status.length ? `<span class="statuses">${status.map(([id, n]) => '<span title="' + esc(STATUSES[id]?.description) + '">' + esc(STATUSES[id]?.name || id) + ' ' + n + '</span>').join('')}</span>` : ''}
    </button>`;
}

function rewardCard(id) {
  const r = REWARDS[id];
  return `<button class="reward-card ${r.rarity}" data-pick="${r.id}">
    <span class="card-art">${rewardIcon(r)}</span><span class="card-body"><span class="rarity">${esc(r.rarity)} · ${category[r.category]}</span>
    <strong>${esc(r.name)}</strong><span class="description">${esc(r.description)}</span></span>
  </button>`;
}

function actionDock(v, p, selectedAction, targetId) {
  const actions = getActions(v, p.id);
  const a = actions.find((x) => x.id === selectedAction && !x.disabled) || actions.find((x) => !x.disabled);
  if (!a) return '<p>No action is available.</p>';
  const targets = v.players.filter((x) => x.alive && x.id !== p.id);
  const t = a.target === 'enemy' ? targets.find((x) => x.id === targetId) || targets[0] : p;
  const preview = t ? previewAction(v, p.id, a.id, t.id) : null;
  return `<div class="dock-heading"><div><small>Action phase${v.remainingActions > 1 ? ' · ' + v.remainingActions + ' actions left' : ''}</small><h2>Choose an action</h2></div>
    ${btn('build', 'Your build', 'book')}</div>
    <div class="action-layout"><div class="action-grid">${actions
      .map(
        (
          x,
        ) => `<button class="action-choice ${a.id === x.id ? 'chosen' : ''}" data-action="${esc(x.id)}" ${x.disabled ? 'disabled' : ''} title="${esc(x.reason || x.description)}">
      ${REWARDS[x.id] ? rewardIcon(REWARDS[x.id]) : img({ attack: 'sword', defend: 'shield', scavenge: 'chest' }[x.id])}
      <span>${esc(x.name)}${x.disabled ? '<small>' + esc(x.reason || 'Unavailable') + '</small>' : ''}</span></button>`,
      )
      .join('')}</div>
    <div class="target-panel"><h3>${esc(a.name)}</h3><p>${esc(a.description)}</p>
    ${a.target === 'enemy' ? `<label class="target-line">Target<select id="target-select">${targets.map((x) => '<option value="' + esc(x.id) + '" ' + (x === t ? 'selected' : '') + '>' + esc(x.name) + '</option>').join('')}</select></label>` : ''}
    <p class="preview" aria-live="polite">${esc(preview?.text)}</p>
    <button class="primary" data-execute="${esc(a.id)}" data-target="${esc(t?.id)}">Use ${esc(a.name)} ${glyph('right')}</button></div></div>`;
}

export function battleHTML(v, id, { action, target, feedback }) {
  const p = v.players.find((x) => x.id === id);
  const active = v.players.find((x) => x.id === v.activeId);
  const mine = v.activeId === id;
  const end = v.phase === 'finished';
  const next = v.nextEvent;
  const living = v.players.filter((x) => x.alive).length;
  const turns = end ? v.order : v.upcoming.slice(0, living);
  const order = turns.map((pid) => v.players.find((x) => x.id === pid)).filter(Boolean);
  const headline = v.log.findLast((e) =>
    ['damage', 'elimination', 'revival', 'event', 'synergy', 'action', 'victory'].includes(e.type),
  );
  const winner = v.players.find((x) => x.id === v.winnerId);
  const players = [p, ...v.players.filter((x) => x.id !== id)];
  let dock = '';
  if (end)
    dock = `<div class="result"><img src="/assets/i-crown.png" alt=""><div><small>Match complete · Round ${v.round}</small><h2>${winner ? (winner.id === id ? 'Victory is yours' : esc(winner.name) + ' wins') : 'The arena claims everyone'}</h2></div>${btn('history', 'Battle log', 'scroll')}<button class="primary" data-ui="replay">Play again ${glyph('right')}</button></div>`;
  else if (!mine)
    dock = `<div class="watch"><img src="${classArt(active?.classId)}" alt=""><div><small>${p.alive ? 'Rival turn' : 'Spectating'}</small><h2>${esc(active?.name)} is ${v.phase === 'acquire' ? 'choosing a reward' : 'taking action'}</h2><p>${p.alive ? 'Inspect a contender on the battlefield while you wait.' : 'You have been eliminated. Watch the remaining contenders finish the match.'}</p></div></div>`;
  else if (v.phase === 'acquire')
    dock = `<div class="dock-heading"><div><small>${v.bonusDraft ? 'Scavenge' : 'Acquisition phase'}</small><h2>Choose a reward</h2></div><button class="tool-btn" data-ui="reroll" ${p.rerolls ? '' : 'disabled'}>${glyph('cycle')} Reroll (${p.rerolls})</button></div><div class="reward-grid">${v.offers.map(rewardCard).join('')}</div>`;
  else dock = actionDock(v, p, action, target);
  return `<div class="battle-shell"><div class="battle-heading"><div><small>Round ${v.round} <span class="gold">◆</span> ${esc(v.age)}</small><h1>The Shattered Ring</h1></div><div class="battle-tools">${btn('history', 'Battle log', 'scroll')}${btn('atlas', 'Atlas', 'book')}</div></div>
  <div class="battle-upper"><section class="stage" aria-label="Battlefield"><div class="fighters ${players.length > 4 ? 'crowded' : ''}" style="--seats:${Math.min(players.length, 4)}">${players.map((x) => statue(x, v.activeId, id, target === x.id, feedback, v.winnerId)).join('')}</div></section>
  <aside class="timeline"><h2>Turn order</h2><ol>${order.map((x) => `<li class="${x.id === v.activeId ? 'now' : ''} ${x.alive ? '' : 'out'}"><button data-inspect="${esc(x.id)}"><img src="${classArt(x.classId)}" alt=""><span>${esc(x.name)}<small>${x.id === id ? 'You' : esc(CLASSES[x.classId].name)}</small></span></button></li>`).join('')}</ol>
  ${next && !end ? `<div class="omen" title="${esc(next.description)}"><small>Round ${next.round} event</small><strong>${esc(next.name)}</strong></div>` : ''}</aside></div>
  ${headline ? '<div class="arena-caption" aria-live="polite">' + glyph('scroll') + esc(headline.text) + '</div>' : ''}<section class="decision-dock">${dock}</section><div class="battle-bottom">${btn('build', 'Your inventory', 'book')}${btn('leave', end ? 'Main menu' : 'Leave match', 'back')}</div></div>`;
}

export function buildHTML(p, own) {
  const skills = p.abilities.map((a) => [
    a.id,
    a.cooldown ? 'Cooldown ' + a.cooldown : 'Ready',
    ...(a.modifiers || []).map((m) => REWARDS[m]?.name || m),
  ]);
  const list = (items, empty) =>
    items.length
      ? '<ul class="item-list">' +
        items
          .map(
            ([id, ...info]) =>
              '<li>' +
              rewardIcon(REWARDS[id]) +
              '<span><strong>' +
              esc(REWARDS[id]?.name || id) +
              '</strong><small>' +
              esc(REWARDS[id]?.description) +
              '</small></span>' +
              (info.length ? '<em>' + esc(info.join(' · ')) + '</em>' : '') +
              '</li>',
          )
          .join('') +
        '</ul>'
      : '<p class="muted">' + empty + '</p>';
  const stats = Object.entries(p.statuses).filter(([, v]) => v);
  return `<div class="inspect-top"><img src="${classArt(p.classId)}" alt=""><div><small>${esc(CLASSES[p.classId].name)}</small><h2>${esc(p.name)}</h2><p>${esc(CLASSES[p.classId].innate)}</p></div></div>
  <dl class="stats-row">${[
    ['Health', p.hp + '/' + p.maxHp],
    ['Shield', p.shield],
    ['Attack', currentAttack(p)],
    ['Armor', p.armor],
    ['Spell power', p.spellPower],
    ['Regen', p.regen || 0],
  ]
    .map(([k, n]) => '<div><dt>' + k + '</dt><dd>' + n + '</dd></div>')
    .join('')}</dl>
  ${stats.length ? '<h3>Status effects</h3>' + stats.map(([k, n]) => '<p><strong>' + esc(STATUSES[k]?.name) + ' ×' + n + '</strong> · ' + esc(STATUSES[k]?.description) + '</p>').join('') : ''}
  <h3>Abilities &amp; equipment</h3>${list(skills, 'No equipped abilities.')}
  <h3>Passive artifacts</h3>${list(
    p.artifacts.map((id) => [id]),
    'No artifacts acquired yet.',
  )}
  <h3>Consumables · ${p.consumableCount}</h3>${
    own
      ? list(
          (p.consumables || []).map((id) => [id]),
          'No consumables carried.',
        )
      : '<p>Only the owner can see these items.</p>'
  }`;
}
export function historyHTML(v) {
  return (
    '<h2>Battle log</h2><ol class="history">' +
    v.log
      .slice()
      .reverse()
      .map(
        (e) =>
          '<li class="' +
          esc(e.type) +
          '"><small>R' +
          e.round +
          ' · ' +
          esc(e.type) +
          '</small><span>' +
          esc(e.text) +
          '</span></li>',
      )
      .join('') +
    '</ol>'
  );
}
