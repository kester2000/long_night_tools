const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),A=require('../advice'),J=require('../journal'),Timeline=require('../timeline');
const setup='模式疯狂\n玩家人数：4\n我是0号';
const msgs=(...texts)=>[setup,...texts].map((text,i)=>({id:String(i),text,view:0}));
const build=(...texts)=>M.build(E.newState(),msgs(...texts));
const observations=(b,id=0,si=0)=>E.replay(b.views[id].model.segments[si],9).observations;
test('real heartbeat grass feedback binds to the public step including historical private reports',()=>{
 const b=build('【第 1 回合】\n[0号]玩家本回合的完整行动轨迹：\n↑→(↓撞)','【第 1 回合】\n[第 1 步] 移动进入【树丛】，声响被巨大的心跳声掩盖，其他玩家未能察觉');
 assert(observations(b).some(o=>o.kind==='sound'&&o.value==='SHASHA'&&o.clock.step===1));assert.equal(b.model.config.heartPresence,true);
});
test('real turn hide and replacement-character step hide preserve known prefix and split suffix',()=>{
 assert.equal(M.clean('<隐匿行动>'),'(隐匿行动)');assert.equal(M.clean('&lt;隐匿行动&gt;'),'(隐匿行动)');
 const b=build('[0号]玩家本回合的完整行动轨迹：\n→�↑');
 assert.equal(b.model.segments.length,2);assert.equal(E.replay(b.model.segments[0],9).c,5);assert.equal(E.replay(b.model.segments[1],9).r,3);
 assert(b.views[0].steps.some(s=>s.step===3&&s.segment===1));assert(!observations(b,0,1).some(o=>o.kind==='quiet'));
 const hidden=build('[0号]玩家本回合的完整行动轨迹：\n→<隐匿行动>');assert.equal(hidden.model.segments.length,2);assert.equal(E.replay(hidden.model.segments[0],9).c,5);
});
test('public timeout walls attach to the named player and boss walls never attach to a player',()=>{
 const p=M.parse('玩家 2号 超时未行动\n【第 3 回合】\n您所在位置的四周墙壁信息：\n墙空空墙');assert.equal(p.items.find(i=>i.kind==='walls').player,2);
 const b=build('玩家 2号 超时未行动\n【第 3 回合】\n您所在位置的四周墙壁信息：\n墙空空墙');assert.deepEqual(b.views[2].pending,[3]);assert.equal(b.views[0].pending.length,0);
 const boss=build('邦邦所在位置的四周墙壁信息：\n墙空空墙');assert.equal(observations(boss).length,0);assert(boss.reports.at(-1).warnings.some(w=>w.includes('BOSS')));
});
test('same-cell and blocked bearings parse across multiline source headings',()=>{
 for(const hint of ['你听见有人进入了你所在的树丛，他从旁边匆匆走过。','同一片液体里溅起了另一阵啪嗒声，近得只剩一臂之遥。','你听见有人进入了你的小树丛，沙沙声很近很近。']){
  const p=M.parse('[1号(第2步)]\n'+hint);assert.equal(p.items.find(i=>i.kind==='hear')?.direction,'同格');
 }
 const p=M.parse('[1号(第2步)]你感到地面有所振动，那是踩动草木（沙沙）特有的动静；但周围？却没有任何声音？\n声响方向被屏蔽，当前位置附近存在【屏蔽器】');assert.equal(p.items.find(i=>i.kind==='hear')?.direction,'被屏蔽');assert(p.items.some(i=>i.kind==='feature'&&i.value==='JAMMERBOX'));
});
test('late and early bearings give the same source panel cells and relation frames',()=>{
 const route='【第 1 回合】\n[1号]玩家本回合的完整行动轨迹：\n↑→↓',hear='【第 1 回合】\n[1号(第2步)]你听见了来自【正上方】的沙沙声！';
 const early=build(hear,route),late=build(route,hear);
 assert.deepEqual(E.locate(early.model.segments[0].sounds,'1号',9).cells,E.locate(late.model.segments[0].sounds,'1号',9).cells);
 assert(E.locate(late.model.segments[0].sounds,'1号',9).cells.length<81);
});
test('merged public steps exclude masked portal branches while unmerged beat steps retain them',()=>{
 const b=build('本局有心脏','[0号]玩家本回合的完整行动轨迹：\n→×4');assert.equal(b.ambiguities.length,0);assert.equal(observations(b).filter(o=>o.kind==='quiet').length,4);
 assert(build('本局有心脏','[0号]玩家本回合的完整行动轨迹：\n→→→→').ambiguities.length>0);
});
test('bomb death does not invent an impassable wall and removes the player from hunting order',()=>{
 const b=build('[0号]玩家本回合的完整行动轨迹：\n→(↑炸飞出局)');assert.equal(b.players[0].alive,false);assert.equal(observations(b).filter(o=>o.kind==='hit').length,0);assert.equal(b.captures.length,0);
 assert.equal(build('玩家 2号 退出游戏').players[2].alive,false);
});
test('feature requirements constrain complete layouts without fixing movable box positions',()=>{
 const b=build('声响方向被屏蔽，当前位置附近存在【屏蔽器】');assert.deepEqual(b.model.config.requiredFeatures,['JAMMERBOX']);
 const noJammer={...b.model.config,pool:'1 2 3 4 5 6 7 8 9 10 11 12 E1 E2 E3 E4'};assert.equal(E.solveMap(noJammer,[]).phases.length,0);
 const valid={...b.model.config,pool:'1 2 3 4 5 6 7 8 44 E1 E2 E3 E4'};const solution=E.solveMap(valid,[]),proof=E.verifyCompleteLayout(valid,solution,[]);assert.equal(proof.status,'verified');assert(proof.layout.some(m=>m.id==='44'));assert(solution.phases.length>1,'movable jammer must not be pinned to the listener block');
});
test('button count uses full-round totals and incomplete observations only as a lower bound',()=>{
 const block=E.pool({...E.newState().config,mode:'BUTTON'}).find(b=>b.cells.some(c=>c.attach==='BUTTON')),i=block.cells.findIndex(c=>c.attach==='BUTTON'),r=Math.floor(i/3),c=i%3,placements=[{block,origin:{r:0,c:0}}],obs=[{kind:'action',arrival:true,r,c,clock:{round:1,player:0,step:1}}];
 assert.equal(Timeline.check({size:9,dynamicDoors:true,playerCount:4,buttonCounts:{1:0}},placements,obs).valid,false);
 assert.equal(Timeline.check({size:9,dynamicDoors:true,playerCount:4,buttonCounts:{1:2}},placements,obs).valid,true);
 const b=build('【第 3 回合】门曾被按钮触发，发生 2 次变化');assert.equal(b.model.config.buttonCounts[3],2);
});
test('private input inspection and misassigned self-direction produce explicit feedback',()=>{
 const text='[0号]甲\n【第 1 回合】\n[→沙沙(左上)]\n[1号]乙\n【第 1 回合】\n↑';assert.equal(M.inspect(text).type,'私聊完整赛况');assert(build(text).reports.at(-1).warnings.some(w=>w.includes('接收者')));
});
test('merging preserves each receiver, deduplicates repeated imports and refuses conflicting games',()=>{
 const current={version:2,base:E.newState(),messages:msgs('【第 1 回合】\n[0号]玩家本回合的完整行动轨迹：\n↑')};
 const incoming={version:2,base:E.newState(),messages:[{id:'s',text:'模式疯狂\n玩家人数：4\n我是2号'},{id:'w',text:'【开局】墙空空墙',view:2}]};
 const merged=J.merge(current,incoming);assert.equal(merged.added,1);const b=M.build(merged.journal.base,merged.journal.messages);assert.equal(b.self,0);assert(observations(b,2).some(o=>o.kind==='walls'));assert.equal(J.merge(merged.journal,incoming).added,0);
 const conflict=E.clone(incoming);conflict.messages.push({id:'r',text:'【第 1 回合】\n[0号]玩家本回合的完整行动轨迹：\n↓',view:2});assert.throws(()=>J.merge(current,conflict),/冲突/);
 const other=E.clone(incoming);other.messages[0].text='模式经典\n玩家人数：4\n我是2号';assert.throws(()=>J.merge(current,other),/设置不一致/);
});
test('richer private snapshots survive subsequent public history and merged replays',()=>{
 const pri='[1号]乙\n【第 1 回合】\n[↑沙沙(正上)](←撞)',pub='[1号]乙\n【第 1 回合】\n[↑沙沙](←撞)';
 const b=build(pri,pub);assert(b.views[0].hears.some(h=>h.direction==='正上'));assert(b.relations.some(h=>h.direction==='正上'));
});
test('two teammates private reports retain both listener-specific bearings after merge',()=>{
 const a={version:2,base:E.newState(),messages:msgs('[1号]乙\n【第 1 回合】\n[↑沙沙(正上)](←撞)')};
 const b={version:2,base:E.newState(),messages:[{id:'s',text:'模式疯狂\n玩家人数：4\n我是2号'},{id:'p',text:'[1号]乙\n【第 1 回合】\n[↑沙沙(右上)](←撞)',view:2}]};
 const result=J.merge(a,b),built=M.build(result.journal.base,result.journal.messages);
 assert(built.relations.some(h=>h.a===0&&h.b===1&&h.direction==='正上'));assert(built.relations.some(h=>h.a===2&&h.b===1&&h.direction==='右上'));
 assert.equal(E.replay(built.views[1].model.segments[0],9).r,3,'route must not accumulate twice');
});
test('unnumbered source bearings remain available without a numbered route',()=>{
 const b=build('[1号]你听见了来自【正上方】的沙沙声！');assert(E.locate(b.model.segments[0].sounds,'1号',9).cells.length<81);
});
test('multiple walls in one paste do not inherit the preceding boss context',()=>{
 const p=M.parse('邦邦所在位置的四周墙壁信息：\n墙空空墙\n玩家 2号 超时未行动\n【第 3 回合】\n您所在位置的四周墙壁信息：\n空墙墙空');
 const walls=p.items.filter(i=>i.kind==='walls');assert.equal(walls.length,1);assert.equal(walls[0].player,2);assert.equal(walls[0].value,'空墙墙空');
});
test('coin announcements cover all players in a single source broadcast',()=>{
 const b=build('【金币公示】\n0号 获得了 1 枚金币（当前共持有 1 枚）\n2号 获得了 2 枚金币（当前共持有 3 枚）');
 assert.equal(b.players[0].coins,1);assert.equal(b.players[2].coins,3);assert(b.model.config.requiredFeatures.includes('COIN'));
});
