(function longNightModule(root){
  'use strict';
  (root.LongNightSources ||= {})['hypotheses.js']=longNightModule.toString();
  const E=typeof module!=='undefined'?require('./engine.js'):root.LongNight;
  const M=typeof module!=='undefined'?require('./messages.js'):root.LongNightMessages;
  const signature=o=>JSON.stringify(Object.fromEntries(Object.entries(o).filter(([k])=>k!=='index')));
  function portalFrames(config,models,segment){
    const n=config.size,middle=Math.floor(n/2),worlds=models.map(model=>E.replay(model.segments[segment],n));
    const exits=worlds.map(w=>w.log.find(e=>e.kind==='teleport'));
    if(!worlds.length||exits.some(e=>!e))return null;
    const common=sets=>sets[0].filter(o=>sets.every(s=>s.some(x=>signature(x)===signature(o))));
    const before=[],after=[],positions=new Map(),traces=[];
    for(let i=0;i<worlds.length;i++){
      const w=worlds[i],exit=exits[i],entry=w.log.slice(0,exit.index).findLast(e=>e.kind==='observe'&&e.portalLink);
      if(!entry)return null;
      before.push(w.observations.filter(o=>o.index<=entry.index));
      const dr=middle-exit.r,dc=middle-exit.c,shift=o=>({...o,r:E.mod(o.r+dr,n),c:E.mod(o.c+dc,n)});
      after.push(w.observations.filter(o=>o.index>=exit.index).map(shift));
      traces.push(w.log.filter(e=>e.index>=exit.index&&(e.kind==='teleport'||e.kind==='move'&&e.outcome==='move')).map(shift));
      const at=shift(w);positions.set(E.key(at.r,at.c),{r:at.r,c:at.c});
    }
    const entry=worlds[0].log.slice(0,exits[0].index).findLast(e=>e.kind==='observe'&&e.portalLink);
    const prefix=worlds[0].log.filter(e=>e.index<=entry.index&&(e.kind==='move'&&e.outcome==='move'));
    return {before:{observations:common(before),trace:[{r:middle,c:middle},...prefix],positions:[{r:entry.r,c:entry.c}]},after:{observations:common(after),trace:common(traces),positions:[...positions.values()],exit:{r:middle,c:middle}},exitCount:new Set(exits.map(e=>E.key(e.r,e.c))).size};
  }
  const effectiveConfig=(config,model)=>({...config,heartPresence:model.config.heartPresence??config.heartPresence});
  function search(config,base,messages,player,self,maxCases=null,initialChoices={}){
    const automaticBudget=maxCases==null;
    maxCases??=config.silent?512:96;
    const replayChoices=choices=>M.buildHypothesis(base,messages,player,self,choices,{heartPresence:config.heartPresence});
    const initial=replayChoices(initialChoices),first=initial.ambiguities[0];
    if(!first)return null;
    const resume=config.routeCheckpoint;
    const segment=first.segment,queue=resume?resume.states.map(s=>({choices:{...initialChoices,...s.choices},kind:s.kind})): [{choices:initialChoices,kind:null}],cases=[],rejections={ground:new Set(),portal:new Set()},cache=new Map();let visits=0;
    function checkpoint(){config.onRouteCheckpoint?.({states:[...cases.filter(c=>!c.pending).map(c=>({choices:c.choices,kind:c.kind})),...queue],visited:(resume?.visited||0)+visits,exhausted:queue.length===0});}
    function crossFits(choices){
      if(config.independentPerspective)return true;
      const b=M.build(base,messages,{[player]:choices}),groups=new Map();
      const crossConfig=effectiveConfig(config,b.model);
      for(const h of b.relations.filter(h=>!['首次','被屏蔽'].includes(h.direction)&&(h.a===player||h.b===player))){const k=h.aNode+'|'+h.bNode;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(h);}
      for(const relations of groups.values()){
        const first=relations[0],[a,sa]=first.aNode.split(':').map(Number),[other,sb]=first.bNode.split(':').map(Number),A=b.views[a].model.segments[sa],B=b.views[other].model.segments[sb];
        if(!A||!B)continue;const ra=E.replay(A,config.size),rb=E.replay(B,config.size),as=E.solveMap(crossConfig,ra.observations,A.anchors),bs=E.solveMap(crossConfig,rb.observations,B.anchors);let possible=false;
        for(let dr=0;dr<config.size&&!possible;dr++)for(let dc=0;dc<config.size&&!possible;dc++){
          const shift=o=>({...o,r:E.mod(o.r+dr,config.size),c:E.mod(o.c+dc,config.size)});
          if(!relations.every(h=>E.bearings(shift(h.source),h.listener,config.size).includes(h.direction)))continue;
          const observations=ra.observations.concat(rb.observations.map(shift)),solution=E.mergeMaps(crossConfig,as,bs,dr,dc,observations,A.anchors.concat(B.anchors.map(shift)));
          if(E.verifyCompleteLayout(crossConfig,solution,observations,1000).status!=='impossible')possible=true;
        }
        if(!possible)return false;
      }return true;
    }
    function solve(model){
      const branchConfig=effectiveConfig(config,model);
      const results=model.segments.map(s=>{
        const replay=E.replay(s,config.size),key=JSON.stringify([branchConfig.heartPresence,replay.observations,s.anchors]);
        if(!cache.has(key)){const solution=E.solveMap(branchConfig,replay.observations,s.anchors),proof=E.verifyCompleteLayout(branchConfig,solution,replay.observations,3000);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,{solution,proof});}
        return {replay,...cache.get(key)};
      });return results;
    }
    // Prove the whole no-portal explanation separately. A first-step "ground"
    // branch can still contain later portals, and an unfinished breadth-first
    // search must not hide an already provable contradiction in walking alone.
    let walkingChoices=Object.fromEntries(Object.entries(initialChoices).filter(([k])=>k.startsWith('__'))),walking=replayChoices(walkingChoices),walkingSteps=0;
    while(walking.ambiguities.length&&walkingSteps++<512){
      walkingChoices[walking.ambiguities[0].key]={kind:'ground'};
      walking=replayChoices(walkingChoices);
    }
    const walkingResults=walking.ambiguities.length?[]:solve(walking.model);
    const groundOnly={status:walking.ambiguities.length?'unknown':walking.branchErrors.length||walkingResults.some(r=>r.proof.status==='impossible')?'impossible':walkingResults.every(r=>r.proof.status==='verified')?'verified':'unknown'};
    if(automaticBudget&&groundOnly.status!=='impossible')maxCases=Math.min(maxCases,96);
    function expand(state,built){
      const a=built.ambiguities[0],at=E.replay(built.model.segments[a.segment],config.size);
      const matches=E.matchBlocks(effectiveConfig(config,built.model),at.observations,a.entry).matches,links=new Map();
      for(const m of matches){const link=m.block.cells[m.lr*3+m.lc].portal;if(link)links.set(link.join(','),{kind:'portal',dr:link[0],dc:link[1],...(a.requiresHeart?{requiresHeart:true}:{})});}
      const choices=[{kind:'ground'},...links.values()];
      // Interactive inference first follows one route to its end. Breadth-first
      // expansion of long silent walks otherwise spends the budget on prefixes.
      for(const choice of config.witnessFirst?[...choices].reverse():choices)queue.push({kind:state.kind||choice.kind,choices:{...state.choices,[a.key]:choice}});
      if(!state.kind&&!links.size)rejections.portal.add('入口附近没有匹配的配对传送门区块');
    }
    while(queue.length&&visits<maxCases){
      visits++;
      const state=config.witnessFirst?queue.pop():queue.shift();let processed=false;
      try{
      const built=replayChoices(state.choices);
      processed=true;
      if(built.branchErrors.length){built.branchErrors.forEach(s=>rejections[state.kind]?.add(s));continue;}
      const results=solve(built.model);
      if(results.some(r=>r.proof.status==='impossible')){rejections[state.kind]?.add('与后续地形、墙壁或完整地图约束不符');continue;}
      if(built.ambiguities.length){expand(state,built);continue;}
      if(!crossFits(state.choices)){rejections[state.kind]?.add('与其他玩家的声源方位或捕捉同格位置矛盾');continue;}
      cases.push({...state,built,results});
      // Keep searching after a witness: only exhausting the remaining branches
      // can resolve a portal. The shared deadline still bounds interactive work.
      if(config.witnessFirst&&queue.length>6&&results.every(r=>r.proof.status==='verified'))break;
      }catch(error){processed=false;throw error;}
      finally{if(!processed)queue.unshift(state);if(!processed||visits%16===0)checkpoint();}
    }
    checkpoint();
    // Unsearched branches remain explicit possibilities; they never establish certainty.
    // Keep a common unresolved prefix per group instead of solving every queued
    // branch after the budget is exhausted. Pending work cannot prove a fact.
    for(const kind of ['ground','portal']){
      const states=queue.filter(s=>s.kind===kind);if(!states.length)continue;
      const choices=Object.fromEntries(Object.entries(states[0].choices).filter(([k,v])=>states.every(s=>JSON.stringify(s.choices[k])===JSON.stringify(v))));
      const built=replayChoices(choices);cases.push({kind,choices,built,results:solve(built.model),pending:true});
    }
    const groups=['ground','portal'].map(kind=>{
      const worlds=cases.filter(c=>c.kind===kind),pending=worlds.some(c=>c.pending),reasons=[...rejections[kind]];
      if(!worlds.length)return {kind,excluded:true,reasons};
      const maps=worlds.map(w=>w.results[segment]),firstMap=maps[0],sets=maps.map(m=>new Set(m.replay.observations.map(signature)));
      const observations=firstMap.replay.observations.filter(o=>sets.every(s=>s.has(signature(o))));
      const traceSets=maps.map(m=>new Set(m.replay.trace.map(p=>E.key(p.r,p.c)))),trace=firstMap.replay.trace.filter(p=>traceSets.every(s=>s.has(E.key(p.r,p.c))));
      const solution={irregular:config.size===10,phases:maps.flatMap(m=>m.solution.phases)},verified=!pending&&maps.every(m=>m.proof.status==='verified');
      const positions=new Map();let inSpace=false,remaining=new Set();
      for(const w of worlds)if(w.built.model.active===segment){const r=w.results[segment].replay,space=w.built.space;inSpace ||= !!space;if(space)remaining.add(space.remaining);positions.set(E.key(r.r,r.c),{r:r.r,c:r.c,inSpace:!!space});}
      // Keep the correlations between a portal link, its exit, and the later collision.
      // Their intersection alone erases exactly the evidence that distinguishes routes.
      const alternatives=new Map();
      for(const w of worlds){
        const m=w.results[segment],r=m.replay,space=w.built.space;
        const entryMatches=E.globallyFilter(E.matchBlocks(config,r.observations,first.entry),m.solution).matches;
        const alternative={choices:w.choices,observations:r.observations,trace:r.trace,solution:m.solution,
          positions:w.built.model.active===segment?[{r:r.r,c:r.c,inSpace:!!space}]:[],inSpace:!!space,remaining:space?[space.remaining]:[],
          pending:!!w.pending||m.proof.status!=='verified',verification:{status:w.pending?'unknown':m.proof.status,blocks:w.pending?[]:m.proof.blocks},
          entryBlocks:[...new Set(entryMatches.map(m=>m.id))],
          teleports:r.log.filter(e=>e.kind==='teleport').map(e=>({r:e.r,c:e.c,round:e.clock?.round,step:e.clock?.step}))};
        alternative.exampleRoute=m.proof.status==='verified'&&!w.pending?r.observations.filter(o=>o.kind==='action'&&o.arrival).map(o=>{
          const placed=m.proof.layout.find(b=>E.mod(o.r-b.origin.r,config.size)<3&&E.mod(o.c-b.origin.c,config.size)<3);
          if(!placed)return null;
          const lr=E.mod(o.r-placed.origin.r,config.size),lc=E.mod(o.c-placed.origin.c,config.size);
          const match=m.solution.phases.flatMap(p=>p.domains.flat()).find(b=>b.id===placed.id&&b.origin.r===placed.origin.r&&b.origin.c===placed.origin.c);
          return {clock:o.clock,id:placed.id,lr,lc,types:match?.cellTypes?.[lr*3+lc]||[]};
        }).filter(Boolean):[];
        const key=JSON.stringify([r.observations,alternative.positions,alternative.pending]);
        if(!alternatives.has(key))alternatives.set(key,alternative);
      }
      return {kind,excluded:false,pending:pending||!verified,cases:worlds.length,observations,trace,solution,positions:[...positions.values()],inSpace,remaining:[...remaining],verification:{status:verified?'verified':'unknown',blocks:verified?E.determinedBlocks(solution):[]},alternatives:[...alternatives.values()]};
    });
    const resolvedChoices=!queue.length&&cases.length===1&&!cases[0].pending&&cases[0].results.every(r=>r.proof.status==='verified')?cases[0].choices:null;
    const confirmedPortal=!queue.length&&groups.find(g=>g.kind==='ground').excluded&&!groups.find(g=>g.kind==='portal').excluded&&!groups.find(g=>g.kind==='portal').pending;
    const portalViews=confirmedPortal?portalFrames(config,cases.filter(c=>c.kind==='portal').map(c=>c.built.model),segment):null;
    if(portalViews){
      // Intersecting different later teleports erases valid routes and their final
      // collision. Keep each complete, verified route available for drawing.
      const unique=new Map();
      for(const c of cases.filter(c=>c.kind==='portal')){
        const frame=portalFrames(config,[c.built.model],segment).after;
        const replay=c.results[segment].replay,exit=replay.log.find(e=>e.kind==='teleport'),middle=Math.floor(config.size/2);
        frame.solution=E.solveMap(config,replay.observations.map(o=>({...o,r:E.mod(o.r+middle-exit.r,config.size),c:E.mod(o.c+middle-exit.c,config.size)})));
        const key=JSON.stringify([frame.observations,frame.positions]);
        if(!unique.has(key))unique.set(key,{...frame,teleports:c.results[segment].replay.log.filter(e=>e.kind==='teleport').map(e=>({step:e.clock?.step,round:e.clock?.round})),pending:!!c.pending});
      }
      portalViews.afterAlternatives=[...unique.values()];
    }
    // Examples are complete witness layouts, never intersections of different routes.
    function examples(result,limit){
      if(!result||result.proof.status!=='verified')return [];
      const birthConfig=segment===0?{...config,births:[{r:Math.floor(config.size/2),c:Math.floor(config.size/2),player}]}:config;
      const proof=E.verifyCompleteLayout(birthConfig,result.solution,result.replay.observations,1000,{limit});
      return (proof.layouts||[proof.layout]).filter(Boolean).slice(0,limit).map(blocks=>({
        blocks,observations:result.replay.observations,focus:{r:result.replay.r,c:result.replay.c},
        teleports:result.replay.log.filter(e=>e.kind==='teleport').map(e=>({r:e.r,c:e.c,round:e.clock?.round,step:e.clock?.step})),
        unique:!!proof.complete&&proof.layouts?.length===1
      }));
    }
    const walkingExamples=examples(walkingResults[segment],1),portalExamples=[];
    const portalCases=cases.filter(c=>!c.pending&&c.results.every(r=>r.proof.status==='verified')&&c.built.model.segments.some(s=>s.events.some(e=>e.portalLink)));
    for(const c of portalCases){
      if(portalExamples.length>=3)break;
      portalExamples.push(...examples(c.results[segment],3-portalExamples.length));
    }
    const portalStatus=portalCases.length?'possible':queue.length||cases.some(c=>c.pending||c.results.some(r=>r.proof.status!=='verified'))?'unknown':'excluded';
    const requiresPortal=groundOnly.status==='impossible'&&cases.some(c=>!c.pending&&c.results.every(r=>r.proof.status==='verified')&&c.built.model.segments.some(s=>s.events.some(e=>e.portalLink)));
    return {player,segment,round:first.round,step:first.step,maskedUnknown:first.maskedUnknown,silentUnknown:first.silentUnknown,recoveryUnknown:first.recoveryUnknown,recovery:initialChoices.__portalRecovery?'missing':null,entry:first.entry,groups,truncated:queue.length>0,resolvedChoices,confirmedPortal,portalViews,groundOnly,walkingExamples,portalExamples,portalStatus,walkingObservations:walkingResults[segment]?.replay.observations,requiresPortal,search:{visited:visits,budget:maxCases,pending:queue.length}};
  }
  function analyze(config,base,messages,player,self,maxCases=null,initialChoices={}){
    const run=choices=>search(config,base,messages,player,self,maxCases,choices);
    // Silent movement never proves walking. Search unannounced portals even
    // when a walking-only map exists, before publishing any map deductions.
    if(config.silent&&!initialChoices.__portalRecovery){
      const seed={__portalRecovery:true},proactive=run(seed);
      if(proactive)return {...proactive,recovery:'silent',reopenedChoices:seed};
    }
    let impossibleRounds=[];
    let result=run(initialChoices);
    // Budget exhaustion is uncertainty, not a contradiction. Reopen choices
    // only after the current explanation has actually been disproved.
    if(result){if(result.truncated||result.groups.some(g=>!g.excluded))return result;}
    else{
      const built=M.buildHypothesis(base,messages,player,self,initialChoices,{heartPresence:config.heartPresence});
      impossibleRounds=built.model.segments.flatMap(s=>{
        const observations=E.replay(s,config.size).observations,cfg=effectiveConfig(config,built.model);
        return E.verifyCompleteLayout(cfg,E.solveMap(cfg,observations,s.anchors),observations,3000).status==='impossible'?[...new Set(observations.map(o=>o.clock?.round).filter(r=>r>0))]:[];
      });
      const impossible=built.branchErrors.length||impossibleRounds.length;
      if(!impossible)return null;
    }
    if(Object.keys(initialChoices).some(k=>!k.startsWith('__'))){
      const seed=initialChoices.__portalRecovery?{__portalRecovery:true}:{},reopened=run(seed);
      if(reopened){result={...reopened,recovery:'reopened',reopenedChoices:seed};if(reopened.truncated||reopened.groups.some(g=>!g.excluded))return result;}
    }
    if(!initialChoices.__portalRecovery){
      const seed={__portalRecovery:true,...(config.silent&&impossibleRounds.length?{__portalRecoveryRounds:impossibleRounds}:{})},recovered=run(seed);
      if(recovered)return {...recovered,recovery:'missing',reopenedChoices:seed};
    }
    return result;
  }
  // Shared by Worker and file:// fallback; compare updates to avoid rebuild loops.
  function choiceUpdates(hypotheses,previous={}){
    const updates=hypotheses.map(h=>[h.player,h.resolvedChoices||(h.recovery==='silent'?null:h.reopenedChoices)]).filter(([id,c])=>c&&JSON.stringify(c)!==JSON.stringify(previous[id]||{}));
    return updates.length?{...previous,...Object.fromEntries(updates)}:null;
  }
  function all(config,notebook){return Array.from({length:notebook.count},(_,id)=>analyze(config,notebook.base,notebook.messages,id,notebook.self,null,notebook.choices?.[id]||{})).filter(Boolean);}
  // An unknown paired exit has no single coordinate frame. Shared map facts
  // use the verified entrance prefix; local candidates independently enumerate
  // complete alternatives with their correlated exit, sounds and collisions.
  function constrainNodes(nodes,relations,hypotheses){
    const uncertain=new Set();
    const constrained=nodes.map(node=>{
      const unresolved=hypotheses.find(h=>!h.resolvedChoices&&!h.confirmedPortal&&node.id===h.player+':'+h.segment&&h.groups.some(g=>!g.excluded));
      if(unresolved){
        uncertain.add(node.id);
        const observations=node.observations.filter(o=>!o.clock||o.clock.round<unresolved.round||o.clock.round===unresolved.round&&o.clock.step<=unresolved.step);
        return {...node,observations,walkingObservations:unresolved.walkingObservations||node.observations,focus:{...unresolved.entry},histories:[],previous:null,routePending:true,
          routeAlternatives:unresolved.groups.filter(g=>!g.excluded).flatMap(g=>g.alternatives||[])};
      }
      const h=hypotheses.find(h=>h.confirmedPortal&&!h.resolvedChoices&&h.portalViews&&node.id===h.player+':'+h.segment);
      if(!h)return node;
      uncertain.add(node.id);
      const observations=[...h.portalViews.before.observations,{kind:'terrain',r:h.entry.r,c:h.entry.c,value:'PORTAL'}];
      return {...node,observations,walkingObservations:h.walkingObservations||node.observations,focus:{...h.entry},histories:[],previous:null,portalPrefix:true,routePending:true,
        portalAlternatives:h.groups.find(g=>g.kind==='portal').alternatives};
    });
    // Original relations after the entrance use the obsolete walking position.
    // They are still checked against complete routes by crossFits above.
    return {nodes:constrained,relations:relations.filter(r=>!uncertain.has(r.aNode)&&!uncertain.has(r.bNode))};
  }
  const api={analyze,all,portalFrames,choiceUpdates,constrainNodes};if(typeof module!=='undefined')module.exports=api;else root.LongNightHypotheses=api;
})(globalThis);
