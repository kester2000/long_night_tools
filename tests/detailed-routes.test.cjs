const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../route-explanations');
test('detailed routes identify rounds and steps and preserve hits, wrapping and teleport breaks',()=>{
 const o=(kind,round,step,r,c,extra={})=>({kind,r,c,clock:{player:1,round,step},...extra});
 const observations=[o('pass',1,1,8,0,{dir:1}),o('action',1,1,0,0,{arrival:true}),o('hit',2,1,0,0,{dir:2}),o('action',2,1,0,0,{arrival:false}),o('action',2,2,0,0,{arrival:false}),o('action',2,3,0,0,{arrival:false}),o('action',2,3,4,4,{arrival:true})];
 const steps=R.detailedSteps(observations,1,9);
 assert.deepEqual(steps.map(s=>[s.label,s.kind]),[['1·1','move'],['2·1','hit'],['2·2','space'],['2·3','teleport']]);
 assert.deepEqual(steps[0].to,{r:0,c:0});assert.deepEqual(steps[1].from,steps[1].to);
 assert.deepEqual(R.detailedSteps(observations,0,9),[]);
 assert([...R.previewTrace(observations,1).values()].flat().every(m=>/^\d+·\d+/.test(m.label)));
});
