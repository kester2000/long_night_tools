(function(root){
  'use strict';
  const V=[[-1,0],[1,0],[0,-1],[0,1]],OPP=[1,0,3,2],DIR={UP:0,DOWN:1,LEFT:2,RIGHT:3},mod=(v,n)=>(v%n+n)%n;
  // Unknown turns add one parity variable per BUTTON, never independent variables per door.
  // This preserves linked-door correlations without guessing an unlocated player's path.
  function check(config,placements,observations){
    const timed=observations.filter(o=>o.clock),n=config.size;
    if(!config.dynamicDoors||!timed.length)return {valid:true,uncertain:false,presses:0};
    const cells=new Map(),edgeKey=(r,c,d)=>{const a=mod(r,n)*n+mod(c,n),b=mod(r+V[d][0],n)*n+mod(c+V[d][1],n);return a<b?a+':'+b:b+':'+a;};
    for(const m of placements)for(let i=0;i<9;i++)cells.set(mod(m.origin.r+Math.floor(i/3),n)*n+mod(m.origin.c+i%3,n),m.block.cells[i]);
    const cell=(r,c)=>cells.get(mod(r,n)*n+mod(c,n)),doors=new Map(),buttons=new Map();
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
  const api={check};if(typeof module!=='undefined')module.exports=api;else root.LongNightTimeline=api;
})(globalThis);
