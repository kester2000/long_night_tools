const test=require('node:test'),assert=require('node:assert/strict'),E=require('../engine'),L=require('../local');
test('fast assignment support agrees with exact matching on constrained, broad and quota domains',()=>{
 let seed=12873;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 for(let trial=0;trial<600;trial++){
  const size=3+Math.floor(random()*7),ids=['1','2','3','4','5','6','7','8','9','E1','E2','E3'],slots=Array.from({length:size},(_,i)=>({r:Math.floor(i/3)*3,c:i%3*3})),domains=slots.map(()=>ids.filter(()=>random()<(trial%2?.85:.2)).map(id=>({id}))),pins=slots.slice(0,Math.floor(random()*4)).map((origin,i)=>({origin,id:ids[Math.floor(random()*ids.length)]}));
  const exitCount=trial%3===0?2:null,phase={slots,domains},expected=new Set(pins.map(b=>b.id)).size===pins.length&&pins.every((b,i)=>domains[i].some(m=>m.id===b.id))&&E.hasDistinctAssignment(domains.map((d,i)=>i<pins.length?[pins[i]]:d),exitCount);
  assert.equal(L.groupSupported({exitCount},{phases:[phase]},pins),expected,'trial '+trial);
 }
});
test('cached seam results distinguish equal template ids at different wrapped origins',()=>{
 const config={...E.newState().config,mode:'CLASSIC',dynamicDoors:false,localMaxBlocks:3,localSearchBudget:Infinity,localCandidateBudget:Infinity},ids=['1','2','3'],anchors=ids.map((id,i)=>({id,r:6,c:i*3})),observations=ids.map((id,i)=>({kind:'terrain',r:7,c:i*3+1,value:E.byId.get(id).cells[4].type})),solution=E.solveMap(config,observations,anchors),node={observations,anchors,focus:{r:7,c:1}},first=L.analyze(config,node,solution),second=L.analyze(config,{...node,observations:[...observations,...observations]},solution);
 assert.equal(first.triples.length,1);assert.deepEqual(first.triples.map(c=>c.blocks),second.triples.map(c=>c.blocks));
});
