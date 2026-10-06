import { Immich, eligible, UpstreamError, type Asset } from './immich';
import { Store, type Batch, type Journal, type Decision } from './store';
import { day, shift, yearBoundary, select } from './selection';
export class Service {
 private queue: Promise<unknown> = Promise.resolve();
 constructor(public store: Store, public immich: Immich, public tz='Asia/Bangkok', public now=()=>new Date()) { day(now(),tz); }
 serial<T>(fn:()=>Promise<T>):Promise<T> { const next=this.queue.then(fn); this.queue=next.catch(()=>{}); return next; }
 private batch(date:string) { const b=this.store.state.batches.find(b=>b.date===date); if(!b) throw new Error('Session not found. Reload Today.'); return b; }
 private finish(b:Batch) { const active=b.picks.filter(p=>!b.skipped.includes(p.id)); const done=b.decisions.filter(d=>!d.undone); b.completed=active.length>0 && active.every(p=>done.some(d=>d.id===p.id)) ? (b.completed??day(this.now(),this.tz)) : undefined; }
 private finalize(j:Journal,a:Asset) {
  const b=this.batch(j.batch); const s=this.store.state;
  if(j.undo) { const d=[...b.decisions].reverse().find(d=>d.id===j.asset&&!d.undone); if(d) d.undone=true; if(j.priorCooldown) s.cooldowns[j.asset]=j.priorCooldown; else delete s.cooldowns[j.asset]; }
  else { b.decisions.push({id:j.asset,action:j.action,previous:j.previous,at:j.at,updatedAt:a.updatedAt,priorCooldown:j.priorCooldown}); s.cooldowns[j.asset]={action:j.action,until:shift(day(new Date(j.at),this.tz),j.action==='later'?7:90)}; }
  s.requests[j.requestId]=JSON.stringify([j.batch,j.asset,j.undo?'undo':j.action]); delete s.journal; this.finish(b); this.store.save();
 }
 async reconcile() {
  const j=this.store.state.journal; if(!j) return;
  let a:Asset;try {a=await this.immich.get(j.asset);}catch(e){if(e instanceof UpstreamError && [400,401,403,404].includes(e.status)){delete this.store.state.journal;this.store.save();}throw e;}
  if(a.isFavorite===j.target) this.finalize(j,a);
  else if(a.isFavorite===j.previous && (!j.beforeUpdatedAt || a.updatedAt===j.beforeUpdatedAt) && a.type==='IMAGE' && a.visibility==='timeline' && !a.isTrashed && !a.isOffline && !a.isArchived) { let updated:Asset;try{updated=await this.immich.favorite(j.asset,j.target);}catch(e){if(e instanceof UpstreamError&&[400,401,403,404].includes(e.status)){delete this.store.state.journal;this.store.save();}throw e;} if(updated.isFavorite!==j.target) throw new Error('Immich did not confirm the favorite state. Retry.'); this.finalize(j,updated); }
  else throw new Error('Pending save conflicts with an external change. Resolve the photo in Immich before retrying.');
 }
 async today() {
  await this.reconcile(); const s=this.store.state; const date=day(this.now(),this.tz);
  let b=s.batches.find(b=>!b.completed && b.picks.some(p=>!b.skipped.includes(p.id)&&!b.decisions.some(d=>d.id===p.id&&!d.undone))) ?? s.batches.find(b=>b.completed===date) ?? s.batches.find(b=>b.date===date);
  if(!b) {
   const boundary=yearBoundary(this.now()); const old:Asset[]=[]; const recent:Asset[]=[];
   for(let n=0;n<3;n++) { old.push(...await this.immich.random(boundary,true)); recent.push(...await this.immich.random(boundary,false)); }
   const blocked=new Set(Object.entries(s.cooldowns).filter(([,c])=>c.until>date).map(([id])=>id));
   const deferred:Asset[]=[];
   for(const [id,c] of Object.entries(s.cooldowns).filter(([,c])=>c.action==='later'&&c.until<=date).slice(0,100)) { try { deferred.push(await this.immich.get(id)); } catch(e) { if(!(e instanceof UpstreamError && [403,404].includes(e.status))) throw e; } }
   b={date,picks:select(old,recent,deferred,blocked,this.tz),decisions:[],skipped:[]}; s.batches.push(b); this.store.save();
  }
  let photo:Asset|undefined; let pick;
  for(const p of b.picks.filter(p=>!b!.skipped.includes(p.id)&&!b!.decisions.some(d=>d.id===p.id&&!d.undone))) {
   try { const a=await this.immich.get(p.id); if(eligible(a)) {photo=a;pick=p;break;} }
   catch(e) { if(!(e instanceof UpstreamError && [403,404].includes(e.status))) throw e; }
   b.skipped.push(p.id); this.finish(b); this.store.save();
  }
  const done=b.decisions.filter(d=>!d.undone); const last=done.at(-1);
  return {date:b.date,nextDate:shift(date,1),total:b.picks.length-b.skipped.length,reviewed:done.length,favorites:done.filter(d=>d.action==='favorite').length,complete:!!b.completed,skipped:b.skipped.length,undo:last?{id:last.id}:null,photo:photo?{id:photo.id,date:photo.fileCreatedAt,location:[photo.exifInfo?.city,photo.exifInfo?.country].filter(Boolean).join(', '),reason:pick!.reason,url:`${this.immich.url.replace(/\/$/,'')}/photos/${photo.id}`}:null};
 }
 async decide(batch:string,id:string,action:Decision['action']|'undo',requestId:string) {
  const fingerprint=JSON.stringify([batch,id,action]); const prev=this.store.state.requests[requestId]; if(prev) {if(prev!==fingerprint) throw new Error('Request ID was already used.'); return;}
  await this.reconcile(); if(this.store.state.requests[requestId]) return;
  const b=this.batch(batch); const undo=action==='undo'; const last=b.decisions.filter(d=>!d.undone).at(-1);
  if(undo ? last?.id!==id : b.picks.find(p=>!b.skipped.includes(p.id)&&!b.decisions.some(d=>d.id===p.id&&!d.undone))?.id!==id) throw new Error('Session changed in another tab. Reload Today.');
  const a=await this.immich.get(id);
  if(undo) { if(a.isFavorite!==(last!.action==='favorite'?true:last!.previous) || (last!.action==='favorite'&&a.updatedAt!==last!.updatedAt)) throw new Error('Photo changed in Immich; Undo was not applied.'); }
  else if(!eligible(a)) throw new Error('Photo is no longer eligible. Reload Today.');
  const j:Journal={requestId,batch,asset:id,action:undo?last!.action:action as Decision['action'],undo,target:undo?last!.previous:true,previous:a.isFavorite,beforeUpdatedAt:a.updatedAt,priorCooldown:undo?last!.priorCooldown:this.store.state.cooldowns[id],at:this.now().toISOString()};
  if(j.action==='favorite') {this.store.state.journal=j;this.store.save(); await this.reconcile();}
  else this.finalize(j,a);
 }
 progress() {
  const date=day(this.now(),this.tz); const dates=new Set(this.store.state.batches.map(b=>b.completed).filter(Boolean)); let cursor=dates.has(date)?date:shift(date,-1);let streak=0;while(dates.has(cursor)){streak++;cursor=shift(cursor,-1);}
  const days=Array.from({length:7},(_,i)=>shift(date,i-6)).map(date=>{const decisions=this.store.state.batches.flatMap(b=>b.decisions).filter(d=>!d.undone&&day(new Date(d.at),this.tz)===date);return {date,reviewed:decisions.length,favorites:decisions.filter(d=>d.action==='favorite').length,completed:dates.has(date)};});
  return {days,reviewed:days.reduce((n,d)=>n+d.reviewed,0),favorites:days.reduce((n,d)=>n+d.favorites,0),streak};
 }
}
