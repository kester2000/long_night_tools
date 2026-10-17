(function longNightModule(root){
  'use strict';
  (root.LongNightSources ||= {})['team.js']=longNightModule.toString();
  const E=typeof module!=='undefined'?require('./engine.js'):root.LongNight;
  const L=typeof module!=='undefined'?require('./local.js'):root.LongNightLocal;
  const Timeline=typeof module!=='undefined'?require('./timeline.js'):root.LongNightTimeline;
  const shift=(o,dr,dc,n)=>({...o,r:E.mod(o.r+dr,n),c:E.mod(o.c+dc,n)});
  const walkingCache=new WeakMap();
  function walkingSolution(config,node){
    if(node.walkingDisplaySolution)return node.walkingDisplaySolution;
    if(!node.routePending)return node.solution;
    const observations=node.walkingObservations||node.observations;
    const old=walkingCache.get(node),signature=JSON.stringify(config);
    if(old?.observations===observations&&old.signature===signature)return old.solution;
    const solution=E.refineCompleteLayout(config,E.solveMap(config,observations,node.anchors||[]),observations);
    walkingCache.set(node,{observations,signature,solution});return solution;
  }
  function birthCandidates(config,node,solution,candidates){
    const matches=[],pending=[],excluded=[];
    for(const m of candidates){
      if(!node?.birth||!E.spawnCheck(config,[m],node.birth).inExitBlock){matches.push(m);continue;}
      const phases=solution.phases.map(p=>({...p,domains:p.domains.map(d=>d.filter(b=>b.origin.r!==m.origin.r||b.origin.c!==m.origin.c||b.id===m.id))})).filter(p=>p.domains.every(d=>d.length)&&p.domains.some(d=>d.some(b=>b.id===m.id&&b.origin.r===m.origin.r&&b.origin.c===m.origin.c)));
      const proof=E.verifyCompleteLayout({...config,births:[{...node.birth,player:node.player}]},{...solution,phases},node.walkingObservations||node.mergedObservations||node.observations,200);
      (proof.status==='verified'?matches:proof.status==='impossible'?excluded:pending).push(m);
    }
    return {matches,pending,excluded};
  }
  const jointExampleCache=new WeakMap();
  function jointExample(config,team,referenceId,request={}){
    if(!team)return {status:'unknown'};
    let cache=jointExampleCache.get(team);if(!cache){cache=new Map();jointExampleCache.set(team,cache);}
    const key=JSON.stringify([config,referenceId,request]);
    if(cache.has(key))return cache.get(key);
    let result;
    try{result=computeJointExample(config,team,referenceId,request);}catch(error){if(error.code!=='INFERENCE_TIMEOUT')throw error;return {status:'unknown'};}
    if(result.status!=='unknown')cache.set(key,result);
    return result;
  }
  function computeJointExample(config,team,referenceId,request={}){
    const nodes=team?.nodes||[],reference=nodes.find(n=>n.id===referenceId),n=config.size;
    if(!reference||team.conflict||nodes.some(n=>n.routePending)||n%3)return {status:'unknown'};
    const offsets=new Map([[referenceId,{dr:0,dc:0}]]),until=Date.now()+2000,pins=request.positions||(request.position?[request.position]:[]);
    if(pins.some(p=>!nodes.some(node=>node.player===p.player&&(p.segment==null||node.segment===p.segment))))return {status:'unknown'};
    let answer=null,pending=false,checks=0;
    function domain(a,b){const pair=team.pairs?.find(p=>p.a===a&&p.b===b||p.a===b&&p.b===a);return pair?.offsets.map(d=>pair.a===a?d:{dr:E.mod(-d.dr,n),dc:E.mod(-d.dc,n)});}
    function options(node){
      let out=domain(referenceId,node.id);if(!out){pending=true;return [];}
      for(const pin of pins.filter(p=>p.player===node.player&&(p.segment==null||p.segment===node.segment)))out=out.filter(d=>{const p=shift(node.focus,d.dr,d.dc,n);return p.r===pin.r&&p.c===pin.c;});
      for(const [id,d] of offsets){if(id===referenceId)continue;const rel=domain(id,node.id);if(!rel){pending=true;return [];}
        const allowed=new Set(rel.map(x=>E.key(E.mod(x.dr+d.dr,n),E.mod(x.dc+d.dc,n))));out=out.filter(x=>allowed.has(E.key(x.dr,x.dc)));}
      return out;
    }
    function visit(){
      if(answer)return;if(Date.now()>until||checks>=256){pending=true;return;}
      if(offsets.size<nodes.length){const next=nodes.filter(x=>!offsets.has(x.id)).map(node=>({node,choices:options(node)})).sort((a,b)=>a.choices.length-b.choices.length)[0];
        for(const d of next.choices){offsets.set(next.node.id,d);visit();offsets.delete(next.node.id);if(answer)break;if(Date.now()>until){pending=true;break;}}return;}
      checks++;
      const observations=nodes.flatMap(node=>{const d=offsets.get(node.id);return node.observations.map(o=>shift(o,d.dr,d.dc,n));});
      const anchors=nodes.flatMap(node=>{const d=offsets.get(node.id);return (node.anchors||[]).map(o=>shift(o,d.dr,d.dc,n));}).concat((request.blocks||[]).map(b=>({id:b.id,r:b.origin.r,c:b.origin.c})));
      const births=nodes.filter(x=>x.birth).map(node=>{const d=offsets.get(node.id);return {...shift(node.birth,d.dr,d.dc,n),player:node.player};});
      const solution=E.solveMap(config,observations,anchors),proof=E.verifyCompleteLayout({...config,births,...(request.events?{eventSelection:request.events}:{})},solution,observations,3000);
      if(proof.status!=='verified'){pending ||= proof.status==='unknown';return;}
      const latest=new Map();for(const node of nodes)if(!latest.has(node.player)||latest.get(node.player).segment<node.segment)latest.set(node.player,node);
      const players=[...latest.values()].map(node=>{const d=offsets.get(node.id);return {player:node.player,segment:node.segment,...shift(node.focus,d.dr,d.dc,n),birth:node.birth?shift(node.birth,d.dr,d.dc,n):null};});
      answer={status:'verified',layout:proof.layout,players,observations};
    }
    if(pins.some(p=>p.player===reference.player&&(p.segment==null||p.segment===reference.segment)&&(p.r!==reference.focus.r||p.c!==reference.focus.c)))return {status:'impossible'};
    visit();return answer||{status:pending?'unknown':'impossible'};
  }
  function candidateExample(config,node,solution,candidate){
    if(!solution||solution.irregular)return {status:'unknown'};
    const phases=solution.phases.flatMap(p=>{
      const slot=p.slots.findIndex(s=>s.r===candidate.origin.r&&s.c===candidate.origin.c);
      if(slot<0)return [];
      const domains=p.domains.map((d,i)=>i===slot?d.filter(m=>m.id===candidate.id):d);
      return domains.every(d=>d.length)?[{...p,domains}]:[];
    });
    const observations=node.walkingObservations||node.mergedObservations||node.observations;
    return E.verifyCompleteLayout({...config,...(node.birth?{births:[{...node.birth,player:node.player}]}:{})},{...solution,phases},observations,3000);
  }
  function mapScope(config,node,observations=node?.mergedObservations||node?.observations||[]){
    const n=config.size,visited=new Set();
    for(const o of observations){
      if(o.kind==='action'&&!o.arrival||o.kind==='turnEnd')continue;
      visited.add(E.key(o.r,o.c));
      if(o.kind==='pass')visited.add(E.key(E.mod(o.r+E.V[o.dir][0],n),E.mod(o.c+E.V[o.dir][1],n)));
    }
    if(node?.birth)visited.add(E.key(node.birth.r,node.birth.c));
    const exposed=new Set(visited);
    if(!node?.routePending&&node?.verification?.status==='verified')for(const block of node.verification.blocks)for(let r=0;r<3;r++)for(let c=0;c<3;c++)exposed.add(E.key(E.mod(block.origin.r+r,n),E.mod(block.origin.c+c,n)));
    const known=new Set((node?.verification?.blocks||[]).map(b=>E.key(b.origin.r,b.origin.c))).size;
    const remaining=n%3===0?n*n/9-known:Infinity;
    return {visited,exposed,remaining,full:node?.verification?.status==='verified'&&!node.routePending&&remaining<=2};
  }
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
    // Exclusions must update alignment itself, not just the red marker list.
    // A unique jointly supported offset then follows the ordinary fusion path.
    for(const pair of pairs){
      if(pair.offsets.length<2||pair.offsets.length>8)continue;
      const other=results.find(node=>node.id===pair.b),snapshot={nodes:results,pairs,conflict:false};
      if(!other?.focus)continue;
      pair.offsets=pair.offsets.filter(offset=>{
        const position={...shift(other.focus,offset.dr,offset.dc,n),player:other.player,segment:other.segment};
        return jointExample(config,snapshot,pair.a,{position}).status!=='impossible';
      });
    }
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
      if(!team?.conflict&&!node?.routePending&&!node?.fusionConflict&&node?.verification?.status==='verified')for(const j of node.joined||[]){
        const other=team.nodes.find(n=>n.id===j.id);
        if(j.id!==id&&remaining.has(j.id)&&!other?.routePending&&!other?.fusionConflict&&other?.verification?.status==='verified'&&other.joined?.some(k=>k.id===id))members.push(j.id);
      }
      members.forEach(k=>remaining.delete(k));groups.push(members);
    }
    return groups;
  }
  function relocationView(config,team,built){
    if(!team)return null;
    const reference=team.nodes.filter(n=>n.segment<built.views[n.player].model.active&&n.verification?.status==='verified'&&n.verification.blocks.length).sort((a,b)=>b.verification.blocks.length-a.verification.blocks.length)[0];
    if(!reference)return null;
    const n=config.size,middle=Math.floor(n/2),targets=[];
    for(const v of built.views){
      if(!built.players[v.id].alive||!v.model.active)continue;
      const node=team.nodes.find(x=>x.id===v.id+':'+v.model.active);if(!node)continue;
      const pair=team.pairs.find(p=>p.a===reference.id&&p.b===node.id||p.b===reference.id&&p.a===node.id);
      let offsets=team.conflict?[]:pair?.offsets||[];
      // Pairwise compatibility can retain offsets ruled out by the complete
      // joint enumeration. Only show offsets supported by those full maps.
      if(!team.conflict&&team.combined?.complete&&pair){
        const supported=new Set(team.combined.cases.filter(c=>c.layouts.length).flatMap(c=>{
          const a=c.joined.find(j=>j.id===pair.a),b=c.joined.find(j=>j.id===pair.b);
          return a&&b?[E.key(E.mod(b.dr-a.dr,n),E.mod(b.dc-a.dc,n))]:[];
        }));
        offsets=offsets.filter(o=>supported.has(E.key(o.dr,o.dc)));
      }
      targets.push({player:v.id,node:node.id,positions:offsets.map(o=>{
        const dr=pair.a===reference.id?o.dr:-o.dr,dc=pair.a===reference.id?o.dc:-o.dc;
        return {arrival:shift({r:middle,c:middle},dr,dc,n),current:shift(node.focus,dr,dc,n)};
      }),conflict:!!team.conflict});
    }
    return {reference,targets};
  }
  function coinQuestions(config,team,built){
    if(built.spectator||!team?.combined?.complete||team.conflict)return [];
    const player=built.self,node=team.nodes.find(n=>n.id===player+':'+built.views[player].model.active);if(!node)return [];
    const rounds=[...new Set(node.observations.filter(o=>o.kind==='action'&&o.arrival).map(o=>o.clock?.round).filter(Boolean))].sort((a,b)=>b-a);
    for(const round of rounds){
      if(config.coinGains?.some(g=>g.player===player&&g.round===round)||(config.coinTransferRounds||[]).includes(round))continue;
      const outcomes=[];
      for(const c of team.combined.cases){
        const observations=c.joined.flatMap(j=>team.nodes.find(n=>n.id===j.id).observations.map(o=>shift(o,j.dr,j.dc,config.size)));
        for(const layout of c.layouts){
          const domains=layout.map(b=>[{...b,block:E.byId.get(b.id)}]);
          const fits=(min,max)=>Timeline.coinBounds({...config,coinGains:[{player,round,min,max}]},domains,observations).valid;
          outcomes.push({yes:fits(1,null),no:fits(0,0)});
        }
      }
      if(outcomes.some(o=>o.yes)&&outcomes.some(o=>o.no)&&outcomes.some(o=>!o.yes||!o.no))return [{player,round}];
    }
    return [];
  }
  function extraInformationQuestions(config,team,built){
    if(!config.dynamicDoors||!team?.nodes?.length)return [];
    const rounds=[...new Set(built.views.flatMap(v=>v.roundEnds.map(e=>e.round)))].filter(round=>
      config.buttonCounts?.[round]===undefined&&built.views.every(v=>v.roundEnds.some(e=>e.round===round&&e.complete)));
    if(!rounds.length)return [];
    // Ask only when a surviving template needs door changes to explain an
    // observed edge. Jointly checking the missing rounds catches alternatives
    // where either of two unrecorded rounds could have changed the same door.
    const zero={...config,buttonCounts:{...config.buttonCounts,...Object.fromEntries(rounds.map(r=>[r,0]))}},needed=new Set();
    for(const node of team.nodes){
      const observations=node.mergedObservations||node.observations||[],seen=new Set();
      for(const phase of node.solution?.phases||[])for(const domain of phase.domains)for(const m of domain){
        const block=m.block||E.byId.get(m.id);if(!block?.cells.some(c=>c.walls.some(w=>w===3||w===4)))continue;
        const key=m.id+':'+m.origin.r+':'+m.origin.c;if(seen.has(key))continue;seen.add(key);
        const relevant=observations.filter(o=>E.mod(o.r-m.origin.r,config.size)<3&&E.mod(o.c-m.origin.c,config.size)<3);
        if(!Timeline.check(config,[{...m,block}],relevant).valid||Timeline.check(zero,[{...m,block}],relevant).valid)continue;
        const last=Math.max(0,...relevant.map(o=>o.clock?.round||0));for(const round of rounds)if(round<=last)needed.add(round);
      }
    }
    return [...needed].sort((a,b)=>a-b).map(round=>({round,key:'extra:'+round}));
  }
  function positionCandidates(config,team,referenceId){
    const out=[],reference=team?.nodes.find(n=>n.id===referenceId);
    if(!reference||reference.routePending||team.conflict)return out;
    for(const pair of team.pairs||[]){
      if(pair.a!==referenceId&&pair.b!==referenceId||pair.offsets.length<2)continue;
      const other=team.nodes.find(n=>n.id===(pair.a===referenceId?pair.b:pair.a));
      if(!other?.focus||other.routePending)continue;
      const seen=new Set();
      for(const offset of pair.offsets){
        const sign=pair.a===referenceId?1:-1,at=shift(other.focus,sign*offset.dr,sign*offset.dc,config.size),key=E.key(at.r,at.c);
        if(seen.has(key))continue;seen.add(key);
        const position={...at,player:other.player,segment:other.segment},proof=jointExample(config,team,referenceId,{position});
        if(proof.status!=='impossible')out.push({...position,status:proof.status});
      }
    }
    return out;
  }
  const api={jointExample,candidateExample,positionCandidates,birthCandidates,walkingSolution,mapScope,extraInformationQuestions,coinQuestions,relocationView,enumerateCombined,viewGroups,globalView,solve,compatible,shift};if(typeof module!=='undefined')module.exports=api;else root.LongNightTeam=api;
})(globalThis);
