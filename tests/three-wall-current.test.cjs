const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),T=require('../team'),A=require('../advice');
const j=require('./fixtures/three-wall-current.json');
test('archive 8 walking candidates retain round three walls instead of reusing portal entrance candidates',()=>{
 const b=M.build(j.base,j.messages),h=H.analyze(b.model.config,j.base,j.messages,0,b.self);
 const node=H.constrainNodes(L.nodes(b),b.relations,[h]).nodes.find(n=>n.id==='0:0');
 assert(node.routePending);assert.equal(b.views[0].model.segments.length,1);
 const at=E.replay(b.views[0].model.segments[0],9),walls=at.observations.findLast(o=>o.kind==='walls');
 assert.equal(walls.value,'墙墙墙空');assert.deepEqual([walls.r,walls.c],[at.r,at.c]);
 const solution=T.walkingSolution(b.model.config,node),matches=E.globallyFilter(E.matchBlocks(b.model.config,at.observations,at),solution).matches;
 assert.deepEqual(matches.map(m=>[m.id,m.lr,m.lc]).sort(),[['10',2,1]]);
 for(const m of matches){
  const phases=solution.phases.map(p=>({...p,domains:p.domains.map(d=>d.filter(x=>x.origin.r!==m.origin.r||x.origin.c!==m.origin.c||x.id===m.id))})).filter(p=>p.domains.every(d=>d.length));
  assert.equal(E.verifyCompleteLayout(b.model.config,{...solution,phases},node.walkingObservations,3000).status,'verified');
 }
 assert.equal(T.walkingSolution(b.model.config,node),solution);
 assert.equal(A.radar(b,{nodes:[node]},0),null,'entrance prefix must not certify the current position');
 const source=fs.readFileSync(require.resolve('../chat.js'),'utf8'),start=source.indexOf('  function certifiedSolution('),end=source.indexOf('  function blockPossibilities(',start);
 const display=new Function('window','model',source.slice(start,end)+';return certifiedSolution;')({LongNightTeam:T},b.model);
 assert.equal(display(node),solution,'map popup uses all walking evidence, never the prefix solution');
});
