const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses');
const config={...E.newState().config,mode:'CLASSIC',exitCount:2};
const messages=(...texts)=>['模式经典\n玩家人数：4\n我是0号',...texts].map((text,i)=>({id:String(i),text,view:0}));
const route=text=>'[0号]玩家本回合的完整行动轨迹：\n'+text;
const analyze=ms=>H.analyze(config,E.newState(),ms,0,0);
test('ambiguous papa creates independent ground and portal hypotheses without changing the original route',()=>{
 const ms=messages(route('[→啪嗒]')),original=M.build(E.newState(),ms),h=analyze(ms),[ground,portal]=h.groups;
 assert(!ground.excluded&&!portal.excluded);assert.equal(ground.inSpace,false);assert.equal(portal.inSpace,true);assert.deepEqual(portal.remaining,[2]);
 assert(ground.observations.some(o=>o.kind==='nonPortalSound'));assert(portal.observations.some(o=>o.kind==='terrain'&&o.value==='PORTAL'));
 assert.deepEqual(M.build(E.newState(),ms),original);
});
test('portal branch rejects a missing second papa and collisions are resolved without hypothetical maps',()=>{
 const h=analyze(messages(route('[→啪嗒]↑↑')));assert(!h.groups[0].excluded);assert(h.groups[1].excluded);assert(h.groups[1].reasons.some(s=>s.includes('出口')));
 assert.equal(analyze(messages(route('[→啪嗒]↑(→撞)'))),null);
});
test('two subspace actions ignore arrows and exit through the paired portal across turns',()=>{
 const h=analyze(messages(route('[→啪嗒]↑'),route('[↑啪嗒]'))),portal=h.groups[1];
 assert(!portal.excluded);assert.equal(portal.inSpace,false);assert(portal.positions.length>0);
 assert(portal.positions.every(p=>p.c===7&&(p.r===2||p.r===6)));
 assert(!portal.observations.some(o=>o.kind==='pass'&&o.r===4&&o.c===5));
});
test('walls reported during subspace are checked but never projected onto the physical entrance',()=>{
 const clear=analyze(messages(route('[→啪嗒]'),'【第1回合】\n空空空空')).groups[1];
 assert(!clear.excluded);assert(!clear.observations.some(o=>o.kind==='walls'));
 const wall=analyze(messages(route('[→啪嗒]'),'【第1回合】\n墙空空空')).groups[1];
 assert(wall.excluded);assert(wall.reasons.some(s=>s.includes('亚空间')));
});
test('removing a following collision restores both papa hypotheses',()=>{
 const ms=messages(route('[→啪嗒]'),route('(↑撞)'));assert.equal(analyze(ms),null);
 assert(analyze(ms.slice(0,-1)).groups.every(g=>!g.excluded));
});
test('portal hypotheses must respect the template paired endpoint',()=>{
 const observations=[{kind:'terrain',r:3,c:3,value:'PORTAL'},{kind:'portalLink',r:3,c:3,dr:2,dc:2}];
 const matches=E.matchBlocks(config,observations,{r:3,c:3}).matches;
 assert(matches.length>0);assert(matches.every(m=>{const p=m.block.cells[m.lr*3+m.lc].portal;return p[0]===2&&p[1]===2;}));
});
