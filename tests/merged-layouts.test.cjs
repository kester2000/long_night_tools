const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine.js'),T=require('../team.js');
const config={...E.newState().config,mode:'CLASSIC',size:9,exitCount:0};
function fixture(){
 const slots=Array.from({length:9},(_,i)=>({r:Math.floor(i/3)*3,c:i%3*3}));
 const candidate=(id,origin)=>({id,origin,block:E.byId.get(id)});
 const domains=slots.map((origin,i)=>(i<2?['1','2']:[String(i+1)]).map(id=>candidate(id,origin)));
 return {phases:[{pr:0,pc:0,slots,domains}]};
}
test('complete layout enumeration lists every valid assignment without duplicate blocks',()=>{
 const result=E.verifyCompleteLayout(config,fixture(),[],5000,{limit:8});
 assert.equal(result.complete,true);assert.equal(result.layouts.length,2);
 assert(result.layouts.every(layout=>new Set(layout.map(b=>b.id)).size===9));
 assert.notEqual(result.layouts[0][0].id,result.layouts[1][0].id);
});
test('enumeration distinguishes overflow, unfinished search and impossible maps',()=>{
 const overflow=E.verifyCompleteLayout(config,fixture(),[],5000,{limit:1});
 assert.equal(overflow.overflow,true);assert.equal(overflow.complete,false);assert.equal(overflow.layouts.length,1);
 const pending=E.verifyCompleteLayout(config,fixture(),[],1,{limit:8});
 assert.equal(pending.complete,false);assert.equal(pending.status,'unknown');
 const impossible=E.verifyCompleteLayout({...config,exitCount:1},fixture(),[],5000,{limit:8});
 assert.equal(impossible.complete,true);assert.equal(impossible.layouts.length,0);
});
test('a connected verified subgroup merges even when another player is unaligned',()=>{
 const nodes=['0:0','1:0','2:0'].map(id=>({id,verification:{status:'verified'},joined:[{id}]}));
 nodes[0].joined.push({id:'1:0'});nodes[1].joined.push({id:'0:0'});
 assert.deepEqual(T.viewGroups({nodes},nodes.map(n=>n.id)),[['0:0','1:0'],['2:0']]);
 nodes[1].verification.status='unknown';
 assert.equal(T.viewGroups({nodes},nodes.map(n=>n.id)).length,3);
 nodes[1].verification.status='verified';
 assert.equal(T.viewGroups({nodes,conflict:true},nodes.map(n=>n.id)).length,3);
});
