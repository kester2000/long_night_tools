const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),j=require('./fixtures/birth-non-exit.json');
const note={id:'birth-confirmed',text:'1号的出生区块不可能是逃生区块',view:0};
test('birth exclusion applies to the entire block and only to the named player',()=>{
 const b=M.build(j.base,[...j.messages,note]),birth={r:4,c:4};
 const one=E.replay(b.views[1].model.segments[0],9),zero=E.replay(b.views[0].model.segments[0],9);
 assert(one.observations.some(o=>o.kind==='nonExitBlock'));assert(!zero.observations.some(o=>o.kind==='nonExitBlock'));
 const matches=E.matchBlocks(b.model.config,one.observations,birth).matches;
 assert(matches.length);assert(matches.every(m=>!m.block.cells.some(c=>c.type==='EXIT')));
 const unrestricted=M.build(j.base,j.messages);assert(!E.replay(unrestricted.views[1].model.segments[0],9).observations.some(o=>o.kind==='nonExitBlock'));
});
test('portal hypotheses and the normal map solver both retain the birth restriction',()=>{
 const ms=[...j.messages,note],b=M.build(j.base,ms),h=H.analyze(b.model.config,j.base,ms,1,0,16);
 assert(h);for(const g of h.groups.filter(g=>!g.excluded))for(const a of g.alternatives){
  assert(a.observations.some(o=>o.kind==='nonExitBlock'));
  for(const phase of a.solution.phases){const i=phase.slots.findIndex(p=>E.mod(4-p.r,9)<3&&E.mod(4-p.c,9)<3);
   assert(phase.domains[i].every(m=>!m.block.cells.some(c=>c.type==='EXIT')));
  }
 }
 const config=b.model.config,obs=[{kind:'nonExitBlock',r:4,c:4}],away=E.matchBlocks(config,obs,{r:0,c:0}).matches;
 assert(away.some(m=>m.id.startsWith('E')),'later or distant exit blocks are still allowed');
});
