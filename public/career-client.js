import { createMatch } from '../src/game/index.js';
import { newProfile } from '../src/game/progression.js';

const cacheKey = 'rift-career-profile', identityKey = 'rift-career-key';
const listeners = new Set(), queued = new Map(), fallbackQueue = new Map();
let profile = newProfile(), identity, database, identityReady, draining, dirty, retryTimer, loading;
let status = 'connecting';
try {
  const cached = JSON.parse(localStorage.getItem(cacheKey));
  if (cached?.version === 1 && Array.isArray(cached.unlocks)) profile = cached;
  identity = localStorage.getItem(identityKey);
} catch { /* A browser with disabled storage can still play the arena. */ }

function generateKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
}
function openDatabase() {
  if (!database) database = new Promise(resolve => {
    let request;
    try { request = indexedDB.open('rift-career',1); } catch { resolve(null); return; }
    request.onupgradeneeded = () => {
      request.result.createObjectStore('identity');
      request.result.createObjectStore('pending');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(null);
  });
  return database;
}
// An IndexedDB read/write transaction serializes two first-use tabs, including
// browsers that run the game on an ordinary LAN HTTP origin.
export async function initCareer() {
  if (!identityReady) identityReady = (async () => {
    const db = await openDatabase();
    if (db) {
      identity = await new Promise((resolve,reject) => {
        const tx = db.transaction('identity','readwrite'), store=tx.objectStore('identity'), get=store.get('key');
        let key;
        get.onsuccess=()=>{ key=get.result || identity || generateKey(); if (!get.result) store.put(key,'key'); };
        tx.oncomplete=()=>resolve(key);
        tx.onabort=()=>reject(tx.error);
      }).catch(()=>identity || generateKey());
    } else identity ||= generateKey();
    try { localStorage.setItem(identityKey,identity); } catch { /* Tab-scoped profile. */ }
  })();
  return identityReady;
}
export const profileHeaders = () => identity ? {'X-Rift-Profile':identity} : {};
export const readProfile = () => profile;
export const readCareerStatus = () => status;
export const subscribeProfile = fn => { listeners.add(fn); return ()=>listeners.delete(fn); };
function announce() { for (const fn of listeners) fn(profile); }
function connection(next) { if (status !== next) { status=next; announce(); } }
export function acceptProfile(next) {
  if (!next || next.version !== 1 || next.revision <= profile.revision) return;
  profile=next;
  try { localStorage.setItem(cacheKey,JSON.stringify(next)); } catch { /* The server retains the profile. */ }
  announce();
}
async function api(path,body) {
  await initCareer();
  let response;
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),7000);
  try {
    response=await fetch('/api/profile'+path,{method:body === undefined ? 'GET' : 'POST',
      headers:{...profileHeaders(),...(body !== undefined ? {'Content-Type':'application/json'} : {})},
      body:body === undefined ? undefined : JSON.stringify(body),cache:'no-store',signal:controller.signal});
  } catch { connection('offline'); throw Error('The progression server is unavailable.'); }
  finally { clearTimeout(timer); }
  const data=await response.json();
  if (!response.ok) {
    const error=Error(data.error || 'The progression request could not be completed.');
    error.status=response.status;
    if (response.status >= 500) connection('offline');
    throw error;
  }
  connection('online');
  return data;
}
export function loadProfile() {
  if (!loading) loading=api('').then(next=>{ acceptProfile(next); void drain(); return profile; })
    .catch(()=>profile).finally(()=>{ loading=null; });
  return loading;
}
export async function buyItem(itemId) {
  const result=await api('/buy',{itemId}); acceptProfile(result); return profile;
}
export async function equipSkin(classId,skinId) {
  const result=await api('/equip',{classId,skinId}); acceptProfile(result); return profile;
}

export async function startCareerSolo(options) {
  try {
    const result=await api('/solo',options);
    acceptProfile(result.profile);
    result.state.careerJournal=[];
    return result.state;
  } catch (error) {
    if (error.status && error.status < 500) throw error;
    const state=createMatch({...options,career:{runId:'offline',seats:{p1:profile.unlocks}}});
    state.careerUnavailable=true;
    return state;
  }
}

async function pending(id, transform) {
  const db=await openDatabase();
  if (!db) {
    const next=transform(fallbackQueue.get(id));
    if (next) fallbackQueue.set(id,next); else fallbackQueue.delete(id);
    return;
  }
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('pending','readwrite'), store=tx.objectStore('pending');
    const get=store.get(id);
    get.onsuccess=()=>{
      const next=transform(get.result);
      if (next) store.put(next,id); else store.delete(id);
    };
    tx.oncomplete=resolve;
    tx.onabort=()=>reject(tx.error);
  });
}
async function entries() {
  const db=await openDatabase();
  if (!db) return [...fallbackQueue.values()];
  return new Promise((resolve,reject)=>{
    const get=db.transaction('pending').objectStore('pending').getAll();
    get.onsuccess=()=>resolve(get.result); get.onerror=()=>reject(get.error);
  });
}

async function drain() {
  if (draining) { dirty=true; return draining; }
  draining=(async ()=>{
    do {
      dirty=false;
      for (const run of await entries()) {
        let offset=run.offset;
        while (offset<run.commands.length) {
          const result=await api('/solo/'+run.id,{from:offset,commands:run.commands.slice(offset,offset+48)}).catch(async error=>{
            if (error.status === 400 || error.status === 404 || error.status === 409) {
              // A divergent copy of an old save cannot replace verified turns.
              await pending(run.id,cur=>cur && cur.commands.length>run.commands.length ? cur : undefined);
            } else throw error;
            return null;
          });
          if (!result) break;
          offset=result.offset;
          queued.set(run.id,{length:Math.max(queued.get(run.id)?.length ?? 0,run.commands.length),offset});
          await pending(run.id,cur=>!cur || offset>=cur.commands.length ? undefined : {...cur,offset:Math.max(cur.offset,offset)});
          acceptProfile(result.profile);
        }
      }
    } while (dirty);
  })().catch(()=>{
    if (!retryTimer) retryTimer=setTimeout(()=>{ retryTimer=null; void drain(); },15000);
  }).finally(()=>{ draining=null; });
  return draining;
}
// Called after a saved local transition. Store a pending batch before upload so
// leaving the battle or refreshing while disconnected does not discard earnings.
export async function syncCareerSolo(state) {
  if (!state?.careerJournal?.length || !state.career || state.careerUnavailable) return;
  const id=state.career.runId, commands=state.careerJournal;
  const previous=queued.get(id) || {offset:0,length:0};
  if (commands.length <= previous.length) return;
  queued.set(id,{...previous,length:commands.length});
  try {
    await pending(id,cur=>cur && cur.commands.length>=commands.length ? cur :
      {id,commands,offset:Math.max(previous.offset,cur?.offset ?? 0)});
    await drain();
  } catch { queued.delete(id); connection('offline'); }
}
window.addEventListener('online',()=>{ void loadProfile(); });
window.addEventListener('storage',event=>{
  if (event.key === cacheKey && event.newValue) {
    try { acceptProfile(JSON.parse(event.newValue)); } catch { /* Ignore a malformed cached view. */ }
  }
});
