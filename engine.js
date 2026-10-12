(function(root){
  'use strict';
  const D = typeof module !== 'undefined' ? require('./blocks.js') : root.LongNightData;
  const Timeline=typeof module!=='undefined'?require('./timeline.js'):root.LongNightTimeline;
  const DIRS = ['上','下','左','右'], V = [[-1,0],[1,0],[0,-1],[0,1]], OPP = [1,0,3,2];
  const TYPES = {EMPTY:'道路',GRASS:'树丛',WATER:'水洼',PORTAL:'传送门',ONEWAYPORTAL:'传送门出口',EXIT:'逃生舱',TRAP:'陷阱',HEAT:'热源',BERRY:'浆果丛',HEART:'巨大的心脏'};
  const ATTACH = {EMPTY:'无附着',BUTTON:'按钮',BOX:'箱子',HEATBOX:'小太阳',JAMMERBOX:'屏蔽器',COIN:'金币',BOMB:'炸弹'};
  const mod = (x,n)=>(x%n+n)%n, key=(r,c)=>`${r},${c}`;
  const clone = x=>JSON.parse(JSON.stringify(x));
  const byId = new Map(D.blocks.map(b=>[b.id,b]));
  function parseWalls(text){
    const s = (text||'').replace(/[\s，,、/|]/g,'').replace(/[？*]/g,'?');
    if (!s) return '';
    if (!/^[墙空?]{4}$/.test(s)) throw new Error('墙壁请按上、下、左、右输入四个字，例如「墙空空墙」；未知填 ?。');
    return s;
  }
  function parseDirections(text){
    const aliases = {'上':0,'U':0,'s':0,'↑':0,'下':1,'D':1,'x':1,'↓':1,'左':2,'L':2,'z':2,'←':2,'右':3,'R':3,'y':3,'→':3};
    const chars = [...text.replace(/\s/g,'')];
    if (!chars.length || chars.some(c=>aliases[c]===undefined)) throw new Error('移动仅支持 上下左右、UDLR、sxzy 或方向箭头。');
    if(chars.length>200) throw new Error('一次最多录入 200 步。');
    return chars.map(c=>aliases[c]);
  }
  const poolCache=new Map(),poolMetadata=new WeakMap();
  const poolKey=config=>((config.pool||'').trim()?'custom:'+config.pool.trim().toUpperCase():'mode:'+config.mode)+':heart='+config.heartPresence;
  function pool(config){
    const custom=(config.pool||'').trim(),cacheKey=poolKey(config);
    if(poolCache.has(cacheKey))return poolCache.get(cacheKey).slice();
    let ids = custom ? custom.toUpperCase().split(/[\s,，、]+/).filter(Boolean) : D.modes[config.mode];
    if(!ids?.length) throw new Error('请选择区块池。');
    const bad = ids.filter(id=>!byId.has(id));
    if(bad.length) throw new Error(`不存在的区块编号：${bad.join('、')}`);
    const blocks=[...new Set(ids)].map(id=>byId.get(id)).filter(b=>config.heartPresence!==false||!b.cells.some(c=>c.type==='HEART'));
    // A bounded cache also handles repeatedly edited public/custom pools.
    if(poolCache.size>=64)poolCache.delete(poolCache.keys().next().value);
    poolCache.set(cacheKey,blocks);return blocks.slice();
  }
  function preparedPool(config){
    const cacheKey=poolKey(config);
    pool(config);const blocks=poolCache.get(cacheKey);
    if(!poolMetadata.has(blocks)){
      const external=V.map((_,d)=>[...new Set([0,...blocks.flatMap(b=>b.cells.filter((c,i)=>d===0?Math.floor(i/3)===2:d===1?Math.floor(i/3)===0:d===2?i%3===2:i%3===0).map(c=>c.walls[OPP[d]]))])]);
      const anyBoxes=blocks.some(hasBoxes),templates=new Map();
      for(const block of blocks){
        const raw=Array.from({length:36},(_,k)=>possibleWalls(block,Math.floor(k/4),k%4,{dynamicDoors:false},external));
        const dynamic=raw.map(ws=>[...new Set(ws.flatMap(w=>expandWall(w,true)))]);
        const enclosed=i=>DIRS.every((_,d)=>raw[i*4+d].includes(1));
        const converted=block.cells.map((cell,i)=>{if(!cell.portal)return false;const j=(Math.floor(i/3)+cell.portal[0])*3+i%3+cell.portal[1];return enclosed(i)||(j>=0&&j<9&&enclosed(j));});
        const boxes=Array.from({length:36},(_,k)=>{const i=Math.floor(k/4),d=k%4,rr=Math.floor(i/3)+V[d][0],cc=i%3+V[d][1];return rr>=0&&rr<3&&cc>=0&&cc<3?hasBoxes(block):anyBoxes;});
        templates.set(block.id,{raw,dynamic,converted,boxes});
      }
      poolMetadata.set(blocks,{blocks,external,anyBoxes,templates});
    }
    return poolMetadata.get(blocks);
  }
  function newState(){return {version:1,config:{size:9,mode:'TWIST',pool:'',event:'NONE',dynamicDoors:true,silent:false,exitCount:null},segments:[{name:'初始轨迹',events:[],sounds:[],anchors:[]}],active:0,notes:'',players:[{name:'0号',alive:true},{name:'1号',alive:true},{name:'2号',alive:true},{name:'3号',alive:true}],target:'PREVIOUS'};}
  function replay(segment,size){
    let r=Math.floor(size/2),c=r,last=-1;
    const observations=[],trace=[{r,c}],log=[];
    segment.events.forEach((e,index)=>{
      if(e.kind==='move'){
        if(e.outcome==='move'){
          observations.push({r,c,kind:'pass',dir:e.dir,last,index});
          r=mod(r+V[e.dir][0],size);c=mod(c+V[e.dir][1],size);last=e.dir;trace.push({r,c});
        } else if(e.outcome==='hit'){observations.push({r,c,kind:'hit',dir:e.dir,last,index});last=-1;}
        else last=e.dir;
        // Subspace wall feedback is always empty and carries no physical-wall evidence.
        if(e.outcome!=='space') addObservation(e,r,c,index);
      } else if(e.kind==='observe') addObservation(e,e.r,e.c,index);
      else if(e.kind==='teleport') {r=mod(r+e.dr,size);c=mod(c+e.dc,size);trace.push({r,c});}
      else if(e.kind==='turn') last=-1;
      if(e.clock){for(const o of observations)if(o.index===index&&!o.clock)o.clock=e.clock;
        if(e.kind==='move'||e.kind==='teleport')observations.push({r,c,index,kind:'action',arrival:e.kind==='teleport'||e.outcome==='move',clock:e.clock});
        if(e.kind==='turn')observations.push({r,c,index,kind:'turnEnd',clock:e.clock});
      }
      log.push({r,c,index,...e});
    });
    function addObservation(e,row,col,index){
      if(e.walls) observations.push({r:row,c:col,kind:'walls',value:parseWalls(e.walls),index});
      if(e.terrain) observations.push({r:row,c:col,kind:'terrain',value:e.terrain,index});
      if(e.kind==='move'&&e.outcome==='move'&&e.quiet)observations.push({r:row,c:col,kind:'quiet',index});
      if(e.nonPortalSound)observations.push({r:row,c:col,kind:'nonPortalSound',index});
      if(e.audible)observations.push({r:row,c:col,kind:'audible',index});
      if(e.portalLink)observations.push({r:row,c:col,kind:'portalLink',...e.portalLink,index});
      if(e.sound) observations.push({r:row,c:col,kind:'sound',value:e.sound,index});
    }
    return {r,c,last,observations,trace,log};
  }
  function combos(a,n,start=0,prefix=[],out=[]){
    if(n===0){out.push(prefix);return out;}
    for(let i=start;i<=a.length-n;i++) combos(a,n-1,i+1,[...prefix,a[i]],out);
    return out;
  }
  const variantCache=new Map();
  function variants(block,event){
    const cacheKey=block.id+event;
    if(variantCache.has(cacheKey)) return variantCache.get(cacheKey);
    const base=block.cells.map(c=>c.type);let out=[base];
    if(event==='RAINSTORY') out=[base.map(t=>t==='GRASS'?'WATER':t)];
    if(event==='LAZYGARDENER'){
      const i=base.findIndex(t=>t==='GRASS'||t==='BERRY');
      if(i>=0){ const empty=base.slice();empty[i]='EMPTY';out=empty.flatMap((t,j)=>t==='EMPTY'?[empty.map((v,k)=>k===j?base[i]:v)]:[]); }
    }
    if(event==='OVERGROWTH'){
      const grow=block.cells.flatMap((c,i)=>c.grow?[i]:[]), count=Math.min(grow.length,base.filter(t=>['GRASS','BERRY','TRAP'].includes(t)).length);
      out=combos(grow,count).map(indices=>base.map((t,i)=>indices.includes(i)?'GRASS':t));
    }
    variantCache.set(cacheKey,out);return out;
  }
  function soundTypes(type,event){
    if(type==='GRASS')return ['SHASHA'];
    if(type==='BERRY')return [event==='RAINSTORY'?'PAPA':'SHASHA'];
    if(['WATER','PORTAL','ONEWAYPORTAL'].includes(type))return ['PAPA'];
    if(type==='TRAP')return ['NONE',event==='RAINSTORY'?'PAPA':'SHASHA'];
    return ['NONE'];
  }
  const wallFeedback=w=>w===1||w===3?'墙':'空';
  const expandWall=(w,dynamic)=>dynamic && (w===3||w===4)?[3,4]:[w];
  const hasBoxes=block=>block.cells.some(c=>['BOX','HEATBOX','JAMMERBOX'].includes(c.attach));
  function edgeFits(w,o,d,box=false){return o.kind==='walls'?wallFeedback(w)===o.value[d]:o.kind==='hit'?box||w===1||w===3||(w===2&&o.last!==d):w===0||w===4||(w===2&&o.last===d);}
  function hitBoxPossible(config,block,i,d){const rr=Math.floor(i/3)+V[d][0],cc=i%3+V[d][1];return rr>=0&&rr<3&&cc>=0&&cc<3?hasBoxes(block):preparedPool(config).anyBoxes;}
  // Unknown neighbour blocks are existential possibilities, never assumed to have empty edges.
  function possibleWalls(block,i,d,config,external){
    const cell=block.cells[i],rr=Math.floor(i/3)+V[d][0],cc=i%3+V[d][1];
    let raw;
    if(rr>=0&&rr<3&&cc>=0&&cc<3) raw=[Math.max(cell.walls[d],block.cells[rr*3+cc].walls[OPP[d]])];
    else raw=[...new Set(external[d].map(w=>Math.max(cell.walls[d],w)))];
    return [...new Set(raw.flatMap(w=>expandWall(w,config.dynamicDoors)))];
  }
  function matchBlocks(config,observations,focus,originOnly=false){
    const {blocks,templates}=preparedPool(config),n=config.size;
    const positions=[];
    for(let lr=0;lr<(originOnly?1:3);lr++)for(let lc=0;lc<(originOnly?1:3);lc++){
      const origin={r:mod(focus.r-lr,n),c:mod(focus.c-lc,n)};
      const relevant=observations.flatMap(o=>{const rr=mod(o.r-origin.r,n),cc=mod(o.c-origin.c,n);return rr<3&&cc<3?[{...o,i:rr*3+cc}]:[];});
      const edgeEvidence=new Map();
      for(const o of relevant)for(let d=0;d<4;d++)if(o.kind==='walls'&&o.value[d]!=='?'||(o.kind==='pass'||o.kind==='hit')&&o.dir===d){const k=o.i*4+d;if(!edgeEvidence.has(k))edgeEvidence.set(k,[]);edgeEvidence.get(k).push(o);}
      positions.push({lr,lc,origin,relevant,edgeEvidence});
    }
    const matches=[];
    for(const block of blocks) for(const {lr,lc,origin,relevant,edgeEvidence} of positions){
      const template=templates.get(block.id);
      const getWalls=(i,d)=>(config.dynamicDoors?template.dynamic:template.raw)[i*4+d];
      let wallConflict=false;
      for(const [k,evidence] of edgeEvidence){
        const i=Math.floor(k/4),d=k%4;
        const raw=template.raw[k];
        if(!raw.some(w=>evidence.every(o=>expandWall(w,config.dynamicDoors).some(v=>edgeFits(v,o,d,template.boxes[k]))))){wallConflict=true;break;}
      }
      if(wallConflict)continue;
      if(block.cells.some(c=>c.walls.some(w=>w===3||w===4))&&!Timeline.check(config,[{block,origin}],relevant).valid)continue;
      const converted=i=>template.converted[i];
      const surviving=variants(block,config.event).filter(types=>relevant.every(o=>{
        const type=types[o.i];
        if(o.kind==='quiet')return soundTypes(type,config.event).includes('NONE');
        if(o.kind==='audible')return soundTypes(type,config.event).some(s=>s!=='NONE');
        if(o.kind==='nonPortalSound'&&type==='PORTAL')return converted(o.i);
        if(o.kind==='portalLink')return type==='PORTAL'&&block.cells[o.i].portal?.[0]===o.dr&&block.cells[o.i].portal?.[1]===o.dc;
        if(o.kind==='terrain'){
          // Consumed exits and one-way conversion are dynamic and not exclusions.
          return type===o.value || (type==='EXIT'&&o.value==='EMPTY') || (type==='PORTAL'&&o.value==='ONEWAYPORTAL'&&converted(o.i));
        }
        return o.kind!=='sound'||soundTypes(type,config.event).includes(o.value);
      }));
      if(!surviving.length)continue;
      const cellTypes=Array.from({length:9},(_,i)=>{
        const ts=[...new Set(surviving.map(v=>v[i]))];
        if(ts.includes('PORTAL')&&converted(i))ts.push('ONEWAYPORTAL');
        if(ts.includes('EXIT')&&!relevant.some(o=>o.i===i&&o.kind==='terrain'&&o.value==='EXIT'))ts.push('EMPTY');return relevant.some(o=>o.i===i&&o.kind==='nonPortalSound')?ts.filter(t=>t!=='PORTAL'):ts;
      });
      if(cellTypes.some(ts=>!ts.length))continue;
      matches.push({id:block.id,name:block.name,lr,lc,origin:{...origin},evidence:relevant.length,variantCount:surviving.length,types:cellTypes[lr*3+lc],cellTypes,portal:block.cells[lr*3+lc].portal,wallOptions:DIRS.map((_,d)=>getWalls(lr*3+lc,d).slice()),block});
    }
    // On 10x10 the selected square can be a gap. Keep it as an explicit possibility.
    let gap=false;
    if(n===10){
      const local=observations.filter(o=>o.r===focus.r&&o.c===focus.c);
      gap=local.every(o=>o.kind!=='terrain'||o.value==='EMPTY') && local.every(o=>o.kind!=='sound'||o.value==='NONE');
    }
    return {matches,gap,total:blocks.length*9,types:[...new Set([...matches.flatMap(m=>m.types),...(gap?['EMPTY']:[])])]};
  }
  function hasDistinctAssignment(domains,exitCount=null){
    if(exitCount!==null&&exitCount!==undefined){
      const ids=[...new Set(domains.flatMap(d=>d.map(c=>c.id)))],idIndex=new Map(ids.map((id,i)=>[id,i]));
      const firstId=1+domains.length,exitGroup=firstId+ids.length,normalGroup=exitGroup+1,sink=normalGroup+1,graph=Array.from({length:sink+1},()=>[]);
      function edge(a,b,cap){graph[a].push({to:b,cap,rev:graph[b].length});graph[b].push({to:a,cap:0,rev:graph[a].length-1});}
      domains.forEach((d,i)=>{edge(0,i+1,1);d.forEach(c=>edge(i+1,firstId+idIndex.get(c.id),1));});
      ids.forEach((id,i)=>edge(firstId+i,id.startsWith('E')?exitGroup:normalGroup,1));
      edge(exitGroup,sink,exitCount);edge(normalGroup,sink,domains.length-exitCount);
      let flow=0;
      while(true){
        const parent=Array(graph.length).fill(null),queue=[0];parent[0]=[-1,-1];
        for(let head=0;head<queue.length&&!parent[sink];head++)for(let i=0;i<graph[queue[head]].length;i++){
          const e=graph[queue[head]][i];if(e.cap>0&&!parent[e.to]){parent[e.to]=[queue[head],i];queue.push(e.to);}
        }
        if(!parent[sink])break;
        for(let v=sink;v!==0;){const [u,i]=parent[v],e=graph[u][i];e.cap--;graph[v][e.rev].cap++;v=u;}flow++;
      }
      return flow===domains.length;
    }
    const owner=new Map();
    function visit(slot,seen){
      for(const c of domains[slot]){
        if(seen.has(c.id))continue;
        seen.add(c.id);
        if(!owner.has(c.id)||visit(owner.get(c.id),seen)){owner.set(c.id,slot);return true;}
      }
      return false;
    }
    return domains.every((_,i)=>visit(i,new Set()));
  }
  function solveMap(config,observations,anchors=[]){
    if(config.size===10)return {phases:[],irregular:true};
    const n=config.size,k=n/3,phases=[];
    for(let pr=0;pr<3;pr++)for(let pc=0;pc<3;pc++){
      if(anchors.some(a=>a.r%3!==pr||a.c%3!==pc))continue;
      const slots=[];
      for(let br=0;br<k;br++)for(let bc=0;bc<k;bc++)slots.push({r:pr+br*3,c:pc+bc*3});
      let domains=slots.map(p=>matchBlocks(config,observations,p,true).matches.filter(m=>anchors.every(a=>a.r!==p.r||a.c!==p.c||a.id===m.id)));
      if(domains.some(d=>!d.length))continue;
      const edges=[];
      for(let a=0;a<slots.length;a++)for(const d of [1,3]){
        const b=d===1?((Math.floor(a/k)+1)%k)*k+a%k:Math.floor(a/k)*k+(a%k+1)%k;
        const requirements=[];
        for(let offset=0;offset<3;offset++){
          const i=d===1?6+offset:offset*3+2,j=d===1?offset:offset*3;
          const ar=mod(slots[a].r+Math.floor(i/3),n),ac=mod(slots[a].c+i%3,n),br=mod(slots[b].r+Math.floor(j/3),n),bc=mod(slots[b].c+j%3,n);
          for(const o of observations){
            const side=o.r===ar&&o.c===ac?d:o.r===br&&o.c===bc?OPP[d]:-1;
            if(side<0)continue;
            if(o.kind==='walls'&&o.value[side]!=='?')requirements.push({i,j,value:o.value[side]});
            if((o.kind==='pass'||o.kind==='hit')&&o.dir===side)requirements.push({i,j,pass:o.kind==='pass',hit:o.kind==='hit',sprint:o.last===o.dir,fromA:side===d});
          }
        }
        if(requirements.length)edges.push({a,b,d,requirements,cache:new Map()});
      }
      function compatible(edge,x,y){
        const cacheKey=x.id+'/'+y.id;
        if(edge.cache.has(cacheKey))return edge.cache.get(cacheKey);
        const ok=x.id!==y.id&&edge.requirements.every(req=>{
          const w=Math.max(x.block.cells[req.i].walls[edge.d],y.block.cells[req.j].walls[OPP[edge.d]]);
          return expandWall(w,config.dynamicDoors).some(v=>req.hit?(hasBoxes(req.fromA?y.block:x.block)||v===1||v===3||(v===2&&!req.sprint)):req.pass?(v===0||v===4||(v===2&&req.sprint)):wallFeedback(v)===req.value);
        });
        edge.cache.set(cacheKey,ok);return ok;
      }
      let changed=true,valid=true;
      while(changed&&valid){
        changed=false;
        const singles=domains.filter(d=>d.length===1).map(d=>d[0].id);
        if(new Set(singles).size!==singles.length){valid=false;break;}
        for(let s=0;s<domains.length;s++)if(domains[s].length>1){
          const next=domains[s].filter(c=>!singles.includes(c.id));
          if(next.length!==domains[s].length){changed=true;domains[s]=next;}
        }
        if(config.exitCount!==null&&config.exitCount!==undefined){
          const certain=domains.filter(d=>d.length&&d.every(c=>c.id.startsWith('E'))).length;
          const possible=domains.filter(d=>d.some(c=>c.id.startsWith('E'))).length;
          if(certain>config.exitCount||possible<config.exitCount){valid=false;break;}
          for(let s=0;s<domains.length;s++){
            const hasExit=domains[s].some(c=>c.id.startsWith('E')),hasNormal=domains[s].some(c=>!c.id.startsWith('E'));
            if(!hasExit||!hasNormal)continue;
            const next=domains[s].filter(c=>certain===config.exitCount?!c.id.startsWith('E'):possible===config.exitCount?c.id.startsWith('E'):true);
            if(next.length!==domains[s].length){changed=true;domains[s]=next;}
          }
        }
        for(const edge of edges){
          let next=domains[edge.a].filter(x=>domains[edge.b].some(y=>compatible(edge,x,y)));
          if(next.length!==domains[edge.a].length){changed=true;domains[edge.a]=next;}
          next=domains[edge.b].filter(y=>domains[edge.a].some(x=>compatible(edge,x,y)));
          if(next.length!==domains[edge.b].length){changed=true;domains[edge.b]=next;}
        }
        if(domains.some(d=>!d.length))valid=false;
      }
      if(valid&&(config.heartPresence!==true||domains.some(d=>d.some(m=>m.block.cells.some(c=>c.type==='HEART'))))&&hasDistinctAssignment(domains,config.exitCount))phases.push({pr,pc,slots,domains});
    }
    return {phases,irregular:false};
  }
  function globallyFilter(local,solution){
    if(solution.irregular)return local;
    const allowed=new Set(solution.phases.flatMap(p=>p.domains.flatMap(d=>d.map(m=>m.id+'@'+key(m.origin.r,m.origin.c)))));
    const matches=local.matches.filter(m=>allowed.has(m.id+'@'+key(m.origin.r,m.origin.c)));
    return {...local,matches,types:[...new Set(matches.flatMap(m=>m.types))]};
  }
  // Spawn generation uses ordinary walking connectivity, no hedge sprint or portal shortcuts.
  function spawnCheck(config,blocks,birth){
    if(!birth)return {checked:false,fallback:false};
    const n=config.size,cells=new Map();
    for(const b of blocks){const block=b.block||byId.get(b.id);for(let i=0;i<9;i++)cells.set(key(mod(b.origin.r+Math.floor(i/3),n),mod(b.origin.c+i%3,n)),{cell:block.cells[i],block});}
    const start=cells.get(key(birth.r,birth.c)),inExitBlock=!!start&&start.block.cells.some(c=>c.type==='EXIT');
    const blocked=c=>['HEAT','HEART'].includes(c.type)||['BOX','HEATBOX','JAMMERBOX'].includes(c.attach);
    const distances=new Map([[key(birth.r,birth.c),0]]),queue=[birth];let nearest=Infinity;
    for(let head=0;head<queue.length;head++){const p=queue[head],k=key(p.r,p.c),a=cells.get(k),distance=distances.get(k);if(!a||blocked(a.cell))continue;
      if(a.cell.type==='EXIT')nearest=Math.min(nearest,distance);
      for(let d=0;d<4;d++){const q={r:mod(p.r+V[d][0],n),c:mod(p.c+V[d][1],n)},qk=key(q.r,q.c),b=cells.get(qk);if(!b||distances.has(qk)||blocked(b.cell))continue;
        if(![0,4].includes(Math.max(a.cell.walls[d],b.cell.walls[OPP[d]])))continue;distances.set(qk,distance+1);queue.push(q);
      }
    }
    return {checked:true,fallback:inExitBlock||nearest<5,inExitBlock,exitDistance:Number.isFinite(nearest)?nearest:null,reason:inExitBlock?'出生点位于逃生舱区块，仅回退出生方案允许':nearest<5?'出生到逃生舱已有 '+nearest+' 格可通行路径，短于常规要求的 5 格':''};
  }
  function verifyCompleteLayout(config,solution,observations,budget=20000){
    if(!solution||solution.irregular)return {status:'unknown',blocks:[],steps:0};
    const n=config.size;let steps=0,limited=false,witness=null;
    const nonPortalSounds=observations.filter(o=>o.kind==='nonPortalSound'),portalLinks=observations.filter(o=>o.kind==='portalLink');
    for(const phase of solution.phases){
      const at=(r,c)=>({slot:Math.floor(mod(r-phase.pr,n)/3)*(n/3)+Math.floor(mod(c-phase.pc,n)/3),i:mod(r-phase.pr,3)*3+mod(c-phase.pc,3)}),requirements=[];
      for(const o of observations)for(let d=0;d<4;d++)if(o.kind==='walls'&&o.value[d]!=='?'||(o.kind==='pass'||o.kind==='hit')&&o.dir===d){const a=at(o.r,o.c),b=at(mod(o.r+V[d][0],n),mod(o.c+V[d][1],n));requirements.push({a,b,o,d});}
      const bySlot=Array.from({length:phase.slots.length},()=>[]);
      for(const q of requirements){q.cache=new Map();bySlot[q.a.slot].push(q);if(q.b.slot!==q.a.slot)bySlot[q.b.slot].push(q);}
      const chosen=Array(phase.slots.length).fill(null),used=new Set();
      function fits(slot,m){for(const q of bySlot[slot]){const a=q.a.slot===slot?m:chosen[q.a.slot],b=q.b.slot===slot?m:chosen[q.b.slot];if(!a||!b)continue;
        const pair=a.id+'/'+b.id;
        if(!q.cache.has(pair)){const w=Math.max(a.block.cells[q.a.i].walls[q.d],b.block.cells[q.b.i].walls[OPP[q.d]]);q.cache.set(pair,expandWall(w,config.dynamicDoors).some(v=>edgeFits(v,q.o,q.d,hasBoxes(b.block))));}
        if(!q.cache.get(pair))return false;
      }return true;}
      function portalFits(){const cell=(r,c)=>{const p=at(mod(r,n),mod(c,n));return chosen[p.slot].block.cells[p.i];},enclosed=(r,c)=>DIRS.every((_,d)=>Math.max(cell(r,c).walls[d],cell(r+V[d][0],c+V[d][1]).walls[OPP[d]])===1);
        return nonPortalSounds.every(o=>{const c=cell(o.r,o.c);return c.type!=='PORTAL'||c.portal&&(enclosed(o.r,o.c)||enclosed(o.r+c.portal[0],o.c+c.portal[1]));})&&portalLinks.every(o=>{const c=cell(o.r,o.c);return c.type==='PORTAL'&&c.portal?.[0]===o.dr&&c.portal?.[1]===o.dc&&!enclosed(o.r,o.c)&&!enclosed(o.r+o.dr,o.c+o.dc);});
      }
      function visit(){if(++steps>budget){limited=true;return false;}if(used.size===chosen.length){if(config.exitCount!=null&&chosen.filter(m=>m.id.startsWith('E')).length!==config.exitCount)return false;if(config.heartPresence===true&&!chosen.some(m=>m.block.cells.some(c=>c.type==='HEART')))return false;if(!portalFits())return false;if(!Timeline.check(config,chosen,observations).valid)return false;witness=chosen.map(m=>({id:m.id,origin:m.origin}));return true;}
        const domains=phase.domains.map((d,i)=>chosen[i]?[chosen[i]]:d.filter(m=>!used.has(m.id)&&fits(i,m)));
        if(config.heartPresence===true){const slots=domains.flatMap((d,i)=>d.some(m=>m.block.cells.some(c=>c.type==='HEART'))?[i]:[]);if(!slots.length)return false;if(slots.length===1)domains[slots[0]]=domains[slots[0]].filter(m=>m.block.cells.some(c=>c.type==='HEART'));}
        if(domains.some(d=>!d.length)||!hasDistinctAssignment(domains,config.exitCount))return false;
        let slot=-1;for(let i=0;i<domains.length;i++)if(!chosen[i]&&(slot<0||domains[i].length<domains[slot].length))slot=i;
        for(const m of domains[slot]){chosen[slot]=m;used.add(m.id);if(visit())return true;used.delete(m.id);chosen[slot]=null;if(limited)return false;}return false;
      }
      if(visit())break;if(limited)break;
    }
    return {status:witness?'verified':limited?'unknown':'impossible',blocks:witness?determinedBlocks(solution):[],layout:witness,steps};
  }
  function certifyBlocks(config,solution,observations,budget=20000){
    const proof=verifyCompleteLayout(config,solution,observations,budget);
    if(proof.status!=='verified')return proof;
    const blocks=[];let uncertain=0;
    for(const b of proof.layout){
      const phases=solution.phases.map(p=>({...p,domains:p.domains.map(d=>d.filter(m=>!(m.id===b.id&&m.origin.r===b.origin.r&&m.origin.c===b.origin.c)))})).filter(p=>p.domains.every(d=>d.length));
      const alternative=verifyCompleteLayout(config,{...solution,phases},observations,budget);
      if(alternative.status==='impossible')blocks.push(b);
      if(alternative.status==='unknown')uncertain++;
    }
    return {...proof,blocks,uncertain};
  }
  function refineCompleteLayout(config,solution,observations,maxChecks=160,budget=2000){
    if(!solution||solution.irregular)return solution;
    const supported=new Set(),phases=[];let checks=0,removed=0,pending=0;
    const tag=(p,b)=>p.pr+','+p.pc+':'+b.id+'@'+key(b.origin.r,b.origin.c);
    for(const original of solution.phases){
      const p={...original,domains:original.domains.map(d=>[...d])};
      const base=verifyCompleteLayout(config,{...solution,phases:[p]},observations,budget);
      if(base.status==='impossible'){removed+=p.domains.reduce((n,d)=>n+d.length,0);continue;}
      if(base.layout)base.layout.forEach(b=>supported.add(tag(p,b)));
      for(let slot=0;slot<p.domains.length;slot++)for(const candidate of [...p.domains[slot]]){
        if(supported.has(tag(p,candidate)))continue;
        if(checks++>=maxChecks){pending++;continue;}
        const domains=p.domains.map((d,i)=>i===slot?[candidate]:d),proof=verifyCompleteLayout(config,{...solution,phases:[{...p,domains}]},observations,budget);
        if(proof.status==='impossible'){p.domains[slot]=p.domains[slot].filter(m=>m!==candidate);removed++;}
        else if(proof.layout)proof.layout.forEach(b=>supported.add(tag(p,b)));
        else pending++;
      }
      if(p.domains.every(d=>d.length))phases.push(p);
    }
    return {...solution,phases,completeChecks:{checks:Math.min(checks,maxChecks),removed,pending}};
  }
  function determinedBlocks(solution){
    if(!solution||solution.irregular||!solution.phases.length)return [];
    const placements=p=>new Map(p.domains.flatMap(d=>d.length===1?[[d[0].id+'@'+key(d[0].origin.r,d[0].origin.c),d[0]]]:[]));
    const first=placements(solution.phases[0]),others=solution.phases.slice(1).map(placements);
    return [...first].filter(([k])=>others.every(m=>m.has(k))).map(([,m])=>({id:m.id,origin:m.origin}));
  }
  function displayOffset(solution){
    if(!solution||solution.irregular||!solution.phases.length)return {r:0,c:0,aligned:false};
    const first=solution.phases[0];
    return solution.phases.every(p=>p.pr===first.pr&&p.pc===first.pc)?{r:first.pr,c:first.pc,aligned:true}:{r:0,c:0,aligned:false};
  }
  function inferredWalls(config,solution){
    const out=new Map();if(!solution||solution.irregular||!solution.phases.length)return out;
    const n=config.size,at=(phase,r,c)=>({slot:Math.floor(mod(r-phase.pr,n)/3)*(n/3)+Math.floor(mod(c-phase.pc,n)/3),i:mod(r-phase.pr,3)*3+mod(c-phase.pc,3)});
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)for(let d=0;d<4;d++){
      const values=new Set();for(const p of solution.phases){const a=at(p,r,c),b=at(p,mod(r+V[d][0],n),mod(c+V[d][1],n)),xs=p.domains[a.slot],ys=p.domains[b.slot];
        if(a.slot===b.slot)for(const x of xs)expandWall(Math.max(x.block.cells[a.i].walls[d],x.block.cells[b.i].walls[OPP[d]]),config.dynamicDoors).forEach(v=>values.add(v));
        else {const av=new Set(xs.map(x=>x.block.cells[a.i].walls[d])),bv=new Set(ys.map(y=>y.block.cells[b.i].walls[OPP[d]]));for(const x of av)for(const y of bv)expandWall(Math.max(x,y),config.dynamicDoors).forEach(v=>values.add(v));}
      }
      if(values.size&&[...values].every(w=>w!==0))out.set(key(r,c)+':'+d,'墙');else if(values.size===1&&values.has(0))out.set(key(r,c)+':'+d,'空');
    }return out;
  }
  function inferredDoors(config,solution,knownBlocks=[],observations=[]){
    const out=new Map();if(!solution||solution.irregular||!solution.phases.length||!knownBlocks.length)return out;
    const n=config.size,known=new Map(knownBlocks.map(b=>[key(b.origin.r,b.origin.c),b.id]));
    const at=(p,r,c)=>{const slot=Math.floor(mod(r-p.pr,n)/3)*(n/3)+Math.floor(mod(c-p.pc,n)/3),origin=p.slots[slot],id=known.get(key(origin.r,origin.c));return {slot,i:mod(r-p.pr,3)*3+mod(c-p.pc,3),domain:id?p.domains[slot].filter(m=>m.id===id):p.domains[slot]};};
    for(const block of knownBlocks)for(let i=0;i<9;i++)for(let d=0;d<4;d++){
      const r=mod(block.origin.r+Math.floor(i/3),n),c=mod(block.origin.c+i%3,n),rr=mod(r+V[d][0],n),cc=mod(c+V[d][1],n),values=new Set();
      for(const p of solution.phases){const a=at(p,r,c),b=at(p,rr,cc);if(a.slot===b.slot){for(const x of a.domain)values.add(Math.max(x.block.cells[a.i].walls[d],x.block.cells[b.i].walls[OPP[d]]));}else for(const x of a.domain)for(const y of b.domain)values.add(Math.max(x.block.cells[a.i].walls[d],y.block.cells[b.i].walls[OPP[d]]));}
      if(!values.size||![...values].every(w=>w===3||w===4))continue;
      let state=!config.dynamicDoors&&values.size===1?(values.has(3)?'closed':'open'):'unknown',last=null;
      for(const o of observations){const side=o.r===r&&o.c===c?d:o.r===rr&&o.c===cc?OPP[d]:-1;if(side<0)continue;
        const observed=o.kind==='walls'?(o.value[side]==='墙'?'closed':o.value[side]==='空'?'open':null):o.kind==='pass'&&o.dir===side?'open':null;
        if(!observed)continue;const clock=o.clock,rank=clock?[clock.round,clock.player,clock.step]:null;
        if(!last||!rank&&!last.rank||rank&&(!last.rank||rank[0]>last.rank[0]||rank[0]===last.rank[0]&&(rank[1]>last.rank[1]||rank[1]===last.rank[1]&&rank[2]>=last.rank[2]))){last={state:observed,rank};}
      }
      if(last)state=last.state;
      const result={state,observed:!!last};out.set(key(r,c)+':'+d,result);out.set(key(rr,cc)+':'+OPP[d],result);
    }return out;
  }
  function terrainPossibilities(solution,n){
    if(!solution||solution.irregular||!solution.phases.length)return new Map();
    const out=new Map();
    for(let r=0;r<n;r++)for(let c=0;c<n;c++){
      const types=new Set();
      for(const phase of solution.phases){
        const sr=Math.floor(mod(r-phase.pr,n)/3),sc=Math.floor(mod(c-phase.pc,n)/3),i=mod(r-phase.pr,3)*3+mod(c-phase.pc,3);
        phase.domains[sr*(n/3)+sc].forEach(m=>m.cellTypes[i].forEach(t=>types.add(t)));
      }
      if(types.size)out.set(key(r,c),[...types].sort());
    }
    return out;
  }
  function inferredTerrain(solution,n){return new Map([...terrainPossibilities(solution,n)].filter(([,types])=>types.length===1).map(([k,types])=>[k,types[0]]));}
  function bearings(from,to,n){
    const axis=(a,b)=>{const v=mod(a-b,n);return n%2===0&&v===n/2?[v,-v]:[v>n/2?v-n:v];};
    const out=[];
    for(const dr of axis(from.r,to.r))for(const dc of axis(from.c,to.c)){
      out.push(dr===0&&dc===0?'同格':dr===0?(dc>0?'正右':'正左'):dc===0?(dr>0?'正下':'正上'):(dc>0?'右':'左')+(dr>0?'下':'上'));
    }
    return [...new Set(out)];
  }
  function locate(sounds,source,n){
    const all=()=>Array.from({length:n*n},(_,i)=>({r:Math.floor(i/n),c:i%n}));
    let cells=all(),history=[];
    for(const e of sounds.filter(e=>e.source===source)){
      const before=cells.length;
      if(e.kind==='reset')cells=all();
      if(e.kind==='pin')cells=cells.filter(p=>p.r===e.r&&p.c===e.c);
      if(e.kind==='hear' && !['未知','首次','被屏蔽','隐匿','静音','心跳掩盖'].includes(e.direction))cells=cells.filter(p=>bearings(p,e.listener,n).includes(e.direction));
      if(e.kind==='move'){
        const next=[];
        for(const p of cells){
          if(e.outcome==='unknown'||e.outcome==='hit'||e.outcome==='space')next.push(p);
          if(e.outcome==='unknown'||e.outcome==='move')next.push({r:mod(p.r+V[e.dir][0],n),c:mod(p.c+V[e.dir][1],n)});
        }
        cells=[...new Map(next.map(p=>[key(p.r,p.c),p])).values()];
      }
      history.push({event:e,before,after:cells.length});
    }
    return {cells,history};
  }
  function targets(players,mode){
    const alive=players.flatMap((p,i)=>p.alive?[i]:[]),delta=mode==='NEXT'?1:-1;
    return players.map((p,i)=>!p.alive||alive.length<2?null:alive[mod(alive.indexOf(i)+delta,alive.length)]);
  }
  function validateState(s){
    if(!s||s.version!==1||!s.config||![9,10,12].includes(s.config.size)||!D.modes[s.config.mode]||!['NONE','RAINSTORY','LAZYGARDENER','OVERGROWTH'].includes(s.config.event)||typeof s.config.pool!=='string'||typeof s.config.dynamicDoors!=='boolean')throw new Error('存档配置无效。');
    if(s.config.silent!==undefined&&typeof s.config.silent!=='boolean')throw new Error('静音设置无效。');
    pool(s.config);
    if(s.config.exitCount!==null&&s.config.exitCount!==undefined&&(!Number.isInteger(s.config.exitCount)||s.config.exitCount<0||s.config.exitCount>16))throw new Error('无效逃生区块数量。');
    if(!Array.isArray(s.segments)||!s.segments.length||s.segments.length>100||!Number.isInteger(s.active)||!s.segments[s.active])throw new Error('存档轨迹无效。');
    const coord=(a,b)=>Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<s.config.size&&b<s.config.size;
    const direction=d=>Number.isInteger(d)&&d>=0&&d<4;
    const outcome=o=>['move','hit','space','unknown'].includes(o);
    for(const seg of s.segments){
      if(typeof seg.name!=='string'||!Array.isArray(seg.events)||!Array.isArray(seg.sounds)||seg.events.length+seg.sounds.length>10000)throw new Error('存档事件过多或格式错误。');
      if(!Array.isArray(seg.anchors)||seg.anchors.some(a=>!byId.has(a.id)||!coord(a.r,a.c)))throw new Error('无效区块假设。');
      for(const e of seg.events){
        if(!e||!['move','observe','turn','teleport'].includes(e.kind))throw new Error('未知轨迹事件。');
        if(e.kind==='move'&&(!direction(e.dir)||!['move','hit','space'].includes(e.outcome)))throw new Error('无效移动。');
        if(e.kind==='observe'&&!coord(e.r,e.c))throw new Error('无效观测坐标。');
        if(e.kind==='teleport'&&(!Number.isInteger(e.dr)||!Number.isInteger(e.dc)||Math.abs(e.dr)>100||Math.abs(e.dc)>100))throw new Error('无效传送位移。');
        parseWalls(e.walls);
        if(e.terrain&&!TYPES[e.terrain]||e.sound&&!['SHASHA','PAPA','NONE'].includes(e.sound))throw new Error('无效地形或声响。');
      }
      for(const e of seg.sounds){
        if(!e||typeof e.source!=='string'||!e.source.trim()||!['hear','move','pin','reset'].includes(e.kind))throw new Error('无效声源事件。');
        if(e.kind==='hear'&&(!coord(e.listener?.r,e.listener?.c)||!['正上','正下','正左','正右','左上','右上','左下','右下','同格','未知','首次','被屏蔽','隐匿','静音','心跳掩盖'].includes(e.direction)))throw new Error('无效声源方向或听者坐标。');
        if(e.kind==='move'&&(!direction(e.dir)||!outcome(e.outcome)))throw new Error('无效声源移动。');
        if(e.kind==='pin'&&!coord(e.r,e.c))throw new Error('无效声源坐标。');
      }
    }
    if(typeof s.notes!=='string'||!Array.isArray(s.players)||s.players.length<1||s.players.length>8||s.players.some(p=>typeof p.name!=='string'||typeof p.alive!=='boolean')||!['PREVIOUS','NEXT'].includes(s.target))throw new Error('无效玩家或笔记。');
    return clone(s);
  }
  const api={inferredDoors,refineCompleteLayout,displayOffset,certifyBlocks,verifyCompleteLayout,inferredWalls,determinedBlocks,terrainPossibilities,spawnCheck,edgeFits,hasBoxes,hitBoxPossible,DIRS,V,OPP,TYPES,ATTACH,mod,key,clone,byId,parseWalls,parseDirections,pool,newState,replay,variants,soundTypes,wallFeedback,possibleWalls,matchBlocks,solveMap,globallyFilter,inferredTerrain,hasDistinctAssignment,bearings,locate,targets,validateState};
  if(typeof module!=='undefined')module.exports=api;else root.LongNight=api;
})(globalThis);
