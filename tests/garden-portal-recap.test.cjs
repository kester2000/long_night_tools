const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),j=require('./fixtures/garden-no-buttons.json');
const messages=[...j.messages,{id:'buttons',text:'当前还没人动过按钮',view:1}];
test('a valid walking map must not suppress the actual silent round-two portal alternative',()=>{
 const b=M.build(j.base,messages),h=H.analyze(b.model.config,j.base,messages,0,1);
 assert(h);assert.equal(h.groundOnly.status,'verified');assert.equal(h.round,2);assert.equal(h.step,1);
 assert.equal(h.resolvedChoices,null);assert(!h.truncated);
 const portals=h.groups.find(g=>g.kind==='portal');assert(!portals.excluded);assert(!portals.pending);
 assert(portals.alternatives.some(a=>a.observations.some(o=>o.kind==='portalLink'&&o.value?.dr===-2))||portals.alternatives.some(a=>a.teleports.some(t=>t.round===2&&t.step===3)));
 assert.equal(H.choiceUpdates([h]),null,'unresolved alternatives must not split the default walking view');
 assert.equal(b.views[0].model.segments.length,1);
 const constrained=H.constrainNodes(L.nodes(b),b.relations,[h]).nodes.find(n=>n.id==='0:0');
 assert(constrained.walkingObservations.some(o=>o.kind==='pass'&&o.clock.round===2&&o.clock.step>=2));
 assert(!constrained.observations.some(o=>o.kind==='pass'&&o.clock.round===2&&o.clock.step>=2));
});
test('revealed map proves the real portal entry and the complete opponent route',()=>{
 const base=E.clone(j.base),ids=['8','E15','2','10','51','24','49','6','11'];
 // Screenshot coordinates: player 0 spawns at row 9, column 6. Translate
 // that square to the replay origin (4,4), preserving all nine block seams.
 base.segments[0].anchors=ids.map((id,i)=>({id,r:E.mod(Math.floor(i/3)*3-4,9),c:E.mod(i%3*3-1,9)}));
 const extra=['【第 3 回合】\n[0号]玩家本回合的完整行动轨迹：\n↓×3↑→→(↑撞)',
  '【第 4 回合】\n[0号]玩家本回合的完整行动轨迹：\n←←↓←↑↑←↓↓←←↓↓(陷阱)',
  '【第 5 回合】\n[0号]玩家本回合的完整行动轨迹：\n↑↑→→↓(←撞)'];
 const ms=[...messages,...extra.map((text,i)=>({id:'recap-'+i,text,view:1}))],b=M.build(base,ms),h=H.analyze(b.model.config,base,ms,0,0);
 assert(h.resolvedChoices,JSON.stringify({search:h.search,groups:h.groups.map(g=>({kind:g.kind,excluded:g.excluded,reasons:g.reasons,cases:g.cases})),ground:h.groundOnly}));const v=M.buildHypothesis(base,ms,0,0,h.resolvedChoices),r=E.replay(v.model.segments[0],9);
 assert.deepEqual(r.log.filter(o=>o.portalLink).map(o=>[o.clock.round,o.clock.step,o.portalLink]),[[2,1,{dr:-2,dc:-2}]]);
 assert.deepEqual(r.log.filter(o=>o.kind==='teleport').map(o=>[o.clock.round,o.clock.step]),[[2,3]]);
 assert.deepEqual([r.r,r.c],[8,8]); // Actual final square: row 4, column 1.
 assert.equal(E.verifyCompleteLayout(v.model.config,E.solveMap(v.model.config,r.observations,base.segments[0].anchors),r.observations).status,'verified');
});
test('unsearched silent portals remain unknown even if the walking explanation is verified',()=>{
 const b=M.build(j.base,messages),h=H.analyze(b.model.config,j.base,messages,0,1,1);
 assert(h.truncated);assert.equal(h.resolvedChoices,null);assert.equal(h.groundOnly.status,'verified');assert.equal(H.choiceUpdates([h]),null);
});
