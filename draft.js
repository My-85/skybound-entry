// Store the complete scene and its actual flight together. Large traces belong in
// IndexedDB; localStorage retains a small recovery draft if storage is unavailable.
const KEY='a4-skybound-dual-v1';
let database, pending=Promise.resolve();
function open(){
 return database??=new Promise((resolve,reject)=>{
  const request=indexedDB.open('skybound-dual-scenes',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
export function saveDraft(project,onError){
 const draftId=crypto.randomUUID(),snapshot=structuredClone(project);
 const fallback={...snapshot,_draftId:draftId};
 if(fallback.flight?.kind==='dual-result'){fallback.flight=null;fallback._missingComputedFlight=true;}
 try{localStorage.setItem(KEY,JSON.stringify(fallback));}catch{onError('场景草稿存储失败，请保存项目文件。');}
 pending=pending.catch(()=>{}).then(async()=>{
  const db=await open();
  await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({draftId,project:snapshot},'current');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
 }).catch(()=>onError('飞行结果未能保存在本机，请点击“保存项目”下载完整记录。'));
}
export async function loadDraft(){
 const raw=localStorage.getItem(KEY);if(!raw)return null;
 const fallback=JSON.parse(raw);
 try{
  const db=await open(),saved=await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  if(saved&&saved.draftId===fallback._draftId)return saved.project;
 }catch{/* Recover geometry and archive references without inventing flight data. */}
 return fallback;
}
export const draftSaved=()=>pending;
