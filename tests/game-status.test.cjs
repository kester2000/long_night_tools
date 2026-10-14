const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),A=require('../advice');
const setup='模式经典\n玩家人数：4\n我是0号';
const build=(...texts)=>M.build(E.newState(),[setup,...texts].map((text,i)=>({id:String(i),text,view:0})));
test('source opening notices recognize game size, player count and reverse hunting order',()=>{
 const b=build('【捕捉顺位】本局玩家的捕捉顺位为相反顺序，捕捉目标变更为下家\n【12*12】本局游戏地图将更改为 12x12 大地图。\n[提示] 本局游戏人数为 6 人，逃生舱数量为 4 个。\n【关闭点杀】仅需路过即可触发捕捉');
 assert.equal(b.count,6);assert.equal(b.model.config.size,12);assert.equal(b.model.config.exitCount,4);assert.equal(b.model.config.captureTarget,'NEXT');assert.equal(b.model.config.pointCapture,false);
 assert.equal(A.status(b)[0].target,1);assert.equal(A.status(b)[0].hunter,5);
});
test('brawl escape keeps player active, retains exit and starts unknown relocation exactly once',()=>{
 const route='【第 2 回合】\n[0号]玩家本回合的完整行动轨迹：\n→(逃生)[传送]';
 const b=build('【大乱斗模式】所有的逃生舱改为随机传送！但仍会统计逃生分',route);
 assert(b.players[0].alive);assert.equal(b.model.segments.length,2);assert(E.replay(b.model.segments[0],9).observations.some(o=>o.kind==='terrain'&&o.value==='EXIT'));assert.equal(b.views[0].roundEnds[0].locatable,false);
 const repeat=build('大乱斗开启',route,route);assert.equal(repeat.model.segments.length,2);assert(repeat.players[0].alive);
 const normal=build(route);assert.equal(normal.players[0].alive,false);
 // A correction pasted after the route must replay the escape under the corrected mode.
 assert(build(route,'大乱斗开启').players[0].alive);
 assert.equal(build('大乱斗开启',route,'大乱斗关闭').players[0].alive,false);
});
test('brawl escape without an explicit teleport token still breaks the route',()=>{
 const b=build('大乱斗开启','[0号]玩家本回合的完整行动轨迹：\n→(逃生)');assert.equal(b.model.active,1);assert.equal(b.views[0].roundEnds[0].locatable,false);assert(b.players[0].alive);
});
test('snapshot retirement headers survive report expansion and affect current target cards',()=>{
 const report='[0号]甲\n【第 1 回合】\n↑\n[1号]乙【已出局】\n【第 1 回合】\n←\n[2号]丙【逃生舱撤离】\n【第 1 回合】\n→(逃生)\n[3号]丁\n【第 1 回合】\n↓';
 const b=build(report),rows=A.status(b);assert.deepEqual(b.players.map(p=>p.alive),[true,false,false,true]);assert.equal(rows[0].target,3);assert.equal(rows[0].hunter,3);assert.equal(rows[1].reason,'已出局');assert.equal(rows[2].reason,'已逃生');
 assert.deepEqual(build(report,report).players,b.players);assert(build().players.every(p=>p.alive));
});
test('special switches can be reset and pending walls are visible in status',()=>{
 const b=build('特殊事件：雨天小故事\n静音开启\n点杀关闭','特殊事件：无\n静音关闭\n点杀开启','【第 3 回合】\n空墙空墙');
 assert.equal(b.model.config.event,'NONE');assert.equal(b.model.config.silent,false);assert.equal(b.model.config.pointCapture,true);assert.deepEqual(A.status(b)[0].pending,[3]);
 const invalid=E.newState();invalid.config.brawl='false';assert.throws(()=>E.validateState(invalid));
});
