const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),A=require('../advice');
const messages=texts=>texts.map((text,i)=>({id:String(i),text,view:0}));
test('spectator retains public routes without adopting a player or private receiver',()=>{
 const ms=messages(['模式经典\n人数3\n我是观战','【第1回合】\n[0号]玩家本回合的完整行动轨迹：\n↑','【第1回合】\n[2号]玩家本回合的完整行动轨迹：\n↓','【开局】墙空空墙']);
 const live=M.liveMessages(ms),b=M.build(E.newState(),live);
 assert(b.spectator);assert(live.at(-1).excluded);assert(b.views[0].steps.length);assert(b.views[2].steps.length);
 assert(!b.views[0].model.segments.flatMap(s=>s.events).some(e=>e.walls));
 assert.deepEqual(M.soundChecklist(ms),[]);assert.deepEqual(A.practical(b),[]);assert(A.summarize(b,null)[0].includes('观战'));
 const restored=[...ms,{id:'return',text:'我是0号',view:0}];assert(!M.build(E.newState(),M.liveMessages(restored)).spectator);assert(!M.liveMessages(restored).at(-2).excluded);
});
test('spectator does not inherit private spatial data from a legacy base',()=>{
 const base=E.newState();base.segments[0].events.push({kind:'observe',r:4,c:4,walls:'墙墙墙墙'});
 const b=M.build(base,M.liveMessages(messages(['模式经典\n人数3\n我是观战'])));
 assert.equal(b.views[0].model.segments[0].events.length,0);assert.equal(base.segments[0].events.length,1);
});
