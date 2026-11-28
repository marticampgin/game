import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { SHOP, newProfile } from '../src/game/progression.js';
import { createRooms } from '../server/rooms.js';
import { createArenaServer } from '../server/index.js';
import { applyCommand, botCommand } from '../src/game/index.js';
import { isDraftUnlocked } from '../src/game/progression.js';

const roster=()=>[{id:'p1',name:'Moss',classId:'guardian',bot:false},{id:'p2',name:'Cinder',classId:'alchemist',bot:true}];
async function launch(directory) {
  const server=createArenaServer({profileDirectory:directory,botDelay:5});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  return {close:()=>new Promise(resolve=>server.close(resolve)), async send(path,key,input,token) {
    const res=await fetch('http://127.0.0.1:'+server.address().port+'/api/'+path,{
      method:input===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',...(key?{'X-Rift-Profile':key}:{}),...(token?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify(input),
    });
    const data=await res.json();
    return {status:res.status,data};
  }};
}
test('verified solo histories survive server restarts, retries and competing purchases', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'rift-test-profile-')), key=randomBytes(32).toString('hex'), other=randomBytes(32).toString('hex');
  let api=await launch(dir);
  t.after(async()=>{await api.close();rmSync(dir,{recursive:true,force:true});});
  assert.equal((await api.send('profile',key)).data.coins,0);
  assert.equal((await api.send('profile',null)).status,401);
  const before=await api.send('profile/buy',key,{itemId:'echo-rune',coins:9999});
  assert.equal(before.status,400);
  const init=await api.send('profile/solo',key,{seed:'field',players:roster()});
  assert.equal(init.status,201);
  let state=init.data.state;
  const url='profile/solo/'+state.career.runId;
  const stream=[];
  while(state.phase!=='finished') {
    const cmd=botCommand(state);
    stream.push(cmd);
    state=applyCommand(state,state.activeId,cmd);
    assert.ok(stream.length<1500);
  }
  assert.equal((await api.send(url,other,{from:0,commands:stream.slice(0,1)})).status,404);
  assert.equal((await api.send(url,key,{from:10,commands:stream.slice(10,11)})).status,409);
  let profile;
  for(let i=0;i<stream.length;i+=20) {
    const data={from:i,commands:stream.slice(i,i+20)};
    const [first,second]=await Promise.all([api.send(url,key,data),api.send(url,key,data)]);
    assert.equal(first.status,200,JSON.stringify(first.data));
    assert.deepEqual(first,second);
    profile=second.data.profile;
    if (!i) { await api.close(); api=await launch(dir); }
  }
  assert.equal(profile.totals.damage,state.career.seats.p1.metrics.damage);
  assert.equal(profile.classes.guardian.matches,1);
  assert.equal(profile.claimed.includes('first-steps'),true);
  assert.deepEqual((await api.send('profile',key)).data,profile);
  const forged={from:0,commands:[{type:'act',actionId:'defend'}]};
  assert.equal((await api.send(url,key,forged)).status,409);
  assert.deepEqual((await api.send('profile',key)).data,profile);

  // The assigned objectives vary with each real server ticket. Play until a
  // purchase is affordable, including the guaranteed cumulative damage bounty.
  for(let n=0;n<20 && profile.coins<65;n++) {
    const init2=await api.send('profile/solo',key,{seed:'field'+n,players:roster()});
    let two=init2.data.state, sequence=[];
    while(two.phase!=='finished') { const c=botCommand(two); sequence.push(c); two=applyCommand(two,two.activeId,c); }
    const url2='profile/solo/'+two.career.runId;
    for(let i=0;i<sequence.length;i+=40) profile=(await api.send(url2,key,{from:i,commands:sequence.slice(i,i+40)})).data.profile;
  }
  assert.ok(profile.coins>=65);
  const repeated=await Promise.all([api.send('profile/buy',key,{itemId:'glass-orchard'}),api.send('profile/buy',key,{itemId:'glass-orchard'})]);
  assert.deepEqual(repeated[0],repeated[1]);
  assert.equal(repeated[0].data.coins,profile.coins-65);
  assert.deepEqual((await api.send('profile',other)).data.unlocks,[]);
  const third=await api.send('profile/solo',key,{seed:'field3',players:roster()});
  assert.deepEqual(third.data.state.career.seats.p1.unlocks,['glass-orchard']);

  let validation=third.data.state, ledger=[];
  while(validation.activeId==='p1') {
    const c=botCommand(validation); ledger.push(c); validation=applyCommand(validation,'p1',c);
  }
  const desired=botCommand(validation);
  const wrong=validation.offers.find(id=>id!==desired.rewardId);
  assert.equal((await api.send('profile/solo/'+validation.career.runId,key,{from:0,commands:[...ledger,{type:'pick',rewardId:wrong}]})).status,400);
});

