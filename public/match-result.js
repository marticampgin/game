import { CLASSES } from '../src/game/catalog.js';
import { SHOP } from '../src/game/progression.js';
import { esc, glyph, seatCrest, toolButton } from './art.js';
import { fighterPortrait, resolveFighterSkin } from './fighter-kit.js';
import { finishPlace } from './finish-place.js';

export function matchResult(view, viewerId, settlement) {
  const seat = view.players.findIndex(p => p.id === view.winnerId);
  const winner = view.players[seat];
  const own = winner?.id === viewerId;
  const title = winner ? (own ? 'Victory is yours' : winner.name + ' wins') : 'The arena claims everyone';
  const placing = own ? '1st place' : finishPlace(view,view.milestones?.eliminations.find(fall => fall.targetId === viewerId));
  const details = winner
    ? [own && winner.name, CLASSES[winner.classId].name, resolveFighterSkin(winner.classId, winner.skinId).name]
      .filter(Boolean).map((label, index) => own && index === 0 ? '<span translate="no">' + esc(label) + '</span>' : esc(label)).join(' · ')
    : 'Draw · All ' + view.players.length + ' contenders fell';
  const portrait = winner
    ? `<button type="button" class="result-portrait" data-inspect="${esc(winner.id)}" aria-label="Inspect champion ${esc(winner.name)}" title="Inspect ${esc(winner.name)}"><img src="${fighterPortrait(winner)}" alt="">${seatCrest(seat)}</button>`
    : '<span class="result-portrait draw"><img src="/assets/ring-emblem.webp" alt=""></span>';
  const mastery = settlement?.masterySkinId && SHOP.find(item => item.skinId === settlement.masterySkinId);
  const purse = view.career && [view.career.earnedCoins + ' objective coins',
    settlement?.lifetimeCoins && '+' + settlement.lifetimeCoins + ' lifetime quest coins',
    mastery && mastery.name + ' unlocked'].filter(Boolean).map(esc).join(' · ');

  return `<div class="result">
    ${portrait}<div class="result-identity"><small>Match complete · Round ${esc(view.round)}${placing ? ' · Your finish · ' + esc(placing) : ''}</small><h2>${esc(title)}</h2><p>${details}</p></div>
    ${winner ? `<div class="result-health"><span>Survived with</span><strong>${esc(winner.hp)} <small>/ ${esc(winner.maxHp)} HP</small></strong><span class="vital-bar" aria-hidden="true"><i style="width:${Math.max(0,Math.min(100,100*winner.hp/winner.maxHp))}%"></i></span></div>` : ''}
    <div class="result-followup">${purse ? `<p class="result-purse"><img alt="" src="/assets/i-coin.png">${purse}</p>` : ''}
      <div class="result-actions">${toolButton('history','Battle log','scroll')}${view.career ? toolButton('outfitter','Outfitter','book') : ''}
        <button class="primary" data-ui="replay">Play again ${glyph('right')}</button></div></div></div>`;
}
