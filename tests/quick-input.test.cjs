const {test}=require('node:test'),assert=require('node:assert/strict');
const {compose}=require('../quick-input'),M=require('../messages');
test('manual messages use the real parser and retain player, round and private ownership',()=>{
  const route=M.parse(compose({kind:'trajectory',player:2,round:3,route:'↑[→沙沙](↓撞)'})).items.find(i=>i.kind==='trajectory');
  assert.equal(route.player,2);assert.equal(route.round,3);assert.equal(route.tokens.filter(t=>t.kind==='move').length,3);
  const wall=M.parse(compose({kind:'walls',round:0,walls:'墙空?墙'})).items.find(i=>i.kind==='walls');assert(wall);
  const hear=M.parse(compose({kind:'hear',player:1,round:2,step:4,direction:'右上方',sound:'啪嗒'})).items.find(i=>i.kind==='hear');
  assert.equal(hear.player,1);assert.equal(hear.step,4);assert.equal(hear.round,2);
});
test('manual input rejects malformed values instead of inventing clues',()=>{
  for(const value of [{kind:'walls',round:1,walls:'墙空'},{kind:'trajectory',round:0,player:1,route:'↑'},{kind:'hear',round:1,player:1,step:0}])assert.throws(()=>compose(value));
});
