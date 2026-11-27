import { isSkinId } from '../src/game/skin-id.js';

// Sheets face right. Each of the three health bands repeats the same twelve
// poses in four columns. A cosmetic can replace the artwork without touching rules.
const roles = ['guardian','berserker','chronomancer','alchemist'];
const skins = new Map();
export function registerFighterSkin(classId, id, sheet) {
  if (!roles.includes(classId) || !isSkinId(id) ||
      !/^\/assets\/skins\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(png|webp)$/.test(sheet)) {
    throw new Error('A skin needs a known class, a simple ID and a local skin sheet.');
  }
  skins.set(classId+'/'+id,Object.freeze({classId,id,sheet}));
}
for (const role of roles) registerFighterSkin(role,'founder','/assets/skins/'+role+'-founder.png');

export function resolveFighterSkin(classId,skinId='founder') {
  const role=roles.includes(classId) ? classId : 'guardian';
  return skins.get(role+'/'+skinId) ?? skins.get(role+'/founder');
}
export function healthBand(player) {
  if (player.alive === false) return 'critical';
  if (!Number.isFinite(player.hp) || !(player.maxHp>0)) return 'healthy';
  const fraction=player.hp/player.maxHp;
  return fraction<=.3 ? 'critical' : fraction<=.65 ? 'wounded' : 'healthy';
}
const poses=['idle','breathe','survey','settle','windup','strike','channel','release','guard','hurt','fallen','victory'];
function pose(element,name) {
  const index=poses.indexOf(name);
  element.dataset.pose=name;
  element.style.setProperty('--pose-x',(index%4 / 3 * 100)+'%');
  element.style.setProperty('--pose-y',(Math.floor(index/4)*12.5)+'%');
}
export function fighterSpriteHTML(player,{skinId=player.skinId,reducedMotion=false}={}) {
  const skin=resolveFighterSkin(player.classId,skinId);
  const band=healthBand(player);
  const fallen=player.alive===false || player.hp===0;
  const seed=Array.from(String(player.id??skin.classId)).reduce((n,c)=>(31*n+c.charCodeAt(0))>>>0,0);
  const style='--skin:url('+skin.sheet+');--idle-delay:-'+(seed%3300)+'ms;'+
    '--pose-x:'+(fallen?'66.666667%':'0%')+';--pose-y:'+(fallen?'25%':'0%');
  return '<span aria-hidden="true" class="arena-sprite" data-class="'+skin.classId+'" data-skin="'+skin.id+
    '" data-tier="'+band+'" data-pose="'+(fallen?'fallen':'idle')+'"'+(reducedMotion?' data-still':'')+
    ' style="'+style+'"><span class="arena-cel"></span></span>';
}
const fxSheet='/assets/skins/arena-effects.png';
const missileSheet='/assets/skins/arena-projectiles.png';
const images=new Map();
export function preloadArenaSkins(players=[]) {
  if (typeof Image==='undefined') return Promise.resolve([]);
  const urls=new Set([fxSheet,missileSheet,...players.map(p=>resolveFighterSkin(p.classId,p.skinId).sheet)]);
  return Promise.all(Array.from(urls,url=>{
    if (!images.has(url)) {
      const image=new Image();
      images.set(url,new Promise(resolve=>{
        image.onload=()=>resolve(true);
        image.onerror=()=>{images.delete(url);resolve(false);};
        image.src=url;
      }));
    }
    return images.get(url);
  }));
}

