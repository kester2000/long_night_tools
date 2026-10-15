const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine');
test('confirmed internal hedge remains a hedge on both sides, not a generic wall',()=>{
 const config={...E.newState().config,mode:'CRAZY'},origin={r:3,c:3},known=[{id:'47',origin}];
 const solution=E.solveMap(config,[],[{id:'47',...origin}]),kinds=E.inferredWallKinds(config,solution,known);
 const hedges=[...kinds].filter(([,values])=>values.length===1&&values[0]===2);
 assert(hedges.length>0);
 for(const [key,values] of hedges){const [r,c,d]=key.split(/[,:]/).map(Number);assert.deepEqual(kinds.get(E.key(E.mod(r+E.V[d][0],9),E.mod(c+E.V[d][1],9))+':'+E.OPP[d]),values);}
 assert.equal(E.inferredWallKinds(config,solution,[]).size,0);
});
test('uncertain neighbour contributions do not turn a possible hedge into a confirmed hedge',()=>{
 const config={...E.newState().config,mode:'CRAZY'},origin={r:0,c:0},known=[{id:'47',origin}],solution=E.solveMap(config,[],[{id:'47',...origin}]);
 const kinds=E.inferredWallKinds(config,solution,known);
 assert([...kinds.values()].some(values=>values.length>1),'seams retain alternatives');
 const boundary=kinds.get('0,0:0');assert(boundary.length>1);assert.deepEqual(kinds.get('8,0:1'),boundary);
});
