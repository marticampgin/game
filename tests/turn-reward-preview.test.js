import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,CLASSES,createMatch,eligible,previewAction,previewReward,REWARDS,viewMatch} from '../src/game/index.js';
import {grantReward} from '../src/game/combat.js';

function draft(classId='guardian',config={}) {
  return createMatch({seed:'preview',config,players:['one','two'].map(id=>({id,name:id,classId}))});
}
const hero=s=>s.players.find(p=>p.id===s.activeId);
function preview(s,id,replaceIndex) {
  s.offers=[id,'heartwood','red-tonic'];
  const view=viewMatch(s,s.activeId);
  return previewReward(view,s.activeId,id,replaceIndex);
}
const pick=(s,id,replaceIndex)=>applyCommand(s,s.activeId,{type:'pick',rewardId:id,replaceIndex});

test('Guardian shard preview uses actual class gains, equipped modifiers, mitigation-independent damage and Defend rounding',()=>{
  const s=draft(), p=hero(s);
  grantReward(s,p,'amplify');
  const rival=s.players.find(x=>x!==p);rival.armor=0;
  const before=previewAction(viewMatch(s,p.id),p.id,'bastion-bash',rival.id).damage;
  const result=preview(s,'iron-shard');
  const next=pick(s,'iron-shard');
  const after=previewAction(viewMatch(next,p.id),p.id,'bastion-bash',rival.id).damage;
  assert.deepEqual(result.lines,['Armor 8 → 13 (+5)','Bastion Bash '+before+' → '+after+' base damage','Defend 10 → 12 shield']);
  assert.equal(hero(next).armor,13);
  assert.equal(result.text,result.lines.join(' · '));
  const nonGuardian=draft('berserker');
  assert.match(preview(nonGuardian,'iron-shard').text,/Armor 4 → 8 \(\+4\)/);
});

test('shard consequences reflect Curse, missing health, spell scaling and healing equipment',()=>{
  const s=draft('chronomancer'),p=hero(s);
  p.hp=30;p.statuses.curse=3;
  const health=preview(s,'heartwood');
  assert.ok(health.lines.includes('Health 30 → 35'));
  assert.equal(hero(pick(s,'heartwood')).hp,35);
  grantReward(s,p,'menders-bell');
  const spell=preview(s,'astral-shard');
  assert.ok(spell.lines.includes('Time Bolt 14 → 16 base damage'));
  assert.ok(spell.lines.includes('Mender’s Bell 7 → 8 healing before the health cap'));
  const b=draft('berserker');hero(b).hp=48;
  assert.match(preview(b,'fang-shard').text,/Basic Attack 18 → 20 base damage/);
});

test('modifier previews identify the actual first compatible slot, its cooldown and delayed echo',()=>{
  const s=draft(),p=hero(s);
  grantReward(s,p,'cinder-orb');
  grantReward(s,p,'amplify');
  assert.deepEqual(preview(s,'amplify').lines,['Applies to Cinder Orb','Cinder Orb 9 → 13 base damage']);
  const haste=preview(s,'accelerate');
  assert.match(haste.text,/Applies to Bastion Bash.*Cooldown 2 → 1 personal turn.*13 → 11 base damage/);
  const next=pick(s,'accelerate');
  assert.ok(hero(next).abilities[0].modifiers.includes('accelerate'));
  const echo=preview(next,'echo-rune');
  // Already in action phase, even a supplied offer cannot expose a preview.
  assert.deepEqual(echo.lines,[]);
  const isolated=draft();
  assert.match(preview(isolated,'echo-rune').text,/Bastion Bash.*4 base damage as an echo/);
});

test('slot and replacement previews respect private inventory, capacity-changing artifacts, and fresh ability cooldowns',()=>{
  const s=draft('guardian',{abilitySlots:1, consumableSlots:1}),p=hero(s);
  grantReward(s,p,'red-tonic');
  assert.match(preview(s,'cinder-orb').text,/Equipment slots full.*ready immediately.*cooldown 2/);
  assert.match(preview(s,'cinder-orb',0).text,/Replaces Bastion Bash in slot 1/);
  assert.match(preview(s,'second-breath',0).text,/Replaces Red Tonic in slot 1.*automatic reaction/);
  assert.equal(preview(s,'vial-sash').text,'Consumable capacity 1 → 2');
  grantReward(s,p,'vial-sash');
  assert.match(preview(s,'second-breath').text,/Consumable slots 1\/2 → 2\/2/);
});

test('artifact hints require an actual compatible action or the correct owner of a status',()=>{
  const s=draft(),p=hero(s);
  assert.equal(preview(s,'molten-mail').text,'Bastion Bash will apply 2 Burn');
  grantReward(s,p,'phoenix-feather');
  assert.equal(preview(s,'molten-mail').text,'Bastion Bash will apply 4 Burn');
  assert.match(preview(s,'stillwater-ring').text,/Defend adds 2 permanent armor/);
  assert.match(preview(s,'golden-shell').text,/0% rarity promotion/);
  p.armor=60;
  assert.match(preview(s,'golden-shell').text,/15% rarity promotion/);
  const alchemist=draft('alchemist'),a=hero(alchemist);
  assert.doesNotMatch(preview(alchemist,'quicksilver-lung').text,/Venom Flask/);
  grantReward(alchemist,a,'widows-brew');
  assert.match(preview(alchemist,'quicksilver-lung').text,/Widow’s Brew applies Poison to you/);
});

test('every eligible reward previews without reading hidden rival data, drawing randomness or mutating the view',()=>{
  const checked=new Set();
  for(const classId of Object.keys(CLASSES)) {
    const s=draft(classId),p=hero(s);
    // Replacing a class-bound starting technique makes it eligible to be
    // offered back to its owner. Keep a damaging slot for rune forecasts.
    if (REWARDS[CLASSES[classId].ability].exclusive) p.abilities=[{id:'time-bolt',cooldown:0,modifiers:[]}];
    for(const reward of Object.values(REWARDS)) {
      if(!eligible(p,reward))continue;
      s.offers=[reward.id];
      const projected=viewMatch(s,p.id);
      const before=JSON.stringify(projected);
      const rng=s.rng;
      const privateView={...projected,players:projected.players.map(player=>player.id===p.id?player:{id:player.id})};
      const result=previewReward(projected,p.id,reward.id);
      assert.ok(result.lines.length,reward.id);
      assert.deepEqual(result,previewReward(privateView,p.id,reward.id));
      assert.equal(JSON.stringify(projected),before);assert.equal(s.rng,rng);
      assert.deepEqual(previewReward(viewMatch(s,null),p.id,reward.id).lines,[]);
      const other=s.players.find(candidate=>candidate.id!==p.id);
      assert.deepEqual(previewReward(viewMatch(s,other.id),other.id,reward.id).lines,[]);
      assert.deepEqual(previewReward(projected,p.id,'not-an-offer').lines,[]);
      checked.add(reward.id);
    }
  }
  assert.equal(checked.size,Object.keys(REWARDS).length);
});
