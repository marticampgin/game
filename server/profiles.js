import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { applyCommand, botCommand, createMatch, CLASSES } from '../src/game/index.js';
import { SHOP, awardLifetimeQuests, buy, credit, equip, newProfile, owns } from '../src/game/progression.js';
import { resolveFighterSkin } from '../public/fighter-kit.js';

export class ProfileError extends Error {
  constructor(status,message) { super(message); this.status=status; }
}
export function profileKey(header) {
  if (header === undefined) return null;
  if (typeof header !== 'string' || !/^[a-f0-9]{64}$/.test(header)) throw new ProfileError(401,'The player profile key is invalid.');
  return createHash('sha256').update(header).digest('hex');
}
function read(path, missing) {
  try { return JSON.parse(readFileSync(path,'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return missing(); throw e; }
}
// One Node process owns the arena. Each profile change is a synchronous
// read/modify/rename, including its receipt and currency balance.
function save(path, value) {
  const temp = path + '.tmp';
  writeFileSync(temp, JSON.stringify(value), {mode:0o600});
  renameSync(temp,path);
}
function cleanCommand(command) {
  if (command?.type === 'reroll') return {type:'reroll'};
  if (command?.type === 'act' && typeof command.actionId === 'string' &&
      (command.targetId === undefined || typeof command.targetId === 'string'))
    return {type:'act',actionId:command.actionId,...(command.targetId !== undefined ? {targetId:command.targetId} : {})};
  if (command?.type === 'pick' && typeof command.rewardId === 'string' &&
      (command.replaceIndex === undefined || Number.isInteger(command.replaceIndex)))
    return {type:'pick',rewardId:command.rewardId,...(command.replaceIndex !== undefined ? {replaceIndex:command.replaceIndex} : {})};
  throw new ProfileError(400,'Invalid recorded command.');
}
const sameCommand = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function classSkinAllowed(profile, classId, skinId) {
  const item = SHOP.find(i=>i.kind === 'skin' && i.classId === classId && i.skinId === skinId);
  return !item || owns(profile,item);
}
export function createProfiles({profileDirectory = process.env.RIFT_PROFILE_DIR || join(homedir(),'.riftbound','profiles')}={}) {
  const accountPath = key => join(profileDirectory,key,'profile.json');
  const folder = key => mkdirSync(join(profileDirectory,key),{recursive:true,mode:0o700});
  function account(key) {
    const path = accountPath(key);
    const file = read(path, () => ({profile:newProfile(), receipts:{}}));
    if (awardLifetimeQuests(file.profile)) {
      file.profile.revision++;
      save(path,file);
    }
    return file;
  }

  function settle(key, state, playerId) {
    const file=account(key), id=state.career.runId + '/' + playerId;
    const receipt = file.receipts[id] ??= {};
    if (credit(file.profile,receipt,state,playerId)) {
      file.profile.revision++;
      folder(key);
      save(accountPath(key),file);
    }
    return file.profile;
  }
  return {
    view(key) { return key ? account(key).profile : newProfile(); },
    change(key, operation, input) {
      const file = account(key);
      let changed;
      try {
        changed = operation === 'buy' ? buy(file.profile,input.itemId) : equip(file.profile,input.classId,input.skinId);
      } catch(error) { throw new ProfileError(400,error.message); }
      if (changed) { file.profile.revision++; folder(key); save(accountPath(key),file); }
      return file.profile;
    },
    settle,
    startSolo(key, {seed, players}) {
      if (!['string','number'].includes(typeof seed) || String(seed).length > 64 ||
          !Array.isArray(players) || players.length < 2 || players.length > 8) throw new ProfileError(400,'Choose a valid solo match.');
      const profile = account(key).profile;
      const seats = players.map((p,i) => {
        if (p?.id !== 'p'+(i+1) || p.bot !== !!i || !Object.hasOwn(CLASSES,p.classId) ||
            typeof p.name !== 'string' || !p.name.trim() || [...p.name].length > 24)
          throw new ProfileError(400,'Invalid solo roster.');
        if (p.skinId && (resolveFighterSkin(p.classId,p.skinId).id !== p.skinId || (!i && !classSkinAllowed(profile,p.classId,p.skinId))))
          throw new ProfileError(400,'Choose an owned outfit for this class.');
        return {id:p.id,name:p.name,classId:p.classId,bot:!!i,...(p.skinId ? {skinId:p.skinId} : {})};
      });
      const runId=randomUUID();
      const state=createMatch({seed,players:seats,career:{runId,seats:{p1:profile.unlocks}}});
      folder(key);
      save(join(profileDirectory,key,runId+'.json'),{state,commands:[]});
      return {state,profile};
    },
    syncSolo(key,runId,{from,commands}) {
      if (!/^[0-9a-f-]{36}$/.test(runId) || !Array.isArray(commands) || commands.length>64 || !Number.isSafeInteger(from) || from<0)
        throw new ProfileError(400,'Invalid match checkpoint.');
      const path=join(profileDirectory,key,runId+'.json');
      const run=read(path,()=>{ throw new ProfileError(404,'This match checkpoint is unavailable.'); });
      if (from>run.commands.length) throw new ProfileError(409,'The match journal is missing earlier turns.');
      let changed=false;
      for (const [i, raw] of commands.entries()) {
        const command=cleanCommand(raw);
        if (i+from<run.commands.length) {
          if (!sameCommand(run.commands[from+i],command)) throw new ProfileError(409,'This saved turn differs from the verified match.');
          continue;
        }
        const state=run.state;
        if (state.phase==='finished') throw new ProfileError(409,'The match has ended.');
        if (state.activeId!=='p1' && !sameCommand(command,cleanCommand(botCommand(state))))
          throw new ProfileError(400,'The recorded bot move differs from its arena decision.');
        try { run.state=applyCommand(state,state.activeId,command); }
        catch(error) { throw new ProfileError(400,error.message); }
        run.commands.push(command);
        changed=true;
      }
      // Save the authoritative checkpoint first. If the wallet write is
      // interrupted, replaying even an already-saved batch reconciles the delta.
      if (changed) save(path,run);
      return {offset:from+commands.length,profile:settle(key,run.state,'p1')};
    },
  };
}
