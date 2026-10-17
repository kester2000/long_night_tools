const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),L=require('../local'),T=require('../team'),R=require('../route-explanations');
const j=require('./fixtures/birth-e8.json');
test('archive 10 E8 matches the local walls but is not a verified birth candidate',()=>{
 const b=M.build(j.base,j.messages),config=b.model.config,node=L.nodes(b)[0],solution=E.solveMap(config,node.observations,[]);
 const matches=E.globallyFilter(E.matchBlocks(config,node.observations,node.birth),solution).matches;
 const e8=matches.find(m=>m.id==='E8');assert(e8);assert.equal(e8.lr,1);assert.equal(e8.lc,2);
 const result=T.birthCandidates(config,node,solution,matches);
 assert(!result.matches.some(m=>m.id==='E8'));
 assert(result.pending.some(m=>m.id==='E8'),'unproved fallback must stay unknown, not become an absolute exclusion');
 assert(result.matches.length>0);
 assert(T.birthCandidates(config,{...node,birth:null},solution,matches).matches.some(m=>m.id==='E8'),'later visits are not birth constraints');
 const world={birth:node.birth,focus:node.focus,observations:node.observations,solution};
 const explained=R.explain(config,world,{singles:[{blocks:[e8]}]},0);
 for(const c of explained.cases)assert(E.birthLayoutCheck(config,c.exampleLayout,[{...node.birth,player:0}]).valid);
});
