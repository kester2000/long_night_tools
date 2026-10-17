const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),T=require('../team'),j=require('./fixtures/endgame-relocation.json');
const cache=new Map();
function solve(messages){const key=JSON.stringify(messages);if(cache.has(key))return cache.get(key);let choices={};for(let i=0;i<5;i++){
 const b=M.build(j.base,messages,choices),h=H.all(b.model.config,{...j,messages,self:b.self,count:b.count,choices}),next=H.choiceUpdates(h,choices);
 if(next){choices=next;continue;}
 const c=H.constrainNodes(L.nodes(b),b.relations,h),t=T.solve({...b.model.config,routePresentation:true},c.nodes,c.relations),result={b,t,choices,h};cache.set(key,result);return result;
}throw Error('unstable choices');}
test('endgame retains only supported historical blocks when new silent portal alternatives remain',()=>{
 const before=solve(M.liveMessages(j.messages.slice(0,24))),after=solve(M.liveMessages(j.messages));
 const view=T.relocationView(after.b.model.config,after.t,after.b);assert(view);assert.equal(after.t.conflict,false);
 const previous=before.t.nodes.find(n=>n.id===view.reference.id).verification.blocks;
 assert(view.reference.verification.blocks.length>0&&view.reference.verification.blocks.length<8);
 assert(view.reference.verification.blocks.every(b=>previous.some(p=>p.id===b.id&&p.origin.r===b.origin.r&&p.origin.c===b.origin.c)));
 assert(after.h.some(h=>!h.resolvedChoices));
 assert(after.t.nodes.some(n=>n.routePending));assert.notEqual(after.t.combined?.complete,true);
 assert(view.targets.every(t=>t.positions.length>1),'unresolved portals must not produce a unique current position');
 for(const t of view.targets)for(const p of t.positions){assert(p.arrival.r>=0&&p.arrival.r<9);assert(p.current.c>=0&&p.current.c<9);}
 assert.equal(T.relocationView(after.b.model.config,{...after.t,conflict:true},after.b).targets[0].positions.length,0);
});


test('endgame does not claim a coin-based unique location while portal search is unfinished',()=>{
 const ms=M.liveMessages(j.messages),base=solve(ms);
 assert.notEqual(base.t.combined?.complete,true);assert.deepEqual(T.coinQuestions(base.b.model.config,base.t,base.b),[]);
 assert.deepEqual(T.coinQuestions(base.b.model.config,base.t,{...base.b,spectator:true}),[]);
 for(const answer of ['获得金币','确认未收到金币通知']){
  const b=M.build(j.base,[...ms,{id:'coin-answer',view:0,text:'【第 6 回合】\n0号'+answer}]);
  assert(b.model.config.coinGains.some(g=>g.player===0&&g.round===6&&g.min===(answer==='获得金币'?1:0)));
 }
 assert(!base.b.model.config.coinGains.some(g=>g.player===0&&g.round===6),'absence of an answer remains unknown');
});
