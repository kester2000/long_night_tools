(function(root){
 'use strict';
 const E=typeof module!=='undefined'?require('./engine.js'):root.LongNight;
 const inside=(p,m,n)=>E.mod(p.r-m.origin.r,n)<3&&E.mod(p.c-m.origin.c,n)<3;
 const compactCache=new WeakMap();
 const compact=m=>{if(!compactCache.has(m))compactCache.set(m,{id:m.id,origin:m.origin,cellTypes:m.cellTypes});return compactCache.get(m);};
 function seam(config,observations,a,b){
  const n=config.size,at=p=>{for(const m of [a,b])if(inside(p,m,n))return {m,i:E.mod(p.r-m.origin.r,n)*3+E.mod(p.c-m.origin.c,n)};};
  for(const o of observations){const x=at(o);if(!x)continue;
   for(let d=0;d<4;d++){
    if(!(o.kind==='walls'&&o.value[d]!=='?'||(o.kind==='pass'||o.kind==='hit')&&o.dir===d))continue;
    const y=at({r:E.mod(o.r+E.V[d][0],n),c:E.mod(o.c+E.V[d][1],n)});if(!y||x.m===y.m)continue;
    const raw=Math.max(x.m.block.cells[x.i].walls[d],y.m.block.cells[y.i].walls[E.OPP[d]]),values=config.dynamicDoors&&(raw===3||raw===4)?[3,4]:[raw];
    if(!values.some(w=>E.edgeFits(w,o,d,E.hasBoxes(y.m.block))))return false;
   }
  }
  return true;
 }
 function groupSupported(config,solution,blocks){
  if(new Set(blocks.map(b=>b.id)).size!==blocks.length)return false;
  if(solution.irregular)return true;
  for(const p of solution.phases){const pins=new Map();let valid=true;
   for(const b of blocks){const i=p.slots.findIndex(s=>s.r===b.origin.r&&s.c===b.origin.c);if(i<0||!p.domains[i].some(m=>m.id===b.id)){valid=false;break;}pins.set(i,b);}
   if(valid){
    const used=new Set(blocks.map(b=>b.id)),remaining=p.domains.filter((_,i)=>!pins.has(i));
    // Hall's condition is automatic when every remaining domain contains at
    // least as many distinct ids as there are remaining slots. This is common
    // for the mostly unexplored map; constrained cases still use exact matching.
    if(config.exitCount==null&&remaining.every(d=>{const ids=new Set();for(const m of d){if(!used.has(m.id))ids.add(m.id);if(ids.size>=remaining.length)return true;}return false;}))return true;
    if(E.hasDistinctAssignment(p.domains.map((d,i)=>pins.has(i)?[pins.get(i)]:d),config.exitCount))return true;
   }
  }return false;
 }
 const pairSupported=(config,solution,a,b)=>groupSupported(config,solution,[a,b]);
 function dependency(config,observations,blocks){
  const n=config.size;
  for(const o of observations){const a=blocks.find(b=>inside(o,b,n));if(!a)continue;const i=E.mod(o.r-a.origin.r,n)*3+E.mod(o.c-a.origin.c,n);
   for(let d=0;d<4;d++){
    if(!(o.kind==='walls'&&o.value[d]!=='?'||(o.kind==='pass'||o.kind==='hit')&&o.dir===d))continue;
    const next={r:E.mod(o.r+E.V[d][0],n),c:E.mod(o.c+E.V[d][1],n)};if(blocks.some(b=>inside(next,b,n)))continue;
    const raw=a.block.cells[i].walls[d],values=config.dynamicDoors&&(raw===3||raw===4)?[3,4]:[raw];
    const fits=values.some(w=>E.edgeFits(w,o,d,E.hitBoxPossible(config,a.block,i,d)));
    if(!fits)return {origin:{r:E.mod(a.origin.r+E.V[d][0]*3,n),c:E.mod(a.origin.c+E.V[d][1]*3,n)},from:a.id,dir:d,r:o.r,c:o.c};
   }
  }return null;
 }
 function analyzeBounded(config,node,solution,onProgress=null){
  const n=config.size,focus=node.focus||{r:Math.floor(n/2),c:Math.floor(n/2)},obs=node.observations;
  if(!obs.length)return {waiting:true,singles:[],doubles:[],triples:[],expanded:[],focusCandidates:[],gap:n===10};
  const local=E.globallyFilter(E.matchBlocks(config,obs,focus),solution),points=[focus,...obs];
  for(const o of obs)if(o.kind==='pass')points.push({r:E.mod(o.r+E.V[o.dir][0],n),c:E.mod(o.c+E.V[o.dir][1],n)});
  const singles=[],doubles=[],triples=[],expanded=[],seen=new Set(),neighborCache=new Map(),seamCache=new Map(),dependencyCache=new WeakMap(),placementKeys=new WeakMap();let needsMore=false,searchSteps=0,truncated=false;const searchBudget=config.localSearchBudget||6000,candidateBudget=config.localCandidateBudget||300,maxBlocks=n===10?1:(config.localMaxBlocks||n*n/9);
  function placementKey(m){if(!placementKeys.has(m))placementKeys.set(m,m.id+'@'+E.key(m.origin.r,m.origin.c));return placementKeys.get(m);}
  function joins(a,b){const pair=[placementKey(a),placementKey(b)].sort().join('/');if(!seamCache.has(pair))seamCache.set(pair,seam(config,obs,a,b));return seamCache.get(pair);}
  function needs(blocks){
   for(const a of blocks){
    if(!dependencyCache.has(a)){
     const requirements=[];
     for(const o of obs){if(!inside(o,a,n))continue;const i=E.mod(o.r-a.origin.r,n)*3+E.mod(o.c-a.origin.c,n);
      for(let d=0;d<4;d++){
       if(!(o.kind==='walls'&&o.value[d]!=='?'||(o.kind==='pass'||o.kind==='hit')&&o.dir===d))continue;
       const next={r:E.mod(o.r+E.V[d][0],n),c:E.mod(o.c+E.V[d][1],n)};if(inside(next,a,n))continue;
       const raw=a.block.cells[i].walls[d],values=config.dynamicDoors&&(raw===3||raw===4)?[3,4]:[raw];
       if(!values.some(w=>E.edgeFits(w,o,d,E.hitBoxPossible(config,a.block,i,d))))requirements.push({origin:{r:E.mod(a.origin.r+E.V[d][0]*3,n),c:E.mod(a.origin.c+E.V[d][1]*3,n)},from:a.id,dir:d,r:o.r,c:o.c});
      }
     }dependencyCache.set(a,requirements);
    }
    for(const requirement of dependencyCache.get(a))if(!blocks.some(b=>b.origin.r===requirement.origin.r&&b.origin.c===requirement.origin.c))return requirement;
   }return null;
  }
  function domain(origin){const k=E.key(origin.r,origin.c);if(!neighborCache.has(k))neighborCache.set(k,E.globallyFilter(E.matchBlocks(config,obs,origin,true),solution).matches);return neighborCache.get(k);}
  for(const a of local.matches){
   if(n===10){if(points.every(p=>inside(p,a,n)))singles.push({blocks:[compact(a)],lr:a.lr,lc:a.lc});continue;}
   const required=new Map();for(const p of points){const origin={r:E.mod(a.origin.r+Math.floor(E.mod(p.r-a.origin.r,n)/3)*3,n),c:E.mod(a.origin.c+Math.floor(E.mod(p.c-a.origin.c,n)/3)*3,n)};required.set(E.key(origin.r,origin.c),origin);}
   if(required.size>maxBlocks){needsMore=true;continue;}

   let lastProgress=0;
   function visit(blocks,reasons,supported=false){
    if(++searchSteps>searchBudget||seen.size>=candidateBudget){truncated=true;return;}
    if(onProgress&&searchSteps%256===0&&Date.now()-lastProgress>=200){lastProgress=Date.now();onProgress({enumerating:true,searchSteps,found:triples.length});}
    let origin=[...required.values()].filter(o=>!blocks.some(b=>b.origin.r===o.r&&b.origin.c===o.c)).sort((a,b)=>domain(a).length-domain(b).length)[0],need=null;
    if(!origin){need=needs(blocks);origin=need?.origin;}
    if(origin){if(blocks.length===maxBlocks){needsMore=true;return;}
     for(const b of domain(origin)){if(truncated)return;if(blocks.some(a=>a.id===b.id)||!blocks.every(a=>joins(a,b)))continue;const next=[...blocks,b];if(!groupSupported(config,solution,next))continue;visit(next,need?[...reasons,{...need,provider:b.id}]:reasons,true);}return;
    }
    if(!supported&&!groupSupported(config,solution,blocks))return;
    if(blocks.length<(config.localMinBlocks||1))return;
    const signature=blocks.map(placementKey).sort().join('/');if(seen.has(signature))return;seen.add(signature);
    const candidate={blocks:blocks.map(compact),lr:a.lr,lc:a.lc,reasons,spawn:E.spawnCheck(config,blocks,node.birth)};
    if(blocks.length>1){const b=blocks[1];candidate.direction=E.V.findIndex(([dr,dc])=>E.mod(a.origin.r+dr*3,n)===b.origin.r&&E.mod(a.origin.c+dc*3,n)===b.origin.c);}
    (blocks.length===1?singles:blocks.length===2?doubles:blocks.length===3?triples:expanded).push(candidate);
   }
   visit([a],[]);if(truncated)break;
  }
  return {waiting:false,singles,doubles,triples,expanded,needsMore,truncated,searchSteps,maxBlocks,focusCandidates:local.matches.map(compact),focus,gap:local.gap,irregular:n===10};
 }
 function analyze(config,node,solution,onProgress=null){
  // Exhaustive callers already reach every size. Bounded automatic expansion
  // must reserve independent searches for small explanations before large ones.
  if(config.localMaxBlocks||config.size===10||config.localSearchBudget===Infinity)return analyzeBounded(config,node,solution,onProgress);
  const single=analyzeBounded({...config,localMaxBlocks:1,localSearchBudget:Infinity,localCandidateBudget:Infinity},node,solution,onProgress);
  if(single.waiting)return single;
  const pair=analyzeBounded({...config,localMaxBlocks:2,localMinBlocks:2},node,solution,onProgress);
  const larger=analyzeBounded({...config,localMinBlocks:3},node,solution,onProgress);
  return {...larger,singles:single.singles,doubles:pair.doubles,singlesComplete:true,doublesComplete:!pair.truncated,truncated:pair.truncated||larger.truncated,searchSteps:single.searchSteps+pair.searchSteps+larger.searchSteps};
 }
 function retainedSingles(config,node,solution){
  if(solution.irregular)return [];
  const out=[],seen=new Set(),histories=new Set(),current=node.mergedObservations||node.observations;
  for(const history of node.histories||[node.previous].filter(Boolean)){
   if(!history.observations?.length||history.observations.length>=current.length)continue;
   const signature=JSON.stringify([history.observations,history.focus]);if(histories.has(signature))continue;histories.add(signature);
   const old=analyzeBounded({...config,localMaxBlocks:1,localSearchBudget:Infinity,localCandidateBudget:Infinity},history,solution);
   if(!old.singles.length||old.singles.length>8)continue;
   for(const c of old.singles){const b=c.blocks[0],key=b.id+'@'+E.key(b.origin.r,b.origin.c);if(seen.has(key))continue;seen.add(key);
    const phases=solution.phases.flatMap(p=>{const k=p.slots.findIndex(s=>s.r===b.origin.r&&s.c===b.origin.c);if(k<0)return [];const domains=p.domains.map((d,i)=>i===k?d.filter(m=>m.id===b.id):d);return domains.every(d=>d.length)?[{...p,domains}]:[];});
    const proof=E.verifyCompleteLayout(config,{...solution,phases},current,1000);
    if(proof.status!=='impossible')out.push({...c,verification:proof.status,patternFocus:history.focus});
   }
  }return out;
 }
 function retained(config,node,solution,local){
  if(!node.previous?.observations.length||solution.irregular)return [];
  const previous=node.previous,old=analyze(config,previous,E.solveMap(config,previous.observations,previous.anchors||[]));
  const small=[...old.singles,...old.doubles,...old.triples];if(!small.length||small.length>12)return [];
  const current=[...local.singles,...local.doubles,...local.triples,...local.expanded];
  return small.flatMap(c=>{if(current.some(x=>x.blocks.length===c.blocks.length&&c.blocks.every(b=>x.blocks.some(a=>a.id===b.id&&a.origin.r===b.origin.r&&a.origin.c===b.origin.c))))return [];
    const anchors=[...(node.anchors||[]),...c.blocks.map(b=>({id:b.id,r:b.origin.r,c:b.origin.c}))],pinned=E.solveMap(config,node.observations,anchors),proof=E.verifyCompleteLayout(config,pinned,node.observations);
    if(proof.status!=='verified')return [];return [{blocks:c.blocks,extensions:current.filter(x=>c.blocks.every(b=>x.blocks.some(a=>a.id===b.id&&a.origin.r===b.origin.r&&a.origin.c===b.origin.c))).length}];
  });
 }
 function preserveTriples(config,node,solution,local,onProgress=null){
  if(solution.irregular)return local;
  const exhaustive=analyze({...config,localMaxBlocks:3,localSearchBudget:Infinity,localCandidateBudget:Infinity},node,solution,onProgress);
  const triples=new Map(),historiesSeen=new Set(),checked=new Set(),verifyStarted=Date.now();let pending=false,checks=0,lastProgress=0;
  function signature(c){return c.blocks.map(b=>b.id+'@'+E.key(b.origin.r,b.origin.c)).sort().join('/');}
  for(const history of [node,...(node.histories||[node.previous].filter(Boolean))]){
   if(!history.observations?.length)continue;
   const historyKey=JSON.stringify([history.observations,history.focus]);if(historiesSeen.has(historyKey))continue;historiesSeen.add(historyKey);
   const old=history===node?exhaustive:analyze({...config,localMaxBlocks:3,localSearchBudget:Infinity,localCandidateBudget:Infinity},history,solution,onProgress);
   for(const c of old.triples){const key=signature(c);if(checked.has(key))continue;checked.add(key);
    // Pin the already solved current domains instead of rebuilding every domain
    // from all templates for each historical triple. This is the same constraint.
    const verifyNow=Date.now()-verifyStarted<(config.historyVerificationMs??500);
    const phases=verifyNow?solution.phases.flatMap(p=>{const domains=p.domains.map((d,i)=>{const pin=c.blocks.find(b=>b.origin.r===p.slots[i].r&&b.origin.c===p.slots[i].c);return pin?d.filter(m=>m.id===pin.id):d;});return c.blocks.every(b=>p.slots.some(o=>o.r===b.origin.r&&o.c===b.origin.c))&&domains.every(d=>d.length)?[{...p,domains}]:[];}):null;
    const pinned={...solution,phases};
    // Historical display candidates must not monopolize the live inference.
    // A budget-limited result remains explicit and selectable; only a proof of
    // impossibility removes it. Main-map certification has its own full budget.
    const proof=verifyNow?E.verifyCompleteLayout(config,pinned,node.observations,config.historyProofBudget??80):{status:'unknown'};
    checks++;if(onProgress&&Date.now()-lastProgress>=200){lastProgress=Date.now();onProgress({checks,kept:triples.size,history:historiesSeen.size});}
    if(proof.status==='impossible')continue;
    pending ||= proof.status==='unknown';triples.set(signature(c),{...c,partial:history!==node,verification:proof.status,patternFocus:history.focus});
   }
  }
  return {...local,historyPending:false,fullRouteTriples:exhaustive.triples.length,triples:[...triples.values()],triplesPending:pending};
 }
 function routeHistories(segment,n,birth=null){
  const rounds=[...new Set(segment.events.filter(e=>e.clock).map(e=>e.clock.round))].sort((a,b)=>a-b);
  if(rounds.length)return rounds.map(round=>{const at=E.replay({...segment,events:segment.events.filter(e=>!e.clock||e.clock.round<=round)},n);return {observations:at.observations,focus:{r:at.r,c:at.c},anchors:segment.anchors,birth,round};});
  return segment.events.flatMap((e,i)=>{if(e.kind!=='turn')return [];const at=E.replay({...segment,events:segment.events.slice(0,i+1)},n);return [{observations:at.observations,focus:{r:at.r,c:at.c},anchors:segment.anchors,birth}];});
 }
 function nodes(built){
  const n=built.model.config.size,middle=Math.floor(n/2);
  return built.views.flatMap(v=>v.model.segments.map((segment,i)=>{
   const at=E.replay(segment,n),birth=i===0?{r:middle,c:middle}:null,histories=routeHistories(segment,n,birth);
   return {id:v.id+':'+i,player:v.id,segment:i,histories,previous:histories.filter(h=>h.observations.length<at.observations.length).at(-1)||null,birth,observations:at.observations,anchors:segment.anchors,focus:{r:at.r,c:at.c}};
  }).filter(node=>node.segment===v.model.active||node.observations.length));
 }
 const api={nodes,routeHistories,preserveTriples,retainedSingles,retained,analyze,seam,inside,pairSupported,groupSupported,dependency};if(typeof module!=='undefined')module.exports=api;else root.LongNightLocal=api;
})(globalThis);
