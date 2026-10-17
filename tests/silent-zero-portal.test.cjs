const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),T=require('../team'),A=require('../advice');
const journal=require('./fixtures/silent-zero-portal.json');
const messages=M.liveMessages(journal.messages),built=M.build(journal.base,messages);
const hypotheses=H.all(built.model.config,{...journal,messages,self:built.self,count:built.count});
const zero=hypotheses.find(h=>h.player===0),choices=Object.fromEntries(hypotheses.filter(h=>h.resolvedChoices).map(h=>[h.player,h.resolvedChoices]));
const resolved=M.build(journal.base,messages,choices);

test('actual named coin announcement is parsed and bound together with the standalone door announcement',()=>{
 assert.equal(M.inspect(journal.messages.at(-2).text).type,'金币线索');
 assert.equal(built.players[1].coins,1);
 assert.deepEqual(built.model.config.coinGains,[{player:1,round:3,min:1,max:1}]);
 assert.deepEqual(built.model.config.buttonCounts,{3:1});
});

test('default worker hypothesis path finishes player zero instead of stopping at 96 search nodes',()=>{
 assert(!zero.truncated);assert(zero.search.visited>96);assert.equal(zero.search.pending,0);
 assert(zero.resolvedChoices);assert.equal(resolved.views[0].ambiguities.length,0);
 assert.equal(zero.groundOnly.status,'impossible');assert(zero.requiresPortal);
 assert(!zero.groups.find(g=>g.kind==='ground').excluded,'ground at the first step still permits later portals');
 assert.deepEqual(Object.values(zero.resolvedChoices).filter(c=>c.kind==='portal'),[
  {kind:'portal',dr:-2,dc:2},{kind:'portal',dr:2,dc:-2},{kind:'portal',dr:-2,dc:2}
 ]);
});

test('verified zero route enters E7 in round one then returns through both portals in round three',()=>{
 const v=resolved.views[0],r=E.replay(v.model.segments[0],9),s=E.solveMap(v.model.config,r.observations),proof=E.certifyBlocks(v.model.config,s,r.observations);
 assert.equal(proof.status,'verified');assert.deepEqual(new Set(proof.blocks.map(b=>b.id)),new Set(['51','E7']));
 assert.deepEqual(r.log.filter(e=>e.portalLink).map(e=>[e.clock.round,e.clock.step]),[[1,10],[3,1],[3,5]]);
 assert.deepEqual(r.log.filter(e=>e.kind==='teleport').map(e=>[e.clock.round,e.clock.step]),[[1,12],[3,3],[3,7]]);
 assert(!r.observations.some(o=>o.kind==='pass'&&(o.clock.round===1&&[11,12].includes(o.clock.step)||o.clock.round===3&&[2,3,6,7].includes(o.clock.step))));
 assert.deepEqual([r.r,r.c],[7,5]);
});

test('walking-only contradiction is available even when the portal search remains unfinished',()=>{
 const h=H.analyze(built.model.config,journal.base,messages,0,1,1);
 assert(h.truncated);assert.equal(h.search.visited,1);assert.equal(h.groundOnly.status,'impossible');
 assert.equal(h.requiresPortal,false,'an unsearched portal prefix is not a verified complete explanation');
 const advice=A.hypothesis(h).join('\n');assert(advice.includes('0号全程按地面移动的解释已排除'));assert(advice.includes('待验证'));
});

test('walking-only evidence does not claim a portal when a full walking route still fits',()=>{
 const ms=['模式经典\n玩家人数：2\n我是0号\n静音开启','[0号]玩家本回合的完整行动轨迹：\n→↑↑'].map((text,i)=>({id:String(i),text,view:0}));
 const b=M.build(E.newState(),ms),h=H.analyze(b.model.config,E.newState(),ms,0,0,1);
 assert(h&&h.truncated);assert.equal(h.confirmedPortal,false);assert.equal(h.resolvedChoices,null);assert.equal(h.groundOnly.status,'verified');assert.equal(b.views[0].ambiguities.length,0);
});

test('both resolved routes jointly fit the real coin and button counts without claiming unique alignment',()=>{
 const nodes=L.nodes(resolved).map(n=>({...n,histories:[],previous:null})),team=T.solve(resolved.model.config,nodes,resolved.relations);
 assert(!team.conflict);assert(team.nodes.every(n=>n.verification.status==='verified'));
 assert.equal(team.pairs[0].offsets.length,2);
 const advice=A.summarize(resolved,team).join('\n');
 assert(advice.includes('0号第1回合第10步进入传送门，第12步'));
 assert(advice.includes('0号第3回合第1步进入传送门，第3步'));
 assert(advice.includes('0号第3回合第5步进入传送门，第7步'));
 assert(advice.includes('金币拾取候选：第14步'));
});


test('preliminary silent replay retains input for the hypothesis pass, without manufacturing quiet evidence',()=>{
 const j=require('./fixtures/three-second-hit.json'),b=M.build(j.base,M.liveMessages(j.messages));
 assert(b.views.every(v=>v.ambiguities.length===0));
 const r=E.replay(b.views[2].model.segments[0],9);
 assert(r.observations.some(o=>o.kind==='hit'&&o.r===3&&o.c===4));
 assert(!r.observations.some(o=>o.kind==='quiet'));
});

test('an unfinished walking verification keeps proactive silent portal branches pending',()=>{
 const original=E.verifyCompleteLayout;let calls=0;
 E.verifyCompleteLayout=()=>{calls++;return {status:'unknown'};};
 try{const h=H.analyze(built.model.config,journal.base,messages,0,1,1);assert(h.truncated);assert.equal(h.resolvedChoices,null);assert.equal(h.groundOnly.status,'unknown');assert(calls>0);}
 finally{E.verifyCompleteLayout=original;}
});

test('explicit teleport in silent mode still separates routes and preserves the later hit',()=>{
 const ms=['模式经典\n玩家人数：2\n我是0号\n静音开启','[0号]玩家本回合的完整行动轨迹：\n→[传送]','[0号]玩家本回合的完整行动轨迹：\n↑(←撞)'].map((text,i)=>({id:String(i),text,view:0}));
 const v=M.build(E.newState(),ms).views[0];assert(v.model.active>0);
 assert(E.replay(v.model.segments[v.model.active],9).observations.some(o=>o.kind==='hit'&&o.dir===2));
});
