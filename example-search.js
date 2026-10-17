(function longNightModule(root){
 'use strict';
  (root.LongNightSources ||= {})['example-search.js']=longNightModule.toString();
 const get=(file,name)=>typeof module!=='undefined'?require('./'+file):root[name];
 const E=get('engine','LongNight'),M=get('messages','LongNightMessages'),H=get('hypotheses','LongNightHypotheses'),L=get('local','LongNightLocal'),T=get('team','LongNightTeam');
 function eventTarget(config,player){
  return (config.coinGains||[]).filter(g=>g.min>0&&g.max===g.min&&!(config.coinTransferRounds||[]).includes(g.round))
   .map(g=>({...g,buttons:config.playerButtonCounts?.find(b=>b.player===g.player&&b.round===g.round)?.count}))
   .filter(g=>g.buttons>0).sort((a,b)=>Number(b.player===player)-Number(a.player===player)||b.round-a.round)[0]||null;
 }
 const eventKey=events=>JSON.stringify(events.map(e=>[e.step,e.block,e.row,e.col]));
 function eventTree(target,leaves,pending){
  const counts={coin:new Set(leaves.map(l=>eventKey(l.coin))).size,button:new Set(leaves.map(l=>eventKey(l.button))).size};
  const first=counts.coin<=counts.button?'coin':'button',second=first==='coin'?'button':'coin',groups=new Map();
  for(const leaf of leaves){const key=eventKey(leaf[first]);if(!groups.has(key))groups.set(key,{events:leaf[first],options:[]});groups.get(key).options.push({events:leaf[second],proof:leaf.proof});}
  const order=(a,b)=>eventKey(a.events).localeCompare(eventKey(b.events),undefined,{numeric:true});
  const options=[...groups.values()].sort(order);options.forEach(g=>g.options.sort(order));
  return {status:leaves.length?'choices':pending?'unknown':'impossible',target,first,second,counts,complete:!pending,options};
 }
 function eventPlans(config,nodes,target,kind,limit=2048){
  const node=nodes.find(n=>n.player===target.player&&n.observations.some(o=>o.clock?.round===target.round&&o.kind==='action'));
  if(!node)return {plans:[],pending:true};
  const solution=E.solveMap(config,node.observations,node.anchors),actions=[...new Map(node.observations.filter(o=>o.kind==='action'&&o.arrival&&o.clock?.round===target.round).map(o=>[o.clock.step,o])).values()].sort((a,b)=>a.clock.step-b.clock.step);
  const seen=new Set(),candidates=[];
  for(const o of actions){
   if(kind==='coin'&&seen.has(E.key(o.r,o.c)))continue;seen.add(E.key(o.r,o.c));
   const unique=new Map();
   for(const phase of solution.phases)for(const domain of phase.domains)for(const m of domain){
    const row=E.mod(o.r-m.origin.r,config.size),col=E.mod(o.c-m.origin.c,config.size);
    if(row>=3||col>=3||m.block.cells[row*3+col].attach!==(kind==='coin'?'COIN':'BUTTON'))continue;
    const event={step:o.clock.step,block:m.id,row:row+1,col:col+1},anchor={id:m.id,r:m.origin.r,c:m.origin.c};
    unique.set(JSON.stringify([event,anchor]),{event,anchor,nodeId:node.id});
   }
   candidates.push(...unique.values());
  }
  const count=kind==='coin'?target.min:target.buttons,plans=[];let pending=false;
  function visit(start,chosen){
   E.checkDeadline();if(plans.length>=limit){pending=true;return;}
   if(chosen.length===count){plans.push(chosen);return;}
   for(let i=start;i<candidates.length;i++){
    const c=candidates[i];if(chosen.some(x=>x.event.step===c.event.step))continue;
    if(chosen.some(x=>x.anchor.r===c.anchor.r&&x.anchor.c===c.anchor.c?x.anchor.id!==c.anchor.id:x.anchor.id===c.anchor.id))continue;
    visit(i+1,[...chosen,c]);if(pending)return;
   }
  }
  visit(0,[]);return {plans,pending};
 }
 // An example needs one complete witness, not a uniquely resolved route.
 // Rebuild messages for each choice combination to preserve cross-player clues.
 function search(notebook,referenceId,request={},emit=()=>{},budgetMs=30000,reuse={}){
  const initial=M.build(notebook.base,notebook.messages),config=initial.model.config,n=config.size;
  const target=request.eventBranches?eventTarget(config,request.player):null,leaves=new Map();
  let pending=false,answer=null;
  E.setDeadline(Date.now()+budgetMs);
  try{
   const options=[];
   for(let player=0;player<initial.count;player++){
    emit({player});
    const h=H.analyze({...config,witnessFirst:false,independentPerspective:true,routeCheckpoint:reuse.routes?.[player],onRouteCheckpoint:checkpoint=>{(reuse.routes ||= {})[player]=checkpoint;}},notebook.base,notebook.messages,player,initial.self,4096,notebook.choices?.[player]||{});
    if(!h){options.push([notebook.choices?.[player]||{}]);continue;}
    const alternatives=h.groups.flatMap(g=>g.alternatives||[]);
    pending ||= h.truncated||alternatives.some(a=>a.pending);
    const choices=new Map();
    for(const a of alternatives)if(!a.pending&&a.choices)choices.set(JSON.stringify(a.choices),a.choices);
    options.push([...choices.values()]);
   }
   function visit(choices,player){
    E.checkDeadline();if(answer)return;
    if(player<options.length){for(const choice of options[player]){visit({...choices,[player]:choice},player+1);if(answer)return;}return;}
    const built=M.build(notebook.base,notebook.messages,choices);
    if(built.views.some(v=>v.branchErrors?.length))return;
    if(built.views.some(v=>v.ambiguities?.length)){pending=true;return;}
    const nodes=L.nodes(built),pairs=[];
    const relations=built.relations.filter(r=>!['首次','被屏蔽'].includes(r.direction));
    for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++){
     const A=nodes[a],B=nodes[b],constraints=relations.filter(h=>h.aNode===A.id&&h.bNode===B.id||h.aNode===B.id&&h.bNode===A.id),offsets=[];
     for(let dr=0;dr<n;dr++)for(let dc=0;dc<n;dc++)if(constraints.every(h=>h.aNode===A.id?E.bearings(T.shift(h.source,dr,dc,n),h.listener,n).includes(h.direction):E.bearings(h.source,T.shift(h.listener,dr,dc,n),n).includes(h.direction)))offsets.push({dr,dc});
     pairs.push({a:A.id,b:B.id,offsets});
    }
    if(!target){
     const proof=T.jointExample(config,{nodes,pairs},referenceId,request);
     if(proof.status==='verified')answer=proof;
     else pending ||= proof.status==='unknown';
     return;
    }
    const coin=eventPlans(config,nodes,target,'coin'),button=eventPlans(config,nodes,target,'button');
    pending ||= coin.pending||button.pending;
    const first=coin.plans.length<=button.plans.length?'coin':'button',plans={coin:coin.plans,button:button.plans};
    for(const a of plans[first])for(const b of plans[first==='coin'?'button':'coin']){
     E.checkDeadline();
     const selected={ [first]:a,[first==='coin'?'button':'coin']:b },events={coin:selected.coin.map(x=>x.event),button:selected.button.map(x=>x.event)};
     const key=eventKey(events.coin)+'|'+eventKey(events.button);
     const anchors=[...a,...b];
     if(anchors.some((x,i)=>anchors.slice(i+1).some(y=>x.anchor.r===y.anchor.r&&x.anchor.c===y.anchor.c?x.anchor.id!==y.anchor.id:x.anchor.id===y.anchor.id)))continue;
     const pinned=nodes.map(node=>({...node,anchors:[...node.anchors,...anchors.filter(x=>x.nodeId===node.id).map(x=>x.anchor)]}));
     const proof=T.jointExample(config,{nodes:pinned,pairs},referenceId,{...request,events:{player:target.player,round:target.round,...events}});
     if(proof.status==='verified'){
      const prior=leaves.get(key);
      leaves.set(key,{...events,proof:prior?.proof||proof,routes:[...(prior?.routes||[]),choices]});emit({verified:leaves.size});
     }else pending ||= proof.status==='unknown';
    }
   }
   visit({},0);
   if(target){
    const result=eventTree(target,[...leaves.values()],pending);
    if(!pending&&leaves.size===1){const leaf=[...leaves.values()][0],choices={};
     for(let player=0;player<initial.count;player++){const first=leaf.routes[0][player]||{};choices[player]=Object.fromEntries(Object.entries(first).filter(([k,v])=>leaf.routes.every(r=>JSON.stringify(r[player]?.[k])===JSON.stringify(v))));}
     result.deductions={events:[...(notebook.base.config.confirmedEvents||[]).filter(e=>e.player!==target.player||e.round!==target.round),{player:target.player,round:target.round,coin:leaf.coin,button:leaf.button}],choices};
     const applied=get('search-cache','LongNightSearchCache').apply(notebook,result.deductions),built=M.build(applied.base,applied.messages,applied.choices);
     result.deductions.blocks=[];
     for(const node of L.nodes(built)){if(built.views[node.player].ambiguities.length)continue;const solution=E.solveMap(built.model.config,node.observations,node.anchors),proof=E.certifyBlocks(built.model.config,solution,node.observations,3000);if(proof.status==='verified')result.deductions.blocks.push({player:node.player,segment:node.segment,blocks:proof.blocks});}

    }
    return result;
   }
   return answer||{status:pending?'unknown':'impossible'};
  }catch(error){if(error.code!=='INFERENCE_TIMEOUT')throw error;return target?eventTree(target,[...leaves.values()],true):{status:'unknown'};}
  finally{E.setDeadline();}
 }
 async function cachedSearch(notebook,referenceId,request={},emit=()=>{},budgetMs=30000,cacheVersion=null,store=null){
  const C=get('search-cache','LongNightSearchCache');
  let version,loaded;
  try{if(cacheVersion!==false){version=cacheVersion||await C.version();loaded=await C.load(version,notebook,store||C.storage);}}catch{loaded=null;}
  const key=C.requestKey(referenceId,request),saved=loaded?.mode==='exact'?loaded.record.outputs?.[key]:null;
  if(saved&&(saved.status==='verified'||saved.status==='impossible'||saved.status==='choices'&&saved.complete)){
   emit({cache:'exact'});return {...saved,cache:{mode:'exact',savedAt:loaded.record.savedAt}};
  }
  const reuse={routes:loaded?.record?.routes?JSON.parse(JSON.stringify(loaded.record.routes)):{}};
  if(loaded?.record)emit({cache:loaded.mode==='prefix'?'prefix':'resume'});
  const result=search(loaded?.record?.deductions?C.apply(notebook,loaded.record.deductions):notebook,referenceId,request,emit,budgetMs,reuse);
  let persisted=false;
  if(loaded)try{persisted=await C.save(version,notebook,loaded,reuse.routes,{key,result},store||C.storage);}catch{}
  return {...result,cache:{mode:loaded?.record?loaded.mode==='prefix'?'prefix':'resume':'miss',persisted}};
 }
 const api={search,cachedSearch,eventTarget,eventTree};if(typeof module!=='undefined')module.exports=api;else root.LongNightExampleSearch=api;
})(globalThis);
