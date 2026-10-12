const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),M=require('../messages.js');
const opening='【开局】\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n墙空空墙';
const trajectory='[0号]玩家本回合的完整行动轨迹：\n[→沙沙][←沙沙]↓(↓撞)';
const messages=(...texts)=>texts.map((text,i)=>({id:String(i),text}));
const end=b=>E.replay(b.model.segments[b.model.active],b.model.config.size);
test('explicit mode selection resets the previous pool and a new public pool narrows that mode',()=>{
 const base=E.newState();
 let b=M.build(base,messages('模式疯狂\n区块池：S1 1 E1','模式经典'));
 assert.equal(b.model.config.mode,'CLASSIC');assert.equal(b.model.config.pool,'');assert.equal(E.pool(b.model.config).length,16);
 b=M.build(base,messages('模式疯狂\n本局区块池：1 2 3 E1 E2 S1'));
 assert.deepEqual(E.pool(b.model.config).map(b=>b.id),['1','2','3','E1','E2','S1']);
});
test('complete public bare and merged moves provide quiet evidence, collisions and spawn do not',()=>{
 const b=M.build(E.newState(),messages('模式经典','[2号]玩家本回合的完整行动轨迹：\n↑×3(←撞)'));
 const r=E.replay(b.views[2].model.segments[0],9),quiet=r.observations.filter(o=>o.kind==='quiet');assert.equal(quiet.length,3);assert.deepEqual(quiet.map(o=>[o.r,o.c]),[[3,4],[2,4],[1,4]]);
 assert.equal(E.replay(E.newState().segments[0],9).observations.length,0);
 assert.equal(E.replay({events:[{kind:'move',dir:0,outcome:'hit',quiet:true}]},9).observations.filter(o=>o.kind==='quiet').length,0);
});
test('mute, hidden routes, unknown bracket annotations and possible heart beats do not invent quiet terrain',()=>{
 for(const texts of [['模式经典','静音开启','[0号]玩家本回合的完整行动轨迹：\n↑'],['模式经典','[0号]玩家本回合的完整行动轨迹：\n(隐匿)↑'],['模式经典','[0号]玩家本回合的完整行动轨迹：\n[↑未知]']])assert(!end(M.build(E.newState(),messages(...texts))).observations.some(o=>o.kind==='quiet'));
 const r=end(M.build(E.newState(),messages('模式疯狂','[0号]玩家本回合的完整行动轨迹：\n↑↑↑↑')));assert.deepEqual(r.observations.filter(o=>o.kind==='quiet').map(o=>o.index),[1,2]);
 const restored=end(M.build(E.newState(),messages('模式经典','静音开启','静音关闭','[0号]玩家本回合的完整行动轨迹：\n↑')));assert(restored.observations.some(o=>o.kind==='quiet'));
});
test('parses the exact user-supplied opening and trajectory formats',()=>{
  const p=M.parse(opening);assert.equal(p.items[0].value,'墙空空墙');assert(p.items[0].opening);
  const t=M.parse(trajectory).items[0];assert.equal(t.player,0);assert.deepEqual(t.tokens.map(t=>[t.dir,t.outcome,t.sound]),[[3,'move','SHASHA'],[2,'move','SHASHA'],[1,'move',''],[1,'hit','']]);
  const b=M.build(E.newState(),messages(opening,trajectory));assert.equal(end(b).r,5);assert.equal(end(b).c,4);assert.equal(end(b).observations.filter(o=>o.kind==='pass').length,3);
});
test('whole-message undo recomputes coordinates and all resulting constraints',()=>{
  const texts=messages(opening,trajectory);let b=M.build(E.newState(),texts);assert.equal(end(b).r,5);
  texts.pop();b=M.build(E.newState(),texts);assert.equal(end(b).r,4);assert.equal(end(b).observations.length,1);
});
test('editing an earlier raw message recalculates following messages',()=>{
  const texts=messages(opening,trajectory);texts[1].text=trajectory.replace('[→沙沙][←沙沙]↓(↓撞)','↑↑(↑撞)');
  assert.equal(end(M.build(E.newState(),texts)).r,2);
});
test('merged arrows, markdown escaping and plain stopping markers parse',()=>{
  const b=M.build(E.newState(),messages('[0号]玩家本回合的完整行动轨迹：\n→×3[↓沙沙]\\(↓撞)(停止)'));
  assert.equal(end(b).r,5);assert.equal(end(b).c,7);
});
test('wall message received before the round summary waits then binds to the endpoint',()=>{
  const wall='【第 1 回合】\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n空墙空空';
  const first=M.build(E.newState(),messages(wall));assert.deepEqual(first.pending,[1]);assert.equal(end(first).observations.length,0);
  const second=M.build(E.newState(),messages(wall,trajectory));assert.equal(second.pending.length,0);
  assert(second.model.segments[0].events.some(e=>e.kind==='observe'&&e.r===5&&e.c===4&&e.walls==='空墙空空'));
});
test('late wall messages for older rounds attach to the older endpoint',()=>{
  const first='【第 1 回合】\n[0号]玩家本回合的完整行动轨迹：\n↑';
  const second='【第 2 回合】\n[0号]玩家本回合的完整行动轨迹：\n↑';
  const b=M.build(E.newState(),messages(first,second,'【第 1 回合】\n四周墙壁信息：\n墙空空墙'));
  assert.equal(end(b).r,2);assert(end(b).observations.some(o=>o.kind==='walls'&&o.r===3));
});
test('explicit repeated round summaries do not count movement twice',()=>{
  const text='【第 1 回合】\n'+trajectory;
  const b=M.build(E.newState(),messages(text,text));assert.equal(end(b).r,5);assert(b.reports[1].warnings.some(w=>w.includes('没有再次累计')));
});
test('identity text changes player perspective and is applied when rebuilding',()=>{
  const b=M.build(E.newState(),messages(trajectory,'我是2号','[2号]玩家本回合的完整行动轨迹：\n↑'));
  assert.equal(b.self,2);assert.equal(end(b).r,3);assert(b.model.segments[0].sounds.some(e=>e.source==='0号'));
});
test('configuration uses the same input without a separate form',()=>{
  const b=M.build(E.newState(),messages('边长12\n模式经典\n逃生舱数量：4\n特殊事件：雨天小故事\n区块池：1 2 3 4 5 6 7 8 9 10 11 12 E1 E2 E3 E4'));
  assert.equal(b.model.config.size,12);assert.equal(b.model.config.mode,'CLASSIC');assert.equal(b.model.config.exitCount,4);assert.equal(b.model.config.event,'RAINSTORY');assert.equal(E.pool(b.model.config).length,16);
  assert.throws(()=>M.parse('区块池：999'));
});
test('ambiguous portal sounds never silently invent ground movement',()=>{
  const b=M.build(E.newState(),messages('[0号]玩家本回合的完整行动轨迹：\n[→啪嗒]←→↑'));
  assert.equal(b.model.segments.length,2);assert.equal(E.replay(b.model.segments[0],9).c,5);assert.equal(end(b).r,4);assert.equal(end(b).c,4);assert(b.reports[0].warnings.length);
});
test('private bearing messages join the correct step of later public trajectory',()=>{
  const hear='[1号(第2步)]你听见了来自【正上方】的沙沙声！';
  const b=M.build(E.newState(),messages(hear,'[1号]玩家本回合的完整行动轨迹：\n→[↑沙沙]→'));
  const events=b.model.segments[0].sounds;assert.equal(events[2].kind,'hear');assert.equal(events[2].direction,'正上');assert.equal(events[3].dir,3);
});
test('unknown text stays a note; malformed large moves fail before applying',()=>{
  const b=M.build(E.newState(),messages('玩家说他在右边，但未证实。'));assert.equal(end(b).observations.length,0);assert(b.reports[0].warnings.length);
  assert.throws(()=>M.parse('[0号]玩家本回合的完整行动轨迹：\n↑×99999'));
});
test('a collision within two steps after PAPA restores player 2 ground route',()=>{
 const b=M.build(E.newState(),messages('[2号]玩家本回合的完整行动轨迹：\n[→啪嗒]↓(↓撞)←'));
 const model=b.views[2].model,r=E.replay(model.segments[model.active],9);assert.equal(model.segments.length,1);assert.equal(r.r,5);assert.equal(r.c,4);assert(r.observations.some(o=>o.kind==='nonPortalSound'&&o.r===4&&o.c===5));assert(r.observations.some(o=>o.kind==='hit'&&o.dir===1));assert(b.reports[0].summary.some(s=>s.includes('排除进入亚空间')));
});
test('PAPA collision lookahead continues across two consecutive rounds',()=>{
 const b=M.build(E.newState(),messages('【第 1 回合】\n[2号]玩家本回合的完整行动轨迹：\n[→啪啪]','【第 2 回合】\n[2号]玩家本回合的完整行动轨迹：\n←(↑撞)'));
 const model=b.views[2].model;assert.equal(model.segments.length,1);assert.equal(E.replay(model.segments[0],9).c,4);
});
test('a third-step collision cannot exclude a portal and hidden movement breaks the inference',()=>{
 const b=M.build(E.newState(),messages('[2号]玩家本回合的完整行动轨迹：\n[→啪嗒]↑↑(↑撞)'));assert.equal(b.views[2].model.segments.length,2);
 const h=M.build(E.newState(),messages('[2号]玩家本回合的完整行动轨迹：\n[→啪嗒](捕捉)↑(↑撞)'));assert.equal(h.views[2].model.segments.length,2);
});
test('bare-arrow papa notation is parsed and resumed after a collision',()=>{
 const b=M.build(E.newState(),messages('[2号]玩家本回合的完整行动轨迹：\n→啪←(↑撞)'));assert.equal(b.views[2].model.segments.length,1);assert(E.replay(b.views[2].model.segments[0],9).observations.some(o=>o.kind==='sound'&&o.value==='PAPA'));
});
