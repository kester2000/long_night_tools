const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../engine'),M=require('../messages'),H=require('../hypotheses'),T=require('../team'),L=require('../local'),R=require('../route-explanations');
const j=require('./fixtures/player-zero-candidates.json');
test('archive 13 exposes a primary player-zero block map even without a portal hypothesis',()=>{
 let choices={},b,h;
 for(let i=0;i<4;i++){b=M.build(j.base,j.messages,choices);h=H.analyze(b.model.config,j.base,j.messages,0,b.self,null,choices[0]||{});const next=H.choiceUpdates(h?[h]:[],choices);if(!next)break;choices=next;}
 assert(!h,'resolved ground choices no longer produce a portal hypothesis');
 const config={...b.model.config,routePresentation:true};
 const local=T.solve(config,L.nodes(b).filter(n=>n.player===0),[]),node=local.nodes[0];node.routeExplanation=R.forNode(config,node);
 const display=R.displayExamples(node);assert(display);assert.equal(display.player,0);assert.equal(display.segment,0);
 assert.equal(display.walkingExamples.length,1);assert.equal(display.walkingExamples[0].blocks.length,9);assert(display.otherWalkingExamples.length>0);
 assert.equal(display.candidateCount,node.routeExplanation.cases.filter(c=>c.status==='verified').length);
 const e=display.walkingExamples[0],anchors=e.blocks.map(m=>({id:m.id,r:m.origin.r,c:m.origin.c}));
 assert.equal(E.verifyCompleteLayout({...config,births:[{player:0,r:4,c:4}]},E.solveMap(config,e.observations,anchors),e.observations,3000).status,'verified');
 const source=fs.readFileSync(require.resolve('../chat.js'),'utf8');
 assert(source.includes('LongNightRouteExplanations.displayExamples(node)'));
 assert(source.includes('<details class="other-route-examples"><summary>展开其他可能</summary>'),'alternatives stay collapsed');
});
test('unknown proofs and portal routes do not become a verified no-portal primary map',()=>{
 const sample={exampleLayout:[{}],steps:[],observations:[],focus:{r:1,c:1}};
 assert.equal(R.displayExamples({routeExplanation:{cases:[{...sample,status:'unknown'}]}}),null);
 assert.equal(R.displayExamples({routeExplanation:{cases:[{...sample,status:'verified',steps:[{teleport:true}]}]}}),null);
});
