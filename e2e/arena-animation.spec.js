import {test,expect} from '@playwright/test';
import {CLASSES,applyCommand,createMatch} from '../src/game/index.js';
import {fileURLToPath} from 'node:url';

const classes=['guardian','berserker','chronomancer','alchemist'];
async function arena(page,first='guardian',woundOnHit) {
  const players=classes.map(classId=>({id:classId,classId,name:classId,bot:false}));
  let state;
  for(let seed=0;seed<100 && state?.activeId!==first;seed++) state=createMatch({seed:'animation-'+seed,players});
  state=applyCommand(state,first,{type:'pick',rewardId:state.offers[0]});
  if (woundOnHit) {
    const defender=state.players.find(player=>player.id===woundOnHit);
    defender.hp=Math.floor(defender.maxHp*.65)+1;
  }
  await page.addInitScript(saved=>sessionStorage.setItem('rift-solo',JSON.stringify(saved)),{state,viewerId:first});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'The Shattered Ring'})).toBeVisible();
  expect(await page.evaluate(async players=>(await (await import('/animation.js')).preloadArenaSkins(players)).every(Boolean),players)).toBe(true);
}

test('all founder sheets contain four unique idle cels and physically different damaged silhouettes',async({page})=>{
  await arena(page);
  const records=await page.evaluate(async classIds=>{
    const {resolveFighterSkin}=await import('/animation.js');
    const canvas=document.createElement('canvas');
    canvas.width=208; canvas.height=166;
    const g=canvas.getContext('2d',{willReadFrequently:true});
    const results=[];
    for(const id of classIds) {
      const image=new Image();image.src=resolveFighterSkin(id).sheet;await image.decode();
      const masks=[],signatures=new Set();
      for(let tier=0;tier<3;tier++) {
        for(let pose=0;pose<12;pose++){
          g.clearRect(0,0,208,166);
          g.drawImage(image,208*(pose%4),166*(tier*3+Math.floor(pose/4)),208,166,0,0,208,166);
          const pixels=g.getImageData(0,0,208,166).data;
          let signature=2166136261, clipped=false;
          const mask=[];
          for(let i=0;i<pixels.length;i+=4) {
            const opacity=pixels[i+3];
            mask.push(opacity>=128);
            if(!opacity)continue;
            signature=Math.imul(signature^pixels[i]^pixels[i+2]^(i/4),16777619)>>>0;
            const x=(i/4)%208,y=Math.floor(i/4/208);
            if(opacity>=128 && (x===0||x===207||y===0||y===165))clipped=true;
          }
          if(clipped) throw Error(id+' touches sheet edge in frame '+pose);
          signatures.add(signature);
          if(pose===0)masks.push(mask);
        }
      }
      results.push({id,frames:signatures.size,
        worn:masks[0].filter((v,i)=>v!==masks[1][i]).length,
        broken:masks[0].filter((v,i)=>v!==masks[2][i]).length});
    }
    return results;
  },classes);
  for(const role of records) {
    expect(role.frames,role.id).toBe(36);
    expect(role.worn,role.id).toBeGreaterThan(35);
    expect(role.broken,role.id).toBeGreaterThan(role.worn);
  }
});

