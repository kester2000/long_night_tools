const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),H=require('../hypotheses'),M=require('../messages'),F=require('./fixtures/heart-recap.cjs');
test('resolved portal route separates its entrance and recentered exit without subspace arrows',()=>{
 const b=M.build(E.newState(),F.messages),h=H.analyze(b.model.config,E.newState(),F.messages,1,0);
 const v=M.buildHypothesis(E.newState(),F.messages,1,0,h.resolvedChoices),frames=H.portalFrames(b.model.config,[v.model],0);
 assert(frames);assert.equal(frames.exitCount,1);
 assert(frames.before.observations.some(o=>o.kind==='terrain'&&o.value==='PORTAL'&&o.clock.step===1));
 assert(!frames.before.observations.some(o=>o.clock.step>1));
 assert(frames.after.observations.some(o=>o.kind==='terrain'&&o.value==='PORTAL'&&o.r===4&&o.c===4&&o.clock.step===3));
 assert(!frames.after.observations.some(o=>o.clock.round===1&&o.clock.step<3));
 assert(!frames.after.observations.some(o=>o.kind==='pass'&&o.clock.round===1&&o.clock.step===2));
 assert(!frames.after.observations.some(o=>o.kind==='portalLink'&&o.clock.round===1&&o.clock.step===1));
});
test('uncertain exit offsets share one independent after view while retaining offset count',()=>{
 const config={...E.newState().config,mode:'TWIST'},make=(dr,dc)=>({segments:[{events:[{kind:'move',dir:1,outcome:'move',clock:{round:1,step:1}},{kind:'observe',r:5,c:4,terrain:'PORTAL',portalLink:{dr,dc},clock:{round:1,step:1}},{kind:'move',dir:1,outcome:'space',clock:{round:1,step:2}},{kind:'move',dir:3,outcome:'space',clock:{round:1,step:3}},{kind:'teleport',dr,dc,clock:{round:1,step:3}},{kind:'observe',r:5+dr,c:4+dc,terrain:'PORTAL',clock:{round:1,step:3}},{kind:'move',dir:0,outcome:'move',clock:{round:1,step:4}},{kind:'move',dir:0,outcome:'hit',clock:{round:1,step:5}}],sounds:[],anchors:[]}],active:0});
 const frames=H.portalFrames(config,[make(-2,-2),make(-2,2)],0);
 assert.equal(frames.exitCount,2);assert.deepEqual(frames.after.positions,[{r:3,c:4}]);
 assert(frames.after.observations.some(o=>o.kind==='hit'&&o.r===3&&o.c===4&&o.dir===0));
 assert.equal(frames.before.observations.filter(o=>o.kind==='portalLink').length,0);
 assert.equal(H.portalFrames(config,[E.newState()],0),null);
});

