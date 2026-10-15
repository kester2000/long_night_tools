const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),R=require('../route-explanations');
test('a complete portal explanation includes the exit stop, every route observation and required wall provider',()=>{
 const config={...E.newState().config,pool:'2 4 9 11 12 13 23 45 46 47 48 51 E1 E4 E7 E8'},observations=[{r:3,c:3,kind:'portalLink',dr:2,dc:2,clock:{player:2,round:1,step:1}},{r:3,c:3,kind:'action',arrival:true,clock:{player:2,round:1,step:1}},{r:5,c:5,kind:'terrain',value:'PORTAL',clock:{player:2,round:1,step:3}},{r:3,c:3,kind:'action',arrival:false,clock:{player:2,round:1,step:3}},{r:5,c:5,kind:'action',arrival:true,clock:{player:2,round:1,step:3}},{r:5,c:5,kind:'hit',dir:1,last:1,clock:{player:2,round:1,step:4}},{r:5,c:5,kind:'action',arrival:false,clock:{player:2,round:1,step:4}}],focus={r:5,c:5},anchors=[{id:'45',r:3,c:3}],solution=E.solveMap(config,observations,anchors),world={observations,focus,anchors,solution},local=L.analyze(config,world,solution),result=R.explain(config,world,local,2);
 assert(result.cases.length>0);
 for(const c of result.cases){assert.equal(c.status,'verified');assert.deepEqual(c.focus,focus);assert.equal(c.wallDependency,null);assert(c.blocks.some(b=>b.origin.r===6));assert.equal(c.steps.find(s=>s.clock.step===1).kind,'entry');assert(c.steps.find(s=>s.clock.step===3).teleport);assert.equal(c.steps.find(s=>s.clock.step===4).kind,'hit');assert(observations.every(o=>c.blocks.some(b=>L.inside(o,b,9))));}
});
test('partial historical patterns and unfinished branch prefixes never become complete current-path explanations',()=>{
 const config={...E.newState().config,mode:'CLASSIC'},observations=[{kind:'terrain',value:'WATER',r:4,c:4}],solution=E.solveMap(config,observations),world={observations,focus:{r:4,c:4},solution,pending:true};
 assert.deepEqual(R.explain(config,world,{singles:[],triples:[{partial:true,blocks:[]}]},0),{cases:[],pending:true});
});
