const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),I=require('../inference');
const j=require('./fixtures/player-zero-candidates.json');
test('archive 13 publishes both independent views and a complete player-one portal witness before joint inference',async()=>{
 const b=M.build(j.base,j.messages),events=[];
 const result=await I.run({config:{...b.model.config,routePresentation:true},notebook:{base:j.base,messages:j.messages,self:b.self,count:b.count},relations:b.relations},event=>events.push(event));
 assert.deepEqual(result.playerStatuses.map(s=>s.status),['complete','complete']);
 const partials=events.filter(e=>e.partial);assert.equal(partials.length,2);
 assert(events.indexOf(partials[0])<events.findIndex(e=>e.progress?.stage==='player-budget'&&e.progress.player===1));
 assert(events.indexOf(partials[1])<events.findIndex(e=>e.progress?.stage==='joint-budget'));
 const h=result.hypotheses.find(h=>h.player===1);
 assert(h.portalExamples.length>0);assert.equal(h.groundOnly.status,'impossible');
 assert(h.truncated);assert.equal(h.resolvedChoices,null,'a witness is not an exhaustive proof');
 for(const e of h.portalExamples){
  assert.equal(e.blocks.length,9);assert(e.teleports.length>0);
  assert.deepEqual([...new Set(e.observations.filter(o=>o.kind==='hit').map(o=>o.clock.round))],[1,2,3]);
  const config={...b.model.config,births:[{player:1,r:4,c:4}]};
  const anchors=e.blocks.map(m=>({id:m.id,r:m.origin.r,c:m.origin.c}));
  assert.equal(E.verifyCompleteLayout(config,E.solveMap(config,e.observations,anchors),e.observations,3000).status,'verified');
 }
});
