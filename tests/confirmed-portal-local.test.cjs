const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local');
test('confirmed entry constrains ordinary local candidates even with multiple paired exits',()=>{
 const journal={base:E.newState()},texts=['模式幻变\n玩家人数：3\n我是0号','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','【开局】\n空空墙空','本局有心脏','[0号]玩家本回合的完整行动轨迹：\n↑←(←撞)','[第 1 步] 移动发出【啪嗒声】，声响被巨大的心跳声掩盖，其他玩家未能察觉','【第 1 回合】\n空墙墙空','[2号]玩家本回合的完整行动轨迹：\n↓↓[→啪嗒]↑(↑撞)','[2号(第3步)]你听见了来自【右上方】的啪嗒声！'];
 const messages=texts.map((text,i)=>({id:String(i),text,view:0})),built=M.build(journal.base,messages);
 const h=H.analyze(built.model.config,journal.base,messages,2,built.self);
 assert(h.confirmedPortal);assert.equal(h.resolvedChoices,null);
 const original=L.nodes(built),relations=[{aNode:'2:0',bNode:'0:0'},{aNode:'0:0',bNode:'1:0'}];
 const constrained=H.constrainNodes(original,relations,[h]),node=constrained.nodes.find(n=>n.id==='2:0');
 assert(node.portalPrefix);assert.deepEqual(node.focus,h.entry);assert.deepEqual(node.histories,[]);
 assert.deepEqual(constrained.relations,[relations[1]]);
 const solution=E.solveMap(built.model.config,node.observations,node.anchors),local=L.analyze(built.model.config,node,solution);
 const candidates=[...local.singles,...local.doubles,...local.triples,...local.expanded];assert(candidates.length>0);
 for(const c of candidates){assert(c.observations.some(o=>o.kind==='hit'));assert(h.groups[1].alternatives.some(a=>a.positions.some(p=>p.r===c.patternFocus.r&&p.c===c.patternFocus.c)));}
 assert(h.groups.find(g=>g.kind==='portal').alternatives.length>1);
 const uncertain=H.constrainNodes(original,relations,[{...h,confirmedPortal:false}]).nodes.find(n=>n.id==='2:0');
 assert(uncertain.routePending);assert(uncertain.routeAlternatives.length);assert(uncertain.walkingObservations.length);
});
test('portal candidates stop at the paired exit and require a lower block when the exit has no bottom wall',()=>{
 const config={...E.newState().config,pool:'2 4 9 11 12 13 23 45 46 47 48 51 E1 E4 E7 E8'};
 const alternatives=['2','13','45','46'].map(id=>{
  const diagonal=['2','13'].includes(id),entry={r:3,c:diagonal?5:3},focus={r:5,c:diagonal?3:5};
  const observations=[{...entry,kind:'terrain',value:'PORTAL'},{...entry,kind:'portalLink',dr:2,dc:diagonal?-2:2},{...focus,kind:'terrain',value:'PORTAL'},{...focus,kind:'hit',dir:1,last:1}];
  return {observations,positions:[focus],solution:E.solveMap(config,observations,[{id,r:3,c:3}])};
 });
 const node={observations:alternatives[0].observations,focus:{r:3,c:5},anchors:[],birth:null,portalAlternatives:alternatives};
 const local=L.analyze(config,node,null);
 for(const id of ['2','13']){const c=local.singles.find(c=>c.blocks[0].id===id);assert(c,id);assert.deepEqual(c.patternFocus,{r:5,c:3});assert.deepEqual([c.lr,c.lc],[2,0]);}
 for(const id of ['45','46']){assert(!local.singles.some(c=>c.blocks[0].id===id),id);const c=local.doubles.find(c=>c.blocks[0].id===id);assert(c,id);assert(c.reasons.some(r=>r.dir===1&&r.origin.r===6));assert.deepEqual(c.patternFocus,{r:5,c:5});}
});
