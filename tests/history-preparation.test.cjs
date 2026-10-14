const test=require('node:test'),assert=require('node:assert/strict'),E=require('../engine'),M=require('../messages'),L=require('../local');
test('historical nodes include late walls at the historical turn without rebuilding every journal prefix',()=>{
 const ms=['模式经典\n玩家人数：4\n我是0号','【第 1 回合】\n[0号]玩家本回合的完整行动轨迹：\n↑','【第 2 回合】\n[0号]玩家本回合的完整行动轨迹：\n→','【第 1 回合】\n四周墙壁信息：\n墙空空墙'].map((text,i)=>({id:String(i),text,view:0}));
 const b=M.build(E.newState(),ms),nodes=L.nodes(b),history=nodes.find(n=>n.id==='0:0').histories.find(h=>h.round===1);
 assert(history.observations.some(o=>o.kind==='walls'&&o.r===3&&o.c===4));assert(!history.observations.some(o=>o.kind==='action'&&o.clock.round===2));
 assert.deepEqual(history.focus,{r:3,c:4});assert.deepEqual(nodes.find(n=>n.id==='0:0').previous.focus,{r:3,c:4});
});
