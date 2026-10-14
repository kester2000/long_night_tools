const E=require('../engine'),M=require('../messages'),T=require('../team');
const files=process.argv.slice(2).length?process.argv.slice(2):['edge-twist-4p-escape.json','crazy-two-rounds.json'];
for(const file of files){
 const j=require('../tests/fixtures/'+file),b=M.build(j.base,j.messages),config=b.model.config;
 const nodes=b.views.flatMap(v=>v.model.segments.map((s,i)=>{const r=E.replay(s,config.size);return {id:v.id+':'+i,player:v.id,segment:i,observations:r.observations,anchors:s.anchors,focus:{r:r.r,c:r.c},histories:[]};}).filter(n=>n.observations.length||n.segment===v.model.active));
 const runs=[];
 for(const reuseDomains of [false,true]){let pairStart,pairEnd;const start=performance.now(),result=T.solve({...config,reuseDomains},nodes,b.relations,local=>{if(local.stage==='local')pairStart=performance.now();if(local.stage==='aligned')pairEnd=performance.now();});runs.push({reuseDomains,totalMs:Math.round(performance.now()-start),pairMs:Math.round(pairEnd-pairStart),pairs:result.pairs.map(p=>({a:p.a,b:p.b,offsets:p.offsets})),conflict:result.conflict});}
 require('node:assert/strict').deepEqual(runs[1].pairs,runs[0].pairs);require('node:assert/strict').equal(runs[1].conflict,runs[0].conflict);
 console.log(JSON.stringify({file,baseline:{totalMs:runs[0].totalMs,pairMs:runs[0].pairMs},optimized:{totalMs:runs[1].totalMs,pairMs:runs[1].pairMs},candidateParity:true}));
}
