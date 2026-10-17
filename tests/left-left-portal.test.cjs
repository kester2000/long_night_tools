const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),T=require('../team');
const j=require('./fixtures/left-left-portal.json');
test('archive 9 left moves cannot walk through an E6 or E7 portal while drawing a continuous ground route',()=>{
 const b=M.build(j.base,j.messages),config=b.model.config,r=E.replay(b.views[0].model.segments[0],9);
 const raw=E.solveMap(config,r.observations,[]);
 const conflict=m=>['E6','E7'].includes(m.id)&&m.origin.r===3&&m.origin.c===0;
 assert(raw.phases.some(p=>p.domains.some(d=>d.some(conflict))),'reproduce the previous incorrect candidate');
 const h=H.analyze(config,j.base,j.messages,0,b.self),node=H.constrainNodes(L.nodes(b),b.relations,[h]).nodes.find(n=>n.id==='0:0');
 assert.equal(b.views[0].model.segments.length,1);
 assert(node.walkingObservations.some(o=>o.kind==='nonPortalSound'&&o.r===5&&o.c===0),'the last left move reaches the candidate portal');
 const solution=T.walkingSolution(config,node);
 assert(solution.phases.length>0,'retain supported continuous walking explanations');
 assert(!solution.phases.some(p=>p.domains.some(d=>d.some(conflict))));
 assert.equal(E.verifyCompleteLayout(config,solution,node.walkingObservations,3000).status,'verified');
 assert(node.routeAlternatives.length>0,'portal alternatives are retained independently');
 for(const id of ['E6','E7']){
  const observations=node.walkingObservations;
  const matches=E.matchBlocks(config,observations,{r:3,c:0},true,new Set([id])).matches;
  assert.equal(matches.length,0,id+' must not survive at the walked portal placement');
 }
});