test('authenticated rooms privately project each participant’s objectives and wallet', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'rift-test-room-career-'));
  const api=await launch(dir);t.after(async()=>{await api.close();rmSync(dir,{recursive:true,force:true});});
  const a=randomBytes(32).toString('hex'), b=randomBytes(32).toString('hex');
  const made=await api.send('rooms',a,{capacity:2,fillBots:false,name:'Flint',classId:'guardian'}), host=made.data;
  assert.equal(made.status,201);
  const path='rooms/'+host.code;
  assert.equal((await api.send(path+'/join',a,{name:'Flint',classId:'guardian'})).status,409);
  const guest=(await api.send(path+'/join',b,{name:'Fern',classId:'alchemist'})).data;
  assert.ok([400,403].includes((await api.send(path+'/class',a,{classId:'guardian',skinId:'sunspire-paladin'},host.token)).status));
  let view=(await api.send(path+'/start',a,{},host.token)).data;
  const peers=[{...host,key:a},{...guest,key:b}];
  let actor=peers.find(s=>s.playerId===view.game.activeId);
  view=(await api.send(path,actor.key,undefined,actor.token)).data;
  assert.ok(view.game.offers.every(id=>isDraftUnlocked(id,[])));
  const before=(await api.send(path,undefined,undefined,peers.find(p=>p!==actor).token)).data;
  assert.deepEqual(before.game.offers,[]);
  assert.notDeepEqual(before.game.career.objectives,view.game.career.objectives);
  assert.ok(!JSON.stringify(view).includes(actor.key));
  assert.ok(view.game.players.every(p=>!Object.hasOwn(p,'metrics')));
  view=(await api.send(path+'/command',actor.key,{revision:view.revision,command:{type:'pick',rewardId:view.game.offers[0]}},actor.token)).data;
  assert.equal(view.game.career.metrics.drafts,1);
  const target=peers.find(s=>s!==actor).playerId;
  view=(await api.send(path+'/command',actor.key,{revision:view.revision,command:{type:'act',actionId:'attack',targetId:target}},actor.token)).data;
  assert.ok(view.profile.totals.damage>0);
  const peer=(await api.send(path,undefined,undefined,peers.find(p=>p!==actor).token)).data;
  assert.equal(peer.profile.totals.damage,0);
  assert.deepEqual((await api.send('profile',actor.key)).data,view.profile);
});

test('an eight-seat room freezes a departing profile before its bot takes over', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'rift-test-takeover-'));
  const api=await launch(dir);
  t.after(async()=>{await api.close();rmSync(dir,{recursive:true,force:true});});
  const a=randomBytes(32).toString('hex'), b=randomBytes(32).toString('hex');
  const host=(await api.send('rooms',a,{capacity:8,fillBots:true,name:'Flint',classId:'guardian'})).data;
  const path='rooms/'+host.code;
  assert.equal((await api.send(path+'/join',a,{name:'Twin',classId:'guardian'})).status,409);
  const guest=(await api.send(path+'/join',b,{name:'Fern',classId:'alchemist'})).data;
  const started=(await api.send(path+'/start',a,{},host.token)).data;
  assert.equal(started.game.players.length,8);
  assert.equal((await api.send(path+'/leave',a,{},host.token)).status,200);
  const cutoff=(await api.send('profile',a)).data;
  const deadline=Date.now()+10000;
  let automatedTurn=false;
  while(Date.now()<deadline && !automatedTurn) {
    const view=(await api.send(path,b,undefined,guest.token)).data;
    automatedTurn=view.game.recentActions.some(action=>action.actorId===host.playerId);
    if (view.game.activeId===guest.playerId && view.game.phase!=='finished') {
      const target=view.game.players.find(p=>p.id!==guest.playerId && p.alive);
      const command=view.game.phase==='acquire' ? {type:'pick',rewardId:view.game.offers[0],replaceIndex:0} :
        {type:'act',actionId:'attack',targetId:target.id};
      await api.send(path+'/command',b,{revision:view.revision,command},guest.token);
    }
    if (!automatedTurn) await new Promise(resolve=>setTimeout(resolve,5));
  }
  assert.equal(automatedTurn,true);
  assert.deepEqual((await api.send('profile',a)).data,cutoff);
  assert.equal((await api.send(path,a,undefined,host.token)).status,401);
});

test('random assignments and three-class drafts wear the owned outfit equipped for the assigned class', () => {
  const profile = newProfile();
  for (const item of SHOP.filter(entry => entry.kind === 'skin' && !entry.mastery)) {
    profile.unlocks.push(item.id);
    profile.equipped[item.classId] = item.skinId;
  }
  const rooms = createRooms({profiles:{view:() => profile}});
  try {
    for (const mode of ['random','draft']) {
      const room = rooms.create({name:'Moss',mode},'test-profile');
      const seat = room.room.seats[0];
      assert.equal(seat.skinId, profile.equipped[seat.classId]);
      const reset = rooms.interact(room.code,room.token,'class',{classId:seat.classId,skinId:'founder'});
      assert.equal(reset.room.seats[0].skinId,undefined);
      if (mode === 'draft') {
        const next = room.room.draft.find(id => id !== seat.classId);
        assert.equal(rooms.interact(room.code,room.token,'class',{classId:next}).room.seats[0].skinId,profile.equipped[next]);
      }
    }
  } finally { rooms.close(); }
});

test('every shop outfit requires ownership at each room wardrobe entry point', () => {
  const profile = newProfile();
  const rooms = createRooms({profiles:{view:() => profile}});
  try {
    const host = rooms.create({name:'Moss',classId:'guardian'},'host');
    for (const {classId, skinId} of SHOP.filter(item => item.kind === 'skin')) {
      const choice = {name:'Flint',classId,skinId};
      for (const wear of [
        () => rooms.create(choice,'guest'),
        () => rooms.join(host.code,choice,'guest'),
        () => rooms.interact(host.code,host.token,'class',choice),
      ]) {
        assert.throws(wear, error => error.status === 403, classId + '/' + skinId);
      }
    }
    const seats = rooms.interact(host.code,host.token,'view',{}).room.seats;
    assert.deepEqual(seats.map(seat => [seat.classId, seat.skinId]), [['guardian', undefined]]);
  } finally { rooms.close(); }
});
