import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actionVisual,fighterSpriteHTML,healthBand,impactScale,preloadArenaSkins,registerFighterSkin,resolveFighterSkin} from '../public/animation.js';

test('every founder sheet has twelve poses in each of three damage bands',async()=>{
  for (const classId of ['guardian','berserker','chronomancer','alchemist']) {
    const {sheet}=resolveFighterSkin(classId);
    const image=await readFile(new URL('../public'+sheet,import.meta.url));
    assert.equal(image.toString('ascii',12,16),'IHDR');
    assert.equal(image.readUInt32BE(16),4*208);
    assert.equal(image.readUInt32BE(20),9*166);
    const html=fighterSpriteHTML({classId,id:'seat-1',hp:10,maxHp:10});
    assert.ok(html.includes('data-class="'+classId+'"'));
    assert.ok(html.includes(sheet));
  }
  for(const [name,width,height] of [['arena-effects',384,896],['arena-projectiles',192,32]]) {
    const image=await readFile(new URL('../public/assets/skins/'+name+'.png',import.meta.url));
    assert.deepEqual([image.readUInt32BE(16),image.readUInt32BE(20)],[width,height]);
  }
});
test('wear thresholds depend on health fraction and tolerate incomplete saved metadata',()=>{
  for(const [hp,band] of [[100,'healthy'],[66,'healthy'],[65,'wounded'],[31,'wounded'],[30,'critical'],[0,'critical']]) {
    assert.equal(healthBand({hp,maxHp:100}),band);
  }
  assert.equal(healthBand({}),'healthy');
  assert.equal(healthBand({alive:false}),'critical');
  assert.match(fighterSpriteHTML({alive:false,hp:15,maxHp:100}),/data-pose="fallen"/);
  assert.match(fighterSpriteHTML({id:'two',classId:'alchemist'},{reducedMotion:true}),/data-still/);
});
test('a new cosmetic can be selected independently per class and unknown selections fall back',async()=>{
  registerFighterSkin('guardian','test-order','/assets/skins/test-order.webp');
  const player={id:'<bad>',classId:'guardian',skinId:'test-order'};
  assert.match(fighterSpriteHTML(player),/test-order.webp/);
  assert.match(fighterSpriteHTML(player,{skinId:'missing'}),/guardian-founder.png/);
  assert.match(fighterSpriteHTML({...player,classId:'alchemist'}),/alchemist-founder.png/);
  assert.doesNotMatch(fighterSpriteHTML(player),/<bad>/);
  assert.throws(()=>registerFighterSkin('guardian','untrusted','/assets/skins/../secret.png'));
  assert.throws(()=>registerFighterSkin('missing','valid','/assets/skins/ok.png'));
  assert.deepEqual(await preloadArenaSkins([player]),[]);
});
test('abilities own their visual language when another class equips them, and heavy impacts grow within bounds',()=>{
  assert.deepEqual(actionVisual('venom-flask','guardian'),{motion:'cast',effect:'venom'});
  assert.deepEqual(actionVisual('attack','berserker'),{motion:'melee',effect:'cleave'});
  assert.deepEqual(actionVisual('defend','alchemist',true),{motion:'support',effect:'guard'});
  assert.deepEqual(actionVisual('interrupted','chronomancer'),{motion:'interrupted',effect:'cleave'});
  assert.ok(impactScale(85)>impactScale(10));
  assert.ok(impactScale(1e6)<2);
});
