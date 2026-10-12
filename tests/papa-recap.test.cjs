const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses');
const messages=require('./fixtures/papa-recap.json');
test('repeated portals retain complete alternative routes including final collision and capture',()=>{
  const built=M.build(E.newState(),messages),h=H.analyze(built.model.config,E.newState(),messages,3,0);
  assert.equal(h.confirmedPortal,true);
  assert.equal(h.groups.find(g=>g.kind==='ground').excluded,true);
  const frames=h.portalViews.afterAlternatives;
  assert.equal(frames.length,2);
  // The old common-only drawing stopped at the second portal and lost the wall.
  assert(!h.portalViews.after.observations.some(o=>o.kind==='hit'));
  for(const f of frames){
    assert.deepEqual(f.teleports.map(t=>t.step),[3,7]);
    assert(f.observations.some(o=>o.kind==='nonPortalSound'&&o.clock.step===4));
    assert(f.observations.some(o=>o.kind==='sound'&&o.clock.step===7));
    const hit=f.observations.find(o=>o.kind==='hit'&&o.clock.step===13);
    assert(hit);assert.equal(hit.dir,3);
    assert.deepEqual(f.positions,[{r:hit.r,c:hit.c}]);
    assert(f.trace.length>=8);
    assert(!f.trace.some(o=>o.clock?.step===6));
    assert(f.solution.phases.length>0);
  }
  assert.notDeepEqual(frames[0].positions,frames[1].positions);
});
