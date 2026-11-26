import { previewReward, REWARDS, STATUSES } from '/src/game/index.js';
import { esc, glyph, rewardIcon } from './art.js';

const categories = {
  shard: 'Stat shard', ability: 'Ability', artifact: 'Artifact', item: 'Active item',
  consumable: 'Consumable', chest: 'Chest', modifier: 'Modifier',
};

function card(reward, lines, selected) {
  const inspect = `draft-${reward.id}-details`;
  return `<button type="button" class="reward-card draft-card ${reward.rarity}" data-draft-select="${reward.id}"
    aria-label="Inspect ${esc(reward.name)}" aria-pressed="${selected}" aria-controls="draft-inspection" aria-describedby="${inspect}${lines.length ? ' ' + inspect + '-impact' : ''}">
    <span class="draft-art">${rewardIcon(reward)}<span class="draft-select-mark" aria-hidden="true">${selected ? glyph('check') : ''}</span></span>
    <span class="draft-copy"><span class="draft-meta">${esc(reward.rarity)} <span>·</span> ${categories[reward.category]}</span>
      <strong>${esc(reward.name)}</strong><span class="draft-rule" id="${inspect}">${esc(reward.description)}</span></span>
    ${lines.length ? `<span class="draft-readout" id="${inspect}-impact">${esc(lines[0])}</span>` : ''}
  </button>`;
}

function inspect(reward, lines, player) {
  const facts = lines.slice(1);
  const consumable = reward.category === 'consumable';
  const replace = consumable
    ? player.consumableCount >= player.consumableCapacity
    : ['ability', 'item'].includes(reward.category) && player.abilities.length >= player.abilityCapacity;
  const copies = consumable ? (player.consumables || []).filter(id => id === reward.id).length : 0;
  if (copies) facts.push(`Already carrying ${copies} ${copies === 1 ? 'copy' : 'copies'} of ${reward.name}.`);
  const glossary = reward.tags.filter(tag => Object.hasOwn(STATUSES, tag));
  return `<section class="draft-review" id="draft-inspection" aria-label="Selected reward">
    <div class="draft-review-copy"><span class="draft-selected-label">${glyph('check')} Selected</span><h3>${esc(reward.name)}</h3>
      ${facts.length ? `<ul class="draft-facts">${facts.map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}
      ${glossary.length ? `<details class="draft-glossary"><summary>How ${glossary.map(tag => STATUSES[tag].name).join(', ')} ${glossary.length === 1 ? 'works' : 'work'}</summary>
        <dl>${glossary.map(tag => `<div><dt>${STATUSES[tag].name}</dt><dd>${esc(STATUSES[tag].description)}</dd></div>`).join('')}</dl></details>` : ''}
    </div>
    <button type="button" class="primary draft-confirm" data-pick="${reward.id}" aria-label="${replace ? 'Choose replacement for' : 'Take'} ${esc(reward.name)}">
      ${replace ? 'Choose replacement' : 'Take ' + esc(reward.name)} ${glyph('right')}</button>
  </section>`;
}

export function draftHTML(view, player, selectedId) {
  const choices = view.offers.map(id => ({
    reward: REWARDS[id],
    lines: previewReward(view, player.id, id).lines,
  }));
  const selected = choices.find(choice => choice.reward.id === selectedId);
  return `<div class="loot-draft">
    <header class="dock-heading draft-heading"><div><small>${view.bonusDraft ? 'Scavenge' : 'Acquisition phase'}</small><h2>Choose a reward</h2></div>
      <button type="button" class="tool-btn draft-reroll" data-ui="reroll" ${player.rerolls > 0 ? '' : 'disabled'}>${glyph('cycle')} Reroll (${player.rerolls})</button>
    </header>
    <div class="draft-options" role="group" aria-label="Reward offers">${choices.map(({ reward, lines }) => {
      const chosen = reward.id === selected?.reward.id;
      return card(reward, lines, chosen) + (chosen ? inspect(reward, lines, player) : '');
    }).join('')}
    ${selected ? '' :
      `<div class="draft-review draft-prompt" id="draft-inspection"><p>Select a reward to inspect it before taking it.</p><button type="button" class="primary draft-confirm" disabled>Take reward ${glyph('right')}</button></div>`}</div>
  </div>`;
}
