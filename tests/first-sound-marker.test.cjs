const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),A=require('../advice');
const journal=require('./fixtures/five-player-first-sound.json');
const note={id:'first8',view:3,text:'2号第1回合第8步首次发声'};
const messages=journal.messages.concat(note),built=M.build(journal.base,messages);
const h=H.analyze(built.model.config,journal.base,messages,2,built.self);

test('standalone first sound binds to the named player and restores negative evidence on heartbeat steps',()=>{
 assert.equal(M.inspect(note.text).type,'首次发声线索');
 const v=built.views[2],r=E.replay(v.model.segments[0],9);
 assert.equal(v.ambiguities[0].step,8);
 assert.deepEqual(r.observations.filter(o=>o.kind==='quiet').map(o=>o.clock.step),[1,2,3,4,5,6,7]);
 assert(r.log.find(e=>e.clock?.step===8&&e.kind==='move').firstSound);
 assert.equal(built.relations.length,0,'first is not a bearing or same-cell constraint');
 assert.equal(built.views[3].model.segments[0].events.length,1,'other player evidence does not invent a self route');
});

test('current save proves entry at step eight and heartbeat-masked exit at step ten',()=>{
 assert(h.groups.find(g=>g.kind==='ground').excluded);
 assert(h.confirmedPortal);assert.equal(h.resolvedChoices,null);
 const g=h.groups.find(g=>g.kind==='portal');assert(!g.pending);assert.equal(g.cases,3);
 assert.deepEqual(g.alternatives.map(a=>a.entryBlocks),[['2'],['6'],['46']]);
 for(const a of g.alternatives){assert.equal(a.teleports[0].step,10);assert(a.observations.some(o=>o.kind==='hit'&&o.clock.step===11));}
 const advice=A.summarize(built,{nodes:[],hypotheses:[h]}).join('\n');
 assert(advice.includes('第10步从配对出口出现'));assert(advice.includes('出口啪嗒可被掩盖'));
});

test('inline first markers and standalone private notifications are equivalent to the supplemental note',()=>{
 for(const text of ['[→啪嗒(首次)]','[→啪嗒(首次发声)]','[→啪嗒](首次发声)'].map(mark=>journal.messages.at(-1).text.replace('[→啪嗒]',mark))){
  const ms=journal.messages.slice(0,-1).concat({id:'inline',view:3,text});
  const b=M.build(journal.base,ms);assert.deepEqual(b.views[2].model.segments[0].events,built.views[2].model.segments[0].events);
 }
 const privateNote={id:'private-first',view:3,text:'【第 1 回合】\n[2号(第8步)]本局首次发声，不会向其他人发出声响'};
 const b=M.build(journal.base,journal.messages.concat(privateNote));assert.equal(b.views[2].ambiguities[0].step,8);
});

test('richer first annotation survives a subsequent public copy and undo does not leak cached constraints',()=>{
 const original=journal.messages.at(-1),ms=journal.messages.slice(0,-1).concat({id:'private',view:3,text:original.text.replace('[→啪嗒]','[→啪嗒(首次)]')},{...original,id:'public'});
 assert.equal(M.build(journal.base,ms).views[2].ambiguities[0].step,8);
 assert.equal(M.build(journal.base,journal.messages).views[2].ambiguities[0].step,1);
});

test('first sound includes earlier heartbeat-masked sounds and earlier rounds in contradiction checks',()=>{
 const ms=['模式幻变\n玩家人数：2','本局有心脏','【第1回合】\n[1号]玩家本回合的完整行动轨迹：\n[→掩盖啪嗒]','【第2回合】\n[1号]玩家本回合的完整行动轨迹：\n→[↓啪嗒]','1号第2回合第2步首次发声'].map((text,i)=>({id:String(i),text,view:0}));
 assert.throws(()=>M.build(E.newState(),ms),/首次发声标注.*冲突/);
});

test('a personal first sound supplement is parsed without treating hidden earlier actions as quiet',()=>{
 const ms=['模式幻变\n玩家人数：2\n我是1号','本局有心脏','【第1回合】\n[1号]玩家本回合的完整行动轨迹：\n(隐匿)→→[↓啪嗒]','【第1回合】\n[第 3 步] 移动发出【啪嗒声】！本局首次发声，不会向其他人发出声响'].map((text,i)=>({id:String(i),text,view:1}));
 const b=M.build(E.newState(),ms);assert(b.views[1].model.segments.flatMap(s=>s.events).some(e=>e.firstSound));
 assert(!b.views[1].model.segments.flatMap(s=>E.replay(s,9).observations).some(o=>o.kind==='quiet'));
});
