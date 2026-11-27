import {test,expect} from '@playwright/test';
import {applyCommand,createMatch} from '../src/game/index.js';

const classes=['guardian','berserker','chronomancer','alchemist'];
async function arena(page,first='guardian') {
  const players=classes.map(classId=>({id:classId,classId,name:classId,bot:false}));
  let state;
  for(let seed=0;seed<100 && state?.activeId!==first;seed++) state=createMatch({seed:'animation-'+seed,players});
  state=applyCommand(state,first,{type:'pick',rewardId:state.offers[0]});
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
  {role:'guardian',action:'bastion-bash',other:'berserker',effect:'bastion',mobile:false},
  {role:'alchemist',action:'venom-flask',other:'guardian',effect:'venom',mobile:true},
]) {
  test(scenario.role+' performs a confirmed action and hits the selected rival in the live arena',async({page},info)=>{
    if(scenario.mobile) await page.setViewportSize({width:390,height:844});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await arena(page,scenario.role);
    const {role,other,action,effect}=scenario;
    await page.locator('[data-action="'+action+'"]').click();
    await page.locator('[data-aim="'+other+'"]').click();
    await page.evaluate(({role,other})=>{
      window.travel={effects:[],stages:[],ghost:[],projectile:[],landings:[]};
      const origin=document.querySelector('[data-seat="'+role+'"] .fighter-art').getBoundingClientRect();
      const dest=document.querySelector('[data-seat="'+other+'"] .fighter-art').getBoundingClientRect();
      const cx=r=>r.x+r.width/2;
      const trace=window.travel;
      trace.from=cx(origin);trace.to=cx(dest);
      const loop=()=>{
        const scene=document.querySelector('.arena-fx');
        if(scene) {
          trace.seen=true;
          trace.stages.push(scene.dataset.stage);
          trace.ghost.push(cx(scene.querySelector('.arena-fx-actor').getBoundingClientRect()));
          const projectile=scene.querySelector('.arena-fx-missile');
          if(projectile)trace.projectile.push(cx(projectile.getBoundingClientRect()));
          for(const burst of scene.querySelectorAll('.arena-fx-burst')) {
            trace.effects.push(burst.dataset.effect);
            trace.landings.push(cx(burst.getBoundingClientRect()));
          }
        } else if(trace.seen) {trace.done=true;return;}
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },{role,other});
    await page.locator('[data-execute="'+action+'"]').click();
    // This cel lasts 340ms; capture it on an animation frame before it resolves.
    await page.waitForFunction(effect=>document.querySelector('.arena-fx-burst[data-effect="'+effect+'"]')?.getBoundingClientRect().width>0,effect);
    await page.screenshot({path:info.outputPath('impact-'+role+'.png')});
    await page.waitForFunction(()=>window.travel.done===true);
    const track=await page.evaluate(()=>window.travel);
    expect(track.stages).toContain('windup');
    expect(track.stages).toContain('impact');
    expect(track.effects).toContain(effect);
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
