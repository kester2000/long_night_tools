(function longNightModule(root){
 'use strict';
  (root.LongNightSources ||= {})['inference.js']=longNightModule.toString();
 const get=(file,name)=>typeof module!=='undefined'?require('./'+file):root[name];
 const E=get('engine','LongNight'),M=get('messages','LongNightMessages'),L=get('local','LongNightLocal'),H=get('hypotheses','LongNightHypotheses'),T=get('team','LongNightTeam'),S=get('sound-candidates','LongNightSoundCandidates'),R=get('route-explanations','LongNightRouteExplanations');
 async function run(request,emit=()=>{},cancelled=()=>false){
  const budget=Math.min(request.playerBudgetMs??3000,3000),statuses=[],nodes=[],hypotheses=[];
  let notebook=request.notebook;
  const playerConfig={...request.config,witnessFirst:true,independentPerspective:true};
  let cachedRoutes={},deductions=request.deductions;
  if(request.cacheVersion)try{const C=get('search-cache','LongNightSearchCache'),cached=await C.load(request.cacheVersion,notebook);cachedRoutes=cached.record?.routes||{};deductions ||= cached.record?.deductions;if(cached.record)emit({progress:{stage:'cache',mode:cached.mode}});}catch{}
  if(deductions){notebook=get('search-cache','LongNightSearchCache').apply(notebook,deductions);request={...request,config:M.build(notebook.base,notebook.messages,notebook.choices).model.config};Object.assign(playerConfig,request.config);}
  let choices={...(notebook.choices||{})},relations=request.relations,result;
  for(let player=0;player<notebook.count;player++){
   await new Promise(resolve=>setTimeout(resolve,0));if(cancelled())return null;
   const start=Date.now();E.setDeadline(start+budget);emit({progress:{stage:'player-budget',player}});
   let checkpoint=[];
   try{
    let built,own,h,resolved;
    for(;;){
     E.checkDeadline();const resume=Object.keys(choices[player]||{}).some(k=>!k.startsWith('__'))?null:cachedRoutes[player];
     h=H.analyze({...playerConfig,routeCheckpoint:resume},notebook.base,notebook.messages,player,notebook.self,null,choices[player]||{});
     const updated=H.choiceUpdates(h?[h]:[],choices);if(!updated)break;if(h?.resolvedChoices&&h.portalExamples?.length)resolved=h;choices=updated;
    }
    built=M.build(notebook.base,notebook.messages,choices);relations=built.relations.filter(r=>!['首次','被屏蔽'].includes(r.direction));
    own=L.nodes(built).filter(n=>n.player===player);
    if(!own.some(n=>n.observations.length||n.anchors?.length)){statuses.push({player,status:'waiting',elapsedMs:Date.now()-start});continue;}
    if(!h&&resolved)h=resolved;
    if(h)hypotheses.push(h);
    const constrained=H.constrainNodes(own,relations,h?[h]:[]);
    if(deductions){checkpoint=constrained.nodes.map(node=>{const solution=E.solveMap(request.config,node.observations,node.anchors);return {...node,solution,verification:E.certifyBlocks(request.config,solution,node.observations,3000),local:{waiting:true,pending:true,singles:[],doubles:[],triples:[],expanded:[],focusCandidates:[]}};});
    emit({partial:true,team:{nodes:[...nodes,...checkpoint],pairs:[],conflict:false,combined:null,hypotheses,soundCandidates:[],completedChoices:choices}});}
    const local=T.solve(request.config,constrained.nodes,constrained.relations,partial=>{checkpoint=partial.nodes;},p=>emit({progress:p}));
    checkpoint=local.nodes;
    for(const node of local.nodes){if(node.routePending)node.walkingDisplaySolution=T.walkingSolution(request.config,node);node.routeExplanation=R.forNode(request.config,node);}
    E.checkDeadline();nodes.push(...local.nodes);
    statuses.push({player,status:'complete',elapsedMs:Date.now()-start});
   }catch(error){if(error.code!=='INFERENCE_TIMEOUT')throw error;nodes.push(...checkpoint);statuses.push({player,status:'timeout',elapsedMs:Date.now()-start});}
   finally{E.setDeadline();}
   emit({playerStatus:statuses.at(-1)});
   emit({partial:true,team:{nodes,pairs:[],conflict:false,combined:null,hypotheses,soundCandidates:[],playerStatuses:statuses,completedChoices:choices}});
  }
  result={nodes,pairs:[],conflict:false,combined:null,hypotheses,soundCandidates:[]};
  // Joint alignment has its own bound; failing it must not erase completed views.
  let jointStatus='skipped';
  if(nodes.length){
   await new Promise(resolve=>setTimeout(resolve,0));if(cancelled())return null;
   E.setDeadline(Date.now()+budget);emit({progress:{stage:'joint-budget'}});
   try{
    const constrained=H.constrainNodes(nodes,relations,hypotheses),joint=T.solve(request.config,constrained.nodes,constrained.relations,null,p=>emit({progress:p}));
    joint.hypotheses=hypotheses;joint.soundCandidates=S.analyze(request.config,S.attach(joint.nodes,hypotheses),request.soundRelations||relations,p=>emit({progress:p}));
    for(const node of joint.nodes){if(node.routePending)node.walkingDisplaySolution=T.walkingSolution(request.config,node);node.routeExplanation=R.forNode(request.config,node);}
    E.checkDeadline();result=joint;jointStatus='complete';
   }catch(error){if(error.code!=='INFERENCE_TIMEOUT')throw error;jointStatus='timeout';}
   finally{E.setDeadline();}
  }
  return {...result,playerStatuses:statuses,jointStatus,completedChoices:choices};
 }
 const api={run};if(typeof module!=='undefined')module.exports=api;else root.LongNightInference=api;
})(globalThis);
