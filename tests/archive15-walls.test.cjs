const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),I=require('../inference'),R=require('../route-explanations'),j=require('./fixtures/archive15-walls.json');
test('archive 15 candidate movement respects both sides of every wall and labels portal discontinuities',async()=>{
 const messages=M.liveMessages(j.messages),b=M.build(j.base,messages),config={...b.model.config,routePresentation:true};
 const t=await I.run({config,notebook:{base:j.base,messages,self:b.self,count:b.count},relations:b.relations});
 const h=t.hypotheses.find(h=>h.player===0);assert(h);assert(h.portalExamples.length);
 for(const e of [...h.walkingExamples,...h.portalExamples]){
  const cell=(r,c)=>{const m=e.blocks.find(m=>E.mod(r-m.origin.r,9)<3&&E.mod(c-m.origin.c,9)<3);return E.byId.get(m.id).cells[E.mod(r-m.origin.r,9)*3+E.mod(c-m.origin.c,9)];};
  for(const o of e.observations.filter(o=>o.kind==='pass')){
   const w=Math.max(cell(o.r,o.c).walls[o.dir],cell(o.r+E.V[o.dir][0],o.c+E.V[o.dir][1]).walls[E.OPP[o.dir]]);
   assert.notEqual(w,1,'no solid wall crossing at step '+o.clock.step);
   if(w===2)assert.equal(o.last,o.dir,'hedges need a running start');
  }
  const anchors=e.blocks.map(m=>({id:m.id,r:m.origin.r,c:m.origin.c}));
  assert.equal(E.verifyCompleteLayout(config,E.solveMap(config,e.observations,anchors),e.observations,3000).status,'verified');
  const marks=[...R.previewTrace(e.observations,0).values()].flat();
  assert(marks.some(m=>m.label.endsWith('·12入')));assert(marks.some(m=>m.label.endsWith('·14出')));
  assert(marks.some(m=>m.label.endsWith('·17↑×')));
  assert(!marks.some(m=>/·1[34][↑↓←→]/.test(m.label)),'space and teleport cannot become ground arrows');
 }
});
