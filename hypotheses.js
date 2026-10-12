(function(root){
  'use strict';
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
  function analyze(config,base,messages,player,self,maxCases=96,initialChoices={}){
    const initial=M.buildHypothesis(base,messages,player,self,initialChoices),first=initial.ambiguities[0];
    if(!first)return null;
    const segment=first.segment,queue=[{choices:initialChoices,kind:null}],cases=[],rejections={ground:new Set(),portal:new Set()},cache=new Map();let visits=0;
    function crossFits(choices){
      const b=M.build(base,messages,{[player]:choices}),groups=new Map();
      for(const h of b.relations.filter(h=>!['首次','被屏蔽'].includes(h.direction)&&(h.a===player||h.b===player))){const k=h.aNode+'|'+h.bNode;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(h);}
      for(const relations of groups.values()){
        const first=relations[0],[a,sa]=first.aNode.split(':').map(Number),[other,sb]=first.bNode.split(':').map(Number),A=b.views[a].model.segments[sa],B=b.views[other].model.segments[sb];
        if(!A||!B)continue;const ra=E.replay(A,config.size),rb=E.replay(B,config.size);let possible=false;
        for(let dr=0;dr<config.size&&!possible;dr++)for(let dc=0;dc<config.size&&!possible;dc++){
          const shift=o=>({...o,r:E.mod(o.r+dr,config.size),c:E.mod(o.c+dc,config.size)});
          if(!relations.every(h=>E.bearings(shift(h.source),h.listener,config.size).includes(h.direction)))continue;
          const observations=ra.observations.concat(rb.observations.map(shift)),solution=E.solveMap(config,observations,A.anchors.concat(B.anchors.map(shift)));
          if(E.verifyCompleteLayout(config,solution,observations,1000).status!=='impossible')possible=true;
        }
        if(!possible)return false;
      }return true;
    }
    function solve(model){
      const results=model.segments.map(s=>{
        const replay=E.replay(s,config.size),key=JSON.stringify([replay.observations,s.anchors]);
        if(!cache.has(key)){const solution=E.solveMap(config,replay.observations,s.anchors),proof=E.verifyCompleteLayout(config,solution,replay.observations,3000);cache.set(key,{solution,proof});}
        return {replay,...cache.get(key)};
      });return results;
    }
    function expand(state,built){
      const a=built.ambiguities[0],at=E.replay(built.model.segments[a.segment],config.size);
      const matches=E.matchBlocks(config,at.observations,a.entry).matches,links=new Map();
      for(const m of matches){const link=m.block.cells[m.lr*3+m.lc].portal;if(link)links.set(link.join(','),{kind:'portal',dr:link[0],dc:link[1]});}
      const choices=[{kind:'ground'},...links.values()];
      for(const choice of choices)queue.push({kind:state.kind||choice.kind,choices:{...state.choices,[a.key]:choice}});
      if(!state.kind&&!links.size)rejections.portal.add('入口附近没有匹配的配对传送门区块');
    }
    while(queue.length&&visits++<maxCases){
      const state=queue.shift(),built=M.buildHypothesis(base,messages,player,self,state.choices);
      if(built.branchErrors.length){built.branchErrors.forEach(s=>rejections[state.kind]?.add(s));continue;}
      const results=solve(built.model);
      if(results.some(r=>r.proof.status==='impossible')){rejections[state.kind]?.add('与后续地形、墙壁或完整地图约束不符');continue;}
      if(built.ambiguities.length){expand(state,built);continue;}
      if(!crossFits(state.choices)){rejections[state.kind]?.add('与其他玩家的声源方位或捕捉同格位置矛盾');continue;}
      cases.push({...state,built,results});
    }
    // Unsearched branches remain explicit possibilities; they never establish certainty.
    for(const state of queue){const built=M.buildHypothesis(base,messages,player,self,state.choices);if(!built.branchErrors.length)cases.push({...state,built,results:solve(built.model),pending:true});}
    const groups=['ground','portal'].map(kind=>{
      const worlds=cases.filter(c=>c.kind===kind),pending=worlds.some(c=>c.pending),reasons=[...rejections[kind]];
      if(!worlds.length)return {kind,excluded:true,reasons};
      const maps=worlds.map(w=>w.results[segment]),firstMap=maps[0],sets=maps.map(m=>new Set(m.replay.observations.map(signature)));
      const observations=firstMap.replay.observations.filter(o=>sets.every(s=>s.has(signature(o))));
      const traceSets=maps.map(m=>new Set(m.replay.trace.map(p=>E.key(p.r,p.c)))),trace=firstMap.replay.trace.filter(p=>traceSets.every(s=>s.has(E.key(p.r,p.c))));
      const solution={irregular:config.size===10,phases:maps.flatMap(m=>m.solution.phases)},verified=!pending&&maps.every(m=>m.proof.status==='verified');
      const positions=new Map();let inSpace=false,remaining=new Set();
      for(const w of worlds)if(w.built.model.active===segment){const r=w.results[segment].replay,space=w.built.space;inSpace ||= !!space;if(space)remaining.add(space.remaining);positions.set(E.key(r.r,r.c),{r:r.r,c:r.c,inSpace:!!space});}
      return {kind,excluded:false,pending:pending||!verified,cases:worlds.length,observations,trace,solution,positions:[...positions.values()],inSpace,remaining:[...remaining],verification:{status:verified?'verified':'unknown',blocks:verified?E.determinedBlocks(solution):[]}};
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
    return {player,segment,round:first.round,step:first.step,maskedUnknown:first.maskedUnknown,entry:first.entry,groups,truncated:queue.length>0,resolvedChoices,confirmedPortal,portalViews};
  }
  function all(config,notebook){return Array.from({length:notebook.count},(_,id)=>analyze(config,notebook.base,notebook.messages,id,notebook.self,96,notebook.choices?.[id]||{})).filter(Boolean);}
  const api={analyze,all,portalFrames};if(typeof module!=='undefined')module.exports=api;else root.LongNightHypotheses=api;
})(globalThis);
