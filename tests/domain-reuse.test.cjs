const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),T=require('../team');
const shape=s=>s.phases.map(p=>({pr:p.pr,pc:p.pc,domains:p.domains.map(d=>d.map(m=>m.id).sort())}));
test('domain reuse agrees with fresh solving for wrapped translations and multiple event variants',()=>{
 for(const event of ['NONE','LAZYGARDENER','OVERGROWTH','RAINSTORY']){
  const config={...E.newState().config,mode:'CLASSIC',event},a=[{r:4,c:4,kind:'walls',value:'空空空空'}],b=[{r:3,c:3,kind:'quiet'}],as=E.solveMap(config,a),bs=E.solveMap(config,b);
  for(const [dr,dc] of [[0,0],[1,2],[8,8]]){const obs=a.concat(b.map(o=>T.shift(o,dr,dc,9))),fresh=E.solveMap(config,obs),reused=E.mergeMaps(config,as,bs,dr,dc,obs);assert.deepEqual(shape(reused),shape(fresh),event+' '+dr+','+dc);}
 }
});
test('joint variants and door clocks are rechecked rather than treating ID intersection as proof',()=>{
 const config={...E.newState().config,mode:'CLASSIC',event:'LAZYGARDENER',pool:'1 2 3 4 5 6 7 8 9 10 11 12 E1 E2 E3 E4'},origin={r:3,c:3},block=E.pool(config).find(b=>E.variants(b,config.event).length>1),anchors=[{id:block.id,...origin}],empty=E.variants(block,config.event)[0],indices=empty.flatMap((_,i)=>E.variants(block,config.event).some(v=>v[i]==='GRASS')?[i]:[]);
 const a=[{kind:'terrain',r:origin.r+Math.floor(indices[0]/3),c:origin.c+indices[0]%3,value:'GRASS'}],b=[{kind:'terrain',r:origin.r+Math.floor(indices[1]/3),c:origin.c+indices[1]%3,value:'GRASS'}],as=E.solveMap(config,a,anchors),bs=E.solveMap(config,b,anchors);
 assert(as.phases.length&&bs.phases.length);assert.equal(E.mergeMaps(config,as,bs,0,0,a.concat(b),anchors).phases.length,0);
 const irregular={...config,size:10};assert.deepEqual(E.mergeMaps(irregular,{irregular:true},{irregular:true},1,1,a),E.solveMap(irregular,a));
});
test('paired candidates remain identical with and without domain reuse on recorded real gameplay',()=>{
 const M=require('../messages'),j=require('./fixtures/edge-twist-4p-escape.json'),built=M.build(j.base,j.messages),config=built.model.config,nodes=built.views.map(v=>{const s=v.model.segments[0],r=E.replay(s,config.size);return {id:v.id+':0',player:v.id,segment:0,observations:r.observations,anchors:s.anchors,focus:{r:r.r,c:r.c},histories:[]};});
 const a=T.solve({...config,reuseDomains:false},nodes,built.relations),b=T.solve(config,nodes,built.relations);assert.deepEqual(b.pairs,a.pairs);assert.equal(b.conflict,a.conflict);
});
