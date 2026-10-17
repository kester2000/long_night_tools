(function longNightModule(root){
 'use strict';
 (root.LongNightSources ||= {})['search-cache.js']=longNightModule.toString();
 const M=typeof module!=='undefined'?require('./messages'):root.LongNightMessages;
 const memory=new Map();let database;
 const canonical=value=>JSON.stringify(value);
 async function digest(text){
  const bytes=new TextEncoder().encode(text),hash=await root.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
 }
 async function version(){
  if(root.document&&root.document.readyState!=='complete')await new Promise(resolve=>root.addEventListener('load',resolve,{once:true}));
  const sources={...root.LongNightSources};
  // file: never runs the worker; HTTP uses its current dispatcher as well.
  if(root.document&&root.location?.protocol!=='file:'){
   const response=await fetch('worker.js',{cache:'no-store'});if(!response.ok)throw new Error('Cannot fingerprint worker');sources['worker.js']=await response.text();
  }
  return digest(canonical(Object.entries(sources).sort(([a],[b])=>a.localeCompare(b))));
 }
 const notebookKey=n=>({base:n.base,messages:n.messages});
 const requestKey=(referenceId,request)=>canonical([referenceId,request]);
 function db(){
  if(!root.indexedDB)return Promise.resolve(null);
  if(!database)database=new Promise(resolve=>{const req=root.indexedDB.open('long-night-search-cache',1);req.onupgradeneeded=()=>req.result.createObjectStore('searches',{keyPath:'key'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);req.onblocked=()=>resolve(null);});
  return database;
 }
 const storage={
  async all(){const database=await db();if(!database)return [...memory.values()];return new Promise(resolve=>{const tx=database.transaction('searches'),r=tx.objectStore('searches').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve([...memory.values()]);});},
  async put(record){
   memory.set(record.key,record);while(memory.size>12)memory.delete(memory.keys().next().value);
   const database=await db();if(!database)return false;
   return new Promise(resolve=>{const tx=database.transaction('searches','readwrite'),store=tx.objectStore('searches');store.put(record);const read=store.getAll();read.onsuccess=()=>{for(const old of read.result.sort((a,b)=>b.savedAt-a.savedAt).slice(12))store.delete(old.key);};tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);});
  }
 };
 // Only append-only, semantically unchanged historical turns may reuse exclusions.
 // Late old-round clues and retroactive settings must start a fresh search.
 function compatiblePrefix(old,next){
  if(canonical(old.base)!==canonical(next.base)||old.messages.length>=next.messages.length)return false;
  if(old.messages.some((m,i)=>canonical(m)!==canonical(next.messages[i])))return false;
  const a=M.build(old.base,old.messages),b=M.build(next.base,next.messages);
  if(a.count!==b.count||a.self!==b.self||a.spectator!==b.spectator)return false;
  const cutoff=Math.max(0,...a.views.flatMap(v=>v.model.segments.flatMap(s=>s.events.map(e=>e.clock?.round||0))));
  if(!cutoff)return false;
  const historical=model=>model.segments.map(s=>({anchors:s.anchors,events:s.events.filter(e=>!e.clock||e.clock.round<=cutoff)})).filter(s=>s.events.length||s.anchors.length);
  if(a.views.some((v,i)=>canonical(historical(v.model))!==canonical(historical(b.views[i].model))))return false;
  const configAt=c=>{
   const out={...c};
   for(const key of ['coinGains','coinSources','playerButtonCounts','zeroCoinTurns'])if(out[key])out[key]=out[key].filter(x=>x.round<=cutoff);
   if(out.buttonCounts)out.buttonCounts=Object.fromEntries(Object.entries(out.buttonCounts).filter(([round])=>+round<=cutoff));
   if(out.coinTransferRounds)out.coinTransferRounds=out.coinTransferRounds.filter(r=>r<=cutoff);
   // Search ordering does not change the space of possible routes.
   delete out.preferATM;
   return out;
  };
  if(a.views.some((v,i)=>canonical(configAt(v.model.config))!==canonical(configAt(b.views[i].model.config))))return false;
  return b.views.some(v=>v.model.segments.some(s=>s.events.some(e=>e.clock?.round>cutoff)));
 }
 async function load(version,notebook,store=storage){
  const input=notebookKey(notebook),key=await digest(version+'\n'+canonical(input));
  const records=await store.all(),exact=records.find(r=>r.key===key&&r.version===version&&canonical(r.notebook)===canonical(input));
  if(exact)return {key,mode:'exact',record:exact};
  const prefix=records.filter(r=>{try{return r.version===version&&compatiblePrefix(r.notebook,input);}catch{return false;}}).sort((a,b)=>b.notebook.messages.length-a.notebook.messages.length)[0];
  return {key,mode:prefix?'prefix':'miss',record:prefix||null};
 }
 async function save(version,notebook,loaded,routes,output,store=storage){
  const outputs=loaded.mode==='exact'?{...loaded.record.outputs}:{};
  if(output)outputs[output.key]=output.result;
  const record=JSON.parse(canonical({key:loaded.key,version,notebook:notebookKey(notebook),routes,outputs,deductions:output?.result?.deductions||loaded.record?.deductions||null,savedAt:Date.now()}));
  if(canonical(record).length>12*1024*1024)return false;
  return store.put(record);
 }
 function apply(notebook,deductions){
  const base=JSON.parse(canonical(notebook.base));base.config.confirmedEvents=deductions?.events||[];base.config.confirmedBlocks=deductions?.blocks||[];
  return {...notebook,base,choices:Object.fromEntries(Array.from({length:8},(_,p)=>[p,{...(deductions?.choices?.[p]||{}),...(notebook.choices?.[p]||{})}]))};
 }
 const api={version,load,save,compatiblePrefix,requestKey,storage,apply};if(typeof module!=='undefined')module.exports=api;else root.LongNightSearchCache=api;
})(globalThis);
