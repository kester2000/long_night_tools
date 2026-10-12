const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),L=require('../local'),A=require('../advice');
const messages=['玩家人数：4','模式疯狂\n区块池：默认','我是0号','【开局】\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n墙墙空空','[0号]玩家本回合的完整行动轨迹：\n←(←撞)','【第 1 回合】\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n空空墙空','[1号]玩家本回合的完整行动轨迹：\n→(↑撞)'].map((text,i)=>({id:String(i),view:0,text}));
test('botanical save: expansion budget cannot starve the four single-block explanations',()=>{
 const built=M.build(E.newState(),messages),v=built.views[0],r=E.replay(v.model.segments[0],9),config=v.model.config,solution=E.solveMap(config,r.observations),node={id:'0:0',observations:r.observations,focus:r,solution};
 const small=L.analyze({...config,localMaxBlocks:1,localSearchBudget:Infinity,localCandidateBudget:Infinity},node,solution);
 for(const budget of [1,300]){
  const local=L.analyze({...config,localCandidateBudget:budget},node,solution);
  assert.deepEqual(local.singles,small.singles);
  assert.deepEqual(local.singles.map(c=>c.blocks[0].id).sort(),['17','18','38','41']);
  assert(local.singlesComplete);assert(local.truncated);
  assert(A.perspective(built,{nodes:[{...node,local}]},0).some(s=>s.includes('17「植物园A」')&&s.includes('不能据此直接认定')));
 }
 const botanical=small.singles.find(c=>c.blocks[0].id==='17');
 assert.deepEqual(botanical.blocks[0].origin,{r:2,c:2});assert.deepEqual([botanical.lr,botanical.lc],[2,1]);
 assert.equal(E.verifyCompleteLayout(config,E.solveMap(config,r.observations,[{id:'17',r:2,c:2}]),r.observations).status,'verified');
});
test('door inference preserves identity, last observation and symmetric edge coloring',()=>{
 const config={...E.newState().config,mode:'CRAZY',dynamicDoors:true},origin={r:3,c:3},known=[{id:'42',origin}],solution=E.solveMap(config,[],[{id:'42',...origin}]);
 const doors=E.inferredDoors(config,solution,known);assert(doors.size>0);assert([...doors.values()].every(v=>v.state==='unknown'));
 const [key]=doors.keys(),[r,c,d]=key.split(/[,:]/).map(Number),rr=E.mod(r+E.V[d][0],9),cc=E.mod(c+E.V[d][1],9),reverse=E.key(rr,cc)+':'+E.OPP[d];
 const wall='????'.split('');wall[d]='墙';
 const observations=[{kind:'pass',r:rr,c:cc,dir:E.OPP[d],clock:{round:2,player:0,step:1}},{kind:'walls',r,c,value:wall.join(''),clock:{round:1,player:0,step:3}}];
 const observed=E.inferredDoors(config,solution,known,observations);assert.deepEqual(observed.get(key),{state:'open',observed:true});assert.deepEqual(observed.get(reverse),observed.get(key));
 assert.equal(E.inferredDoors(config,solution,[]).size,0);
 const staticDoors=E.inferredDoors({...config,dynamicDoors:false},solution,known);assert([...staticDoors.values()].some(v=>v.state==='closed'));
});
test('later movement outside botanical A retains its original placement instead of calling it excluded',()=>{
 const build=ms=>{const built=M.build(E.newState(),ms),v=built.views[0],r=E.replay(v.model.segments[0],9);return {built,config:v.model.config,node:{id:'0:0',observations:r.observations,focus:r}};};
 const old=build(messages),now=build([...messages,{id:'next',view:0,text:'[0号]玩家本回合的完整行动轨迹：\n↓←←(↓撞)'},{id:'walls',view:0,text:'四周墙壁信息：空墙墙空'}]);
 const solution=E.solveMap(now.config,now.node.observations),local=L.analyze(now.config,now.node,solution),retainedSingles=L.retainedSingles(now.config,{...now.node,histories:[old.node]},solution);
 assert.equal(local.singles.length,0);
 assert(retainedSingles.some(c=>c.blocks[0].id==='17'&&c.verification==='verified'&&c.blocks[0].origin.r===2&&c.blocks[0].origin.c===2));
 assert(A.perspective(now.built,{nodes:[{...now.node,solution,local,retainedSingles}]},0).some(s=>s.includes('17「植物园A」')&&s.includes('路线已向外延伸')));
 const impossible=E.solveMap(now.config,now.node.observations,[{id:'18',r:2,c:2}]);
 assert.equal(L.retainedSingles(now.config,{...now.node,histories:[old.node]},impossible).length,0);
});
