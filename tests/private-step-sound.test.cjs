const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages');
const privateSound='[第 1 步] 移动发出【啪嗒声】，声响被巨大的心跳声掩盖，其他玩家未能察觉';
const texts=['模式幻变\n玩家人数：2\n我是0号','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','【开局】\n空空墙空','本局有心脏','[0号]玩家本回合的完整行动轨迹：\n↑←(←撞)',privateSound,'【第 1 回合】\n空墙墙空'];
const ms=texts.map((text,i)=>({id:String(i),text,view:0}));
test('private heartbeat feedback merges into the public step and collision establishes water',()=>{
 const b=M.build(E.newState(),ms),r=E.replay(b.views[0].model.segments[0],9);
 assert.equal(b.views[0].ambiguities.length,0);
 assert(r.observations.some(o=>o.kind==='sound'&&o.value==='PAPA'&&o.r===3&&o.c===4));
 assert(r.observations.some(o=>o.kind==='nonPortalSound'&&o.r===3&&o.c===4));
 const s=E.solveMap(b.model.config,r.observations);
 assert(s.phases.length);assert.equal(E.inferredTerrain(s,9).get('3,4'),'WATER');
 assert(b.reports[5].summary.some(s=>s.includes('已关联完整轨迹')));
 const undo=M.build(E.newState(),ms.filter((_,i)=>i!==5));
 assert(!E.replay(undo.views[0].model.segments[0],9).observations.some(o=>o.kind==='sound'));
});
test('numbered private feedback attaches to historical turn even after later moves',()=>{
 const b=M.build(E.newState(),[...ms.filter((_,i)=>i!==5),{text:'[0号]玩家本回合的完整行动轨迹：\n↓',view:0},{text:'【第 1 回合】\n'+privateSound,view:0}]);
 const r=E.replay(b.views[0].model.segments[0],9);
 assert(r.observations.some(o=>o.kind==='sound'&&o.clock.round===1&&o.r===3&&o.c===4));
 assert(!r.observations.some(o=>o.kind==='sound'&&o.clock.round===2));
});
test('unmatched private feedback stays pending instead of inventing a location',()=>{
 const b=M.build(E.newState(),[{text:privateSound,view:0}]);
 assert(b.reports[0].warnings.some(s=>s.includes('尚未找到')));
 assert.equal(E.replay(b.views[0].model.segments[0],9).observations.length,0);
});
