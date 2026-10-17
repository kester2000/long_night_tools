const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),T=require('../timeline'),archive=require('./fixtures/garden-no-buttons.json');
const note={id:'no-buttons',text:'当前还没人动过按钮',view:1};
test('explicit no-button history excludes the garden B middle-left candidate in the real archive',()=>{
 const run=messages=>{const b=M.build(archive.base,messages),v=b.views[1],r=E.replay(v.model.segments[0],9);return {config:v.model.config,matches:E.matchBlocks(v.model.config,r.observations,r).matches};};
 assert(run(archive.messages).matches.some(m=>m.id==='E16'&&m.lr===1&&m.lc===0));
 const fixed=run([...archive.messages,note]);assert.deepEqual(fixed.config.buttonCounts,{1:0,2:0});
 assert(!fixed.matches.some(m=>m.id==='E16'&&m.lr===1&&m.lc===0));
 assert.deepEqual(run(archive.messages).config.buttonCounts,{});
 const later=run([...archive.messages,note,{id:'later',view:1,text:'[0号]玩家本回合的完整行动轨迹：\n→'}]);
 assert.equal(later.config.buttonCounts[3],undefined);
});
test('zero counts constrain missing turns, but later unknown rounds can still toggle doors',()=>{
 const config={size:9,playerCount:2,dynamicDoors:true,buttonCounts:{1:0,2:0}},ps=[{block:E.byId.get('E16'),origin:{r:0,c:0}}];
 const hit=round=>({kind:'hit',r:1,c:0,dir:3,clock:{round,player:1,step:1}});
 assert.equal(T.check(config,ps,[hit(2)]).valid,false);
 assert.equal(T.check(config,ps,[hit(3)]).valid,true);
 assert.throws(()=>M.build(archive.base,[...archive.messages,note,{id:'conflict',text:'【第1回合】门曾被按钮触发，共发生 1 次变化',view:1}]),/冲突/);
});
test('full team inference excludes every garden B current-position candidate for player 1',()=>{
 const L=require('../local'),T=require('../team'),b=M.build(archive.base,[...archive.messages,note]),config={...b.model.config,routePresentation:true};
 const team=T.solve(config,L.nodes(b),b.relations),node=team.nodes.find(n=>n.id==='1:0'),r=E.replay(b.views[1].model.segments[0],9);
 assert(node.solution.phases.length);assert(!E.globallyFilter(E.matchBlocks(config,node.observations,r),node.solution).matches.some(m=>m.id==='E16'));
 assert(!node.local.focusCandidates.some(m=>m.id==='E16'));
 for(const c of team.combined?.cases||[]){const j=c.joined.find(j=>j.id==='1:0');if(!j)continue;const at=T.shift(r,j.dr,j.dc,9);
  for(const layout of c.layouts)assert.notEqual(layout.find(m=>L.inside(at,m,9))?.id,'E16');
 }
});
