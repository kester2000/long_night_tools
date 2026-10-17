const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),A=require('../advice'),j=require('./fixtures/hedge-empty-feedback.json');
test('real silent archive retains hedge layouts after a hit followed by empty feedback',()=>{
 const b=M.build(j.base,M.liveMessages(j.messages)),v=b.views[0],r=E.replay(v.model.segments[0],9),h=E.openCollisions(r.observations,9);
 assert.equal(h.get('5,3:3').hedgePossible,true);assert.equal(h.get('5,4:2'),h.get('5,3:3'));
 const s=E.solveMap(v.model.config,r.observations);assert(s.phases.length>0);
 const candidates=E.matchBlocks(v.model.config,r.observations,r).matches;assert(candidates.some(m=>m.id==='47'));assert(candidates.some(m=>m.id==='49'));
 assert(A.practical(b).some(t=>t.includes('第1回合第3步向右撞击')&&t.includes('树篱')));
});
test('hedge advice respects sprint direction, round and receiver and disappears on undo',()=>{
 const hit={kind:'hit',r:5,c:3,dir:3,last:3,clock:{round:1,player:0,step:3}},wall={kind:'walls',r:5,c:3,value:'空空空空',clock:{round:1,player:0,step:1000000}};
 assert.equal(E.openCollisions([hit,wall],9).get('5,3:3').hedgePossible,false);
 assert.equal(E.openCollisions([hit,{...wall,clock:{...wall.clock,round:2}}],9).size,0);
 assert.equal(E.openCollisions([hit,{...wall,clock:{...wall.clock,player:1}}],9).size,0);
 assert.equal(E.openCollisions([hit],9).size,0);
 assert(!E.edgeFits(2,hit,3));assert(E.edgeFits(2,{...hit,last:1},3));
});
