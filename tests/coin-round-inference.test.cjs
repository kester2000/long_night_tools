const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),Timeline=require('../timeline'),A=require('../advice'),H=require('../hypotheses');
const journal=require('./fixtures/coin-third-round.json');
const build=(texts)=>M.build(E.newState(),texts.map((text,i)=>({id:String(i),text,view:0})));
const setup='模式幻变\n玩家人数：2\n我是0号';
const action=(round,player,step,r,c,arrival=true)=>({kind:'action',r,c,arrival,clock:{round,player,step}});
const end=(round,player)=>({kind:'turnEnd',r:0,c:0,clock:{round,player,step:1000000}});
const placement=(id,r=0,c=0)=>({id,block:E.byId.get(id),origin:{r,c}});
const config=(min=1,max=null)=>({...E.newState().config,dynamicDoors:false,playerCount:1,coinGains:[{round:1,player:0,min,max}]});

test('standalone broadcasts bind to the preceding completed round regardless of selected map',()=>{
 const b=build([setup,'【第3回合】\n[0号]玩家本回合的完整行动轨迹：\n→(→撞)','【第3回合】\n[1号]玩家本回合的完整行动轨迹：\n←(←撞)','【金币公示】\n1号 获得了 1 枚金币（当前共持有 1 枚）','【注意】在本回合内，门曾被按钮触发，共发生 2 次变化']);
 assert.deepEqual(b.model.config.coinGains,[{round:3,player:1,min:1,max:1}]);assert.deepEqual(b.model.config.buttonCounts,{3:2});
 assert.equal(b.players[1].coins,1);assert(b.reports.at(-1).summary.join('').includes('已关联此前行动'));
 assert(A.summarize(b,{nodes:[]}).join('').includes('第3回合获得1枚金币'));
});

test('explicit historical round wins, no preceding route leaves the broadcast unbound',()=>{
 const b=build([setup,'【第3回合】\n[0号]玩家本回合的完整行动轨迹：\n→','【第 1 回合】\n0号获得2枚金币\n门曾被按钮触发，共发生 1 次变化']);
 assert.equal(b.model.config.coinGains[0].round,1);assert.deepEqual(b.model.config.buttonCounts,{1:1});
 const unknown=build([setup,'0号获得金币','门曾被按钮触发，共发生 1 次变化','[0号]玩家本回合的完整行动轨迹：\n→']);
 assert.deepEqual(unknown.model.config.coinGains,[]);assert.deepEqual(unknown.model.config.buttonCounts,{});
});

test('short pickup notes constrain at least one coin without inventing current holdings',()=>{
 const b=build([setup,'[0号]玩家本回合的完整行动轨迹：\n→','0号获得金币']);
 assert.deepEqual(b.model.config.coinGains,[{round:1,player:0,min:1,max:null}]);assert.equal(b.players[0].coins,undefined);
 const badge=build([setup,'[0号]甲[🪙3]']);assert.equal(badge.players[0].coins,3);assert.deepEqual(badge.model.config.coinGains,[]);
 assert.equal(M.parse('[1号] 获得了 2 枚金币（当前共持有 3 枚）').items[0].gained,2);
});

test('undoing or editing an announcement cannot leak cached round constraints',()=>{
 const texts=[setup,'[0号]玩家本回合的完整行动轨迹：\n→','0号获得金币','门曾被按钮触发，共发生 2 次变化'];
 assert.equal(build(texts).model.config.coinGains.length,1);assert.deepEqual(build(texts.slice(0,2)).model.config.coinGains,[]);
 assert.deepEqual(build([...texts.slice(0,3),'门曾被按钮触发，共发生 1 次变化']).model.config.buttonCounts,{1:1});
});

test('coin bounds reject routes missing coins, including when dynamic doors are disabled',()=>{
 const obs=[action(1,0,1,1,1),end(1,0)];
 assert(Timeline.check(config(),[placement('45')],obs).valid);
 assert.equal(Timeline.check(config(),[placement('5')],obs).valid,false);
 assert(Timeline.check(config(),[],obs).valid,'unmapped cells remain possible');
});

test('one coin cannot be counted twice by revisiting its cell',()=>{
 const obs=[action(1,0,1,1,1),action(1,0,2,1,2),action(1,0,3,1,1),end(1,0)];
 assert.equal(Timeline.check(config(2,2),[placement('45')],obs).valid,false);
 assert(Timeline.check(config(1,1),[placement('45')],obs).valid);
});

test('known previous visits consume coins across turns and across aligned players',()=>{
 const c={...config(),coinGains:[{round:2,player:0,min:1,max:1}]};
 assert.equal(Timeline.check(c,[placement('45')],[action(1,0,1,1,1),end(1,0),action(2,0,1,1,1),end(2,0)]).valid,false);
 const other={...config(),playerCount:2,coinGains:[{round:1,player:1,min:1,max:1}]};
 assert.equal(Timeline.check(other,[placement('45')],[action(1,0,1,1,1),end(1,0),action(1,1,1,1,1),end(1,1)]).valid,false);
});

