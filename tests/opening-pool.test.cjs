const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages');
test('opening pool uses only the announced IDs, including exits',()=>{
 const pool=M.openingPool('1，4 17、18 e1;E2 E3 E4 17','CRAZY');
 assert.equal(pool,'1 4 17 18 E1 E2 E3 E4');
 const built=M.build(E.newState(),[{id:'mode',text:'模式疯狂'},{id:'pool',text:'区块池：'+pool}]);
 assert(!E.pool(built.model.config).some(b=>b.id==='38'));
 assert(E.pool(built.model.config).some(b=>b.id==='17'));
});
test('hidden crazy blocks expand only special IDs, never unannounced ordinary blocks',()=>{
 const pool=M.openingPool('1 17 E1 E2','CRAZY',true).split(' ');
 assert.deepEqual(pool,['1','17','E1','E2','S1','S2','S3','S4']);
 assert.throws(()=>M.openingPool('1 E1','CLASSIC',true),/疯狂/);
});
test('invalid and empty opening selections fail instead of silently accepting a prefix',()=>{
 for(const text of ['', '   ', '17 999', '17 苹果', '17 ???', '1E1'])assert.throws(()=>M.openingPool(text,'CRAZY'));
 assert.equal(M.openingPool('区块池：17 E1','CRAZY'),'17 E1');
});
test('pool replacement, mode change and undo rebuild cleanly without stale excluded candidates',()=>{
 const messages=[{id:'1',text:'模式疯狂'},{id:'2',text:'区块池：17 38 E1 E2'},{id:'3',text:'区块池：17 E1 E2'}];
 const pool=ms=>M.build(E.newState(),ms).model.config.pool;
 assert.equal(pool(messages),'17 E1 E2');assert.equal(pool(messages.slice(0,2)),'17 38 E1 E2');
 assert.equal(pool([...messages,{id:'4',text:'模式幻变'}]),'');
});
