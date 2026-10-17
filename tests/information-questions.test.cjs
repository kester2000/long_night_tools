const test=require('node:test'),assert=require('node:assert/strict'),M=require('../messages'),E=require('../engine');
const rows=texts=>texts.map((text,i)=>({id:String(i),text,view:0}));
const setup='模式幻变\n玩家人数：2\n我是0号\n区块池：1 2 3 4 5 6 7 8 51 E1';
function questions(ms){return M.informationQuestions(ms,M.build(E.newState(),ms).model.config);}
test('heart masking asks for own private feedback and never asks on collision or silent games',()=>{
 const ms=rows([setup,'[0号]玩家本回合的完整行动轨迹：\n↑(←撞)']);
 assert.deepEqual(questions(ms).map(q=>q.key),['heartbeat:0:1:1']);
 const no=[...ms,{id:'no',text:'线索确认 heartbeat:0:1:1：未收到声音私聊',view:0}];assert.deepEqual(questions(no),[]);
 assert.notEqual(M.build(E.newState(),no).model.config.heartPresence,false);
 const observations=messages=>M.build(E.newState(),messages).views[0].model.segments.flatMap(s=>E.replay(s,9).observations);
 assert(observations(no).some(o=>o.kind==='quiet'&&o.clock.step===1),'own explicit no-sound answer constrains the arrival terrain');
 assert(!observations(ms).some(o=>o.kind==='quiet'&&o.clock.step===1),'undo restores heartbeat uncertainty');
 assert(!observations([...ms,{id:'other',text:'线索确认 direction:0:1:1：未收到声音私聊',view:0}]).some(o=>o.kind==='quiet'&&o.clock.step===1),'missing directional notification does not prove quiet terrain');
 assert.deepEqual(questions([...ms,{id:'silent',text:'静音开启'}]),[]);
 assert.deepEqual(questions([...ms,{id:'watch',text:'我是观战'}]),[]);
 assert.deepEqual(questions([...ms,{id:'heard',text:'【第 1 回合】\n[0号(第1步)]\n[第 1 步] 移动发出【啪嗒声】，声响被巨大的心跳声掩盖，其他玩家未能察觉',view:0}]),[]);
 assert.equal(questions(ms).length,1,'undo restores the unanswered question');
});
test('other players audible steps request bearing, actual private bearing clears that step',()=>{
 const ms=rows([setup,'[1号]玩家本回合的完整行动轨迹：\n[↑沙沙](←撞)']);
 assert.deepEqual(questions(ms).map(q=>q.key),['direction:1:1:1']);
 const answer={id:'answer',view:0,text:'【第 1 回合】\n[1号(第1步)]\n你听见了来自【正上方】的沙沙声！'};
 assert.deepEqual(questions([...ms,answer]),[]);
 assert(M.build(E.newState(),[...ms,answer]).relations.some(r=>r.direction==='正上'));
});