test('missing actions, unknown earlier turns and subspace actions remain conservative',()=>{
 assert(Timeline.check(config(),[placement('5')],[action(1,0,2,1,1),end(1,0)]).valid);
 const c={...config(0,0),playerCount:2,coinGains:[{round:1,player:1,min:0,max:0}]};
 assert(Timeline.check(c,[placement('45')],[action(1,1,1,1,1),end(1,1)]).valid,'unknown player 0 could have consumed the coin');
 assert.equal(Timeline.check(config(),[placement('45')],[action(1,0,1,1,1,false),end(1,0)]).valid,false,'subspace arrows do not pick up coins');
});

test('exact gains reject excess guaranteed coins, unspecified amounts retain them',()=>{
 const obs=[action(1,0,1,0,1),action(1,0,2,2,1),end(1,0)];
 assert.equal(Timeline.check(config(1,1),[placement('49')],obs).valid,false);
 assert(Timeline.check(config(),[placement('49')],obs).valid);
});

test('capture and explicit robbery preserve transfer explanations',()=>{
 const b=build([setup,'[0号]玩家本回合的完整行动轨迹：\n→(捕捉)','0号获得金币']);assert.deepEqual(b.model.config.coinTransferRounds,[1]);
 assert(Timeline.check({...config(),coinTransferRounds:[1]},[placement('5')],[action(1,0,1,1,1),end(1,0)]).valid);
 const robbery=build([setup,'[0号]玩家本回合的完整行动轨迹：\n→','0号 抢夺了 1号 持有的 2 枚【金币】！','0号获得2枚金币']);assert.deepEqual(robbery.model.config.coinTransferRounds,[1]);
});

test('map domains and full-layout verification both enforce pickup locations',()=>{
 const c={...config(),pool:'1 2 3 4 5 6 7 8 45 E1 E2 E3 E4',exitCount:null},obs=[action(1,0,1,1,1),end(1,0)],s=E.solveMap(c,obs);
 assert(s.phases.length);for(const p of s.phases){const i=p.slots.findIndex(o=>E.mod(1-o.r,9)<3&&E.mod(1-o.c,9)<3);assert(p.domains[i].every(m=>m.id==='45'));}
 assert.equal(E.solveMap({...c,pool:'1 2 3 4 5 6 7 8 9 E1 E2 E3 E4'},obs).phases.length,0);
 assert.equal(E.verifyCompleteLayout({...c,coinGains:[{round:1,player:0,min:2,max:2}]},s,obs).status,'impossible');
});

test('real silent third-round journal starts with ground routes and binds announcements',()=>{
 const extra=[{id:'coin',view:1,text:'1号获得金币'},{id:'doors',view:0,text:'门曾被按钮触发，共发生 1 次变化'}];
 const b=M.build(journal.base,[...journal.messages,...extra]);
 assert.deepEqual(b.model.config.coinGains,[{round:3,player:1,min:1,max:null}]);assert.deepEqual(b.model.config.buttonCounts,{3:1});
 assert.equal(b.views[1].ambiguities.length,0);
 assert.equal(b.captures.length,0);assert.deepEqual(b.model.config.coinTransferRounds,[]);
});

test('real silent third round resolves entry at step 10, exit at 12 and coin cell at 14',()=>{
 const messages=[...journal.messages,{id:'coin-user-confirmed',view:1,text:'1号获得金币'}],b=M.build(journal.base,messages),h=H.analyze(b.model.config,journal.base,messages,1,1);
 assert(!h.truncated);assert(h.resolvedChoices);assert.deepEqual(h.resolvedChoices['13:0:10'],{kind:'portal',dr:2,dc:2});
 const resolved=M.build(journal.base,messages,{1:h.resolvedChoices}),v=resolved.views[1],r=E.replay(v.model.segments[0],9),s=E.solveMap(v.model.config,r.observations),proof=E.certifyBlocks(v.model.config,s,r.observations);
 assert.equal(v.ambiguities.length,0);assert.equal(proof.status,'verified');assert(proof.blocks.some(b=>b.id==='45'));assert(proof.blocks.some(b=>b.id==='24'));
 const exit=r.log.find(e=>e.kind==='teleport');assert.equal(exit.clock.step,12);assert(!r.observations.some(o=>o.kind==='pass'&&[11,12].includes(o.clock?.step)));
 const advice=A.summarize(resolved,{nodes:[{id:'1:0',solution:s,observations:r.observations,verification:proof}],pairs:[]}).join('\n');
 assert(advice.includes('第10步进入传送门，第12步'));assert(advice.includes('金币拾取候选：第14步'));
});

test('imported coin constraints are validated before solving',()=>{
 const s=E.newState();s.config.coinGains=[{player:0,round:1,min:1,max:0}];assert.throws(()=>E.validateState(s),/金币/);
 s.config.coinGains=[{player:0,round:1,min:1,max:null}];assert.doesNotThrow(()=>E.validateState(s));
});
