import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actionVisual,fighterSpriteHTML,healthBand,impactScale,preloadArenaSkins,registerFighterSkin,resolveFighterSkin} from '../public/animation.js';
import {publicEvent} from '../src/game/recap.js';
import {applyCommand,botCommand,createMatch,replayMatch,viewMatch} from '../src/game/index.js';

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
  for(const [name,width,height] of [['arena-effects',1024,1280],['arena-projectiles',192,256]]) {
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

test('public cosmetics survive save, projection and replay without changing the seeded match',()=>{
  const players=[{id:'a',name:'Rune',classId:'guardian'},{id:'b',name:'Owl',classId:'alchemist'}];
  const classic={seed:'costume-replay',players};
  const dressed={...classic,players:players.map((p,i)=>({...p,skinId:i?'midnight-2':'fallen-order'}))};
  let base=createMatch(classic),alternate=createMatch(dressed);
  const commands=[];
  for(let i=0;i<10;i++){
    const command=botCommand(base);
    assert.deepEqual(command,botCommand(alternate));
    commands.push(command);
    base=applyCommand(base,base.activeId,command);
    alternate=applyCommand(alternate,alternate.activeId,command);
  }
  const restored=JSON.parse(JSON.stringify(alternate));
  assert.deepEqual(replayMatch(dressed,commands),restored);
  for(const viewer of ['a','b',null]) {
    assert.deepEqual(viewMatch(restored,viewer).players.map(p=>p.skinId),['fallen-order','midnight-2']);
  }
  for(const p of restored.players)delete p.skinId;
  assert.deepEqual(restored,base);
  assert.deepEqual(replayMatch(classic,commands),base);
  assert.equal(viewMatch(base,'a').players.every(p=>!Object.hasOwn(p,'skinId')),true);
});

test('malformed and excessive skin IDs fall back cleanly on roster input and old saved state',()=>{
  const players=[{id:'a',name:'Rune',classId:'guardian'},{id:'b',name:'Owl',classId:'alchemist'}];
  for(const skinId of [null,{},'../hidden.png','Mixed-Case','a--b','a-','z'.repeat(41)]) {
    const state=createMatch({seed:'cosmetics',players:[{...players[0],skinId},players[1]]});
    assert.equal(Object.hasOwn(state.players[0],'skinId'),false);
    state.players[0].skinId=skinId;
    const seat=viewMatch(state,'b').players[0];
    assert.equal(Object.hasOwn(seat,'skinId'),false);
    assert.match(fighterSpriteHTML(seat),/data-skin="founder"/);
    assert.throws(()=>registerFighterSkin('guardian',skinId,'/assets/skins/guardian-founder.png'));
  }
  const edge='a'.repeat(40);
  const seat=createMatch({seed:'cosmetics',players:[{...players[0],skinId:edge},players[1]]}).players[0];
  assert.equal(seat.skinId,edge);
  assert.equal(resolveFighterSkin(seat.classId,seat.skinId).id,'founder');
});

test('public impact causes describe visible outcomes without exposing private items',()=>{
  const base={id:1,type:'damage',round:1,text:'Poison dealt 2.'};
  assert.equal(publicEvent({...base,cause:'poison'}).cause,'poison');
  assert.deepEqual(publicEvent({...base,cause:'emergency-ward',hidden:'widows-brew'}),base);
  assert.deepEqual(publicEvent(base),base);
  assert.equal(publicEvent({...base,type:'reward',cause:'poison'}).cause,undefined);
});
