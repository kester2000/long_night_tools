const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages');
const journal=(...texts)=>['模式经典\n玩家人数：4\n我是0号',...texts].map((text,i)=>({id:String(i),text,view:0}));
const at=(b,id)=>E.replay(b.views[id].model.segments[b.views[id].model.active],9);
const report='[0号]甲\n【第 1 回合】\n↑(←撞)\n【第 2 回合】\n↓↑↑(←撞)\n[1号]乙\n【第 1 回合】\n←(↓撞)\n【第 2 回合】\n↑(↑撞)\n[2号]丙\n【第 1 回合】\n↑[↓啪嗒]↑(→撞)\n[3号]丁\n【第 1 回合】\n→(→撞)\n[2号]正在行动中：\n[↑啪嗒](→撞)';
test('actual full report format restores all players and numbered historical rounds',()=>{
 const p=M.parse(report);assert(p.snapshot);assert.equal(p.items.filter(i=>i.kind==='trajectory').length,7);
 const b=M.build(E.newState(),journal(report));assert.deepEqual(b.views.map(v=>{const r=at(b,v.id);return [r.r,r.c];}),[[2,4],[3,3],[2,4],[4,5]]);
 const repeated=M.build(E.newState(),journal(report,report));assert.deepEqual(repeated.views.map(v=>at(repeated,v.id).trace),b.views.map(v=>at(b,v.id).trace));
});
test('private full report footer and subsequent private walls belong to the receiver',()=>{
 const privateReport=report+'\n\n【第 2 回合】\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n空空墙空';
 const p=M.parse(privateReport),wall=p.items.find(i=>i.kind==='walls');assert.equal(wall.player,null);assert.equal(wall.round,2);
 const b=M.build(E.newState(),journal(privateReport));assert(at(b,0).observations.some(o=>o.kind==='walls'&&o.r===2&&o.c===4));assert(!at(b,2).observations.some(o=>o.kind==='walls'));
 const opening=M.build(E.newState(),journal(report,'【开局】\n您所在位置的四周墙壁信息：空空墙墙'));assert(at(opening,0).observations.some(o=>o.kind==='walls'&&o.r===4&&o.c===4));
});
test('updated partial reports replace the existing prefix and a completed broadcast replaces the partial',()=>{
 const texts=['[0号]正在行动中：\n↑','[0号]正在行动中：\n↑↑','[0号]玩家本回合的完整行动轨迹：\n↑↑(←撞)'];
 const partial=M.build(E.newState(),journal(...texts.slice(0,2)));assert.equal(at(partial,0).r,2);assert.equal(at(partial,0).trace.length,3);
 const full=M.build(E.newState(),journal(...texts));assert.equal(at(full,0).r,2);assert.equal(at(full,0).trace.length,3);assert(at(full,0).observations.some(o=>o.kind==='hit'));
});
test('a richer private history replaces public routes and undo restores the public information',()=>{
 const pub='[0号]甲\n【第 1 回合】\n[↑沙沙](←撞)';
 const pri='[0号]甲\n【第 1 回合】\n[↑浆果丛](←撞)';
 const b=M.build(E.newState(),journal(pub,pri));assert.equal(at(b,0).trace.length,2);assert(at(b,0).observations.some(o=>o.kind==='terrain'&&o.value==='BERRY'));
 const old=M.build(E.newState(),journal(pub));assert(!at(old,0).observations.some(o=>o.kind==='terrain'&&o.value==='BERRY'));
});
test('a late richer first round is replayed before an already saved second round',()=>{
 const ms=journal('[0号]玩家本回合的完整行动轨迹：\n↑','【第 1 回合】\n空空空空','[0号]玩家本回合的完整行动轨迹：\n→','[0号]甲\n【第 1 回合】\n[↑沙沙]\n【第 2 回合】\n→');
 const b=M.build(E.newState(),ms),r=at(b,0);
 assert.deepEqual(r.observations.filter(o=>o.kind==='pass').map(o=>[o.r,o.c,o.clock.round]),[[4,4,1],[3,4,2]]);
 assert(r.observations.some(o=>o.kind==='sound'&&o.r===3&&o.c===4));
 assert.deepEqual(b.views[0].roundEnds.map(e=>[e.round,e.r,e.c]),[[1,3,4],[2,3,5]]);
 const undo=M.build(E.newState(),ms.slice(0,-1));assert(!at(undo,0).observations.some(o=>o.kind==='sound'));
});
test('private report sound bearings use the listener position at that historical turn',()=>{
 const text='[0号]甲\n【第 1 回合】\n↑\n【第 2 回合】\n↑\n[1号]乙\n【第 1 回合】\n[→沙沙(正右)]\n【第 2 回合】\n[→沙沙(正右)]';
 const b=M.build(E.newState(),journal(text));assert.equal(b.relations.length,2);assert.deepEqual(b.relations.map(h=>h.listener),[{r:3,c:4},{r:2,c:4}]);
 const j=journal(text);j[0].text='模式经典\n玩家人数：4\n我是2号';j[1].view=2;const other=M.build(E.newState(),j);assert(other.relations.every(h=>h.listener.r===4&&h.listener.c===4));
});
