const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),L=require('../local.js');
const config={...E.newState().config,mode:'CLASSIC',exitCount:2,dynamicDoors:false};
const anchored=(id,r,c)=>({id,r,c});
test('player zero old triple patterns remain valid after the fourth round extends the footprint',()=>{
 const M=require('../messages'),texts=['模式经典\n玩家人数：4\n我是0号','【开局】\n空空墙墙','[0号]玩家本回合的完整行动轨迹：\n↑(←撞)','【第 1 回合】\n空空墙墙','[0号]玩家本回合的完整行动轨迹：\n↓↑↑(←撞)','【第 2 回合】\n空空墙空','[0号]玩家本回合的完整行动轨迹：\n↑(→撞)','【第 3 回合】\n空空空墙','[0号]玩家本回合的完整行动轨迹：\n↑↓↓→↑(→撞)','【第 4 回合】\n墙空墙墙'];
 const build=items=>{const v=M.build(E.newState(),items.map((text,i)=>({id:String(i),text,view:0}))).views[0],r=E.replay(v.model.segments[0],9);return {config:v.model.config,node:{observations:r.observations,focus:r,anchors:[]}};};
 const previous=build(texts.slice(0,8)),current=build(texts),solution=E.solveMap(current.config,current.node.observations),local=L.analyze(current.config,current.node,solution),retained=L.retained(current.config,{...current.node,previous:previous.node},solution,local);
 assert.equal(local.triples.length,0);assert.equal(retained.length,2);assert(retained.every(c=>c.extensions>0));assert(retained.some(c=>c.blocks.some(b=>b.id==='7')));assert(retained.some(c=>c.blocks.some(b=>b.id==='9')));
 const proof=E.certifyBlocks(current.config,solution,current.node.observations);
 assert.equal(proof.status,'verified');assert(!proof.blocks.some(b=>b.id==='4'));
 for(const id of ['4','E3'])assert.equal(E.verifyCompleteLayout(current.config,E.solveMap(current.config,current.node.observations,[{id,r:1,c:2}]),current.node.observations).status,'verified');
 const preserved=L.preserveTriples(current.config,{...current.node,previous:previous.node},solution,local);
 assert(preserved.triples.some(c=>c.partial&&c.blocks.some(b=>b.id==='7')));
 assert(preserved.triples.some(c=>c.partial&&c.blocks.some(b=>b.id==='9')));
 assert.equal(preserved.fullRouteTriples,0);assert(preserved.triples.every(c=>c.blocks.length===3));
});
test('player one escape fixes the cabin and automatically expands to four blocks',()=>{
 const M=require('../messages'),texts=['模式经典\n玩家人数：4\n我是0号','[1号]玩家本回合的完整行动轨迹：\n←(↓撞)','[1号]玩家本回合的完整行动轨迹：\n↑(↑撞)','[1号]玩家本回合的完整行动轨迹：\n↓→↓×5→→↓↓←↑(逃生)'];
 const v=M.build(E.newState(),texts.map((text,i)=>({id:String(i),text,view:0}))).views[1],r=E.replay(v.model.segments[0],9),solution=E.solveMap(v.model.config,r.observations);
 assert.deepEqual([r.r,r.c],[1,5]);assert(r.observations.some(o=>o.kind==='terrain'&&o.value==='EXIT'&&o.r===1&&o.c===5));assert.equal(E.inferredTerrain(solution,9).get('1,5'),'EXIT');
 const result=L.analyze(v.model.config,{observations:r.observations,focus:r},solution);assert.equal(result.expanded.length,40);assert(result.expanded.every(c=>c.blocks.length===4));assert.equal(result.truncated,false);
 const limited=L.analyze({...v.model.config,localSearchBudget:1},{observations:r.observations,focus:r},solution);assert(limited.truncated);assert(limited.focusCandidates.length);
 const possibilities=E.terrainPossibilities(solution,9);assert.deepEqual(possibilities.get('1,5'),['EXIT']);assert([...possibilities.values()].some(types=>types.length>1));
});
test('round two left collision removes both obsolete double-block layouts',()=>{
 const M=require('../messages'),messages=['模式经典\n玩家人数：4\n我是0号','【开局】\n空空墙墙','[0号]玩家本回合的完整行动轨迹：\n↑(←撞)','【第 1 回合】\n空空墙墙','[0号]玩家本回合的完整行动轨迹：\n↓↑↑(←撞)'].map((text,i)=>({id:String(i),text,view:0}));
 const analyze=ms=>{const v=M.build(E.newState(),ms).views[0],r=E.replay(v.model.segments[0],9);return L.analyze(v.model.config,{observations:r.observations,focus:r},E.solveMap(v.model.config,r.observations));};
 assert.equal(analyze(messages.slice(0,-1)).doubles.length,2);
 const result=analyze(messages);assert.equal(result.doubles.length,0);assert.equal(result.triples.length,5);
});
test('hit constraints retain hedges, dynamic closed doors and box uncertainty',()=>{
 const o={kind:'hit',dir:3,last:0};assert(!E.edgeFits(0,o,3));assert(E.edgeFits(1,o,3));assert(E.edgeFits(2,o,3));assert(!E.edgeFits(2,{...o,last:3},3));assert(E.edgeFits(3,o,3));assert(!E.edgeFits(4,o,3));assert(E.edgeFits(0,o,3,true));
});
test('collision retains a drawable directed obstacle without claiming a static wall',()=>{
 const r=E.replay({events:[{kind:'move',dir:3,outcome:'hit'}]},9);assert.equal(r.r,4);assert.equal(r.c,4);
 assert(r.observations.some(o=>o.kind==='hit'&&o.dir===3));assert(!r.observations.some(o=>o.kind==='walls'));
});
test('complete evidence inside a known block produces its single-block placement',()=>{
 const b=E.byId.get('1'),observations=b.cells.map((cell,i)=>({kind:'terrain',r:3+Math.floor(i/3),c:3+i%3,value:cell.type})),anchors=[anchored('1',3,3)],node={observations,anchors,focus:{r:4,c:4}};
 const result=L.analyze(config,node,E.solveMap(config,observations,anchors));assert.equal(result.singles.length,1);assert.equal(result.singles[0].blocks[0].id,'1');assert.equal(result.singles[0].lr,1);assert.equal(result.doubles.length,0);
});
test('a pattern crossing two anchored blocks requires the correct adjacent pair',()=>{
 const a=E.byId.get('1'),b=E.byId.get('2'),observations=[{kind:'terrain',r:4,c:5,value:a.cells[5].type},{kind:'terrain',r:4,c:6,value:b.cells[3].type}],anchors=[anchored('1',3,3),anchored('2',3,6)],node={observations,anchors,focus:{r:4,c:6}};
 const result=L.analyze(config,node,E.solveMap(config,observations,anchors));assert.equal(result.singles.length,0);assert.equal(result.doubles.length,1);assert.deepEqual(result.doubles[0].blocks.map(b=>b.id),['2','1']);assert.equal(result.doubles[0].direction,2);
});
test('two blocks merge their shared wall by priority and reject an incompatible seam',()=>{
 const a={id:'A',origin:{r:0,c:0},block:{cells:Array.from({length:9},()=>({walls:[0,0,0,0]}))}},b={id:'B',origin:{r:0,c:3},block:{cells:Array.from({length:9},()=>({walls:[0,0,0,0]}))}};
 b.block.cells[3].walls[2]=1;assert(L.seam(config,[{kind:'walls',r:1,c:2,value:'???墙'}],a,b));assert(!L.seam(config,[{kind:'walls',r:1,c:2,value:'???空'}],a,b));assert(!L.seam(config,[{kind:'pass',r:1,c:2,dir:3,last:-1}],a,b));
});
test('10x10 keeps road and gap uncertainty instead of imposing regular adjacent pairs',()=>{
 const c={...config,size:10},observations=[{kind:'walls',r:5,c:5,value:'空空空空'}];const result=L.analyze(c,{observations,anchors:[],focus:{r:5,c:5}},E.solveMap(c,observations));assert(result.irregular);assert.equal(result.doubles.length,0);assert(result.gap);
});
test('a proposed pair cannot exceed the global exit quota',()=>{
 const a={id:'E1',origin:{r:0,c:0}},b={id:'E2',origin:{r:0,c:3}},solution={phases:[{slots:[a.origin,b.origin],domains:[[a,{id:'1'}],[b,{id:'2'}]]}]};
 assert(!L.pairSupported({...config,exitCount:1},solution,a,b));assert(L.pairSupported({...config,exitCount:2},solution,a,b));
});
test('a right wall contributed by a third block is counted and recorded as a triple',()=>{
 const pool=E.pool(config).filter(b=>!b.id.startsWith('E')),b=pool.find(b=>b.cells[5].walls[3]===0),c=pool.find(c=>c.id!==b.id&&c.cells[3].walls[2]===1),a=pool.find(a=>a.id!==b.id&&a.id!==c.id);
 assert(a&&b&&c);const observations=[{kind:'terrain',r:1,c:1,value:a.cells[4].type},{kind:'terrain',r:1,c:5,value:b.cells[5].type},{kind:'walls',r:1,c:5,value:'???墙'}],anchors=[anchored(a.id,0,0),anchored(b.id,0,3),anchored(c.id,0,6)],node={observations,anchors,focus:{r:1,c:1}};
 const solution=E.solveMap(config,observations,anchors);assert(solution.phases.length);const result=L.analyze(config,node,solution);
 assert.equal(result.singles.length,0);assert.equal(result.doubles.length,0);assert.equal(result.triples.length,1);assert.equal(result.triples[0].blocks[2].id,c.id);assert(result.triples[0].reasons.some(r=>r.from===b.id&&r.provider===c.id&&r.dir===3));
});
test('a straight three-block footprint is enumerated without counting it as a double',()=>{
 const ids=['1','2','3'],anchors=ids.map((id,i)=>anchored(id,0,i*3)),observations=ids.map((id,i)=>({kind:'terrain',r:1,c:i*3+1,value:E.byId.get(id).cells[4].type})),node={observations,anchors,focus:{r:1,c:1}},result=L.analyze(config,node,E.solveMap(config,observations,anchors));
 assert.equal(result.singles.length,0);assert.equal(result.doubles.length,0);assert.equal(result.triples.length,1);assert.equal(result.triples[0].blocks.length,3);
});
