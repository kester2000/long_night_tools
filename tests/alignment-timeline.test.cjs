const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),Timeline=require('../timeline'),A=require('../advice');
const messages=texts=>texts.map((text,i)=>({id:String(i),text,view:0}));
test('old sender-selected hearing uses self and preceding source round, not next pasted round',()=>{
 const ms=messages(['人数3\n我是2号','[0号]玩家本回合的完整行动轨迹：\n→','[2号]玩家本回合的完整行动轨迹：\n↑','[0号]玩家本回合的完整行动轨迹：\n↓↓','[0号(第2步)]你听见了来自【左下方】的沙沙声！','[0号]玩家本回合的完整行动轨迹：\n←']);
 const b=M.build(E.newState(),ms),h=b.relations[0];assert.equal(h.a,2);assert.equal(h.round,2);assert.deepEqual(h.listener,{r:3,c:4});assert.equal(h.step,2);assert.equal(ms[4].view,0);
});
test('capture provides same-square relation and removes captured player',()=>{
 const b=M.build(E.newState(),messages(['人数3','[0号]玩家本回合的完整行动轨迹：\n→','[1号]玩家本回合的完整行动轨迹：\n↓','[0号]玩家本回合的完整行动轨迹：\n→','[1号]玩家本回合的完整行动轨迹：\n↓(捕捉)[传送]']));
 assert.equal(b.players[0].alive,false);assert(b.relations.some(r=>r.kind==='capture'&&r.direction==='同格'));assert.equal(b.views[1].model.segments.length,2);
});
test('explicit heart declaration overrides inferred absence and preserves heartbeat-masked quiet steps',()=>{
 const b=M.build(E.newState(),messages(['模式幻变','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','[0号]玩家本回合的完整行动轨迹：\n[↑沙沙]←','本局有心脏']));
 assert.equal(b.model.config.heartPresence,true);assert(E.pool(b.model.config).some(b=>b.id==='51'));
 assert(M.parse('本局没有心脏').items.some(i=>i.values?.heartPresence===false));
 const absent=M.build(E.newState(),messages(['模式疯狂','本局有心脏','本局没有心脏']));assert.equal(absent.model.config.heartPresence,false);
});
test('explicit public first-step terrain sound excludes heartbeat block',()=>{
 const b=M.build(E.newState(),messages(['模式疯狂','[0号]玩家本回合的完整行动轨迹：\n[→沙沙]']));assert.equal(b.model.config.heartPresence,false);assert(!E.pool(b.model.config).some(b=>b.id==='51'));
});
test('redstone center buttons retain every positive and negative target',()=>{
 for(const id of ['41','42'])assert.equal(E.byId.get(id).cells[4].buttons.length,16);
});
const config={size:9,playerCount:1,dynamicDoors:true};
function placement(){const cells=Array.from({length:9},()=>({walls:[0,0,0,0],attach:null}));cells[0].walls[3]=cells[1].walls[2]=3;cells[4].attach='BUTTON';cells[4].buttons=[[-1,-1,'RIGHT']];return [{origin:{r:0,c:0},block:{cells}}];}
const obs=(kind,step,extra={})=>({kind,r:0,c:0,dir:3,clock:{round:1,player:0,step},...extra});
test('preview door states follow button toggles and preserve missing-action uncertainty',()=>{
 const cfg={...config,size:3};
 assert.equal(Timeline.check(cfg,placement(),[],true).doorStates['0:1'],'closed');
 const press=obs('action',1,{r:1,c:1,arrival:true}),end=obs('turnEnd',1000000);
 assert.equal(Timeline.check(cfg,placement(),[press,end],true).doorStates['0:1'],'open');
 assert.equal(Timeline.check(cfg,placement(),[press,obs('action',2,{r:1,c:1,arrival:true}),end],true).doorStates['0:1'],'closed');
 assert.equal(Timeline.check(cfg,placement(),[obs('turnEnd',1000000)],true).doorStates['0:1'],'unknown');
});
test('button arrival opens a closed door and a second arrival closes it again',()=>{
 assert.equal(Timeline.check(config,placement(),[obs('pass',1)]).valid,false);
 const first=[obs('action',1,{r:1,c:1,arrival:true}),obs('pass',2)];assert(Timeline.check(config,placement(),first).valid);
 assert.equal(Timeline.check(config,placement(),[...first,obs('action',3,{r:1,c:1,arrival:true}),obs('pass',4)]).valid,false);
 assert(Timeline.check(config,placement(),[...first,obs('action',3,{r:1,c:1,arrival:true}),obs('hit',4)]).valid);
});
test('standing on a button or travelling in subspace does not activate it',()=>{
 assert.equal(Timeline.check(config,placement(),[obs('action',1,{r:1,c:1,arrival:false}),obs('pass',2)]).valid,false);
});
test('unknown turns cannot independently change two doors on the same button',()=>{
 const ps=placement();ps[0].block.cells[1].walls[3]=ps[0].block.cells[2].walls[2]=3;ps[0].block.cells[4].buttons.push([-1,0,'RIGHT']);
 const clock={round:2,player:0,step:1000000};assert.equal(Timeline.check(config,ps,[{kind:'walls',r:0,c:1,value:'??墙空',clock}]).valid,false);
});
test('relative advice labels distinct rounds and hides dead or historical fragments',()=>{
 const b=M.build(E.newState(),messages(['人数3\n我是2号','[1号]玩家本回合的完整行动轨迹：\n→','[2号]玩家本回合的完整行动轨迹：\n↑']));
 const t={nodes:[{id:'2:0',joined:[{id:'1:0',dr:-1,dc:-3}],verification:{status:'verified',blocks:[]}}]};
 assert(A.summarize(b,t).some(x=>x.includes('左2格')&&x.includes('第1回合末')));b.players[1].alive=false;assert(!A.summarize(b,t).some(x=>x.includes('左2格')));
});
test('three historical bearings resolve water; fifth-round route uniquely aligns target two cells left',()=>{
 const H=require('../hypotheses'),T=require('../team'),all=require('./fixtures/direction-session.json');
 for(const length of [21,22]){
  const ms=all.slice(0,length),base=E.newState();let b=M.build(base,ms);
  const hs=H.all(b.model.config,{base,messages:ms,self:b.self,count:b.count});assert(hs[0].resolvedChoices);
  b=M.build(base,ms,Object.fromEntries(hs.map(h=>[h.player,h.resolvedChoices])));assert.equal(b.views[1].model.segments.length,2);assert.equal(b.relations.filter(h=>h.kind!=='capture').length,3);
  const nodes=b.views.flatMap(v=>v.model.segments.map((s,i)=>{const r=E.replay(s,9);return {id:v.id+':'+i,player:v.id,segment:i,observations:r.observations,anchors:s.anchors,focus:{r:r.r,c:r.c},birth:i===0?{r:4,c:4}:null};})),t=T.solve(b.model.config,nodes,b.relations),advice=A.summarize(b,t);
  if(length===21)assert(advice.some(x=>x.includes('2个候选位置')&&x.includes('上1格、右3格')&&x.includes('上2格、右3格')));
  else {assert(t.pairs.every(p=>p.offsets.length===1));assert(advice.some(x=>x.includes('第5回合末')&&x.includes('左2格')));assert.equal(t.nodes.find(n=>n.id==='2:0').verification.blocks.length,7);}
 }
});
