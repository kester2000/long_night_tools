const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../team'),E=require('../engine');
const config={size:9},blocks=Array.from({length:9},(_,i)=>({id:String(i+1),origin:{r:Math.floor(i/3)*3,c:i%3*3}}));
const node=count=>({birth:{r:4,c:4},verification:{status:'verified',blocks:blocks.slice(0,count)},observations:[
 {kind:'pass',r:4,c:4,dir:3},{kind:'action',arrival:true,r:4,c:5},
 {kind:'action',arrival:false,r:0,c:0},{kind:'hit',r:4,c:5,dir:0},{kind:'walls',r:4,c:5,value:'空空空墙'}]});
test('only walked cells are exposed until at most two blocks remain unknown',()=>{
 const scope=T.mapScope(config,node(6));assert.equal(scope.full,false);assert.equal(scope.remaining,3);
 assert.deepEqual([...scope.visited].sort(),['4,4','4,5']);
 assert.equal(scope.exposed.size,54,'all six verified blocks are drawn completely');
 assert(scope.exposed.has('3,5'),'known terrain beyond a collision is visible without claiming it was visited');
 assert.deepEqual([...T.mapScope(config,{...node(6),routePending:true}).exposed].sort(),['4,4','4,5']);
 assert.deepEqual([...T.mapScope(config,{...node(6),verification:{status:'unknown',blocks}}).exposed].sort(),['4,4','4,5']);
 assert(!scope.visited.has('3,5'),'collision target was never entered');assert(!scope.visited.has('0,0'),'subspace directions do not visit ground cells');
 assert.equal(T.mapScope(config,node(7)).full,true);assert.equal(T.mapScope(config,node(8)).full,true);
 assert.equal(T.mapScope(config,{...node(9),routePending:true}).full,false);
 assert.equal(T.mapScope(config,{...node(9),verification:{status:'unknown',blocks}}).full,false);
});
test('unconfirmed route alternatives cannot be promoted to a certain walking map',()=>{
 const M=require('../messages'),H=require('../hypotheses'),L=require('../local'),j=require('./fixtures/garden-no-buttons.json');
 const b=M.build(j.base,j.messages),h=H.analyze(b.model.config,j.base,j.messages,0,1),original=L.nodes(b),c=H.constrainNodes(original,b.relations,[h]),n=c.nodes.find(n=>n.id==='0:0');
 assert(n.routePending);assert(n.routeAlternatives.some(a=>a.teleports.length));
 assert(!n.observations.some(o=>o.clock?.round===2&&o.clock.step>1));
 assert.equal(T.mapScope(config,{...n,verification:{status:'verified',blocks}}).full,false);
});
