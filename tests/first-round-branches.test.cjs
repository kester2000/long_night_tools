const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),A=require('../advice');
const messages=[
 '玩家人数：3\n模式幻变\n我是0号',
 '区块池：2 4 8 9 12 13 14 45 46 47 48 49 E1 E4 E7 E8',
 '【开局】\n您所在位置的四周墙壁信息：\n墙墙空空',
 '[0号]玩家本回合的完整行动轨迹：\n←(↓撞)',
 '【第 1 回合】\n您所在位置的四周墙壁信息：\n墙墙空空',
 '[1号]玩家本回合的完整行动轨迹：\n↓→↓(→撞)',
 '[2号]玩家本回合的完整行动轨迹：\n[→啪嗒]→[↓啪嗒](→撞)'
].map((text,i)=>({id:String(i),text,view:0}));
const base=E.newState(),built=M.build(base,messages),h=H.analyze(built.model.config,base,messages,2,0);

test('two first-round papa sounds retain a verified ground route across block boundaries',()=>{
 const g=h.groups.find(g=>g.kind==='ground');assert(!g.excluded&&!g.pending);
 assert.deepEqual(g.verification.blocks.map(b=>b.id),['13','E7']);
 const example=g.alternatives[0].exampleRoute;
 assert.deepEqual(example.map(o=>[o.clock.step,o.id,o.lr,o.lc,o.types]),[
  [1,'13',2,2,['WATER']],[2,'8',2,0,['EMPTY']],[3,'E7',0,0,['WATER']]
 ]);
 assert.equal(g.alternatives[0].observations.find(o=>o.kind==='hit').clock.step,4);
});

test('each portal candidate keeps its paired exit sound and final collision rather than just their intersection',()=>{
 const g=h.groups.find(g=>g.kind==='portal');assert(!g.excluded&&!g.pending);
 assert.equal(g.alternatives.length,2);
 assert.deepEqual(g.alternatives.map(a=>a.entryBlocks),[['2','13','E7','E8'],['14','45','46']]);
 for(const a of g.alternatives){
  assert.equal(a.teleports.length,1);const exit=a.teleports[0];
  assert(a.observations.some(o=>o.kind==='sound'&&o.value==='PAPA'&&o.r===exit.r&&o.c===exit.c));
  assert(a.observations.some(o=>o.kind==='hit'&&o.dir===3&&o.r===exit.r&&o.c===exit.c&&o.clock.step===4));
  assert(a.observations.some(o=>o.kind==='portalLink'));
  assert.equal(a.verification.status,'verified');
 }
 assert.equal(h.resolvedChoices,null,'both ground and portal explanations remain possible');
});

test('summary shows conditional block deductions and a concrete crossing example for another player',()=>{
 const lines=A.summarize(built,{nodes:[],hypotheses:[h]}).join('\n');
 assert(lines.includes('2号第1回合第1步：若未进入传送门'));
 assert(lines.includes('13「镜面迷宫A」')&&lines.includes('E7「亚空间逃生舱A」'));
 assert(lines.includes('第2步到8号区块第3行第1列（道路）'));
 assert(lines.includes('保留 2 种完整路线'));
});
