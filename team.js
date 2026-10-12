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
          const candidate=map(obs,anchors);
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
    for(const result of results)result.verification=E.certifyBlocks(config,result.solution,result.mergedObservations||result.observations);
    if(onLocal)onLocal({nodes:results,pairs,conflict,stage:'aligned'});
    for(const result of results){
      onProgress?.({stage:'history',player:result.player,checks:0,kept:0});
      result.retained=L.retained(config,result,result.solution,result.local);
      result.retainedSingles=L.retainedSingles(config,result,result.solution);
      result.local=L.preserveTriples(config,{...result,observations:result.mergedObservations||result.observations},result.solution,result.local,progress=>onProgress?.({stage:'history',player:result.player,...progress}));
    }
    return {nodes:results,pairs,conflict};
  }
  function globalView(team,visibleIds,playerCount){
    if(!team||team.conflict)return null;
    const visible=team.nodes.filter(node=>visibleIds.includes(node.id)&&(node.observations.length||node.anchors?.length));
    if(!visible.length||(playerCount>1&&visible.length<2))return null;
    return visible.find(node=>!node.fusionConflict&&node.verification?.status==='verified'&&node.verification.blocks.length&&visible.every(other=>node.joined?.some(j=>j.id===other.id)))||null;
  }
  const api={globalView,solve,compatible,shift};if(typeof module!=='undefined')module.exports=api;else root.LongNightTeam=api;
})(globalThis);
