const test=require('node:test'),assert=require('node:assert/strict'),E=require('../engine'),M=require('../messages');
test('capture relocation is normal feedback while preserving pre-transfer same-square evidence',()=>{
 const ms=['模式疯狂\n玩家人数：4\n我是0号','[2号]玩家本回合的完整行动轨迹：\n→','[3号]玩家本回合的完整行动轨迹：\n→(捕捉)[传送]'].map((text,i)=>({id:String(i),text,view:0}));
 const b=M.build(E.newState(),ms);
 assert.equal(b.reports.at(-1).warnings.length,0);
 assert(b.reports.at(-1).summary.some(s=>s.includes('捕捉后随机传送')));
 assert.equal(b.views[3].model.segments.length,2);
 assert.equal(b.captures.length,1);assert.equal(b.captures[0].aligned,true);
 assert(b.relations.some(h=>h.kind==='capture'&&h.bNode==='2:0'&&h.aNode==='3:0'));
 assert.equal(E.replay(b.views[3].model.segments[0],9).c,5);
});
