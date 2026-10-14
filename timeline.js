(function(root){
  'use strict';
  const V=[[-1,0],[1,0],[0,-1],[0,1]],OPP=[1,0,3,2],DIR={UP:0,DOWN:1,LEFT:2,RIGHT:3},mod=(v,n)=>(v%n+n)%n;
  // A domain describes every still-possible template at one map slot. Missing
  // cells and missing turns remain unknown; neither is evidence of no pickup.
  function coinBounds(config,domains,observations){
    const gains=(config.coinGains||[]).filter(g=>!(config.coinTransferRounds||[]).includes(g.round));
    if(!gains.length)return {valid:true};
    const n=config.size,key=o=>mod(o.r,n)*n+mod(o.c,n),cells=new Map(),turns=new Map();
    for(const domain of domains){if(!domain.length)continue;for(let i=0;i<9;i++){
      const origin=domain[0].origin,k=key({r:origin.r+Math.floor(i/3),c:origin.c+i%3});
      cells.set(k,{possible:domain.some(m=>m.block.cells[i].attach==='COIN'),certain:domain.every(m=>m.block.cells[i].attach==='COIN')});
    }}
    for(const o of observations){if(!o.clock)continue;const id=o.clock.round+':'+o.clock.player;if(!turns.has(id))turns.set(id,{actions:new Map(),ended:false});const t=turns.get(id);
      if(o.kind==='action')t.actions.set(o.clock.step,o);if(o.kind==='turnEnd')t.ended=true;
    }
    const complete=t=>!!t?.ended&&Array.from({length:Math.max(0,...t.actions.keys())},(_,i)=>i+1).every(step=>t.actions.has(step));
    const before=(a,g)=>a.round<g.round||a.round===g.round&&a.player<g.player;
    for(const gain of gains){
      const turn=turns.get(gain.round+':'+gain.player);if(!complete(turn))continue;
      const seen=new Set();for(const t of turns.values())for(const o of t.actions.values())if(o.arrival&&before(o.clock,gain))seen.add(key(o));
      let priorComplete=true;for(let round=1;round<=gain.round&&priorComplete;round++)for(let player=0;player<(config.playerCount||1);player++)if(before({round,player},gain)&&!complete(turns.get(round+':'+player))){priorComplete=false;break;}
      let upper=0,lower=0;for(const o of [...turn.actions.values()].sort((a,b)=>a.clock.step-b.clock.step)){
        if(!o.arrival||seen.has(key(o)))continue;seen.add(key(o));const cell=cells.get(key(o));
        if(!cell||cell.possible)upper++;if(priorComplete&&cell?.certain)lower++;
      }
      if(upper<gain.min||gain.max!=null&&lower>gain.max)return {valid:false,reason:'coinCount',player:gain.player,round:gain.round,lower,upper};
    }
    return {valid:true};
  }
  // Unknown turns add one parity variable per BUTTON, never independent variables per door.
  // This preserves linked-door correlations without guessing an unlocated player's path.
  function check(config,placements,observations){
    const coins=coinBounds(config,placements.map(m=>[m]),observations);if(!coins.valid)return {...coins,uncertain:false,presses:0};
    const timed=observations.filter(o=>o.clock),n=config.size;
    if(!timed.length)return {valid:true,uncertain:false,presses:0};
    const cells=new Map(),edgeKey=(r,c,d)=>{const a=mod(r,n)*n+mod(c,n),b=mod(r+V[d][0],n)*n+mod(c+V[d][1],n);return a<b?a+':'+b:b+':'+a;};
    for(const m of placements)for(let i=0;i<9;i++)cells.set(mod(m.origin.r+Math.floor(i/3),n)*n+mod(m.origin.c+i%3,n),m.block.cells[i]);
    const cell=(r,c)=>cells.get(mod(r,n)*n+mod(c,n)),doors=new Map(),buttons=new Map();
    // Counts are for the whole round. Incomplete routes give only a lower bound;
    // equality is justified only when every player's full turn is available.
    for(const [round,total] of Object.entries(config.buttonCounts||{})){
      const list=timed.filter(o=>o.clock.round===+round),actions=new Map();
      for(const o of list.filter(o=>o.kind==='action'&&o.arrival))actions.set(o.clock.player+':'+o.clock.step,o);
      const known=[...actions.values()].filter(o=>cell(o.r,o.c)?.attach==='BUTTON').length;
      const complete=cells.size===n*n&&Array.from({length:config.playerCount||1},(_,id)=>id).every(id=>{
        const part=list.filter(o=>o.clock.player===id),steps=new Set(part.filter(o=>o.kind==='action').map(o=>o.clock.step));
        return part.some(o=>o.kind==='turnEnd')&&Array.from({length:Math.max(0,...steps)},(_,i)=>i+1).every(i=>steps.has(i));
      });
      if(known>total||complete&&known!==total)return {valid:false,uncertain:!complete,presses:known};
    }
    if(!config.dynamicDoors)return {valid:true,uncertain:false,presses:0};
    for(const [k,a] of cells){const r=Math.floor(k/n),c=k%n;for(let d=0;d<4;d++){const b=cell(r+V[d][0],c+V[d][1]);if(!b)continue;const w=Math.max(a.walls[d],b.walls[OPP[d]]);if(w===3||w===4)doors.set(edgeKey(r,c,d),{bits:0n,value:w===3?1:0});}}
    if(!doors.size)return {valid:true,uncertain:false,presses:0};
    for(const [k,a] of cells)if(a.attach==='BUTTON'){
      const links=new Set(),r=Math.floor(k/n),c=k%n;
      for(const [dr,dc,dir] of a.buttons||[]){const d=DIR[dir];if(d===undefined)continue;const key=edgeKey(r+dr,c+dc,d);if(!doors.has(key))continue;if(links.has(key))links.delete(key);else links.add(key);}
      if(links.size)buttons.set(k,[...links]);
    }
    const basis=new Map();let variable=0,uncertain=false,presses=0;
    function equation(bits,value){while(bits){const pivot=bits.toString(2).length-1,other=basis.get(pivot);if(!other){basis.set(pivot,{bits,value});return true;}bits^=other.bits;value^=other.value;}return value===0;}
    function unknown(){if(!buttons.size)return;uncertain=true;for(const links of buttons.values()){const bit=1n<<BigInt(variable++);for(const k of links)doors.get(k).bits^=bit;}}
    const stage=o=>o.kind==='pass'||o.kind==='hit'?0:o.kind==='action'?1:2;
    const sorted=[...new Map(timed.map(o=>[JSON.stringify({...o,index:undefined}),o])).values()].sort((a,b)=>a.clock.round-b.clock.round||a.clock.player-b.clock.player||a.clock.step-b.clock.step||stage(a)-stage(b));
    const turns=new Map();for(const o of sorted){const k=o.clock.round+':'+o.clock.player;if(!turns.has(k))turns.set(k,[]);turns.get(k).push(o);}
    const count=config.playerCount||Math.max(1,...timed.map(o=>o.clock.player+1));let previous=-1;
    for(const list of turns.values()){
      const clock=list[0].clock,turn=clock.round===0?-1:(clock.round-1)*count+clock.player;
      if(turn>previous+1)unknown();
      let lastStep=0,missingActions=false;const actions=new Set(list.filter(o=>o.kind==='action').map(o=>o.clock.step));
      for(const o of list){
        if(o.clock.round>0&&o.clock.step<1000000&&o.clock.step>lastStep){if(o.clock.step>lastStep+1)unknown();lastStep=o.clock.step;}
        if(o.clock.round>0&&o.clock.step===1000000&&!actions.size&&!missingActions){unknown();missingActions=true;}
        if(o.kind==='action'&&o.arrival){const links=buttons.get(mod(o.r,n)*n+mod(o.c,n));if(links){presses++;for(const k of links)doors.get(k).value^=1;}}
        for(let d=0;d<4;d++){
          if(!(o.kind==='walls'&&o.value[d]!=='?'||(o.kind==='pass'||o.kind==='hit')&&o.dir===d))continue;
          const state=doors.get(edgeKey(o.r,o.c,d));if(!state)continue;
          if(o.kind==='hit'){
            const dest=cell(o.r+V[d][0],o.c+V[d][1]);
            // Movable boxes remain a separate possible cause of collision.
            const block=placements.find(m=>mod(o.r+V[d][0]-m.origin.r,n)<3&&mod(o.c+V[d][1]-m.origin.c,n)<3);
            if(dest&&block?.block.cells.some(c=>['BOX','HEATBOX','JAMMERBOX'].includes(c.attach)))continue;
          }
          const required=o.kind==='walls'?(o.value[d]==='墙'?1:0):o.kind==='hit'?1:0;
          if(!equation(state.bits,state.value^required))return {valid:false,uncertain,presses};
        }
      }
      if(clock.round>0&&!list.some(o=>o.kind==='turnEnd'))unknown();
      previous=Math.max(previous,turn);
    }
    return {valid:true,uncertain,presses};
  }
  const api={check,coinBounds};if(typeof module!=='undefined')module.exports=api;else root.LongNightTimeline=api;
})(globalThis);
