const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../engine'),M=require('../messages'),j=require('./fixtures/pre-collision-portal.json');
function forbidden(b,player){return b.views[player].model.segments.flatMap(s=>E.replay(s,9).observations).filter(o=>o.kind==='nonPortalSound');}
test('real silent archive excludes portal entry on both steps preceding a collision',()=>{
 const b=M.build(j.base,M.liveMessages(j.messages)),zero=forbidden(b,0),one=forbidden(b,1);
 assert(zero.some(o=>o.clock.round===1&&o.clock.step===7));
 assert(zero.some(o=>o.clock.round===1&&o.clock.step===8));
 assert(!zero.some(o=>o.clock.round===1&&o.clock.step===6));
 for(const round of [1,2])assert(one.some(o=>o.clock.round===round&&o.clock.step===1));
 for(const o of one){
  const config=b.views[1].model.config,obs=E.replay(b.views[1].model.segments[0],9).observations;
  const matches=E.matchBlocks(config,obs,o).matches;assert(matches.length);
  assert(matches.every(m=>!m.cellTypes[m.lr*3+m.lc].includes('PORTAL')));
 }
});
test('silent collision lookahead crosses consecutive rounds but stops at unknown relocation',()=>{
 const build=(routes)=>M.build(E.newState(),['模式幻变\n玩家人数：2\n我是0号\n静音开启',...routes.map(r=>'[0号]玩家本回合的完整行动轨迹：\n'+r)].map((text,i)=>({id:String(i),text,view:0})));
 assert(forbidden(build(['→','↑(↑撞)']),0).some(o=>o.clock.round===1&&o.clock.step===1));
 assert(!forbidden(build(['→↑↑(↑撞)']),0).some(o=>o.clock.step===1));
 assert(!forbidden(build(['→[传送]','↑(↑撞)']),0).some(o=>o.clock.round===1));
 assert(!forbidden(build(['→[隐匿]↑(↑撞)']),0).some(o=>o.clock.step===1));
});
