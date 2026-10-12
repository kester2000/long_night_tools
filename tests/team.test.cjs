const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),M=require('../messages.js'),T=require('../team.js');
const msg=(text,view=0)=>({text,view});
const config={...E.newState().config,mode:'CLASSIC'};
const node=(id,anchors=[],observations=[])=>({id,player:+id.split(':')[0],segment:0,anchors,observations});
test('player count creates all perspectives, including empty players',()=>{
 const b=M.build(E.newState(),[msg('玩家人数：6')]);assert.equal(b.count,6);assert.equal(b.views.length,6);assert.throws(()=>M.parse('人数9'));
});
test('private wall messages belong only to their selected receiver',()=>{
 const b=M.build(E.newState(),[msg('【开局】墙空空墙',0),msg('【开局】空墙墙空',1)]);
 assert.equal(E.replay(b.views[0].model.segments[0],9).observations[0].value,'墙空空墙');
 assert.equal(E.replay(b.views[1].model.segments[0],9).observations[0].value,'空墙墙空');
 assert.equal(E.replay(b.views[2].model.segments[0],9).observations.length,0);
});
test('public routes automatically populate their owner perspective',()=>{
 const b=M.build(E.newState(),[msg('[2号]玩家本回合的完整行动轨迹：\n↑→',0)]);
 const r=E.replay(b.views[2].model.segments[0],9);assert.equal(r.r,3);assert.equal(r.c,5);assert.equal(E.replay(b.views[0].model.segments[0],9).r,4);
});
test('private bearing associates source step and both independent frames',()=>{
 const b=M.build(E.newState(),[msg('【第 1 回合】\n[1号(第2步)]你听见了来自【正上方】的沙沙声！',2),msg('【第 1 回合】\n[1号]玩家本回合的完整行动轨迹：\n→↑')]);
 assert.equal(b.relations.length,1);const h=b.relations[0];assert.equal(h.aNode,'2:0');assert.equal(h.bNode,'1:0');assert.deepEqual(h.source,{r:3,c:5});
});
test('empty four-player game retains all 81 translations in all six pairs',()=>{
 const r=T.solve(config,[node('0:0'),node('1:0'),node('2:0'),node('3:0')]);assert.equal(r.pairs.length,6);assert(r.pairs.every(p=>p.offsets.length===81));assert(r.nodes.every(n=>n.joined.length===1));
});
test('a known common unique block aligns maps across the torus',()=>{
 const r=T.solve(config,[node('0:0',[{id:'1',r:0,c:0}]),node('1:0',[{id:'1',r:6,c:3}])]);assert.deepEqual(r.pairs[0].offsets,[{dr:3,dc:6}]);assert.equal(r.nodes[0].joined.length,2);
});
test('bearing filters relative translation, including wraparound',()=>{
 const r=T.solve(config,[node('0:0'),node('1:0')],[{aNode:'0:0',bNode:'1:0',listener:{r:4,c:4},source:{r:4,c:4},direction:'正上'}]);
 assert.equal(r.pairs[0].offsets.length,4);assert(r.pairs[0].offsets.every(o=>o.dc===0&&[5,6,7,8].includes(o.dr)));
});
test('undo drops another player map and all related evidence when rebuilt',()=>{
 const messages=[msg('[1号]玩家本回合的完整行动轨迹：\n↑'),msg('空墙空空',1)];const before=M.build(E.newState(),messages),after=M.build(E.newState(),messages.slice(0,1));
 assert(E.replay(before.views[1].model.segments[0],9).observations.some(o=>o.kind==='walls'));assert(!E.replay(after.views[1].model.segments[0],9).observations.some(o=>o.kind==='walls'));
});
test('three perspectives propagate consistent translations through the third map',()=>{
 const r=T.solve(config,[node('0:0'),node('1:0'),node('2:0')],[
  {aNode:'0:0',bNode:'1:0',listener:{r:4,c:4},source:{r:1,c:2},direction:'同格'},
  {aNode:'1:0',bNode:'2:0',listener:{r:4,c:4},source:{r:2,c:3},direction:'同格'}
 ]);assert.deepEqual(r.pairs.find(p=>p.a==='0:0'&&p.b==='2:0').offsets,[{dr:5,dc:3}]);assert(r.nodes.every(n=>n.joined.length===3));
});
test('legacy map remains only in its owning perspective',()=>{
 const base=E.newState();base.segments[0].events.push({kind:'move',dir:0,outcome:'move'});const b=M.build(base,[]);
 assert.equal(E.replay(b.views[0].model.segments[0],9).r,3);assert.equal(E.replay(b.views[1].model.segments[0],9).r,4);
});
test('size changes cannot split players into incompatible board sizes',()=>{
 const b=M.build(E.newState(),[msg('[1号]玩家本回合的完整行动轨迹：\n↑'),msg('边长12')]);assert(b.views.every(v=>v.model.config.size===9));
});
test('invalid player headers fail before creating perspective arrays',()=>{
 assert.throws(()=>M.parse('[99号]玩家本回合的完整行动轨迹：\n↑'));
});
test('real map evidence survives translation and pairwise checks',()=>{
 const D=require('../blocks.js'),n=9,blocks=D.modes.CLASSIC.slice(0,9).map(id=>E.byId.get(id)),grid=Array(n*n);
 blocks.forEach((b,s)=>b.cells.forEach((cell,i)=>{grid[(Math.floor(s/3)*3+Math.floor(i/3))*n+(s%3)*3+i%3]=E.clone(cell);}));
 for(let r=0;r<n;r++)for(let c=0;c<n;c++)for(let d=0;d<4;d++){
  const rr=(r+E.V[d][0]+n)%n,cc=(c+E.V[d][1]+n)%n,w=Math.max(grid[r*n+c].walls[d],grid[rr*n+cc].walls[E.OPP[d]]);
  grid[r*n+c].walls[d]=w;grid[rr*n+cc].walls[E.OPP[d]]=w;
 }
 const observations=grid.flatMap((cell,i)=>i%5?[]:[{kind:'walls',r:Math.floor(i/n),c:i%n,value:cell.walls.map(w=>w===1||w===3?'墙':'空').join('')},{kind:'terrain',r:Math.floor(i/n),c:i%n,value:cell.type}]);
 const a=observations.filter((_,i)=>i%4<2),b=observations.filter((_,i)=>i%4>=2).map(o=>T.shift(o,-2,-5,n));
 const r=T.solve({...config,dynamicDoors:false,exitCount:0},[node('0:0',[],a),node('1:0',[],b)]);
 assert(r.pairs[0].offsets.some(o=>o.dr===2&&o.dc===5),'lost actual relative map translation');
});
