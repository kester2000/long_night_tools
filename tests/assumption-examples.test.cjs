const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses');
const j=require('./fixtures/left-left-portal.json');
test('show full walking witness and real portal witnesses, including portals after an initial ground choice',()=>{
 const b=M.build(j.base,j.messages),h=H.analyze(b.model.config,j.base,j.messages,0,0);
 assert.equal(h.portalStatus,'possible');assert.equal(h.walkingExamples.length,1);
 assert.equal(h.walkingExamples[0].unique,false);
 assert.equal(h.portalExamples.length,3);
 assert(h.groups.find(g=>g.kind==='portal').excluded,'first-step exclusion must not imply no later portal');
 for(const e of [...h.walkingExamples,...h.portalExamples]){
  assert.equal(e.blocks.length,9);
  const anchors=e.blocks.map(m=>({id:m.id,r:m.origin.r,c:m.origin.c}));
  const s=E.solveMap(b.model.config,e.observations,anchors);
  assert.equal(E.verifyCompleteLayout(b.model.config,s,e.observations,3000).status,'verified');
 }
 assert(h.portalExamples.every(e=>e.teleports.some(t=>t.round===2&&t.step===6)));
 assert.equal(new Set(h.portalExamples.map(e=>JSON.stringify(e.blocks))).size,3);
});
test('unfinished portal search cannot be described as proof of no teleport',()=>{
 const b=M.build(j.base,j.messages),h=H.analyze(b.model.config,j.base,j.messages,0,0,1);
 assert.equal(h.portalStatus,'unknown');assert.equal(h.portalExamples.length,0);
});
