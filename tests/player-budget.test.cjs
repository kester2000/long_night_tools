const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness({failPlayer=null,failJoint=false,resolve=false}={}){
 let now=0,deadline=Infinity,solveCalls=0;const deadlines=[],seen=[],timeout=()=>Object.assign(new Error('timeout'),{code:'INFERENCE_TIMEOUT'});
 const E={setDeadline(v=Infinity){deadline=v;if(Number.isFinite(v))deadlines.push(v);},checkDeadline(){if(now>=deadline)throw timeout();}};
 const raw=[0,1].map(player=>({id:player+':0',player,observations:[{}],anchors:[],solution:{phases:[]}}));
 const root={Date:{now:()=>now},setTimeout:f=>f(),LongNight:E,LongNightMessages:{build:()=>({relations:[]})},LongNightLocal:{nodes:()=>raw},LongNightHypotheses:{analyze(c,b,m,p,s,n,choices){seen.push(p);now+=100;if(p===failPlayer){now+=3000;E.checkDeadline();}return resolve&&!choices.done?{player:p,resolvedChoices:{done:true}}:null;},choiceUpdates(h,c){return h.length?{...c,[h[0].player]:h[0].resolvedChoices}:null;},constrainNodes:(nodes,relations)=>({nodes,relations})},LongNightTeam:{solve(c,n){solveCalls++;now+=100;if(n.length>1&&failJoint){now+=3000;E.checkDeadline();}return {nodes:n,pairs:[],conflict:false};}},LongNightSoundCandidates:{attach:n=>n,analyze:()=>[]},LongNightRouteExplanations:{forNode:()=>({cases:[],pending:false})}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../inference'),'utf8'),root);
 return {run:()=>root.LongNightInference.run({config:{},nodes:raw,relations:[],notebook:{count:2,base:{},messages:[],self:0,choices:{}}}),deadlines,seen};
}
test('a timed out player does not spend the next player budget or discard its result',async()=>{
 const h=harness({failPlayer:0}),r=await h.run();assert.deepEqual(h.deadlines,[3000,6100,6300]);
 assert.equal(r.playerStatuses[0].status,'timeout');assert.equal(r.playerStatuses[1].status,'complete');assert.equal(r.nodes.length,1);assert.equal(r.nodes[0].player,1);
});
test('joint timeout preserves both completed views',async()=>{
 const h=harness({failJoint:true}),r=await h.run();assert.deepEqual(h.deadlines,[3000,3200,3400]);assert.equal(r.jointStatus,'timeout');assert.equal(r.nodes.length,2);assert(r.playerStatuses.every(s=>s.status==='complete'));
});
test('resolving a portal does not restart the player timer',async()=>{
 const h=harness({resolve:true}),r=await h.run();assert.deepEqual(h.deadlines,[3000,3300,3600]);assert.deepEqual(h.seen,[0,0,1,1]);assert(r.completedChoices[0].done&&r.completedChoices[1].done);
});
