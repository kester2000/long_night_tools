const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),A=require('../advice');
const setup={id:'setup',view:0,text:'玩家人数：3\n模式幻变\n我是0号'};
const route=(id,text,view=0)=>({id,view,text});
const build=ms=>M.build(E.newState(),M.liveMessages(ms));
test('public route owner and selected map never become the private receiver',()=>{
 const ms=[setup,route('r','【第1回合】\n[2号]玩家本回合的完整行动轨迹：\n↑(↑撞)',2),route('w','【第1回合】空墙墙空',0)];
 const b=build(ms);assert(b.views[0].pending.includes(1));assert.equal(b.views[2].pending.length,0);assert.equal(b.views[2].roundEnds.length,1);
});
test('foreign private records are isolated while public records and original text survive',()=>{
 const ms=[setup,route('p','【开局】空墙墙空',2),route('r','[2号]玩家本回合的完整行动轨迹：\n↑',2)];
 const original=JSON.stringify(ms),live=M.liveMessages(ms);assert(live[1].excluded);assert(!live[2].excluded);assert.equal(JSON.stringify(ms),original);
 const b=build(ms);assert(!b.views.some(v=>v.model.segments.some(s=>s.events.some(e=>e.kind==='observe'))));assert.equal(b.views[2].roundEnds.length,1);
});
test('foreign masked recap is not allowed to confirm heart or terrain',()=>{
 const ms=[setup,route('p','[1号]甲\n【第1回合】\n[↑掩盖[沙沙]]←(←撞)')];
 assert(M.liveMessages(ms)[1].excluded);assert.equal(build(ms).views[1].roundEnds.length,0);
});
test('own private terrain and bearings about others remain valid',()=>{
 const ms=[setup,route('r','【第1回合】\n[1号]玩家本回合的完整行动轨迹：\n[↑沙沙](←撞)'),route('h','【第1回合】\n[1号(第1步)]你听见了来自【正上方】的沙沙声！')];
 assert(!M.liveMessages(ms).some(m=>m.excluded));assert(build(ms).views[0].hears.some(h=>h.b===1));assert.deepEqual(M.soundChecklist(ms),[]);
 const wrong=[setup,route('p','[0号]甲\n【第1回合】\n[↑沙沙(正上)]')];assert(M.liveMessages(wrong)[1].excluded);
});
test('missing direction remains unconfirmed without claiming first sound',()=>{
 const ms=[setup,route('r','【第1回合】\n[1号]玩家本回合的完整行动轨迹：\n[↑沙沙][↓沙沙](←撞)')];
 const rows=M.soundChecklist(ms);assert.deepEqual(rows.map(r=>[r.player,r.round,r.step]),[[1,1,1],[1,1,2]]);assert(rows.every(r=>r.state==='方位私聊尚未确认'));assert(rows[1].earlier);assert(rows[0].prompt.includes('公屏')&&rows[0].prompt.includes('你自己私聊'));
 assert(!build(ms).views[1].model.segments.flatMap(s=>s.events).some(e=>e.firstSound),'provisional labels do not create false first-sound constraints');
});
test('confirming public first sound or own bearing clears only the corresponding request',()=>{
 const ms=[setup,route('r','【第1回合】\n[1号]玩家本回合的完整行动轨迹：\n[↑沙沙][↓沙沙](←撞)')];
 const first=route('f','【第1回合】\n[1号(第1步)]移动进入【树丛】！本局首次发声，不会向其他人发出声响');
 assert.deepEqual(M.soundChecklist([...ms,first]).map(r=>r.step),[2]);
 const hear=route('h','【第1回合】\n[1号(第2步)]你听见了来自【正上方】的沙沙声！');assert.deepEqual(M.soundChecklist([...ms,first,hear]),[]);
 assert.equal(M.soundChecklist(ms).length,2,'undo restores requests');
});
test('historical recap replacement and unnumbered late bearing do not clear other rounds',()=>{
 const ms=[setup,route('r','[1号]甲\n【第1回合】\n[↑沙沙](←撞)\n【第2回合】\n[↓沙沙](←撞)'),route('h','[1号(第1步)]你听见了来自【正上方】的沙沙声！')];
 assert.deepEqual(M.soundChecklist(ms).map(r=>r.round),[1]);
 assert.equal(M.soundChecklist([...ms,route('dup',ms[1].text)]).length,1);
});
test('three-player archive requests only own missing wall reports and identifies all sound gaps',()=>{
 const j=require('./fixtures/three-player-review.json'),b=M.build(j.base,M.liveMessages(j.messages));
 assert.equal(b.self,0);assert(A.practical(b).some(x=>x.includes('第 2、3、4 回合')));assert.equal(M.soundChecklist(j.messages).length,15);
});
test('five-player archive proactively requests player 2 step 8 and clears confirmed first sound',()=>{
 const j=require('./fixtures/five-player-first-sound.json');assert.deepEqual(M.soundChecklist(j.messages).map(r=>[r.player,r.round,r.step]),[[2,1,8]]);
 assert.deepEqual(M.soundChecklist([...j.messages,route('f','2号第1回合第8步首次发声',3)]),[]);
});