const effectRows=['slash','cleave','bastion','arcane','venom','fire','frost','doom','heal','guard','shock','loot','revival','fracture'];
const missiles=['arcane','venom','fire','frost','doom','shock'];
const actionEffects={
  'bastion-bash':['melee','bastion'], 'blood-cleave':['melee','cleave'], 'hollow-needle':['melee','slash'],
  'time-bolt':['cast','arcane'], 'venom-flask':['cast','venom'], 'spark-bottle':['cast','shock'],
  'cinder-orb':['cast','fire'],combustion:['cast','fire'],whiteout:['cast','frost'],'grave-bell':['cast','doom'],
  defend:['support','guard'],'ward-lantern':['support','guard'],'red-tonic':['support','heal'],
  antidote:['support','heal'],'menders-bell':['support','heal'],'reverse-polarity':['support','heal'],
  'pocket-eclipse':['support','arcane'],'widows-brew':['support','venom'],scavenge:['support','loot'],
  interrupted:['interrupted','cleave']
};
export function actionVisual(actionId,classId,self=false) {
  const [motion,effect]=Object.hasOwn(actionEffects,actionId) ? actionEffects[actionId] :
    self ? ['support','arcane'] : ['melee',classId==='berserker'?'cleave':'slash'];
  return {motion,effect};
}
const animatedEvents=new Set(['damage','shield','heal','revival','elimination','status']);
function visualBeats(recap) {
  const eligible=(recap.events??[]).filter(event=>event.targetId && animatedEvents.has(event.type));
  // Hundreds of simultaneous status messages can come from a round boundary.
  // Preserve the public ordering of selected beats and always prioritize deaths/reactions.
  if (eligible.length<=6) return eligible;
  const chosen=new Set([eligible[0]]);
  for (const event of eligible) {
    if (chosen.size<6 && ['revival','elimination'].includes(event.type)) chosen.add(event);
  }
  for (const event of eligible) {
    if (chosen.size<6 && event.type!=='status') chosen.add(event);
  }
  for (const event of eligible) if(chosen.size<6) chosen.add(event);
  return eligible.filter(event=>chosen.has(event));
}
function effectFor(event,profile,primary) {
  if (event.type==='damage') {
    if(event.shieldBroken) return 'fracture';
    if(event.shieldDamage && !event.healthDamage) return 'guard';
    return primary?profile.effect:'cleave';
  }
  if(event.type==='elimination') return 'doom';
  if(event.type==='revival') return 'revival';
  if(event.type==='heal') return 'heal';
  if(event.type==='shield') return 'guard';
  return profile.effect;
}
export function impactScale(amount) {
  // Small hits use a legible minimum size, while extreme late-game hits stay inside the area.
  return .69+Math.min(.94,Math.sqrt(Math.max(0,Number(amount)||0))*.078);
}
function badge(event) {
  if(event.type==='damage') {
    const bits=[];
    if(event.healthDamage || !event.shieldDamage) bits.push('−'+(event.healthDamage??event.amount??0)+' HP');
    if(event.shieldDamage) bits.push('−'+event.shieldDamage+' shield');
    if(event.shieldBroken) bits.push('Break');
    return bits.join(' · ');
  }
  if(event.type==='heal') return '+'+event.amount+' HP';
  if(event.type==='shield') return '+'+event.amount+' shield';
  if(event.type==='elimination') return 'Fallen';
  if(event.type==='revival') return 'Revived';
  return '';
}
function part(parent,cls) {
  const el=document.createElement('span');
  el.className=cls;
  parent.append(el);
  return el;
}
function positioned(el,x,y,w,h) {
  Object.assign(el.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});
}
const running=new WeakMap();
export function playArenaAction(arena,recap,options={}) {
  running.get(arena)?.cancel();
  const seats=new Map();
  for (const seat of arena?.querySelectorAll('[data-seat]')??[]) {
    const sprite=seat.querySelector('.arena-sprite');
    if(sprite) seats.set(seat.dataset.seat,{seat,sprite});
  }
  const actor=seats.get(recap?.actorId);
  const target=seats.get(recap?.targetId)??actor;
  if(!actor || !target) return {finished:Promise.resolve(),cancel(){}};
  const speed=Math.max(.25,Math.min(6,Number(options.speed)||1));
  const still=options.reducedMotion===true || arena.closest('.reduce-motion') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const profile=actionVisual(recap.actionId,actor.sprite.dataset.class,actor===target);
  const scene=part(arena,'arena-fx');
  scene.setAttribute('aria-hidden','true');
  scene.dataset.motion=still?'reduced':profile.motion;
  scene.dataset.action=recap.actionId;
  const rect=arena.getBoundingClientRect();
  function bounds(subject) {
    const r=(subject.sprite.closest('.fighter-art')??subject.seat).getBoundingClientRect();
    const kx=arena.clientWidth/(rect.width||1), ky=arena.clientHeight/(rect.height||1);
    return {x:(r.left-rect.left)*kx,y:(r.top-rect.top)*ky,w:r.width*kx,h:r.height*ky};
  }
  const start=bounds(actor), end=bounds(target);
  const cx=r=>r.x+r.w*.5, cy=r=>r.y+r.h*.48;
  const facing=actor===target ? (actor.seat.dataset.facing??'right') : cx(end)>=cx(start)?'right':'left';
  const direction=facing==='right'?1:-1;
  const ghost=part(scene,'arena-fx-actor');
  ghost.dataset.facing=facing;
  positioned(ghost,start.x,start.y,start.w,start.h);
  const art=actor.sprite.cloneNode(true);
  ghost.append(art);
  actor.sprite.dataset.playing='hidden';
  const originals=new Map();
  const animations=[];
  const timers=[];
  let settled=false, finish;
  const finished=new Promise(resolve=>{finish=resolve;});
  function cancel() {
    if(settled) return;
    settled=true;
    timers.forEach(clearTimeout);
    animations.forEach(a=>a.cancel());
    for(const [el,old] of originals) pose(el,old);
    delete actor.sprite.dataset.playing;
    scene.remove();
    running.delete(arena);
    finish();
  }
  const handle={finished,cancel};
  running.set(arena,handle);
  function at(ms,run) {timers.push(setTimeout(()=>{if(!settled) run();},ms/speed));}
  function tween(el,frames,ms,easing='ease-out') {
    if(typeof el.animate==='function') animations.push(el.animate(frames,{duration:ms/speed,easing,fill:'forwards'}));
  }
  function cut(subject,name) {
    if(subject===actor) return pose(art,name);
    if(!originals.has(subject.sprite)) originals.set(subject.sprite,subject.sprite.dataset.pose);
    pose(subject.sprite,name);
  }
  function burst(subject,kind,amount=0) {
    const box=bounds(subject);
    const size=Math.max(39,Math.min(204,box.h*impactScale(amount)));
    const el=part(scene,'arena-fx-burst');
    el.dataset.effect=kind;
    positioned(el,cx(box)-size/2,cy(box)-size/2,size,size);
    el.style.setProperty('--effect-row',(effectRows.indexOf(kind)/(effectRows.length-1)*100)+'%');
    el.style.setProperty('--effect-time',(330/speed)+'ms');
    if(still) el.classList.add('arena-fx-still');
    at(still?260:340,()=>el.remove());
  }
  function launch() {
    const el=part(scene,'arena-fx-missile');
    const kind=profile.effect;
    el.dataset.missile=kind;
    const size=Math.max(25,Math.min(77,start.w*.45));
    const left=cx(start)+direction*start.w*.27-size/2, top=cy(start)-start.h*.18-size/2;
    const dx=cx(end)-size/2-left, dy=cy(end)-size/2-top;
    const arc=kind==='venom'?Math.min(91,Math.abs(dx)*.25+13):0;
    const degrees=kind==='venom'?-23:Math.atan2(dy,dx)*180/Math.PI;
    positioned(el,left,top,size,size);
    el.style.setProperty('--projectile-x',(missiles.indexOf(kind)/(missiles.length-1)*100)+'%');
    const rotation=kind==='venom'?direction*138:degrees;
    tween(el,[{transform:'translate(0,0) rotate('+degrees+'deg)'},
      {transform:'translate('+dx*.5+'px,'+(dy*.5-arc)+'px) rotate('+((rotation+degrees)/2)+'deg)'},
      {transform:'translate('+dx+'px,'+dy+'px) rotate('+rotation+'deg)'}],340,'linear');
    at(341,()=>el.remove());
  }
  const beats=visualBeats(recap);
  const contact=still?40:profile.motion==='cast'?615:profile.motion==='melee'?462:320;
  const step=still?70:Math.min(245,720/Math.max(1,beats.length-1));
  const home=contact+140;
  const retreat=245;
  pose(art,profile.motion==='melee'?'windup':profile.motion==='interrupted'?'hurt':'channel');
  if(!still && profile.motion==='melee') {
    const distance=Math.hypot(cx(end)-cx(start),cy(end)-cy(start))||1;
    const remaining=Math.min(distance*.38,end.w*.46);
    const dx=cx(end)-cx(start)-direction*remaining;
    const footDistance=end.y+end.h-start.y-start.h;
    const dy=footDistance-Math.sign(footDistance)*Math.min(end.h*.13,Math.abs(footDistance)*.18);
    const depth=Math.max(.70,Math.min(1.35,end.h/start.h));
    const move=(x,y,scale=1)=>'translate('+x+'px,'+y+'px) scale('+scale+')';
    tween(ghost,[{transform:move(0,0),offset:0},{transform:move(-direction*start.w*.09,0),offset:.24},
      {transform:move(dx,dy,depth),offset:contact/(home+retreat)},
      {transform:move(dx,dy,depth),offset:home/(home+retreat)},{transform:move(0,0),offset:1}],home+retreat,'ease-in-out');
    at(contact-112,()=>pose(art,'strike'));
    at(home+120,()=>pose(art,'settle'));
  } else if(!still && profile.motion==='cast') {
    at(240,()=>pose(art,'release'));
    at(275,launch);
  }
  function react(event,index) {
    const subject=seats.get(event.targetId);
    if(!subject) return;
    const primary=event.targetId===recap.targetId && event.timing!=='turn' && event.timing!=='round';
    const kind=effectFor(event,profile,primary);
    burst(subject,kind,event.type==='revival'?30:event.amount);
    if(['damage','elimination','revival','heal','shield'].includes(event.type)) {
      const reaction={damage:event.shieldDamage&&!event.healthDamage?'guard':'hurt',elimination:'fallen',
        revival:'victory',heal:'victory',shield:'guard'}[event.type];
      cut(subject,reaction);
      if(!still && event.type==='damage' && subject!==actor) {
        const reach=Math.min(13,2+Math.sqrt(event.amount||0));
        const sign=cx(bounds(subject))>=cx(start)?1:-1;
        tween(subject.sprite,[{translate:'0 0'},{translate:sign*reach+'px -2px',offset:.22},{translate:'0 0'}],225);
      }
    }
    const text=badge(event);
    if(text) {
      const box=bounds(subject),label=part(scene,'arena-fx-label');
      label.dataset.kind=event.type;
      label.textContent=text;
      label.style.left=cx(box)+'px';label.style.top=(box.y+box.h*.13)+'px';
      if(!still) tween(label,[{opacity:1,translate:'0 0'},{opacity:1,offset:.73},{opacity:0,translate:'0 -13px'}],460);
      at(still?250:460,()=>label.remove());
    }
    if(index===0) scene.dataset.stage='impact';
    options.onImpact?.(event);
  }
  scene.dataset.stage='windup';
  at(contact,()=>{
    scene.dataset.stage='impact';
    if(profile.motion==='support') pose(art,profile.effect==='guard'?'guard':'release');
    if(!beats.length || profile.motion==='cast' && effectFor(beats[0],profile,true)!==profile.effect) burst(target,profile.effect);
  });
  beats.forEach((event,index)=>at(contact+index*step,()=>react(event,index)));
  const duration=Math.max(still?370:profile.motion==='melee'?1050:985,
    contact+Math.max(0,beats.length-1)*step+(still?275:455));
  at(duration,cancel);
  return handle;
}
