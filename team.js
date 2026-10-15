(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.LongNight;
  const L=typeof module!=='undefined'?require('./local.js'):root.LongNightLocal;
  const shift=(o,dr,dc,n)=>({...o,r:E.mod(o.r+dr,n),c:E.mod(o.c+dc,n)});
  function compatible(a,b,dr,dc,n){
    if(a.irregular||b.irregular)return true;
    for(const pa of a.phases)for(const pb of b.phases){
      if(E.mod(pb.pr+dr,3)!==pa.pr||E.mod(pb.pc+dc,3)!==pa.pc)continue;
      const byOrigin=new Map(pb.slots.map((s,i)=>[E.key(E.mod(s.r+dr,n),E.mod(s.c+dc,n)),new Set(pb.domains[i].map(m=>m.id))]));
      const domains=pa.slots.map((s,i)=>pa.domains[i].filter(m=>byOrigin.get(E.key(s.r,s.c))?.has(m.id)));
      if(domains.every(d=>d.length)&&E.hasDistinctAssignment(domains))return true;
    }
    return false;
  }
  function solve(config,nodes,relations=[],onLocal=null,onProgress=null){
    const n=config.size,cache=new Map(),refined=new WeakMap(),proofs=new WeakMap();
    function refine(solution,obs){if(!refined.has(solution))refined.set(solution,E.refineCompleteLayout(config,solution,obs));return refined.get(solution);}
    function map(obs,anchors){const signature=JSON.stringify([obs,anchors]);if(!cache.has(signature))cache.set(signature,E.solveMap(config,obs,anchors));return cache.get(signature);}
    const results=nodes.map(node=>{onProgress?.({stage:'perspectives',player:node.player});const solution=refine(map(node.observations,node.anchors),node.observations);return {...node,solution,verification:E.certifyBlocks(config,solution,node.observations),local:{waiting:true,pending:true,singles:[],doubles:[],triples:[],expanded:[],focusCandidates:[]}};}),pairs=[];
    // Publish independently established facts before exhaustive historical triples.
    // Those triples still run to completion and must never be reported as zero early.
    if(onLocal)onLocal({nodes:results,pairs:[],conflict:false,stage:'perspectives'});
    for(const result of results){onProgress?.({stage:'local',player:result.player});result.local={...L.analyze(config,result,result.solution),historyPending:true};}
    if(onLocal)onLocal({nodes:results,pairs:[],conflict:false,stage:'local'});
    for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
      const A=nodes[a],B=nodes[b],constraints=relations.filter(h=>(h.aNode===A.id&&h.bNode===B.id)||(h.aNode===B.id&&h.bNode===A.id));
      const offsets=[];
      onProgress?.({stage:'pairs',a:A.player,b:B.player,checked:0,total:n*n});
      for(let dr=0;dr<n;dr++)for(let dc=0;dc<n;dc++){
        if(dc===0)onProgress?.({stage:'pairs',a:A.player,b:B.player,checked:dr*n,total:n*n});
        if(!constraints.every(h=>h.aNode===A.id?E.bearings(shift(h.source,dr,dc,n),h.listener,n).includes(h.direction):E.bearings(h.source,shift(h.listener,dr,dc,n),n).includes(h.direction)))continue;
        if(!compatible(results[a].solution,results[b].solution,dr,dc,n))continue;
        if(A.observations.length&&B.observations.length){
          const obs=A.observations.concat(B.observations.map(o=>shift(o,dr,dc,n))),anchors=A.anchors.concat(B.anchors.map(o=>shift(o,dr,dc,n)));
          const candidate=config.reuseDomains===false?map(obs,anchors):E.mergeMaps(config,results[a].solution,results[b].solution,dr,dc,obs,anchors);
          if(!candidate.irregular&&!candidate.phases.length)continue;
          if(candidate.irregular&&obs.some(o=>!E.matchBlocks(config,obs,o).matches.length&&!E.matchBlocks(config,obs,o).gap))continue;
          if(!candidate.irregular){if(!proofs.has(candidate))proofs.set(candidate,E.verifyCompleteLayout(config,candidate,obs,1000));if(proofs.get(candidate).status==='impossible')continue;}
        }
        offsets.push({dr,dc});
      }
      pairs.push({a:A.id,b:B.id,offsets,soundCount:constraints.filter(h=>h.kind!=='capture').length,captureCount:constraints.filter(h=>h.kind==='capture').length});
    }
    // Relative translations must agree through every third perspective.
    const domains=(a,b)=>{const p=pairs.find(p=>(p.a===a&&p.b===b)||(p.a===b&&p.b===a));return p?.offsets.map(o=>p.a===a?o:{dr:E.mod(-o.dr,n),dc:E.mod(-o.dc,n)});};
    let changed=true;
    while(changed){changed=false;for(const p of pairs){if(!p.offsets.length)continue;for(const C of nodes){if(C.id===p.a||C.id===p.b)continue;const ac=domains(p.a,C.id),cb=domains(C.id,p.b);if(!ac?.length||!cb?.length)continue;
      if(ac.length===n*n||cb.length===n*n)continue;
      const possible=new Set();for(const x of ac)for(const y of cb)possible.add(E.key(E.mod(x.dr+y.dr,n),E.mod(x.dc+y.dc,n)));
      const next=p.offsets.filter(o=>possible.has(E.key(o.dr,o.dc)));if(next.length!==p.offsets.length){p.offsets=next;changed=true;}
    }}}
    const conflict=pairs.some(p=>!p.offsets.length);
    for(const result of results){
      const joined=[{id:result.id,dr:0,dc:0}],observations=[...result.observations],anchors=[...result.anchors];
      if(!conflict)for(const other of nodes){if(other.id===result.id)continue;const d=domains(result.id,other.id);if(d?.length===1){joined.push({id:other.id,...d[0]});observations.push(...other.observations.map(o=>shift(o,d[0].dr,d[0].dc,n)));anchors.push(...other.anchors.map(o=>shift(o,d[0].dr,d[0].dc,n)));}}
      const fused=refine(map(observations,anchors),observations);
      if(!fused.irregular&&!fused.phases.length&&joined.length>1){result.fusionConflict=true;result.joined=[joined[0]];result.mergedObservations=result.observations;}
      else {result.solution=fused;result.joined=joined;result.mergedObservations=observations;}
    }
    const enumerated=new WeakMap();
    for(const result of results){
      const obs=result.mergedObservations||result.observations;
      result.verification=E.certifyBlocks(config,result.solution,obs);
      if(!enumerated.has(result.solution))enumerated.set(result.solution,E.verifyCompleteLayout(config,result.solution,obs,5000,{limit:8}));
      result.completeLayouts=enumerated.get(result.solution);
    }
    const combined=enumerateCombined(config,{nodes:results,pairs,conflict},onProgress);
    if(combined?.complete&&combined.cases.length)applyCombined(config,results,combined);
    if(onLocal)onLocal({nodes:results,pairs,conflict,combined,stage:'aligned'});
    for(const result of results){
      if(config.routePresentation){result.local.historyPending=false;result.retained=[];result.retainedSingles=[];continue;}
      if(result.portalAlternatives){result.local.historyPending=false;result.retained=[];result.retainedSingles=[];continue;}
      onProgress?.({stage:'history',player:result.player,checks:0,kept:0});
      result.retained=L.retained(config,result,result.solution,result.local);
      result.retainedSingles=L.retainedSingles(config,result,result.solution);
      result.local=L.preserveTriples(config,{...result,observations:result.mergedObservations||result.observations},result.solution,result.local,progress=>onProgress?.({stage:'history',player:result.player,...progress}));
    }
    return {nodes:results,pairs,conflict,combined};
  }
  function enumerateCombined(config,team,onProgress=null,limits={}){
    const nodes=team.nodes.filter(n=>n.observations.length||n.anchors?.length);
    if(nodes.length<2||config.size%3||team.conflict)return null;
    const n=config.size,maxCases=limits.maxCases??256,maxLayouts=limits.maxLayouts??4096,budget=limits.budget??50000;
    let complete=!nodes.some(n=>n.portalAlternatives?.length||n.routeAlternatives?.length),checks=0,examined=0,stopped=false,spawnPending=false;
    const cases=[],reference=nodes[0],offsets=new Map([[reference.id,{dr:0,dc:0}]]);
    function domain(a,b){const p=team.pairs.find(p=>p.a===a&&p.b===b||p.a===b&&p.b===a);return p?.offsets.map(d=>p.a===a?d:{dr:E.mod(-d.dr,n),dc:E.mod(-d.dc,n)})||[];}
    function options(node){let out=domain(reference.id,node.id);for(const [id,d] of offsets){if(id===reference.id)continue;const allowed=new Set(domain(id,node.id).map(x=>E.key(E.mod(x.dr+d.dr,n),E.mod(x.dc+d.dc,n))));out=out.filter(x=>allowed.has(E.key(x.dr,x.dc)));}return out;}
    function visit(){
      if(stopped)return;
      if(offsets.size<nodes.length){
        const next=nodes.filter(node=>!offsets.has(node.id)).map(node=>({node,options:options(node)})).sort((a,b)=>a.options.length-b.options.length)[0];
        for(const d of next.options){offsets.set(next.node.id,d);visit();offsets.delete(next.node.id);if(stopped)break;}return;
      }
      if(checks++>=maxCases){complete=false;stopped=true;return;}
      onProgress?.({stage:'combined',checked:checks,found:cases.reduce((s,c)=>s+c.layouts.length,0)});
      const joined=nodes.map(node=>({id:node.id,...offsets.get(node.id)})),observations=nodes.flatMap(node=>{const d=offsets.get(node.id);return node.observations.map(o=>shift(o,d.dr,d.dc,n));}),anchors=nodes.flatMap(node=>{const d=offsets.get(node.id);return (node.anchors||[]).map(o=>shift(o,d.dr,d.dc,n));});
      const solution=E.solveMap(config,observations,anchors),enumeration=E.verifyCompleteLayout(config,solution,observations,budget,{limit:Math.max(1,maxLayouts-examined)});
      if(!enumeration.complete)complete=false;
      const births=nodes.filter(node=>node.birth).map(node=>{const d=offsets.get(node.id);return {...shift(node.birth,d.dr,d.dc,n),player:node.player};});
      const layouts=[];
      for(const layout of enumeration.layouts||[]){examined++;const spawn=E.birthLayoutCheck(config,layout,births);if(spawn.valid)layouts.push(layout);if(spawn.pending){spawnPending=true;complete=false;}}
      if(layouts.length||!enumeration.complete)cases.push({joined,layouts,complete:enumeration.complete&&!spawnPending});
      if(examined>=maxLayouts){complete=false;stopped=true;}
    }
    visit();
    return {reference:reference.id,nodeIds:nodes.map(n=>n.id),cases,complete,spawnPending,examined,checks,count:cases.reduce((s,c)=>s+c.layouts.length,0),unlocated:team.nodes.filter(n=>!nodes.includes(n)).map(n=>n.id)};
  }
  function applyCombined(config,nodes,combined){
    const n=config.size;
    for(const node of nodes.filter(n=>combined.nodeIds.includes(n.id))){
      const layouts=combined.cases.flatMap(c=>{const at=c.joined.find(j=>j.id===node.id);return c.layouts.map(layout=>layout.map(b=>({id:b.id,origin:shift(b.origin,-at.dr,-at.dc,n)})));});
      const tag=b=>b.id+'@'+E.key(b.origin.r,b.origin.c),supported=new Set(layouts.flatMap(layout=>layout.map(tag))),common=layouts[0].filter(b=>layouts.every(layout=>layout.some(x=>tag(x)===tag(b))));
      const phases=node.solution.phases.map(p=>({...p,domains:p.domains.map(d=>d.filter(b=>supported.has(tag(b))))})).filter(p=>p.domains.every(d=>d.length));
      node.solution={...node.solution,phases};node.verification={status:'verified',blocks:common,layout:layouts[0],uncertain:0,source:'combined'};
      const first=combined.cases[0],at=first.joined.find(j=>j.id===node.id);
      node.joined=first.joined.map(j=>({id:j.id,dr:E.mod(j.dr-at.dr,n),dc:E.mod(j.dc-at.dc,n)})).filter(j=>combined.cases.every(c=>{const a=c.joined.find(x=>x.id===node.id),b=c.joined.find(x=>x.id===j.id);return E.mod(b.dr-a.dr,n)===j.dr&&E.mod(b.dc-a.dc,n)===j.dc;}));
      node.mergedObservations=node.joined.flatMap(j=>nodes.find(x=>x.id===j.id).observations.map(o=>shift(o,j.dr,j.dc,n)));
      // Deduplicate maps in this coordinate frame, independently of translation cases.
      const unique=[...new Map(layouts.map(l=>[l.map(tag).sort().join('|'),l])).values()];
      node.completeLayouts={status:'verified',layouts:unique,complete:true,overflow:false};
    }
  }
  function globalView(team,visibleIds,playerCount){
    if(!team||team.conflict)return null;
    const visible=team.nodes.filter(node=>visibleIds.includes(node.id)&&(node.observations.length||node.anchors?.length));
    if(!visible.length||(playerCount>1&&visible.length<2))return null;
    return visible.find(node=>!node.fusionConflict&&node.verification?.status==='verified'&&node.verification.blocks.length&&visible.every(other=>node.joined?.some(j=>j.id===other.id)))||null;
  }
  function viewGroups(team,visibleIds){
    const remaining=new Set(visibleIds),groups=[];
    for(const id of visibleIds){
      if(!remaining.has(id))continue;
      const node=team?.nodes.find(n=>n.id===id),members=[id];
      if(!team?.conflict&&!node?.fusionConflict&&node?.verification?.status==='verified')for(const j of node.joined||[]){
        const other=team.nodes.find(n=>n.id===j.id);
        if(j.id!==id&&remaining.has(j.id)&&!other?.fusionConflict&&other?.verification?.status==='verified'&&other.joined?.some(k=>k.id===id))members.push(j.id);
      }
      members.forEach(k=>remaining.delete(k));groups.push(members);
    }
    return groups;
  }
  const api={enumerateCombined,viewGroups,globalView,solve,compatible,shift};if(typeof module!=='undefined')module.exports=api;else root.LongNightTeam=api;
})(globalThis);
