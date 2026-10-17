const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),j=require('./fixtures/three-second-hit.json');
test('silent route keeps player two collision connected to the full ground route',()=>{
 const b=M.build(j.base,M.liveMessages(j.messages)),v=b.views[2];assert.equal(v.ambiguities.length,0);
 const r=E.replay(v.model.segments[v.model.active],9),hit=r.observations.find(o=>o.kind==='hit');
 assert(hit);assert.equal(hit.dir,0);assert.equal(hit.clock.step,4);assert.equal(hit.last,0);assert.equal(hit.clock.player,2);
 assert.equal(v.model.active,0);assert.equal(v.roundEnds[0].locatable,true);
 assert.deepEqual([hit.r,hit.c],[3,4]);
 assert(b.reports[10].summary.some(s=>s.includes('撞墙 1 次')));
});
test('expired calculation budget interrupts solver and resets cleanly',()=>{
 E.setDeadline(Date.now()-1);
 try{assert.throws(()=>E.solveMap(E.newState().config,[]),e=>e.code==='INFERENCE_TIMEOUT');}finally{E.setDeadline();}
 assert.doesNotThrow(()=>E.replay(E.newState().segments[0],9));
});
