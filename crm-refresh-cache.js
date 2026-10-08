/* Session-only asset URLs and coalesced realtime refreshes. No business-data persistence. */
(function(root){
'use strict';
function createAssetCache({sign,now=Date.now,ttl=50*60*1000,limit=6,maxEntries=5000}){
 const cache=new Map(),pending=new Map(),queue=[];let active=0,epoch=0,context='';
 function drain(){while(active<limit&&queue.length){const run=queue.shift();active++;Promise.resolve().then(run).finally(()=>{active--;drain();});}}
 function clear(){epoch++;cache.clear();pending.clear();}
 function get(path){
  const old=cache.get(path);if(old&&old.until>now())return Promise.resolve(old.url);
  if(pending.has(path))return pending.get(path);
  const generation=epoch;
  const promise=new Promise((resolve,reject)=>{queue.push(async()=>{
   try{if(generation!==epoch)return resolve(null);const url=await sign(path);
    if(generation!==epoch)return resolve(null);
    if(url){cache.delete(path);cache.set(path,{url,until:now()+ttl});while(cache.size>maxEntries)cache.delete(cache.keys().next().value);}
    resolve(url||null);
   }catch(e){reject(e);}
  });});
  pending.set(path,promise);promise.finally(()=>{if(pending.get(path)===promise)pending.delete(path);}).catch(()=>{});drain();return promise;
 }
 async function refresh(value,bucket){
  const assets=[],seen=new WeakSet();
  function visit(v){if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
   if(typeof v.id==='string'&&v.id.startsWith(bucket+'/'))assets.push(v);
   for(const x of Object.values(v))visit(x);
  }visit(value);
  await Promise.all(assets.map(async asset=>{try{const url=await get(asset.id.slice(bucket.length+1));if(url)asset.url=url;}catch(_){/* A failed sign must not block all CRM records. Retried next refresh. */}}));
 }
 return {get,refresh,clear,setContext(value){if(context!==value){context=value;clear();}}};
}
function createRealtimeScheduler({refresh,render,onError=()=>{},delay=180,setTimer=setTimeout,clearTimer=clearTimeout}){
 const pending=new Set();let timer=null,busy=false,disposed=false;
 function schedule(key){if(disposed)return;pending.add(key);arm();}
 function arm(){if(!disposed&&!busy&&timer===null&&pending.size)timer=setTimer(flush,delay);}
 async function flush(){timer=null;if(disposed)return;busy=true;const keys=[...pending];pending.clear();
  const results=await Promise.allSettled(keys.map(key=>Promise.resolve().then(()=>refresh(key))));
  try {
   results.forEach(r=>{if(r.status==='rejected'){try{onError(r.reason);}catch(error){console.error('CRM realtime error handler failed',error);}}});
   if(!disposed&&results.some(r=>r.status==='fulfilled'))render();
  } finally {busy=false;arm();}
 }
 return {schedule,dispose(){disposed=true;pending.clear();if(timer!==null)clearTimer(timer);timer=null;}};
}
root.CrmRefresh={createAssetCache,createRealtimeScheduler};
})(typeof globalThis!=='undefined'?globalThis:this);
