const {test}=require('node:test'),assert=require('node:assert/strict');
const j=require('./fixtures/archive16.json'),M=require('../messages'),I=require('../inference'),T=require('../team');
test('archive 16 resolves both portal entries and locates player one from both bearings',async()=>{
 const b=M.build(j.base,j.messages),r=await I.run({config:{...b.model.config,routePresentation:true},relations:b.relations,notebook:{base:j.base,messages:j.messages,self:b.self,count:2}});
 assert.equal(r.jointStatus,'complete');
 assert.deepEqual(Object.values(r.completedChoices[0]),[{kind:'portal',dr:2,dc:2},{kind:'portal',dr:2,dc:2}]);
 assert.equal(r.pairs[0].soundCount,2);
 assert.deepEqual(T.positionCandidates(b.model.config,r,'0:0').map(p=>[p.player,p.r,p.c]),[]);
 assert.deepEqual(r.nodes.find(n=>n.id==='0:0').verification.blocks.map(b=>b.id).sort(),['45','46','51']);
});
