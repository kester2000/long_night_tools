const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),L=require('../local'),T=require('../team'),Timeline=require('../timeline');
const j=require('./fixtures/archive17.json');
test('a full example preserves the selected player-one block placement and route',()=>{
 const b=M.build(j.base,j.messages),config=b.model.config,node=T.solve(config,L.nodes(b).filter(n=>n.player===1),[]).nodes[0];
 for(const candidate of node.solution.phases[0].domains[0].slice(0,2)){
  const proof=T.candidateExample(config,node,node.solution,candidate);
  assert.equal(proof.status,'verified');assert.equal(proof.layout.length,9);
  assert(proof.layout.some(m=>m.id===candidate.id&&m.origin.r===candidate.origin.r&&m.origin.c===candidate.origin.c));
  assert(Timeline.check(config,proof.layout.map(m=>({...m,block:E.byId.get(m.id)})),node.mergedObservations||node.observations,true).valid);
 }
 const impossible=T.candidateExample(config,node,node.solution,{id:'missing',origin:node.solution.phases[0].slots[0]});
 assert.equal(impossible.status,'impossible');
});