for(const scenario of [
  {role:'guardian',action:'bastion-bash',other:'berserker',effect:'bastion',viewport:{width:1440,height:900}},
  {role:'alchemist',action:'venom-flask',other:'guardian',effect:'venom',viewport:{width:1280,height:720}},
]) {
  test(scenario.role+' performs a confirmed action and hits the selected rival in the live arena',async({page},info)=>{
    await page.setViewportSize(scenario.viewport);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await arena(page,scenario.role,scenario.other);
    const {role,other,action,effect}=scenario;
    await page.locator('[data-action="'+action+'"]').click();
    await page.locator('[data-aim="'+other+'"]').click();
    await page.evaluate(({role,other,action,effect})=>{
      const seat=id=>document.querySelector('[data-seat="'+id+'"]');
      const center=element=>{
        const rect=element.getBoundingClientRect();
        return rect.left+rect.width/2;
      };
      const readHp=()=>Number.parseInt(seat(other).querySelector('.fighter-hp').textContent,10);
      const trace=window.travel={
        from:center(seat(role).querySelector('.fighter-art')),to:center(seat(other).querySelector('.fighter-art')),
        beforeHp:readHp(),confirmClicks:0,seen:false,done:false,
        stages:[],ghost:[],projectile:[],landings:[],windupHp:[],impactHp:[],impactBands:[],
      };
      const button=document.querySelector('[data-execute="'+action+'"]');
      button.addEventListener('click',()=>{trace.confirmClicks++;},{capture:true});
      function sample() {
        const scene=document.querySelector('.arena-fx[data-action="'+action+'"]');
        if(!scene) {
          if(trace.seen) {
            trace.done=true;
            observer.disconnect();
            cancelAnimationFrame(frame);
          }
          return;
        }
        trace.seen=true;
        trace.stages.push(scene.dataset.stage);
        if(scene.dataset.stage==='windup')trace.windupHp.push(readHp());
        if(scene.dataset.stage==='impact') {
          trace.impactHp.push(readHp());
          trace.impactBands.push(seat(other).querySelector('.arena-sprite').dataset.tier);
        }
        const actor=scene.querySelector('.arena-fx-actor'),missile=scene.querySelector('.arena-fx-missile');
        if(actor)trace.ghost.push(center(actor));
        if(missile)trace.projectile.push(center(missile));
        for(const burst of scene.querySelectorAll('.arena-fx-burst[data-effect="'+effect+'"]')) {
          if(burst.getBoundingClientRect().width>0)trace.landings.push(center(burst));
        }
      }
      // DOM updates capture short-lived cels and health changes even if the
      // automation driver is busy returning from click. Frames measure travel
      // between those discrete updates on the actual rendered elements.
      const observer=new MutationObserver(sample);
      observer.observe(document.querySelector('.battle-shell'),{subtree:true,childList:true,attributes:true,
        attributeFilter:['data-stage','data-tier','data-pose']});
      let frame=requestAnimationFrame(function tick(){
        sample();
        if(!trace.done)frame=requestAnimationFrame(tick);
      });
    },{role,other,action,effect});
    let track;
    try {
      await page.locator('[data-execute="'+action+'"]').click();
      // Completion is latched. The driver can arrive after the entire animation.
      await expect.poll(()=>page.evaluate(()=>window.travel.done),{timeout:10000}).toBe(true);
    } finally {
      track=await page.evaluate(()=>window.travel);
      await info.attach('arena-motion-evidence',{body:JSON.stringify(track),contentType:'application/json'});
    }
    expect(track.confirmClicks).toBe(1);
    expect(track.stages).toContain('windup');
    expect(track.stages).toContain('impact');
    expect(track.landings.length,'visible '+effect+' contact samples').toBeGreaterThan(0);
    expect([...new Set(track.windupHp)]).toEqual([track.beforeHp]);
    expect(Math.min(...track.impactHp)).toBeLessThan(track.beforeHp);
    expect(track.impactBands).toContain('wounded');
    const xs=action==='venom-flask'?track.projectile:track.ghost;
    const span=Math.max(...xs)-Math.min(...xs);
    expect(span).toBeGreaterThan(Math.abs(track.to-track.from)*.45);
    expect(Math.min(...track.landings.map(x=>Math.abs(x-track.to)))).toBeLessThan(3);
    await expect(page.locator('[data-playing="hidden"]')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('ordered reactions, cancellation and reduced motion leave connected seats in their original poses',async({page})=>{
  await arena(page);
  const result=await page.evaluate(async()=>{
    const {playArenaAction,fighterSpriteHTML,registerFighterSkin}=await import('/animation.js');
    registerFighterSkin('guardian','festival','/assets/skins/guardian-founder.png');
    const world=document.querySelector('.arena-world'),original=world.querySelector('[data-seat="guardian"] .fighter-art');
    original.innerHTML=fighterSpriteHTML({id:'skin-test',classId:'guardian',skinId:'festival',hp:25,maxHp:100});
    const fighter=original.querySelector('.arena-sprite');
    const before=fighter.dataset.pose;
    const scene={id:187,actionId:'blood-cleave',actorId:'berserker',targetId:'guardian',events:[
      {id:1,type:'damage',targetId:'guardian',amount:25,healthDamage:20,shieldDamage:5,shieldBroken:true},
      {id:2,type:'revival',targetId:'guardian',amount:25},
      {id:3,type:'shield',targetId:'guardian',amount:18},
      {id:4,type:'heal',targetId:'berserker',amount:3},
    ]};
    const first=playArenaAction(world,scene,{speed:.5});
    const observed=[];
    const reduced=playArenaAction(world,scene,{speed:1.5,reducedMotion:true,onImpact:event=>{
      observed.push([event.id,world.querySelectorAll('.arena-fx-burst')[world.querySelectorAll('.arena-fx-burst').length-1].dataset.effect]);
    }});
    await first.finished;
    const motion=world.querySelector('.arena-fx').dataset.motion;
    const moving=world.querySelector('.arena-fx-actor').getAnimations().length;
    await reduced.finished;
    const roundtrip=playArenaAction(world,scene);
    roundtrip.cancel();roundtrip.cancel();await roundtrip.finished;
    return {observed,motion,moving,before,after:fighter.dataset.pose,band:fighter.dataset.tier,skin:fighter.dataset.skin,
      stranded:world.querySelectorAll('.arena-fx,[data-playing="hidden"]').length};
  });
  expect(result).toEqual({observed:[[1,'fracture'],[2,'revival'],[3,'guard'],[4,'heal']],
    motion:'reduced',moving:0,before:'idle',after:'idle',band:'critical',skin:'festival',stranded:0});
});

test('the restored battle renders another seat’s registered cosmetic and falls back for an uninstalled one',async({page})=>{
  const role={...CLASSES.guardian,id:'fencer',name:'Fencer',ability:'hollow-needle'};
  CLASSES[role.id]=role;
  let state;
  try {
    state=createMatch({seed:'costume-roster',players:[
      {id:'rival',name:'Rune',classId:'fencer',skinId:'festival-2'},
      {id:'me',name:'Owl',classId:'alchemist',skinId:'future-edition'},
    ]});
  } finally { delete CLASSES[role.id]; }
  // Artists extend the public catalog and manifest. Render the restored state
  // through the same startup, roster projection and skin lookup as a match.
  await page.route('**/src/game/catalog.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())+'\nCLASSES.fencer='+JSON.stringify(role)+';'});
  });
  await page.route('**/fighter-kit.json',async route=>{
    const response=await route.fetch();
    const layout=await response.json();
    layout.founders.fencer={weapon:'dagger',emblem:'sword',title:'Duelist',layers:[],anchors:{hand:[111,72],critical:{ground:[151,146]}}};
    layout.skins.push({classId:'fencer',id:'festival-2',sheet:'/assets/skins/test-festival.png',
      portrait:'/assets/skins/festival-head.webp',model:'/assets/skins/festival-full.png',anchors:{critical:{mouth:[110,63]}}});
    await route.fulfill({response,json:layout});
  });
  await page.route('**/assets/skins/test-festival.png',route=>route.fulfill({
    path:fileURLToPath(new URL('../public/assets/skins/guardian-founder.png',import.meta.url)),contentType:'image/png',
  }));
  await page.route('**/assets/skins/festival-head.webp',route=>route.fulfill({
    path:fileURLToPath(new URL('../public/assets/portrait-guardian.webp',import.meta.url)),contentType:'image/webp',
  }));
  await page.route('**/assets/skins/festival-full.png',route=>route.fulfill({
    path:fileURLToPath(new URL('../public/assets/guardian.png',import.meta.url)),contentType:'image/png',
  }));
  await page.addInitScript(saved=>{
    if (!sessionStorage.getItem('rift-solo')) sessionStorage.setItem('rift-solo',JSON.stringify(saved));
  },{state,viewerId:'me'});
  const fetched=page.waitForResponse(response=>response.url().endsWith('/assets/skins/test-festival.png') && response.ok());
  await page.goto('/');
  await fetched;
  const rival=page.locator('[data-seat="rival"] .arena-sprite');
  await expect(rival).toHaveAttribute('data-skin','festival-2');
  await expect(rival).toHaveAttribute('data-class','fencer');
  const score=await page.evaluate(async()=>{
    const {motionScore,actorClip}=await import('/combat-motion.js');
    const {fighterAnchors,resolveFighterSkin}=await import('/fighter-kit.js');
    const hit=motionScore('hollow-needle','fencer');
    return [motionScore('attack','fencer').track,actorClip(hit,'hollow-needle','fencer'),
      fighterAnchors('fencer','critical',resolveFighterSkin('fencer','festival-2').anchors)];
  });
  expect(score).toEqual(['needle','signature',{hand:[111,72],mouth:[110,63],ground:[151,146]}]);
  await expect(rival.locator('.arena-cel')).toHaveCSS('background-image',/test-festival\.png/);
  await expect(page.locator('[data-seat="me"] .arena-sprite')).toHaveAttribute('data-skin','founder');
  const railButton=page.locator('.turn-rail [data-inspect="rival"]');
  await expect(railButton.locator('img')).toHaveAttribute('src','/assets/skins/festival-head.webp');
  await railButton.click();
  await expect(page.locator('.inspect-top img')).toHaveAttribute('src','/assets/skins/festival-full.png');
  const visibleIds=await page.evaluate(async()=>{
    const {viewMatch}=await import('/src/game/index.js');
    const {state,viewerId}=JSON.parse(sessionStorage.getItem('rift-solo'));
    return viewMatch(state,viewerId).players.map(p=>p.skinId);
  });
  expect(visibleIds).toEqual(['festival-2','future-edition']);
  await page.reload();
  await expect(rival).toHaveAttribute('data-skin','festival-2');
});
