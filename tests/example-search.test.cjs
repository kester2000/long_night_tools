const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('../example-search'),E=require('../engine'),M=require('../messages'),T=require('../timeline');
const j=require('./fixtures/archive19.json');
test('archive 19 gets a joint example without resolving its silent route uniquely',()=>{
 const config=M.build(j.base,j.messages).model.config,proof=X.search(j,'0:0');
 assert.equal(proof.status,'verified');assert.equal(proof.layout.length,9);
 assert.deepEqual(proof.players.map(p=>p.player).sort(),[0,1]);
 assert(T.check(config,proof.layout.map(m=>({...m,block:E.byId.get(m.id)})),proof.observations).valid);
 assert(E.birthLayoutCheck(config,proof.layout,proof.players.map(p=>({...p.birth,player:p.player}))).valid);
 for(const player of [0,1]){
  const actions=proof.observations.filter(o=>o.kind==='action'&&o.clock.player===player);
  assert.deepEqual([...new Set(actions.map(o=>o.clock.step))].sort((a,b)=>a-b),Array.from({length:player===1?19:2},(_,i)=>i+1));
 }
 assert(proof.observations.some(o=>o.kind==='portalLink'));
});
test('exhausted example search remains unknown',()=>{
 assert.equal(X.search(j,'0:0',{},()=>{},0).status,'unknown');
});
test('coin/button choices enumerate compatible supported leaves, smaller dimension first',()=>{
 const config=M.build(j.base,j.messages).model.config,result=X.search(j,'0:0',{eventBranches:true,player:1});
 assert.equal(result.status,'choices');assert.equal(result.complete,true);assert.equal(result.first,'coin');
 assert.deepEqual(result.counts,{coin:4,button:5});
 assert.deepEqual(result.options.map(o=>o.events.map(e=>[e.step,e.block,e.row,e.col])),[[[13,'49',1,2]],[[13,'49',3,2]],[[17,'49',3,2]],[[18,'49',3,2]]]);
 let leaves=0;
 for(const group of result.options){
  assert(group.options.length);
  for(const option of group.options){
   leaves++;const p=option.proof,placements=p.layout.map(m=>({...m,block:E.byId.get(m.id)}));
   assert.equal(p.status,'verified');assert.equal(p.layout.length,9);
   const events=T.eventsForTurn(config,placements,p.observations,1,1);
   assert.deepEqual(events.coin,group.events);assert.deepEqual(events.button,option.events);
   assert(T.check(config,placements,p.observations).valid);
   assert(E.birthLayoutCheck(config,p.layout,p.players.map(p=>({...p.birth,player:p.player}))).valid);
   const wrong={player:1,round:1,coin:events.coin.map(e=>({...e,step:99})),button:events.button};
   assert.equal(T.check({...config,eventSelection:wrong},placements,p.observations).valid,false);
  }
 }
 assert.equal(leaves,5);
 assert.deepEqual(result.options.at(-1).options[0].events,[{step:13,block:'45',row:1,col:3}]);
});
test('button-first ordering and partial search expose only supported leaves',()=>{
 const coin=step=>[{step,block:'49',row:3,col:2}],button=[{step:1,block:'45',row:3,col:1}],proof={status:'verified'};
 const tree=X.eventTree({player:1,round:1},[{coin:coin(13),button,proof},{coin:coin(18),button,proof}],true);
 assert.equal(tree.first,'button');assert.equal(tree.complete,false);assert.equal(tree.options.length,1);assert.equal(tree.options[0].options.length,2);
 const empty=X.search(j,'0:0',{eventBranches:true,player:1},()=>{},0);
 assert.equal(empty.status,'unknown');assert.deepEqual(empty.options,[]);assert.equal(empty.complete,false);
});
test('event selections distinguish consumed coins from repeatable button presses',()=>{
 const block=E.byId.get('49'),buttonBlock=E.byId.get('45'),config={size:9,dynamicDoors:false};
 const placements=[{id:'49',block,origin:{r:0,c:0}},{id:'45',block:buttonBlock,origin:{r:0,c:3}}];
 const action=(player,step,r,c)=>({kind:'action',arrival:true,r,c,clock:{player,round:1,step}});
 const observations=[action(0,1,0,1),action(1,1,0,1),action(1,2,2,1),action(1,3,0,5),action(1,4,0,5),action(1,5,2,1)];
 const events=T.eventsForTurn(config,placements,observations,1,1);
 assert.deepEqual(events.coin,[{step:2,block:'49',row:3,col:2}]);
 assert.deepEqual(events.button,[{step:3,block:'45',row:1,col:3},{step:4,block:'45',row:1,col:3}]);
 const selection={player:1,round:1,...events};
 assert(T.check({...config,eventSelection:selection},placements,observations).valid);
 assert.equal(T.check({...config,eventSelection:{...selection,coin:[{step:1,block:'49',row:1,col:2}]}},placements,observations).valid,false);
});
