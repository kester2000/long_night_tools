const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../search-cache'),X=require('../example-search'),H=require('../hypotheses'),E=require('../engine'),M=require('../messages');
const j=require('./fixtures/archive19.json'),copy=x=>JSON.parse(JSON.stringify(x));
const store=()=>{const records=new Map();return {all:async()=>copy([...records.values()]),put:async r=>{records.set(r.key,copy(r));return true;}};};
const next=()=>({...copy(j),messages:[...copy(j.messages),{id:'round-two-zero',text:'【第 2 回合】\n[0号]玩家本回合的完整行动轨迹：\n(↓撞)',view:0},{id:'round-two-one',text:'【第 2 回合】\n[1号]玩家本回合的完整行动轨迹：\n(↓撞)',view:0}]});
test('script fingerprint includes private implementation changes',async()=>{
 const before=await C.version();globalThis.LongNightSources['test-private-helper']='private helper v1';
 assert.notEqual(await C.version(),before);delete globalThis.LongNightSources['test-private-helper'];
 assert.equal(await C.version(),before);
});
test('exact search persists, reloads without search, and append-only turns reuse route frontiers',async()=>{
 const storage=store(),request={eventBranches:true,player:1};
 const first=await X.cachedSearch(j,'0:0',request,()=>{},30000,'test-v1',storage);
 assert.equal(first.status,'choices');assert(first.complete);assert.equal(first.cache.persisted,true);
 const loaded=await C.load('test-v1',j,storage);assert.equal(loaded.mode,'exact');assert(loaded.record.routes[1].states.length>0);
 // A zero search budget can still load a finished result after a fresh lookup.
 const second=await X.cachedSearch(copy(j),'0:0',request,()=>{},0,'test-v1',storage);
 assert.equal(second.cache.mode,'exact');assert.deepEqual(second.options,first.options);
 const extended=next();assert(C.compatiblePrefix(j,extended));
 assert.equal((await C.load('test-v1',extended,storage)).mode,'prefix');
 const warm=await X.cachedSearch(extended,'0:0',request,()=>{},30000,'test-v1',storage),cold=X.search(extended,'0:0',request);
 assert.equal(warm.cache.mode,'prefix');assert.equal(warm.complete,true);
 const signatures=result=>result.options.map(g=>({events:g.events,children:g.options.map(o=>o.events)}));
 assert.deepEqual(signatures(warm),signatures(cold));
 for(const g of warm.options)for(const o of g.options)assert(o.proof.observations.some(a=>a.clock?.round===2),'new evidence must be revalidated');
 assert.equal((await C.load('test-v2',j,storage)).mode,'miss');
 const edited=copy(j);edited.messages[7].text+='\n修正';assert.equal((await C.load('test-v1',edited,storage)).mode,'miss');
 const late={...copy(j),messages:[...copy(j.messages),{id:'late',text:'【第 1 回合】\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n墙墙空墙',view:0},...next().messages.slice(j.messages.length)]};
 assert.equal(C.compatiblePrefix(j,late),false);
 const changed=next();changed.messages.push({id:'change-mode',text:'静音关闭',view:0});assert.equal(C.compatiblePrefix(j,changed),false);
});
test('interrupted route search resumes its frontier without losing the in-flight branch',()=>{
 const b=M.build(j.base,j.messages),config={...b.model.config,witnessFirst:false,independentPerspective:true};let checkpoint;
 const h=H.analyze({...config,onRouteCheckpoint:c=>{checkpoint=copy(c);}},j.base,j.messages,1,b.self,20);
 assert(h.truncated);assert(checkpoint.states.length);assert.equal(checkpoint.exhausted,false);
 let resumed;
 const result=H.analyze({...config,routeCheckpoint:checkpoint,onRouteCheckpoint:c=>{resumed=c;}},j.base,j.messages,1,b.self,4096);
 const fresh=H.analyze(config,j.base,j.messages,1,b.self,4096);
 const choices=r=>r.groups.flatMap(g=>g.alternatives||[]).filter(a=>!a.pending).map(a=>JSON.stringify(a.choices)).sort();
 assert.deepEqual(choices(result),choices(fresh));assert(resumed.exhausted);assert.equal(resumed.visited,checkpoint.visited+result.search.visited);
 let timed;
 try{H.analyze({...config,onRouteCheckpoint:c=>{timed=copy(c);E.setDeadline(0);}},j.base,j.messages,1,b.self,4096);}catch(e){assert.equal(e.code,'INFERENCE_TIMEOUT');}finally{E.setDeadline();}
 assert(timed?.states.length);
 assert.deepEqual(choices(H.analyze({...config,routeCheckpoint:timed},j.base,j.messages,1,b.self,4096)),choices(fresh));
});
test('storage failure does not prevent a valid search result',async()=>{
 const broken={all:async()=>{throw Error('blocked');},put:async()=>{throw Error('full');}};
 const result=await X.cachedSearch(j,'0:0',{},()=>{},30000,'test-v1',broken);
 assert.equal(result.status,'verified');assert.equal(result.cache.persisted,false);
});
