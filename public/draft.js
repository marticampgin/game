import { previewReward, rewardInMatch, STATUSES } from '/src/game/index.js';
import { esc, glyph, rewardIcon } from './art.js';

const categories = {
  shard: 'Stat shard', ability: 'Ability', artifact: 'Artifact', item: 'Active item',
  consumable: 'Consumable', chest: 'Chest', modifier: 'Modifier',
};

function offerCard(reward, impact, selected) {
  const descriptionId = 'offer-' + reward.id;
  return `<button type="button" class="reward-card draft-card ${reward.rarity}" data-draft-select="${reward.id}"
      aria-label="Inspect ${esc(reward.name)}" aria-pressed="${selected}" aria-controls="draft-inspection" aria-describedby="${descriptionId}">
    <span class="offer-mount"><span class="draft-art">${rewardIcon(reward)}</span>
      <span class="offer-sigil" aria-hidden="true">${selected ? glyph('check') : '◆'}</span>
      <span class="draft-meta">${esc(reward.rarity)}<span> · ${categories[reward.category]}</span></span>
      <strong class="offer-name">${esc(reward.name)}</strong>
      <span class="offer-preview" id="${descriptionId}">${esc(impact || reward.description)}</span>
    </span></button>`;
}

function review(reward, lines, player) {
  const consumable = reward.category === 'consumable';
  const replace = consumable
    ? player.consumableCount >= player.consumableCapacity
    : ['ability', 'item'].includes(reward.category) && player.abilities.length >= player.abilityCapacity;
  const copies = consumable ? (player.consumables || []).filter(id => id === reward.id).length : 0;
  const facts = [...lines];
  if (copies) facts.push(`Already carrying ${copies} ${copies === 1 ? 'copy' : 'copies'} of ${reward.name}.`);
  const glossary = reward.tags.filter(tag => Object.hasOwn(STATUSES, tag));
  return `<section class="draft-review" id="draft-inspection" aria-label="Selected reward">
    <div class="draft-review-copy">
      <p class="draft-rule"><strong>${esc(reward.name)}</strong><span class="draft-kind">${categories[reward.category]}</span> ${esc(reward.description)}</p>
      ${facts.length ? `<ul class="draft-facts">${facts.map((text, i) => `<li${i === 0 && lines.length ? ' class="offer-summary"' : ''}>${esc(text)}</li>`).join('')}</ul>` : ''}
      ${glossary.length ? `<details class="draft-glossary"><summary>How ${glossary.map(tag => STATUSES[tag].name).join(', ')} ${glossary.length === 1 ? 'works' : 'work'}</summary>
        <dl>${glossary.map(tag => `<div><dt>${STATUSES[tag].name}</dt><dd>${esc(STATUSES[tag].description)}</dd></div>`).join('')}</dl></details>` : ''}
    </div>
    <button type="button" class="primary draft-confirm" data-pick="${reward.id}" aria-label="${replace ? 'Choose replacement for' : 'Take'} ${esc(reward.name)}">
      ${replace ? 'Choose replacement' : 'Take ' + esc(reward.name)} ${glyph('right')}</button>
  </section>`;
}

export function draftHTML(view, player, selectedId) {
  const choices = view.offers.map(id => ({
    reward: rewardInMatch(view,id),
    lines: previewReward(view, player.id, id).lines,
  }));
  const selected = choices.find(choice => choice.reward.id === selectedId);
  const canThrow = player.classId === 'gambler' && player.abilities.some(a => a.id === 'cut-the-deck' && !a.cooldown) &&
    !player.statuses.freeze && (!view.bonusDraft || view.remainingActions > 1);
  const loaded = canThrow && player.stackedDeckTurn === player.personalTurn;
  const prompt = loaded ? 'High card loaded for this turn. Choose a reward.' :
    canThrow && player.rerolls ? 'Reroll to load a high card, or inspect a reward from this hand.' : 'Select a reward to inspect it.';
  const rerollHint = ['Draw three new offers.',canThrow ? 'Guarantees a high card this turn.' : '',
    player.artifacts.includes('marked-deck') ? 'Marked Deck adds 5 shield.' : ''].filter(Boolean).join(' ');
  return `<div class="loot-draft">
    <header class="dock-heading draft-heading"><h2>${view.bonusDraft ? 'Scavenge · ' : ''}Choose a reward</h2>
      <button type="button" class="tool-btn draft-reroll" data-ui="reroll" title="${esc(rerollHint)}" ${player.rerolls > 0 ? '' : 'disabled'}>${glyph('cycle')} Reroll (${player.rerolls})</button></header>
    <div class="draft-options" role="group" aria-label="Reward offers">
      ${choices.map(({reward, lines}) => offerCard(reward, lines[0], reward.id === selected?.reward.id)).join('')}
    </div>
    ${selected ? review(selected.reward, selected.lines, player) :
      `<div class="draft-review draft-prompt" id="draft-inspection"><p>${esc(prompt)}</p><button type="button" class="primary draft-confirm" disabled>Take reward ${glyph('right')}</button></div>`}
  </div>`;
}
