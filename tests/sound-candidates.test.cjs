const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),L=require('../local'),S=require('../sound-candidates');
function fixture(){
 const base=E.newState(),messages=['模式幻变\n玩家人数：3\n我是0号','区块池：2 4 5 12 14 23 45 47 48 49 50 51 E5 E6 E15 E16','【开局】\n空空墙空','本局有心脏','[0号]玩家本回合的完整行动轨迹：\n↑←(←撞)','[第 1 步] 移动发出【啪嗒声】，声响被巨大的心跳声掩盖，其他玩家未能察觉','【第 1 回合】\n空墙墙空','[2号]玩家本回合的完整行动轨迹：\n↓↓[→啪嗒]↑(↑撞)','[2号(第3步)]你听见了来自【右上方】的啪嗒声！'].map((text,i)=>({id:String(i),text,view:0}));
 const built=M.build(base,messages),h=H.analyze(built.model.config,base,messages,2,0),nodes=H.constrainNodes(L.nodes(built),built.relations,[h]).nodes;
 return {base,messages,built,h,nodes};
}
test('9x9 upper-right bearing has exactly sixteen cells, including wrapped ones',()=>{
 for(const listener of [{r:4,c:4},{r:0,c:8}]){
  const cells=Array.from({length:81},(_,i)=>({r:Math.floor(i/9),c:i%9})).filter(p=>E.bearings(p,listener,9).includes('右上'));
  assert.equal(cells.length,16);assert(cells.every(p=>E.mod(listener.r-p.r,9)>=1&&E.mod(listener.r-p.r,9)<=4&&E.mod(p.c-listener.c,9)>=1&&E.mod(p.c-listener.c,9)<=4));
 }
});
test('hearing source candidates use step-three paired exits and retain independently supported block placements',()=>{
 const {built,nodes}=fixture(),results=S.analyze(built.model.config,nodes,S.hearings(built)),h=results[0];
 assert.equal(h.initialCount,16);assert.equal(h.player,2);assert.equal(h.step,3);assert(h.cells.length>0);assert(h.cells.length<16);
 for(const cell of h.cells)for(const branch of cell.branches){
  const source=branch.observations.findLast(o=>o.kind==='action'&&o.clock.player===2&&o.clock.step===3);
  assert.deepEqual([source.r,source.c],[cell.r,cell.c]);assert(branch.observations.some(o=>o.kind==='portalLink'));assert(branch.observations.some(o=>o.kind==='hit'));
  assert(branch.blocks.length);assert(branch.blocks.every(m=>m.status!=='impossible'));assert(branch.focus);
 }
 assert.equal(S.analyze(built.model.config,nodes,[]).length,0,'undo removes the overlay');
});
test('a hearing without a located source route keeps directional cells as pending rather than inventing a route',()=>{
 const config={...E.newState().config,mode:'CLASSIC'},nodes=[{id:'0:0',observations:[],anchors:[],birth:{r:4,c:4}},{id:'2:0',observations:[],anchors:[]}];
 const relation={a:0,b:2,aNode:'0:0',bNode:'2:0',round:1,step:3,direction:'右上',listener:{r:4,c:4}};
 const h=S.analyze(config,nodes,[relation])[0];assert.equal(h.initialCount,16);assert.equal(h.cells.length,16);
 assert(h.cells.every(c=>c.branches.every(b=>b.status==='unknown'&&b.focus===null&&b.blocks.every(m=>m.status==='unknown'))));
});
module.exports={fixture};
test('clicked-source patterns pin all conditional observations, mark the translated final stop and include wall providers',()=>{
 const f=fixture(),h=S.analyze(f.built.model.config,f.nodes,S.hearings(f.built))[0],branch=h.cells[0].branches[0],local=S.patterns(f.built.model.config,branch);
 const candidates=[...local.singles,...local.doubles,...local.triples,...local.expanded];assert(candidates.length>0);
 for(const c of candidates){
  assert.deepEqual(c.patternFocus,branch.focus);assert.deepEqual(c.birth,branch.birth);assert.deepEqual(c.observations,branch.conditionalObservations);
  assert(c.observations.every(o=>c.blocks.some(b=>L.inside(o,b,9))), 'combination covers both source and listener observations');
  assert.equal(c.verification,'verified');assert(c.blocks.some(b=>L.inside(branch.focus,b,9)));
  const full=c.blocks.map(b=>({...b,block:E.byId.get(b.id)}));assert.equal(L.dependency(f.built.model.config,c.observations,full),null,'required seam walls must be provided in the combination');
 }
 assert.strictEqual(S.patterns(f.built.model.config,branch),local,'repeat clicks reuse the conditioned result');
});
