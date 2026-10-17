const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),A=require('../advice');
function fixture(first='[←未知]',setting=''){
 const base=E.newState();base.segments[0].anchors=[{id:'E7',r:2,c:3}];
 const messages=['模式幻变\n玩家人数：2\n我是0号\n'+setting,'[0号]玩家本回合的完整行动轨迹：\n'+first+'↑[↑啪嗒](↓撞)'].map((text,i)=>({id:String(i),text,view:0}));
 const built=M.build(base,messages);return {base,messages,built,analyze:(choices={},budget=null)=>H.analyze(built.model.config,base,messages,0,0,budget,choices)};
}
test('impossible walking route automatically gains an earlier unknown-sound portal and uses its paired exit',()=>{
 const f=fixture();assert.equal(f.built.views[0].ambiguities.length,0);
 const h=f.analyze();assert.equal(h.recovery,'missing');assert(h.requiresPortal);assert(h.groups[0].excluded);assert(!h.groups[1].pending);
 assert.deepEqual(h.resolvedChoices, {__portalRecovery:true,'1:0:1':{kind:'portal',dr:-2,dc:2}});
 const rebuilt=M.build(f.base,f.messages,{0:h.resolvedChoices}),r=E.replay(rebuilt.model.segments[0],9);
 assert.deepEqual([r.r,r.c],[2,5]);assert.equal(r.log.filter(e=>e.kind==='teleport').length,1);
 assert(!r.observations.some(o=>o.kind==='pass'&&[2,3].includes(o.clock?.step)));
 assert.equal(f.analyze(h.resolvedChoices),null,'a verified route does not repeatedly reopen');
 assert(A.summarize(rebuilt,{nodes:[],hypotheses:[]}).some(s=>s.includes('已启用传送门补充推理')));
});
test('a missing heartbeat entry is conditional on a complete map containing the heart',()=>{
 const f=fixture('←'),h=f.analyze();assert(h.resolvedChoices['1:0:1'].requiresHeart);
 const rebuilt=M.build(f.base,f.messages,{0:h.resolvedChoices});assert(rebuilt.views.every(v=>v.model.config.heartPresence===true));
 const r=E.replay(rebuilt.model.segments[0],9),proof=E.verifyCompleteLayout(rebuilt.model.config,E.solveMap(rebuilt.model.config,r.observations,rebuilt.model.segments[0].anchors),r.observations,3000);
 assert.equal(proof.status,'verified');assert(proof.layout.some(b=>b.id==='51'));
 assert.equal(fixture('←','本局没有心脏').analyze(),null);
 assert.equal(fixture('[←沙沙]').analyze(),null,'an explicit conflicting sound must not be overwritten');
});
test('when all existing sound-based portal branches fail, recovery adds an earlier entrance',()=>{
 const f=fixture();f.messages[1].text=f.messages[1].text.replace('(↓撞)','←');
 assert.equal(M.build(f.base,f.messages).views[0].ambiguities[0].step,3);
 const h=f.analyze();assert.equal(h.recovery,'missing');assert.equal(h.step,1);
 assert(h.resolvedChoices);assert.equal(h.resolvedChoices['1:0:1'].kind,'portal');
});
test('unsolved supplementary branches remain pending and choice updates stabilize after one rebuild',()=>{
 const f=fixture(),h=f.analyze({},1);assert(h.truncated);assert.equal(h.resolvedChoices,null);assert.equal(h.requiresPortal,false);
 const choices=H.choiceUpdates([h]);assert.deepEqual(choices,{0:{__portalRecovery:true}});
 const again=f.analyze(choices[0],1);assert(again.truncated);assert.equal(H.choiceUpdates([again],choices),null);
 assert(A.hypothesis(h).some(s=>s.includes('补充传送门假设')));
});
test('no additional portal is invented when the confirmed exit collision is itself impossible',()=>{
 const f=fixture();f.messages[1].text=f.messages[1].text.replace('(↓撞)','(←撞)');
 const h=f.analyze();assert(h.groups.every(g=>g.excluded));assert.equal(h.resolvedChoices,null);assert.equal(h.requiresPortal,false);
});
test('silent search proactively reopens a previously assumed walking route',()=>{
 const journal=require('./fixtures/silent-zero-portal.json'),messages=M.liveMessages(journal.messages),built=M.build(journal.base,messages);
 let old={},b=M.buildHypothesis(journal.base,messages,0,1,old);
 while(b.ambiguities.length){old[b.ambiguities[0].key]={kind:'ground'};b=M.buildHypothesis(journal.base,messages,0,1,old);}
 const h=H.analyze(built.model.config,journal.base,messages,0,1,null,old);
 assert.equal(b.ambiguities.length,0);assert.equal(h.recovery,'silent');assert(h.resolvedChoices);assert(h.requiresPortal);
 assert.equal(Object.values(h.resolvedChoices).filter(c=>c.kind==='portal').length,3);
 assert.deepEqual(H.choiceUpdates([h],{0:old})[0],h.resolvedChoices);
 assert.equal(H.choiceUpdates([h],{0:h.resolvedChoices}),null);
});
