(function longNightModule(root){
 'use strict';
  (root.LongNightSources ||= {})['route-explanations.js']=longNightModule.toString();
 const E=typeof module!=='undefined'?require('./engine'):root.LongNight,L=typeof module!=='undefined'?require('./local'):root.LongNightLocal,cache=new WeakMap();
 const candidates=local=>['singles','doubles','triples','expanded'].flatMap(k=>local?.[k]||[]).filter(c=>!c.partial);
 function steps(observations,player,blocks,n){
  const groups=new Map();
  for(const o of observations){if(!o.clock||o.clock.player!==player)continue;const key=o.clock.round+':'+o.clock.step;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
  return [...groups.values()].flatMap(group=>{
   const action=group.findLast(o=>o.kind==='action'),hit=group.find(o=>o.kind==='hit'),link=group.find(o=>o.kind==='portalLink');if(!action&&!hit&&!link)return [];
   const at=action||hit||link,block=blocks.find(b=>L.inside(at,b,n)),types=block?.cellTypes?.[E.mod(at.r-block.origin.r,n)*3+E.mod(at.c-block.origin.c,n)]||[];
   return [{clock:at.clock,r:at.r,c:at.c,block:block?{id:block.id,lr:E.mod(at.r-block.origin.r,n),lc:E.mod(at.c-block.origin.c,n)}:null,types,sound:group.findLast(o=>o.kind==='sound')?.value,kind:hit?'hit':link?'entry':action?.arrival?'arrival':'space',dir:hit?.dir,teleport:group.filter(o=>o.kind==='action').length>1&&action?.arrival}];
  }).sort((a,b)=>a.clock.round-b.clock.round||a.clock.step-b.clock.step);
 }
 function explain(config,world,local,player){
  if(world.pending)return {cases:[],pending:true};
  if(world.birth)config={...config,births:[{...world.birth,player}]};
  let birthPending=false;
  const observations=world.observations,solution=world.solution||E.solveMap(config,observations,world.anchors||[]),cases=[],seen=new Set();
  function add(candidate,proof){
   const focus=candidate.patternFocus||world.focus,blocks=candidate.blocks;
   const signature=JSON.stringify([blocks.map(b=>[b.id,b.origin]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),focus,observations]);if(seen.has(signature))return;seen.add(signature);
   const full=blocks.map(b=>({...b,block:E.byId.get(b.id)}));
   cases.push({...candidate,blocks,focus,birth:world.birth,observations,status:world.pending?'unknown':proof.status,steps:steps(observations,player,blocks,config.size),reasons:candidate.reasons||[],exampleLayout:proof.layout||[],wallDependency:L.dependency(config,observations,full)});
  }
  for(const c of candidates(local)){
   if(!observations.every(o=>c.blocks.some(b=>L.inside(o,b,config.size))))continue;
   const phases=(solution.phases||[]).flatMap(p=>{const pins=new Map();for(const b of c.blocks){const i=p.slots.findIndex(s=>s.r===b.origin.r&&s.c===b.origin.c);if(i<0)return [];pins.set(i,b.id);}const domains=p.domains.map((d,i)=>pins.has(i)?d.filter(b=>b.id===pins.get(i)):d);return domains.every(d=>d.length)?[{...p,domains}]:[];});
   const proof=E.verifyCompleteLayout(config,solution.irregular?solution:{...solution,phases},observations,world.birth?200:1500);if(world.birth&&proof.status==='unknown'){birthPending=true;continue;}if(proof.status!=='impossible')add(c,proof);
  }
  // A complete layout can still explain the route when local enumeration ran
  // out of budget. Draw only its visited blocks and necessary wall providers.
  if(!cases.length){const proof=E.verifyCompleteLayout(config,solution,observations,world.birth?200:3000);if(proof.status==='unknown'&&world.birth)birthPending=true;if(proof.status==='verified'){
   const placements=proof.layout.map(b=>solution.phases.flatMap(p=>p.domains.flat()).find(m=>m.id===b.id&&m.origin.r===b.origin.r&&m.origin.c===b.origin.c)).filter(Boolean),points=[...observations,...(world.focus?[world.focus]:[])],blocks=placements.filter(b=>points.some(o=>L.inside(o,b,config.size)));
   for(let i=0;i<placements.length;i++){const need=L.dependency(config,observations,blocks);if(!need)break;const provider=placements.find(b=>b.origin.r===need.origin.r&&b.origin.c===need.origin.c);if(!provider||blocks.includes(provider))break;blocks.push(provider);}
   if(blocks.length)add({blocks:blocks.map(b=>({id:b.id,origin:b.origin,cellTypes:b.cellTypes})),patternFocus:world.focus},proof);
  }}
  return {cases,pending:birthPending||!!local?.truncated||cases.some(c=>c.status!=='verified')};
 }
 function forNode(config,node){
  const alternatives=node.routeAlternatives||node.portalAlternatives,old=cache.get(node);if(old&&old.local===node.local&&old.solution===node.solution&&old.alternatives===alternatives)return old.result;
  const worlds=alternatives||[{observations:node.mergedObservations||node.observations,solution:node.solution,positions:[node.focus]}],cases=[];let pending=false;
  for(const [i,world] of worlds.entries()){
   const focus=world.positions?.[0]||node.focus,model={...world,focus,birth:node.birth,anchors:node.anchors},local=alternatives?L.analyze(config,{...node,portalAlternatives:null,observations:world.observations,focus},world.solution):node.local,result=explain(config,model,local,node.player);
   cases.push(...result.cases.map(c=>({...c,route:i+1})));pending ||= result.pending;
  }
  const result={cases,pending};cache.set(node,{local:node.local,solution:node.solution,alternatives,result});return result;
 }
 function displayExamples(node){
  const result=node?.routeExplanation;
  if(!result)return null;
  const candidates=result.cases.filter(c=>c.status==='verified'&&c.exampleLayout?.length&&!c.steps.some(step=>step.teleport||step.kind==='entry'||step.kind==='space'));
  if(!candidates.length)return null;
  const examples=candidates.slice(0,4).map(c=>({blocks:c.exampleLayout,observations:c.observations,focus:c.focus,teleports:[],unique:false}));
  return {player:node.player,segment:node.segment,walkingExamples:examples.slice(0,1),otherWalkingExamples:examples.slice(1),portalExamples:[],portalStatus:'not-needed',candidateCount:candidates.length};
 }
 // Draw only edges from this witness's observations. In-space actions and
 // teleport arrivals must never be connected as ordinary ground movement.
 function previewTrace(observations,player){
  const cells=new Map(),groups=new Map(),arrows=['↑','↓','←','→'];
  const add=(o,label,text)=>{const key=E.key(o.r,o.c);if(!cells.has(key))cells.set(key,[]);cells.get(key).push({label:o.clock.round+'·'+label,round:o.clock.round,step:o.clock.step,title:'第 '+o.clock.round+' 回合第 '+o.clock.step+' 步 · '+text});};
  for(const o of observations){if(o.clock?.player!==player)continue;const key=o.clock.round+':'+o.clock.step;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
   if(o.kind==='pass')add(o,o.clock.step+arrows[o.dir],'从此格向'+arrows[o.dir]+'移动');
   if(o.kind==='hit')add(o,o.clock.step+arrows[o.dir]+'×','向'+arrows[o.dir]+'撞墙，停留原格');
   if(o.kind==='portalLink')add(o,o.clock.step+'入','进入传送门');
  }
  for(const group of groups.values()){const actions=group.filter(o=>o.kind==='action'),arrival=actions.find(o=>o.arrival);if(arrival&&actions.some(o=>!o.arrival))add(arrival,arrival.clock.step+'出','传送出口；此前亚空间步骤不在地面行走');}
  for(const marks of cells.values())marks.sort((a,b)=>a.round-b.round||a.step-b.step);
  return cells;
 }
 function detailedSteps(observations,player,n){
  const groups=new Map();
  for(const o of observations){if(o.clock?.player!==player||o.kind==='turnEnd')continue;const key=o.clock.round+':'+o.clock.step;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
  return [...groups.values()].flatMap(group=>{
   const pass=group.find(o=>o.kind==='pass'),hit=group.find(o=>o.kind==='hit'),link=group.find(o=>o.kind==='portalLink'),action=group.findLast(o=>o.kind==='action');
   if(!pass&&!hit&&!link&&!action)return [];
   const origin=pass||hit||link||action,kind=hit?'hit':link?'portal':action?.arrival&&group.filter(o=>o.kind==='action').length>1?'teleport':pass?'move':action?.arrival?'arrival':'space';
   const to=hit?hit:action?.arrival?action:pass?{r:E.mod(pass.r+E.V[pass.dir][0],n),c:E.mod(pass.c+E.V[pass.dir][1],n)}:link||action;
   return [{round:origin.clock.round,step:origin.clock.step,label:origin.clock.round+'·'+origin.clock.step,kind,dir:(pass||hit)?.dir,from:{r:origin.r,c:origin.c},to:{r:to.r,c:to.c},sound:group.findLast(o=>o.kind==='sound')?.value}];
  }).sort((a,b)=>a.round-b.round||a.step-b.step);
 }
 const api={detailedSteps,explain,forNode,steps,displayExamples,previewTrace};if(typeof module!=='undefined')module.exports=api;else root.LongNightRouteExplanations=api;
})(globalThis);
