const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),Timeline=require('../timeline');
const j=require('./fixtures/button-coin-atm.json'),messages=[...j.messages,{id:'button-owner',text:'【第 1 回合】\n1号触发按钮1次',view:0}];
test('button ownership and coin award jointly constrain player 1 and prioritize ATM without excluding other blocks',()=>{
 const b=M.build(j.base,messages),config=b.model.config;
 assert.deepEqual(config.playerButtonCounts,[{player:1,round:1,count:1}]);assert.equal(config.buttonCounts[1],1);
 assert.equal(E.pool(config)[0].id,'45');assert.equal(E.pool(config).length,16);
 const h=H.analyze(config,j.base,messages,1,0),obs=h.walkingObservations,s=E.solveMap(config,obs,[]),proof=E.verifyCompleteLayout(config,s,obs,3000);
 assert.equal(proof.status,'verified');
 const arrivals=obs.filter(o=>o.kind==='action'&&o.arrival),cell=o=>{const b=proof.layout.find(b=>E.mod(o.r-b.origin.r,9)<3&&E.mod(o.c-b.origin.c,9)<3);return E.byId.get(b.id).cells[E.mod(o.r-b.origin.r,9)*3+E.mod(o.c-b.origin.c,9)];};
 assert.equal(arrivals.filter(o=>cell(o).attach==='BUTTON').length,1);
 assert.equal(new Set(arrivals.filter(o=>cell(o).attach==='COIN').map(o=>E.key(o.r,o.c))).size,1);
 const complete=[{kind:'action',arrival:true,r:0,c:0,clock:{player:1,round:1,step:1}},{kind:'turnEnd',r:0,c:0,clock:{player:1,round:1,step:1000000}}];
 const plain={origin:{r:0,c:0},block:{cells:Array.from({length:9},()=>({attach:'EMPTY',walls:[0,0,0,0]}))}};
 assert.equal(Timeline.check(config,[plain],complete).valid,false);
 assert.equal(Timeline.buttonBounds(config,[[plain]],complete).valid,false);
 assert.equal(Timeline.check(config,[plain],complete.slice(0,1)).valid,true,'incomplete paths stay unknown');
 const raw=M.build(j.base,j.messages);assert.deepEqual(raw.model.config.playerButtonCounts,[{player:1,round:1,count:1,inferred:true}]);
 const incomplete=M.build(j.base,j.messages.filter(m=>!m.text.includes('[0号]玩家本回合的完整行动轨迹')));assert.equal(incomplete.model.config.playerButtonCounts.length,0,'public total cannot assign ownership when another player route is missing');
});

test('unmodified archive 11 excludes zero-button player-one layouts without an added attribution message',()=>{
 const b=M.build(j.base,j.messages),config=b.model.config;
 assert.deepEqual(config.playerButtonCounts,[{player:1,round:1,count:1,inferred:true}]);
 assert(config.requiredFeatures.includes('BUTTON'));
 const h=H.analyze(config,j.base,j.messages,1,0),obs=h.walkingObservations,s=E.solveMap(config,obs,[]),proof=E.verifyCompleteLayout(config,s,obs,3000);
 assert.equal(proof.status,'verified');
 const arrivals=obs.filter(o=>o.kind==='action'&&o.arrival);
 const buttons=arrivals.filter(o=>{const m=proof.layout.find(m=>E.mod(o.r-m.origin.r,9)<3&&E.mod(o.c-m.origin.c,9)<3);return E.byId.get(m.id).cells[E.mod(o.r-m.origin.r,9)*3+E.mod(o.c-m.origin.c,9)].attach==='BUTTON';});
 assert.equal(buttons.length,1);
 const mutated=obs.map(o=>o.kind==='action'?{...o,arrival:false}:o);
 assert.equal(Timeline.check(config,proof.layout.map(m=>({...m,block:E.byId.get(m.id)})),mutated).valid,false);
});
