import { CLASSES } from './catalog.js';
import { currentAttack, fittingCount, highCardReady, rawHit, receivedHealing } from './combat.js';
import { rewardInMatch } from './rules-edition.js';

// All inputs here are on the spectator projection. A rival can inspect the
// same line without learning which consumables or pending draft they hold.
export function talentState(view,p) {
  if (!view || !p.alive || view.phase === 'finished') return '';
  const signature=CLASSES[p.classId].ability;
  const slot=p.abilities.find(a => a.id === signature);
  switch (p.classId) {
    case 'guardian': {
      if (!slot) return '';
      const hit=rewardInMatch(view,signature).effects[0];
      return 'Bastion Bash deals ' + rawHit(p,{statuses:{}},hit,slot) + ' damage before defenses.';
    }
    case 'berserker': {
      const bonus=currentAttack(p)-p.attack;
      const next=Math.floor(p.maxHp*(9-bonus)/10);
      return 'Bloodrush adds ' + bonus + ' attack' + (next ? ' · next increase at ' + next + ' health.' : '.');
    }
    case 'chronomancer': {
      if (view.activeId === p.id && p.personalTurn % 5 === 0) return 'Second Hand is active this turn.';
      return 'Next bonus action on personal turn ' + (p.personalTurn + 5 - p.personalTurn % 5) + '.';
    }
    case 'alchemist': {
      const count=p.consumableCount;
      if (count === undefined) return '';
      if (!count) return 'Distillation is waiting for a consumable.';
      return count + (count === 1 ? ' carried consumable can' : ' carried consumables can') + ' trigger Distillation.';
    }
    case 'gambler': {
      const charge='Next bonus reroll on personal turn ' + (p.personalTurn + 4 - p.personalTurn % 4) + '.';
      if (!slot) return charge;
      const odds=view.activeId === p.id && highCardReady(p) ? 'High card loaded. ' : 'Even odds on the card draw. ';
      return odds + charge;
    }
    case 'necromancer':
      if (p.lastRitesTurn === p.personalTurn) return 'Curse healing returns on personal turn ' + (p.personalTurn + 1) + '.';
      return 'Last Rites is ready to heal up to ' + receivedHealing(p,5) + ' health.';
    case 'trickster':
      if (p.falseGuardTurn === p.personalTurn) return 'False Guard returns on personal turn ' + (p.personalTurn + 1) + '.';
      return p.shield ? 'False Guard is ready for the next direct hit against this shield.' : 'Gain shield to bring False Guard into play.';
    case 'artificer': {
      const count=fittingCount(p);
      if (!slot) return count + (count === 1 ? ' fitting equipped.' : ' fittings equipped.');
      const hit=rewardInMatch(view,signature).effects[0];
      const used=Math.min(hit.maxFittings,count);
      return 'Rivet Drive uses ' + used + '/' + hit.maxFittings + ' fittings · +' + used * hit.fittingBonus + ' damage before runes.';
    }
    default: return '';
  }
}
