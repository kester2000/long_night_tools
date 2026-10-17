(function longNightModule(root){
 'use strict';
  (root.LongNightSources ||= {})['sound-candidates.js']=longNightModule.toString();
 const E=typeof module!=='undefined'?require('./engine'):root.LongNight;
 const L=typeof module!=='undefined'?require('./local'):root.LongNightLocal,patternCache=new WeakMap();
 const shift=(o,dr,dc,n)=>({...o,r:E.mod(o.r+dr,n),c:E.mod(o.c+dc,n)});
 function hearings(built){
  const out=[...built.relations];
  for(const view of built.views)for(const h of view.hears){
   if(!h.step||h.a===h.b||out.some(r=>r.a===h.a&&r.b===h.b&&r.index===h.index&&r.step===h.step))continue;
   const source=built.views[h.b];if(!source)continue;
   const round=h.round??source.steps.findLast(s=>s.index<=h.index)?.round??source.roundEnds.at(-1)?.round??1;
   const before=round-(h.a>h.b?1:0),end=view.roundEnds.filter(e=>e.round<=before).sort((a,b)=>b.round-a.round)[0];
   if(end?.inSpace||end?.locatable===false)continue;
   const middle=Math.floor(built.model.config.size/2),segment=end?.segment||0;
   const sourceSegment=source.ambiguities.find(a=>a.round===round&&a.step<=h.step)?.segment??source.model.active;
   out.push({...h,round,listener:end?{r:end.r,c:end.c}:{r:middle,c:middle},aNode:h.a+':'+segment,bNode:h.b+':'+sourceSegment});
  }
  return out;
 }
 function attach(nodes,hypotheses){return nodes.map(node=>{const h=hypotheses.find(h=>node.id===h.player+':'+h.segment);return h?{...node,soundAlternatives:h.groups.filter(g=>!g.excluded).flatMap(g=>g.alternatives||[])}:node;});}
 function worlds(node){return node.soundAlternatives||node.portalAlternatives||[{observations:node.mergedObservations||node.observations,solution:node.solution,positions:[node.focus]}];}
 function sourceAt(world,h){return world.observations.findLast(o=>o.kind==='action'&&o.clock?.player===h.b&&o.clock.round===h.round&&o.clock.step===h.step)||(!world.branch?h.source:null);}
 function listenerAt(world,node,h){
  if(!node.portalAlternatives&&!node.soundAlternatives)return h.listener;
  const before=h.round-(h.a>h.b?1:0),end=world.observations.findLast(o=>o.kind==='turnEnd'&&o.clock?.player===h.a&&o.clock.round<=before);
  return end||node.birth;
 }
 function analyze(config,nodes,relations,onProgress=null){
  const n=config.size,results=[];
  for(const h of relations.filter(h=>h.kind!=='capture'&&h.step&&!['首次','被屏蔽','未知','隐匿','静音','心跳掩盖'].includes(h.direction))){
   const A=nodes.find(n=>n.id===h.aNode),B=nodes.find(n=>n.id===h.bNode);if(!A||!B)continue;
   const cells=new Map(),initial=new Set(),pairRelations=relations.filter(r=>r.aNode===h.aNode&&r.bNode===h.bNode&&r.kind!=='capture');
   for(const rawA of worlds(A))for(const rawB of worlds(B)){
    const a={...rawA,branch:!!(A.portalAlternatives||A.soundAlternatives)},b={...rawB,branch:!!(B.portalAlternatives||B.soundAlternatives)},knownSource=sourceAt(b,h),source=knownSource||{r:0,c:0},listener=listenerAt(a,A,h);if(!listener)continue;
    const pending=!knownSource||b.pending;
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
     const cell={r,c};if(!E.bearings(cell,listener,n).includes(h.direction))continue;
     initial.add(E.key(r,c));onProgress?.({stage:'sounds',player:h.b,step:h.step,checked:initial.size});
     const dr=E.mod(r-source.r,n),dc=E.mod(c-source.c,n);
     if(!pairRelations.every(rel=>{const s=sourceAt(b,rel),l=listenerAt(a,A,rel);return !s||!l||E.bearings(shift(s,dr,dc,n),l,n).includes(rel.direction);}))continue;
     const observations=a.observations.concat(knownSource?b.observations.map(o=>shift(o,dr,dc,n)):[{...cell,kind:'audible'}]),anchors=(A.anchors||[]).concat(knownSource?(B.anchors||[]).map(o=>shift(o,dr,dc,n)):[]);
     const solution=E.solveMap(config,observations,anchors),proof=E.verifyCompleteLayout(config,solution,observations,2000);if(proof.status==='impossible')continue;
     const matches=E.globallyFilter(E.matchBlocks(config,observations,cell),solution).matches,blocks=[];
     for(const m of matches){
      const phases=solution.phases.flatMap(p=>{const i=p.slots.findIndex(s=>s.r===m.origin.r&&s.c===m.origin.c);if(i<0)return [];const domains=p.domains.map((d,k)=>k===i?d.filter(x=>x.id===m.id):d);return domains.every(d=>d.length)?[{...p,domains}]:[];});
      const supported=E.verifyCompleteLayout(config,solution.irregular?solution:{...solution,phases},observations,1000);if(supported.status==='impossible')continue;
      blocks.push({id:m.id,origin:m.origin,lr:m.lr,lc:m.lc,types:m.types,status:pending?'unknown':supported.status,exampleLayout:pending?[]:(supported.layout||[])});
     }
     if(!blocks.length)continue;
     const key=E.key(r,c);if(!cells.has(key))cells.set(key,{r,c,branches:[]});
     const focus=knownSource?(b.positions?.[0]||B.focus):null;
     cells.get(key).branches.push({status:pending?'unknown':proof.status,blocks,focus:focus?shift(focus,dr,dc,n):null,observations:knownSource?b.observations.map(o=>shift(o,dr,dc,n)):[],conditionalObservations:observations,anchors,solution,birth:knownSource&&B.birth?shift(B.birth,dr,dc,n):null,offset:{dr,dc},route:worlds(B).indexOf(rawB)+1});
    }
   }
   results.push({listenerNode:h.aNode,sourceNode:h.bNode,player:h.b,round:h.round,step:h.step,direction:h.direction,initialCount:initial.size,cells:[...cells.values()]});
  }
  return results;
 }
 function patterns(config,branch){
  if(patternCache.has(branch))return patternCache.get(branch);
  const observations=branch.conditionalObservations||branch.observations,focus=branch.focus||observations.at(-1),node={observations,focus,birth:branch.birth,anchors:branch.anchors||[]};
  const solution=branch.solution||E.solveMap(config,observations,node.anchors),local=L.analyze(config,node,solution);
  for(const kind of ['singles','doubles','triples','expanded'])local[kind]=local[kind].flatMap(candidate=>{
   const phases=solution.phases.flatMap(p=>{const pins=new Map();for(const block of candidate.blocks){const i=p.slots.findIndex(s=>s.r===block.origin.r&&s.c===block.origin.c);if(i<0)return [];pins.set(i,block.id);}const domains=p.domains.map((d,i)=>pins.has(i)?d.filter(m=>m.id===pins.get(i)):d);return domains.every(d=>d.length)?[{...p,domains}]:[];});
   const proof=E.verifyCompleteLayout(config,solution.irregular?solution:{...solution,phases},observations,1500);
   return proof.status==='impossible'?[]:[{...candidate,patternFocus:focus,birth:branch.birth,observations,verification:branch.status==='unknown'?'unknown':proof.status}];
  });
  patternCache.set(branch,local);return local;
 }
 const api={analyze,hearings,attach,patterns};if(typeof module!=='undefined')module.exports=api;else root.LongNightSoundCandidates=api;
})(globalThis);
