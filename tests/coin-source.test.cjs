const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses');
const j=require('./fixtures/button-coin-atm.json');
test('archive 11 can separate coin source 49 from button source and rejects source 45 under no teleport',()=>{
 for(const source of ['45','49']){
  const messages=[...j.messages,{text:'【第 1 回合】\n1号金币来自'+source+'号区块',view:0}],b=M.build(j.base,messages),config=b.model.config;
  assert.deepEqual(config.coinSources,[{player:1,round:1,block:source}]);assert.equal(config.preferATM,false);
  assert(E.pool(config).some(b=>b.id==='45'),'coin provenance must not remove the block from the map pool');
  const h=H.analyze(config,j.base,messages,1,0),obs=h.walkingObservations,s=E.solveMap(config,obs,[]),proof=E.verifyCompleteLayout(config,s,obs,30000);
  assert.equal(proof.status,source==='45'?'impossible':'verified');
  if(source==='49'){
   const visits=obs.filter(o=>o.kind==='action'&&o.arrival).map(o=>{const m=proof.layout.find(m=>E.mod(o.r-m.origin.r,9)<3&&E.mod(o.c-m.origin.c,9)<3);return {id:m.id,attach:E.byId.get(m.id).cells[E.mod(o.r-m.origin.r,9)*3+E.mod(o.c-m.origin.c,9)].attach};});
   assert(visits.some(v=>v.id==='49'&&v.attach==='COIN'));
   assert.equal(visits.filter(v=>v.attach==='BUTTON').length,1);
   assert(visits.filter(v=>v.attach==='BUTTON').every(v=>v.id!=='49'));
  }
 }
 assert.equal(M.build(j.base,j.messages).model.config.coinSources.length,0,'removing the source message restores both source hypotheses');
});
