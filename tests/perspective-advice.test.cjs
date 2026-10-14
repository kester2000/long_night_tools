const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),A=require('../advice'),T=require('../team'),L=require('../local');
const journal=require('./fixtures/crazy-two-rounds.json');
const built=M.build(journal.base,journal.messages),v=built.views[2],segment=v.model.segments[0],replay=E.replay(segment,9);
const solution=E.refineCompleteLayout(v.model.config,E.solveMap(v.model.config,replay.observations,segment.anchors),replay.observations);
const node={id:'2:0',player:2,observations:replay.observations,anchors:segment.anchors,solution,verification:E.certifyBlocks(v.model.config,solution,replay.observations)};
test('latest two-round player 2 save has one block phase but three supported grass-block alternatives',()=>{
 assert.deepEqual(solution.phases.map(p=>[p.pr,p.pc]),[[2,2]]);
 const p=solution.phases[0],k=p.slots.findIndex(o=>o.r===8&&o.c===5);
 assert.deepEqual(p.domains[k].map(m=>m.id),['6','7','32']);
 for(const m of p.domains[k])assert.equal(E.verifyCompleteLayout(v.model.config,{...solution,phases:[{...p,domains:p.domains.map((d,i)=>i===k?[m]:d)}]},replay.observations,2000).status,'verified');
 const lines=A.perspective({...built,self:2},{nodes:[node]},2);
 assert(!A.perspective({...built,self:0},{nodes:[node]},2).some(x=>x.includes('区分线索：')),'only ask for own private walls');
 assert(lines.some(x=>x.includes('第2回合第2步')&&x.includes('只剩3种')&&x.includes('空间裂隙')));
 assert(lines.some(x=>x.includes('第2回合第2步')&&x.includes('左侧')&&x.includes('若为空，候选缩为7')));
 assert(lines.some(x=>x.includes('第2回合第3步')&&x.includes('左侧')&&x.includes('若为空，候选缩为32')));
 assert(lines.some(x=>x.includes('奇数次进入')&&x.includes('停步风险')));
 assert.equal(node.verification.blocks.length,0,'do not fill an arbitrary complete grass block');
});
test('uncertain or conflicted maps do not claim a unique block boundary or fixed probe result',()=>{
 assert.deepEqual(A.perspective(built,{nodes:[{...node,verification:{status:'unknown'}}]},2),[]);
 assert.deepEqual(A.perspective(built,{nodes:[node],conflict:true},2),[]);
 assert.deepEqual(A.perspective(built,{nodes:[{...node,solution:{...solution,phases:[...solution.phases,...solution.phases]}}]},2),[]);
});
test('confirmed perspective progress arrives before expensive local enumeration',()=>{
 const original=L.analyze,sentinel=new Error('stop before enumeration');let progress;
 L.analyze=()=>{assert(progress,'independent facts must already have been published');throw sentinel;};
 try{assert.throws(()=>T.solve(v.model.config,[{id:'2:0',player:2,observations:replay.observations,anchors:segment.anchors,focus:{r:replay.r,c:replay.c}}],[],data=>{progress=data;assert.equal(data.stage,'perspectives');assert.equal(data.nodes[0].local.pending,true);assert(A.perspective(built,data,2).some(x=>x.includes('只剩3种')));}),error=>error===sentinel);}
 finally{L.analyze=original;}
});

test('pasting subsequent route and wall report automatically identifies player 2 block without hardcoded ids',()=>{
 const extra=[{id:'probe-route',view:2,text:'[2号]玩家本回合的完整行动轨迹：\n↓[↓沙沙]'},{id:'probe-walls',view:2,text:'【第 3 回合】\n空空空空'}];
 const b=M.build(journal.base,journal.messages.concat(extra)),v=b.views[2],r=E.replay(v.model.segments[0],9),s=E.solveMap(v.model.config,r.observations,v.model.segments[0].anchors);
 assert.deepEqual([...new Set(E.globallyFilter(E.matchBlocks(v.model.config,r.observations,{r:r.r,c:r.c}),s).matches.map(m=>m.id))],['7']);
 assert(E.certifyBlocks(v.model.config,s,r.observations).blocks.some(b=>b.id==='7'));
});
test('history verification time limit keeps unverified triples explicitly pending',()=>{
 const obs=[{kind:'terrain',r:1,c:1,value:E.byId.get('1').cells[4].type},{kind:'terrain',r:1,c:4,value:E.byId.get('2').cells[4].type},{kind:'terrain',r:1,c:7,value:E.byId.get('3').cells[4].type}],anchors=['1','2','3'].map((id,i)=>({id,r:0,c:i*3})),config={...E.newState().config,mode:'CLASSIC',historyVerificationMs:0},node={observations:obs,anchors,focus:{r:1,c:1}},s=E.solveMap(config,obs,anchors),local=L.analyze(config,node,s),retained=L.preserveTriples(config,node,s,local);
 assert(retained.triples.length>0);assert(retained.triplesPending);assert(retained.triples.every(c=>c.verification==='unknown'));assert.equal(retained.historyPending,false);
});

