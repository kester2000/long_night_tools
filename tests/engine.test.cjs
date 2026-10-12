const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../engine.js'),D=require('../blocks.js');
const config=(overrides={})=>({...E.newState().config,mode:'CLASSIC',...overrides});
test('mode pools isolate candidates and cached wall metadata across mode and custom-pool changes',()=>{
  for(const [mode,ids] of Object.entries(D.modes)){
    const c=config({mode}),matches=E.matchBlocks(c,[],{r:4,c:4},true).matches;
    assert.deepEqual(matches.map(m=>m.id),ids);
    const external=E.V.map((_,d)=>[...new Set([0,...E.pool(c).flatMap(b=>b.cells.filter((_,i)=>d===0?Math.floor(i/3)===2:d===1?Math.floor(i/3)===0:d===2?i%3===2:i%3===0).map(cell=>cell.walls[E.OPP[d]]))])]);
    for(const m of matches)for(let d=0;d<4;d++)assert.deepEqual(m.wallOptions[d],E.possibleWalls(m.block,0,d,c,external));
  }
  const c=config({mode:'CRAZY'});assert(E.pool(c).some(b=>b.id==='S1'));
  c.mode='CLASSIC';assert(!E.matchBlocks(c,[],{r:4,c:4}).matches.some(m=>m.id.startsWith('S')));
  c.pool='1 E1';assert.deepEqual(E.matchBlocks(c,[],{r:4,c:4},true).matches.map(m=>m.id),['1','E1']);
  E.pool(c).pop();const m=E.matchBlocks(c,[],{r:4,c:4},true).matches[0];m.wallOptions[0].push(999);m.origin.r=99;
  const again=E.matchBlocks(c,[],{r:4,c:4},true).matches[0];assert(!again.wallOptions[0].includes(999));assert.equal(again.origin.r,4);assert.equal(E.pool(c).length,2);
  c.pool='';assert.equal(E.pool(c).length,16);
});
test('complete map support removes a candidate that fails a joint seam and preserves unchecked possibilities',()=>{
 const slots=Array.from({length:9},(_,i)=>({r:Math.floor(i/3)*3,c:i%3*3}));
 const make=(id,origin)=>({id,origin,block:{cells:Array.from({length:9},()=>({type:'EMPTY',attach:'EMPTY',walls:[0,0,0,0]}))}});
 const domains=slots.map((o,i)=>[make('A'+i,o)]),bad=make('bad',slots[0]);bad.block.cells[2].walls[3]=1;domains[0].unshift(bad);
 const solution={irregular:false,phases:[{pr:0,pc:0,slots,domains}]},obs=[{kind:'pass',r:0,c:2,dir:3}];
 const refined=E.refineCompleteLayout(config({exitCount:0}),solution,obs);
 assert.deepEqual(refined.phases[0].domains[0].map(b=>b.id),['A0']);assert.equal(refined.completeChecks.removed,1);
 assert.equal(solution.phases[0].domains[0].length,2);
 assert.equal(E.refineCompleteLayout(config({exitCount:0}),solution,obs,0).phases[0].domains[0].length,2);
 assert.equal(E.certifyBlocks(config({exitCount:0}),refined,obs).blocks.length,9);
});
test('display alignment changes only when the block grid has a unique phase',()=>{
 assert.deepEqual(E.displayOffset({phases:[{pr:2,pc:1}]}),{r:2,c:1,aligned:true});
 assert.equal(E.displayOffset({phases:[{pr:2,pc:1},{pr:0,pc:1}]}).aligned,false);
 assert.equal(E.displayOffset({irregular:true,phases:[{pr:2,pc:1}]}).aligned,false);
});
test('full-layout verification accepts a top neighbour providing a collision wall and fails safely on budget',()=>{
 const slots=Array.from({length:9},(_,i)=>({r:Math.floor(i/3)*3,c:i%3*3})),domains=slots.map((origin,i)=>[{id:'A'+i,origin,block:{cells:Array.from({length:9},()=>({type:'EMPTY',attach:'EMPTY',walls:[0,0,0,0]}))}}]);
 domains[0][0].block.cells[8].walls[1]=1;const solution={irregular:false,phases:[{pr:0,pc:0,slots,domains}]},observations=[{kind:'hit',r:3,c:2,dir:0,last:-1}];
 const result=E.verifyCompleteLayout(config({exitCount:0}),solution,observations);assert.equal(result.status,'verified');assert.equal(result.layout.length,9);
 const limited=E.verifyCompleteLayout(config({exitCount:0}),solution,observations,1);assert.equal(limited.status,'unknown');assert.deepEqual(limited.blocks,[]);
 domains[0][0].block.cells[8].walls[1]=0;assert.equal(E.verifyCompleteLayout(config({exitCount:0}),solution,observations).status,'impossible');
});
test('player one left block 3 survives full layout verification and alternatives cannot satisfy its internal collision',()=>{
 const M=require('../messages'),texts=['模式经典\n玩家人数：4\n我是0号','[1号]玩家本回合的完整行动轨迹：\n←(↓撞)','[1号]玩家本回合的完整行动轨迹：\n↑(↑撞)','[1号]玩家本回合的完整行动轨迹：\n↓→↓×5→→↓↓←↑(逃生)'];
 const v=M.build(E.newState(),texts.map((text,i)=>({id:String(i),text,view:0}))).views[1],r=E.replay(v.model.segments[0],9),s=E.solveMap(v.model.config,r.observations),proof=E.verifyCompleteLayout(v.model.config,s,r.observations);
 assert.equal(proof.status,'verified');assert(proof.blocks.some(b=>b.id==='3'&&b.origin.r===3&&b.origin.c===1));assert.equal(new Set(proof.layout.map(b=>b.id)).size,9);assert.equal(proof.layout.filter(b=>b.id.startsWith('E')).length,v.model.config.exitCount);
 for(const b of E.pool(v.model.config).filter(b=>b.id!=='3'))assert.equal(E.solveMap(v.model.config,r.observations,[{id:b.id,r:3,c:1}]).phases.length,0,b.id);
});
test('player two uniquely determined water corridor projects all nine tiles and internal walls',()=>{
 const M=require('../messages'),texts=['模式经典\n玩家人数：4\n我是0号','[2号]玩家本回合的完整行动轨迹：\n↑[↓啪嗒]↑(→撞)','[2号]玩家本回合的完整行动轨迹：\n[↑啪嗒](→撞)'];
 const v=M.build(E.newState(),texts.map((text,i)=>({id:String(i),text,view:0}))).views[2],r=E.replay(v.model.segments[0],9),s=E.solveMap(v.model.config,r.observations);
 assert.deepEqual(E.determinedBlocks(s),[{id:'1',origin:{r:2,c:2}}]);const terrain=E.inferredTerrain(s,9),walls=E.inferredWalls(v.model.config,s),b=E.byId.get('1');
 for(let i=0;i<9;i++)assert.equal(terrain.get(E.key(2+Math.floor(i/3),2+i%3)),b.cells[i].type);
 for(let d=0;d<4;d++)assert.equal(walls.get('3,3:'+d),'墙');
 assert.deepEqual(E.determinedBlocks(E.solveMap(config(),[])),[]);
});
test('quiet arrival removes mandatory sound terrain but retains traps with a silent state',()=>{
 for(const event of ['NONE','RAINSTORY'])for(const type of ['WATER','PORTAL','GRASS','BERRY','TRAP']){
  const b=D.blocks.find(b=>b.cells.some(c=>c.type===type)),i=b.cells.findIndex(c=>c.type===type),o={kind:'quiet',r:3+Math.floor(i/3),c:3+i%3};
  const c=config({mode:'WILD',pool:b.id,event});assert.equal(E.matchBlocks(c,[],{r:3,c:3},true).matches.length,1);
  assert.equal(E.matchBlocks(c,[o],{r:3,c:3},true).matches.length,type==='TRAP'?1:0,`${event}:${type}`);
 }
});
test('spawn distance uses wrapped walking BFS, with five allowed and short paths marked fallback',()=>{
 const make=(id,c)=>({id,origin:{r:0,c},block:{cells:Array.from({length:9},()=>({type:'EMPTY',attach:'EMPTY',walls:[0,0,0,0]}))}});
 const a=make('A',0),b=make('B',3);b.block.cells[4].type='EXIT';
 let result=E.spawnCheck(config(),[a,b],{r:0,c:0});assert.equal(result.exitDistance,5);assert.equal(result.fallback,false);
 result=E.spawnCheck(config(),[a,b],{r:1,c:0});assert.equal(result.exitDistance,4);assert.equal(result.fallback,true);
 result=E.spawnCheck(config(),[a,b],{r:0,c:3});assert(result.inExitBlock);assert(result.fallback);
 const wrap=make('C',6);wrap.block.cells[2].type='EXIT';assert.equal(E.spawnCheck(config(),[a,wrap],{r:0,c:0}).exitDistance,1);
 a.block.cells[0].walls[2]=2;assert.equal(E.spawnCheck(config(),[a,wrap],{r:0,c:0}).exitDistance,3);
 a.block.cells[0].walls[2]=0;wrap.block.cells[2].attach='BOX';assert.equal(E.spawnCheck(config(),[a,wrap],{r:0,c:0}).exitDistance,null);
});
test('player two papa followed by collision excludes unsealed portal blocks and infers water',()=>{
 const M=require('../messages'),messages=['模式经典\n玩家人数：4\n我是0号','[2号]玩家本回合的完整行动轨迹：\n↑[↓啪嗒]↑(→撞)'].map((text,i)=>({id:String(i),text,view:0}));
 const v=M.build(E.newState(),messages).views[2],r=E.replay(v.model.segments[0],9),c=v.model.config;
 const matches=E.matchBlocks(c,r.observations,{r:4,c:4}).matches;assert(matches.length);
 assert(matches.every(m=>{const i=E.mod(4-m.origin.r,9)*3+E.mod(4-m.origin.c,9);return m.cellTypes[i].length===1&&m.cellTypes[i][0]==='WATER';}));
 assert.equal(E.inferredTerrain(E.solveMap(c,r.observations),9).get('4,4'),'WATER');
});
test('extracts every source block and validates paired portals',()=>{
  assert.equal(D.blocks.length,71);assert.equal(new Set(D.blocks.map(b=>b.id)).size,71);
  for(const b of D.blocks){
    assert.equal(b.cells.length,9);
    b.cells.forEach((c,i)=>{
      assert.equal(c.walls.length,4);assert(c.walls.every(w=>Number.isInteger(w)&&w>=0&&w<=4));
      if(c.portal){const j=(Math.floor(i/3)+c.portal[0])*3+i%3+c.portal[1];assert.equal(b.cells[j].type,'PORTAL',`${b.id}:${i}`);assert.deepEqual(b.cells[j].portal,c.portal.map(n=>-n).map(n=>n||0));}
    });
  }
});
test('direction and wall parsers fail on malformed input',()=>{
  assert.deepEqual(E.parseDirections('上D z→'),[0,1,2,3]);assert.equal(E.parseWalls('空，墙，？，空'),'空墙?空');
  assert.throws(()=>E.parseDirections('R2'));assert.throws(()=>E.parseWalls('上下左右'));
});
test('relative movement wraps; collision and subspace do not move',()=>{
  const s={events:[...Array.from({length:5},()=>({kind:'move',dir:0,outcome:'move'})),{kind:'move',dir:1,outcome:'hit',walls:'空墙空空'},{kind:'move',dir:3,outcome:'space',walls:'空空空空'}]};
  const r=E.replay(s,9);assert.equal(r.r,8);assert.equal(r.c,4);assert.equal(r.observations.filter(o=>o.kind==='pass').length,5);assert.equal(r.observations.filter(o=>o.kind==='walls').length,1);
});
test('turn breaks hedge sprint chain; confirmed teleport keeps movement direction',()=>{
  const s={events:[{kind:'move',dir:3,outcome:'move'},{kind:'turn'},{kind:'move',dir:3,outcome:'move'},{kind:'teleport',dr:2,dc:-2},{kind:'move',dir:3,outcome:'move'}]};
  const r=E.replay(s,9);assert.deepEqual(r.observations.map(o=>o.last),[-1,-1,3]);assert.equal(r.r,6);assert.equal(r.c,5);
});
test('sound direction uses wrap and permits both half-board directions',()=>{
  assert.deepEqual(E.bearings({r:0,c:8},{r:0,c:0},9),['正左']);
  assert.deepEqual(new Set(E.bearings({r:5,c:5},{r:0,c:0},10)),new Set(['右下','右上','左下','左上']));
  assert.deepEqual(new Set(E.bearings({r:6,c:0},{r:0,c:0},12)),new Set(['正下','正上']));
  assert.deepEqual(E.bearings({r:3,c:3},{r:3,c:3},9),['同格']);
});
test('first sound, jammer and concealment do not invent negative location evidence',()=>{
  const sounds=['首次','被屏蔽','隐匿','静音','心跳掩盖','未知'].map(direction=>({kind:'hear',source:'A',listener:{r:4,c:4},direction}));
  assert.equal(E.locate(sounds,'A',9).cells.length,81);
});
test('source location obeys event order, movement, conflicts and reset',()=>{
  const events=[{kind:'hear',source:'A',listener:{r:4,c:4},direction:'同格'},{kind:'move',source:'A',dir:0,outcome:'move'},{kind:'hear',source:'A',listener:{r:4,c:4},direction:'正上'}];
  assert.deepEqual(E.locate(events,'A',9).cells,[{r:3,c:4}]);
  events.push({kind:'hear',source:'A',listener:{r:4,c:4},direction:'正下'});assert.equal(E.locate(events,'A',9).cells.length,0);
  events.push({kind:'reset',source:'A'});assert.equal(E.locate(events,'A',9).cells.length,81);
});
test('all random-event variants follow actual code choices',()=>{
  const block=E.byId.get('2'),lazy=E.variants(block,'LAZYGARDENER');
  assert.equal(lazy.length,7);assert(lazy.every(v=>v.filter(t=>t==='GRASS').length===1));assert(lazy.some(v=>v[4]==='GRASS'));
  const growth=E.variants(block,'OVERGROWTH');assert.equal(growth.length,4);assert(growth.every(v=>v.filter(t=>t==='GRASS').length===2));
  assert.equal(E.variants(block,'RAINSTORY')[0][4],'WATER');
  assert.deepEqual(E.soundTypes('TRAP','NONE'),['NONE','SHASHA']);assert.deepEqual(E.soundTypes('BERRY','RAINSTORY'),['PAPA']);
});
test('boundary wall uses max priority; dynamic doors and hedges report correctly',()=>{
  assert.equal(E.wallFeedback(2),'空');assert.equal(E.wallFeedback(3),'墙');assert.equal(E.wallFeedback(4),'空');
  const block=E.clone(E.byId.get('1'));block.cells[0].walls[0]=1;
  const ext=[[0,2],[0],[0],[0]];
  assert.deepEqual(E.possibleWalls(block,0,0,config(),ext),[1,2]);
  block.cells[0].walls[0]=3;assert.deepEqual(E.possibleWalls(block,0,0,config(),ext),[3,4]);
});
test('same cell contradictory static walls removes all classic candidates',()=>{
  const observations=[{kind:'walls',r:4,c:4,value:'墙???'},{kind:'walls',r:4,c:4,value:'空???'}];
  assert.equal(E.matchBlocks(config(),observations,{r:4,c:4}).matches.length,0);
});
test('10x10 retains a gap and explicitly disables regular tiling',()=>{
  assert(E.solveMap(config({size:10}),[]).irregular);
  assert(E.matchBlocks(config({size:10}),[],{r:4,c:4}).gap);
  assert(!E.matchBlocks(config({size:10}),[{r:4,c:4,kind:'sound',value:'PAPA'}],{r:4,c:4}).gap);
});
test('all-different matching detects non-singleton shortages',()=>{
  const d=()=>[{id:'1'},{id:'2'}];assert(!E.hasDistinctAssignment([d(),d(),d()]));assert(E.hasDistinctAssignment([d(),d(),[{id:'3'}]]));
});
test('global solver checks repeated anchors, exit counts, and all nine alignments',()=>{
  const all=E.solveMap(config(),[]);assert.equal(all.phases.length,9);
  assert.equal(E.solveMap(config(),[],[{id:'1',r:0,c:0},{id:'1',r:3,c:0}]).phases.length,0);
  assert.equal(E.solveMap(config({exitCount:5}),[]).phases.length,0);
  assert.equal(E.solveMap(config(),[],[{id:'2',r:3,c:3}]).phases.length,1);
});
test('generated real maps survive global reasoning including toroidal seams',()=>{
  // Independent fixture builder mirrors Board::FixAdjacentWalls; no solver helpers for merging.
  for(const size of [9,12])for(const phase of [[0,0],[1,2],[2,1]]){
    const k=size/3,blocks=D.modes.CLASSIC.slice(0,k*k).map(id=>E.byId.get(id));
    const grid=Array(size*size);
    blocks.forEach((block,s)=>block.cells.forEach((cell,i)=>{
      const r=(phase[0]+Math.floor(s/k)*3+Math.floor(i/3))%size,c=(phase[1]+(s%k)*3+i%3)%size;
      grid[r*size+c]=E.clone(cell);
    }));
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)for(let d=0;d<4;d++){
      const rr=(r+E.V[d][0]+size)%size,cc=(c+E.V[d][1]+size)%size;
      const value=Math.max(grid[r*size+c].walls[d],grid[rr*size+cc].walls[E.OPP[d]]);
      grid[r*size+c].walls[d]=value;grid[rr*size+cc].walls[E.OPP[d]]=value;
    }
    const observations=[];
    for(let i=0;i<size*size;i+=4){const cell=grid[i];observations.push({kind:'walls',r:Math.floor(i/size),c:i%size,value:cell.walls.map(w=>w===1||w===3?'墙':'空').join('')},{kind:'terrain',r:Math.floor(i/size),c:i%size,value:cell.type});}
    const solution=E.solveMap(config({size,dynamicDoors:false,exitCount:blocks.filter(b=>b.id.startsWith('E')).length}),observations);
    const actual=solution.phases.find(p=>p.pr===phase[0]&&p.pc===phase[1]);assert(actual,`lost true phase ${size} ${phase}`);
    actual.domains.forEach((domain,i)=>assert(domain.some(m=>m.id===blocks[i].id),`lost true block ${size} ${i}`));
  }
});
test('saved data is validated before replacement; imported names remain plain data',()=>{
  const s=E.newState();s.players[0].name='<script>bad()</script>';assert.deepEqual(E.validateState(s),s);
  const invalid=E.clone(s);invalid.segments[0].events.push({kind:'move',dir:6,outcome:'move'});assert.throws(()=>E.validateState(invalid));
  const malformed=E.clone(s);malformed.segments[0].sounds.push({kind:'hear',source:'A',listener:{r:1,c:1},direction:'north'});assert.throws(()=>E.validateState(malformed));
});
test('hunting targets use surviving order in both directions',()=>{
  const players=[{alive:true},{alive:false},{alive:true},{alive:true}];assert.deepEqual(E.targets(players,'PREVIOUS'),[3,null,0,2]);assert.deepEqual(E.targets(players,'NEXT'),[2,null,3,0]);
});
