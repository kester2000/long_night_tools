const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),T=require('../team');
const F=require('./fixtures/heart-recap.cjs');
test('public heartbeat arrow branches into a portal even when the hidden papa was omitted',()=>{
 const ms=['模式幻变\n玩家人数：2\n我是0号','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','[1号]玩家本回合的完整行动轨迹：\n↓↓[→啪嗒]↑(↑撞)','本局有心脏'].map((text,i)=>({id:String(i),text,view:0}));
 const b=M.build(E.newState(),ms),first=b.views[1].ambiguities[0];
 assert.equal(first.step,1);assert(first.maskedUnknown);
 const h=H.analyze(b.model.config,E.newState(),ms,1,0);
 assert(!h.groups.find(g=>g.kind==='portal').excluded);
 const actual=M.buildHypothesis(E.newState(),ms,1,0,{[first.key]:{kind:'portal',dr:-2,dc:-2}}),r=E.replay(actual.model.segments[0],9);
 assert.deepEqual([r.r,r.c],[2,2]);assert.equal(actual.branchErrors.length,0);
 assert(!r.observations.some(o=>o.kind==='pass'&&o.clock.step===2));
});
test('heart beats stop after step nineteen; step twenty-two is not silently masked',()=>{
 const ms=['模式幻变','本局有心脏','[0号]玩家本回合的完整行动轨迹：\n'+Array(22).fill('→').join('')].map((text,i)=>({id:String(i),text}));
 const choices={};let built;
 for(let i=0;i<9;i++){built=M.buildHypothesis(E.newState(),ms,0,0,choices);const a=built.ambiguities[0];if(!a)break;choices[a.key]={kind:'ground'};}
 const quiet=E.replay(built.model.segments[0],9).observations.filter(o=>o.kind==='quiet').map(o=>o.clock.step);
 assert(!quiet.includes(19));assert(quiet.includes(22));
});
test('known heart requires a heart in every verified full map rather than only allowing its template',()=>{
 const config={...E.newState().config,mode:'CLASSIC',heartPresence:true};
 assert.equal(E.solveMap(config,[]).phases.length,0);
 const broad={...config,mode:'TWIST'},proof=E.verifyCompleteLayout(broad,E.solveMap(broad,[]),[]);
 assert.equal(proof.status,'verified');assert(proof.layout.some(b=>b.id==='51'));
});
test('final screenshot replay resolves both portal routes, capture alignment and four verified blocks',()=>{
 let built=M.build(E.newState(),F.messages);const choices={};
 for(let player=0;player<2;player++){
  const h=H.analyze(built.model.config,E.newState(),F.messages,player,0);
  assert(h.resolvedChoices);assert(!h.truncated);choices[player]=h.resolvedChoices;
 }
 built=M.build(E.newState(),F.messages,choices);
 const nodes=built.views.map(v=>{
  assert.equal(v.ambiguities.length,0);assert.equal(v.branchErrors.length,0);assert.equal(v.model.segments.length,1);
  const r=E.replay(v.model.segments[0],9),absolute={r:E.mod(r.r+F.births[v.id].r-4,9),c:E.mod(r.c+F.births[v.id].c-4,9)};
  assert.deepEqual(absolute,F.ends[v.id]);
  const anchors=F.layout.map(b=>({id:b.id,r:E.mod(b.origin.r-F.births[v.id].r+4,9),c:E.mod(b.origin.c-F.births[v.id].c+4,9)}));
  assert.equal(E.verifyCompleteLayout(v.model.config,E.solveMap(v.model.config,r.observations,anchors),r.observations).status,'verified');
  return {id:v.id+':0',player:v.id,segment:0,observations:r.observations,anchors:[],focus:r};
 });
 assert.equal(built.captures.length,1);assert(built.captures[0].aligned);assert(!built.players[0].alive);assert(built.players[1].alive);
 const team=T.solve(built.model.config,nodes,built.relations);
 assert.deepEqual(team.pairs[0].offsets,[{dr:6,dc:3}]);
 assert.deepEqual(team.nodes[0].verification.blocks.map(b=>b.id).sort(),['14','45','5','51']);
 for(const node of team.nodes)for(const b of node.verification.blocks){const truth=F.layout.find(x=>x.id===b.id);assert.deepEqual({r:E.mod(b.origin.r+F.births[node.player].r-4,9),c:E.mod(b.origin.c+F.births[node.player].c-4,9)},truth.origin);}
});
