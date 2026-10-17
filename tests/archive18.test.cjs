const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../messages'),I=require('../inference'),T=require('../team'),E=require('../engine'),j=require('./fixtures/archive18.json');
test('a unique jointly verified offset fuses both players and their observations',async()=>{
 const b=M.build(j.base,j.messages),config=b.model.config;
 const result=await I.run({config:{...config,routePresentation:true},relations:b.relations,notebook:{base:j.base,messages:j.messages,self:b.self,count:2}});
 assert.equal(result.jointStatus,'complete');assert.deepEqual(result.pairs[0].offsets,[{dr:1,dc:5}]);
 assert.deepEqual(T.viewGroups(result,['0:0','1:0']),[['0:0','1:0']]);
 for(const node of result.nodes){assert.equal(node.joined.length,2);assert(node.mergedObservations.some(o=>o.clock?.player===0));assert(node.mergedObservations.some(o=>o.clock?.player===1));}
 assert.deepEqual(T.positionCandidates(config,result,'0:0'),[],'located players are drawn directly instead of as ambiguous markers');
 const own=result.nodes.find(n=>n.player===1),terrain=E.inferredTerrain(own.solution,9);
 for(const step of [1,4]){const quiet=own.observations.find(o=>o.kind==='quiet'&&o.clock.round===1&&o.clock.step===step);assert(quiet);assert.equal(terrain.get(E.key(quiet.r,quiet.c)),'EMPTY');}
});
