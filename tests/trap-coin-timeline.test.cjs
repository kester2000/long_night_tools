const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../timeline'),E=require('../engine'),M=require('../messages'),H=require('../hypotheses');
const cell=(type='EMPTY',attach='EMPTY')=>({type,attach,walls:[0,0,0,0]}),placement={id:'test',origin:{r:0,c:0},block:{id:'test',cells:Array.from({length:9},(_,i)=>cell(i===0||i===2?'TRAP':'EMPTY'))}};
const a=(step,r,c,player=0,round=1,arrival=true)=>({kind:'action',arrival,r,c,clock:{player,round,step}}),end=(player=0,round=1)=>({kind:'turnEnd',r:0,c:0,clock:{player,round,step:1000000}});
test('same trap twice requires stopping even in silent mode, and collisions count as continuing actions',()=>{
 const config={size:3,playerCount:1,silent:true};
 assert.equal(T.trapCheck(config,[placement],[a(1,0,0),a(2,0,1),a(3,0,0),a(4,0,0,0,1,false),end()]).valid,false);
 assert.equal(T.trapCheck(config,[placement],[a(1,0,0),a(2,0,1),a(3,0,0),end()]).valid,true);
 assert.equal(T.trapCheck(config,[placement],[a(1,0,0),a(2,0,1),a(3,0,2),a(4,1,2),end()]).valid,true,'different traps have independent counters');
 assert.equal(T.trapCheck(config,[placement],[a(1,0,0),a(2,0,1),a(5,0,0),a(6,0,1),end()]).valid,true,'missing steps may change parity');
 const shared=[a(1,0,0),end(),a(1,0,0,1),a(2,0,1,1),end(1)];
 assert.equal(T.trapCheck({...config,playerCount:2},[placement],shared).valid,false,'counter belongs to cell, not player');
});
test('a proven zero-coin prior turn prevents treating an extra coin as already consumed',()=>{
 const m={origin:{r:0,c:0},block:{cells:Array.from({length:9},(_,i)=>cell('EMPTY',i<2?'COIN':'EMPTY'))}},obs=[a(1,0,0,1),a(2,0,1,1),end(1)],config={size:3,playerCount:2,coinGains:[{player:1,round:1,min:1,max:1}]};
 assert.equal(T.coinBounds(config,[[m]],obs).valid,true);
 assert.equal(T.coinBounds({...config,zeroCoinTurns:[{player:0,round:1}]},[[m]],obs).valid,false);
 assert.equal(T.coinBounds({...config,zeroCoinTurns:[{player:0,round:1}]},[[m]],[a(1,0,0,1),a(2,0,0,1),end(1)]).valid,true,'same coin is consumed only once');
});
test('archive 12 produces a birth-valid no-portal example with one button and one coin',()=>{
 const j=require('./fixtures/trap-two-coins.json'),b=M.build(j.base,j.messages),config=b.model.config,h=H.analyze(config,j.base,j.messages,1,0);
 assert(config.zeroCoinTurns.some(t=>t.player===0&&t.round===1));assert(h.walkingExamples.length);
 for(const e of h.walkingExamples){
  const placements=e.blocks.map(m=>({...m,block:E.byId.get(m.id)}));assert(T.check(config,placements,e.observations).valid);
  assert(E.birthLayoutCheck(config,e.blocks,[{player:1,r:4,c:4}]).valid);
  const arrivals=e.observations.filter(o=>o.kind==='action'&&o.arrival&&o.clock.round===1),at=o=>{const m=placements.find(m=>E.mod(o.r-m.origin.r,9)<3&&E.mod(o.c-m.origin.c,9)<3);return {id:m.id,cell:m.block.cells[E.mod(o.r-m.origin.r,9)*3+E.mod(o.c-m.origin.c,9)]};};
  assert.equal(arrivals.filter(o=>at(o).cell.attach==='BUTTON').length,1);
  const coins=arrivals.filter(o=>at(o).cell.attach==='COIN');assert.equal(new Set(coins.map(o=>E.key(o.r,o.c))).size,1);assert(coins.every(o=>at(o).id==='49'));
 }
});
