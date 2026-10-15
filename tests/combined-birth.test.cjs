const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),T=require('../team');
const journal=require('./fixtures/four-player-birth.json');
function prepare(){
 let choices={},built,hypotheses;
 for(let i=0;i<5;i++){
  built=M.build(journal.base,M.liveMessages(journal.messages),choices);
  hypotheses=H.all(built.views[0].model.config,{base:journal.base,messages:M.liveMessages(journal.messages),self:built.self,count:built.count,choices});
  const next=H.choiceUpdates(hypotheses,choices);if(!next)break;choices=next;
 }
 const config={...built.views[0].model.config,routePresentation:true},constrained=H.constrainNodes(L.nodes(built),built.relations,hypotheses);
 return {config,...constrained};
}
test('archive proves birth block 13 and enumerates all 16 global maps',()=>{
 const p=prepare(),team=T.solve(p.config,p.nodes,p.relations),all=team.combined;
 assert.equal(all.complete,true);assert.equal(all.count,16);assert.equal(all.cases.length,1);
 assert.deepEqual(all.unlocated,['0:1']);
 const third=team.nodes.find(n=>n.id==='3:0');
 assert(third.verification.blocks.some(b=>b.id==='13'&&b.origin.r===4&&b.origin.c===3));
 assert.equal(third.joined.length,4);
 const layouts=all.cases[0].layouts,joined=all.cases[0].joined;
 assert.equal(p.config.exitCount,2);
 for(const layout of layouts){
  assert.equal(layout.length,9);
  assert.equal(new Set(layout.map(b=>b.id)).size,9,'every block ID is used at most once');
  assert.equal(layout.filter(b=>b.id.startsWith('E')).length,2,'every global map has exactly two initial exits');
 }

 const births=p.nodes.filter(n=>n.birth).map(n=>{const d=joined.find(j=>j.id===n.id);return {...T.shift(n.birth,d.dr,d.dc,9),player:n.player};});
 assert(layouts.every(layout=>E.birthLayoutCheck(p.config,layout,births).valid));
 assert.equal(new Set(layouts.map(l=>JSON.stringify(l))).size,16);
 const limited=T.enumerateCombined(p.config,team,null,{maxLayouts:1});
 assert.equal(limited.complete,false,'budget cutoff must not report exact totals');
});
test('exit-block fallback is rejected when ordinary birth candidates suffice',()=>{
 const p=prepare(),nodes=p.nodes.filter(n=>n.observations.length);
 const joined=[{id:'0:0',dr:0,dc:0},{id:'1:0',dr:1,dc:2},{id:'2:0',dr:1,dc:7},{id:'3:0',dr:7,dc:6}];
 const observations=joined.flatMap(j=>nodes.find(n=>n.id===j.id).observations.map(o=>T.shift(o,j.dr,j.dc,9)));
 const solution=E.solveMap(p.config,observations),raw=E.verifyCompleteLayout(p.config,solution,observations,50000,{limit:100});
 const births=joined.map(j=>({...T.shift({r:4,c:4},j.dr,j.dc,9),player:+j.id.split(':')[0]}));
 assert.equal(raw.layouts.length,30);assert.equal(raw.complete,true);
 assert(raw.layouts.every(layout=>!E.birthLayoutCheck(p.config,layout,births).valid));
});
