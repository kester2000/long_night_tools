const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses');
const texts=['模式幻变\n玩家人数：2\n我是0号','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','【开局】\n空空墙空','本局有心脏','[0号]玩家本回合的完整行动轨迹：\n↑←(←撞)','[第 1 步] 移动发出【啪嗒声】，声响被巨大的心跳声掩盖，其他玩家未能察觉','【第 1 回合】\n空墙墙空','[1号]玩家本回合的完整行动轨迹：\n↓↓[→啪嗒]↑(↑撞)','[1号(第3步)]你听见了来自【右上方】的啪嗒声！'];
const journal=ts=>ts.map((text,i)=>({id:String(i),text,view:0}));
test('heard third step requires earlier masked sound and rules out all ground routes',()=>{
 const ms=journal(texts),b=M.build(E.newState(),ms),h=H.analyze(b.model.config,E.newState(),ms,1,0);
 const r=E.replay(b.views[1].model.segments[0],9);
 assert(r.observations.some(o=>o.kind==='audible'&&o.clock.step===1));
 assert(h.groups.find(g=>g.kind==='ground').excluded);
 assert(!h.groups.find(g=>g.kind==='portal').excluded);
 assert.equal(h.confirmedPortal,true);assert.equal(h.groups.find(g=>g.kind==='portal').cases,4);
 const a=b.views[1].ambiguities[0],ground=M.buildHypothesis(E.newState(),ms,1,0,{[a.key]:{kind:'ground'}}),observations=E.replay(ground.model.segments[0],9).observations;
 for(const terrain of ['WATER','GRASS','BERRY','TRAP','ONEWAYPORTAL']){
  const obs=observations.concat({kind:'terrain',r:a.entry.r,c:a.entry.c,value:terrain});
  assert.equal(E.verifyCompleteLayout(b.model.config,E.solveMap(b.model.config,obs),obs).status,'impossible',terrain);
 }
 const without=journal(texts.slice(0,-1)),old=M.build(E.newState(),without),oldH=H.analyze(old.model.config,E.newState(),without,1,0);
 assert(!oldH.groups.find(g=>g.kind==='ground').excluded);assert(!oldH.confirmedPortal);
});
test('later-round hearings cannot force that rounds first step to be the first sound',()=>{
 const ms=journal(['模式幻变\n我是0号','本局有心脏','[1号]玩家本回合的完整行动轨迹：\n←(←撞)','【第 2 回合】\n[1号]玩家本回合的完整行动轨迹：\n↓↓[→啪嗒]↑(↑撞)','【第 2 回合】\n[1号(第3步)]你听见了来自【右上方】的啪嗒声！']);
 const b=M.build(E.newState(),ms);assert(!b.reports.at(-1).summary.some(s=>s.includes('此前已发声')));
});
test('multiple possible earlier heartbeat sounds remain a disjunction rather than forcing step one',()=>{
 const b=M.build(E.newState(),journal(['模式幻变\n我是0号','本局有心脏','[1号]玩家本回合的完整行动轨迹：\n↓↓→↓→[→啪嗒]','[1号(第6步)]你听见了来自【右上方】的啪嗒声！']));
 assert(!b.reports.at(-1).summary.some(s=>s.includes('此前已发声')));
});
