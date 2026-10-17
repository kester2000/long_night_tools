const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),I=require('../inference'),T=require('../team'),Timeline=require('../timeline');
test('clicked current-position pins are enforced in a jointly verified map',async()=>{
 const j=require('./fixtures/archive16.json'),b=M.build(j.base,j.messages),config=b.model.config;
 const team=await I.run({config:{...config,routePresentation:true},relations:b.relations,notebook:{base:j.base,messages:j.messages,self:b.self,count:2}});
 const position={player:1,segment:0,r:7,c:0},result=T.jointExample(config,team,'0:0',{position});
 assert.equal(result.status,'verified');assert.equal(result.layout.length,9);
 assert.deepEqual(result.players.map(p=>p.player).sort(),[0,1]);
 const at=result.players.find(p=>p.player===1);assert.equal(at.r,7);assert.equal(at.c,0);
 assert(Timeline.check(config,result.layout.map(m=>({...m,block:E.byId.get(m.id)})),result.observations,true).valid);
 assert(E.birthLayoutCheck(config,result.layout,result.players.map(p=>({...p.birth,player:p.player}))).valid);
 const rejected=T.jointExample(config,team,'0:0',{position:{...position,r:0,c:0}});
 assert.equal(rejected.status,'impossible');assert(!rejected.layout);
 assert.deepEqual(T.positionCandidates(config,team,'0:0').map(p=>[p.r,p.c,p.status]),[]);
 const pendingTeam={...team,pairs:team.pairs.map(p=>({...p,offsets:[{dr:1,dc:5},{dr:2,dc:5}]})),nodes:[...team.nodes,{id:'2:0',player:2,segment:0,routePending:true}]};
 assert.deepEqual(T.positionCandidates(config,pendingTeam,'0:0').map(p=>[p.r,p.c,p.status]),[[7,0,'unknown'],[8,0,'unknown']],'unfinished joint verification must not exclude a possible location');
 const timeoutTeam={...team};E.setDeadline(0);
 try{assert.equal(T.jointExample(config,timeoutTeam,'0:0',{position}).status,'unknown');}finally{E.setDeadline();}
 assert.equal(T.jointExample(config,timeoutTeam,'0:0',{position}).status,'verified','timeouts must not be cached as exclusions');
});
