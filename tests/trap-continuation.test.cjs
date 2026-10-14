const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),L=require('../local');
const pool='2 4 8 9 12 13 14 45 46 47 48 49 E1 E4 E7 E8';
function build(route,extra=''){
 const messages=['玩家人数：3','模式幻变',`区块池：${pool}`,extra,`[1号]玩家本回合的完整行动轨迹：\n${route}`].filter(Boolean).map((text,i)=>({id:String(i),text,view:0}));
 const v=M.build(E.newState(),messages).views[1];
 return {config:v.model.config,replay:E.replay(v.model.segments[0],9)};
}
function garden(config,observations){return E.matchBlocks(config,observations,{r:4,c:4},true).matches.some(m=>m.id==='49');}

test('latest Edge route excludes the single garden block because its silent trap would stop step two',()=>{
 const {config,replay:r}=build('↓→↓(→撞)');
 assert(garden(config,r.observations.filter(o=>o.kind!=='quiet')));
 assert.equal(garden(config,r.observations),false);
 const solution=E.solveMap(config,r.observations),local=L.analyze(config,{observations:r.observations,focus:r},solution);
 assert.equal(local.singles.length,0);
});

test('a collision after a silent trap is still an impossible continuation',()=>{
 const {config,replay:r}=build('↓→(→撞)');
 assert(r.observations.some(o=>o.kind==='quiet'&&o.clock.step===2&&o.continues));
 assert.equal(garden(config,r.observations),false);
});

test('terminal silent trap and audible pass-through remain possible',()=>{
 for(const route of ['↓→','↓[→沙沙]↓(→撞)']){
  const {config,replay:r}=build(route);assert(garden(config,r.observations),route);
 }
});

test('silent mode and heartbeat masking do not become negative sound evidence',()=>{
 for(const [route,extra] of [['↓→↓(→撞)','静音开启'],['↓←→→↓(→撞)','本局有心脏']]){
  const {config,replay:r}=build(route,extra);assert(garden(config,r.observations),extra);
 }
});

test('the next round does not count as continuation of a silent trap arrival',()=>{
 const clock=(round,step)=>({round,player:1,step});
 for(const boundary of [[],[{kind:'turn',clock:clock(1,1000000)}]]){
  const r=E.replay({events:[{kind:'move',dir:3,outcome:'move',quiet:true,clock:clock(1,1)},...boundary,{kind:'move',dir:1,outcome:'hit',clock:clock(2,1)}]},9);
  assert.equal(r.observations.find(o=>o.kind==='quiet').continues,false);
 }
});
