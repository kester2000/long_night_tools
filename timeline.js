(function longNightModule(root){
  'use strict';
  (root.LongNightSources ||= {})['timeline.js']=longNightModule.toString();
  const V=[[-1,0],[1,0],[0,-1],[0,1]],OPP=[1,0,3,2],DIR={UP:0,DOWN:1,LEFT:2,RIGHT:3},mod=(v,n)=>(v%n+n)%n;
  function eventsForTurn(config,placements,observations,player,round){
    const n=config.size,cells=new Map(),actions=new Map(),seen=new Set(),result={coin:[],button:[]};
    for(const m of placements){const block=m.block;for(let i=0;i<9;i++)cells.set(mod(m.origin.r+Math.floor(i/3),n)*n+mod(m.origin.c+i%3,n),{cell:block.cells[i],block:m.id||block.id,row:Math.floor(i/3)+1,col:i%3+1});}
    for(const o of observations)if(o.kind==='action'&&o.clock)actions.set([o.clock.round,o.clock.player,o.clock.step].join(':'),o);
    for(const o of [...actions.values()].sort((a,b)=>a.clock.round-b.clock.round||a.clock.player-b.clock.player||a.clock.step-b.clock.step)){
      if(!o.arrival)continue;
      const key=mod(o.r,n)*n+mod(o.c,n),at=cells.get(key);if(!at)continue;
      const target=o.clock.player===player&&o.clock.round===round,event={step:o.clock.step,block:at.block,row:at.row,col:at.col};
      if(at.cell.attach==='BUTTON'&&target)result.button.push(event);
      if(at.cell.attach==='COIN'&&!seen.has(key)){seen.add(key);if(target)result.coin.push(event);}
    }
    return result;
  }
  // A domain describes every still-possible template at one map slot. Missing
  // cells and missing turns remain unknown; neither is evidence of no pickup.
  function coinBounds(config,domains,observations){
    const gains=(config.coinGains||[]).filter(g=>!(config.coinTransferRounds||[]).includes(g.round));
    if(!gains.length)return {valid:true};
    const n=config.size,key=o=>mod(o.r,n)*n+mod(o.c,n),cells=new Map(),turns=new Map();
    for(const domain of domains){if(!domain.length)continue;for(let i=0;i<9;i++){
      const origin=domain[0].origin,k=key({r:origin.r+Math.floor(i/3),c:origin.c+i%3});
      cells.set(k,{possible:domain.some(m=>m.block.cells[i].attach==='COIN'),certain:domain.every(m=>m.block.cells[i].attach==='COIN'),sources:domain.filter(m=>m.block.cells[i].attach==='COIN').map(m=>m.id||m.block.id)});
    }}
    for(const o of observations){if(!o.clock)continue;const id=o.clock.round+':'+o.clock.player;if(!turns.has(id))turns.set(id,{actions:new Map(),ended:false});const t=turns.get(id);
      if(o.kind==='action')t.actions.set(o.clock.step,o);if(o.kind==='turnEnd')t.ended=true;
    }
    const complete=t=>!!t?.ended&&Array.from({length:Math.max(0,...t.actions.keys())},(_,i)=>i+1).every(step=>t.actions.has(step));
    const before=(a,g)=>a.round<g.round||a.round===g.round&&a.player<g.player;
    for(const gain of gains){
      const turn=turns.get(gain.round+':'+gain.player);if(!complete(turn))continue;
      const seen=new Set();for(const t of turns.values())for(const o of t.actions.values())if(o.arrival&&before(o.clock,gain))seen.add(key(o));
      let priorComplete=true;for(let round=1;round<=gain.round&&priorComplete;round++)for(let player=0;player<(config.playerCount||1);player++)if(before({round,player},gain)&&!(config.zeroCoinTurns||[]).some(t=>t.round===round&&t.player===player)&&!(config.coinRetirements?.[player]&&before(config.coinRetirements[player],{round,player}))&&!complete(turns.get(round+':'+player))){priorComplete=false;break;}
      const source=config.coinSources?.find(s=>s.player===gain.player&&s.round===gain.round);
      let sourceUpper=0,upper=0,lower=0;for(const o of [...turn.actions.values()].sort((a,b)=>a.clock.step-b.clock.step)){
        if(!o.arrival||seen.has(key(o)))continue;seen.add(key(o));const cell=cells.get(key(o));
        if(!cell||cell.possible)upper++;if(!cell||cell.sources.includes(source?.block))sourceUpper++;if(priorComplete&&cell?.certain)lower++;
      }
      if(source&&sourceUpper<gain.min)return {valid:false,reason:'coinSource',player:gain.player,round:gain.round,block:source.block};
      if(upper<gain.min||gain.max!=null&&lower>gain.max)return {valid:false,reason:'coinCount',player:gain.player,round:gain.round,lower,upper};
    }
    return {valid:true};
  }
  function buttonBounds(config,domains,observations){
    const n=config.size,cells=new Map();
    for(const domain of domains){if(!domain.length)continue;for(let i=0;i<9;i++){const origin=domain[0].origin;cells.set(mod(origin.r+Math.floor(i/3),n)*n+mod(origin.c+i%3,n),{possible:domain.some(m=>m.block.cells[i].attach==='BUTTON'),certain:domain.every(m=>m.block.cells[i].attach==='BUTTON')});}}
    for(const report of config.playerButtonCounts||[]){
      const part=observations.filter(o=>o.clock?.player===report.player&&o.clock.round===report.round),actions=new Map();
      for(const o of part.filter(o=>o.kind==='action'))actions.set(o.clock.step,o);
      let lower=0,upper=0;for(const o of actions.values()){if(!o.arrival)continue;const c=cells.get(mod(o.r,n)*n+mod(o.c,n));if(!c||c.possible)upper++;if(c?.certain)lower++;}
      const complete=part.some(o=>o.kind==='turnEnd')&&Array.from({length:Math.max(0,...actions.keys())},(_,i)=>i+1).every(step=>actions.has(step));
      if(lower>report.count||complete&&upper<report.count)return {valid:false,reason:'playerButtonCount'};
    }return {valid:true};
  }
  // Each trap has its own shared parity. Missing actions/players make parity
  // unknown, but cannot excuse two non-stopping entries in one continuous turn.
  function trapCheck(config,placements,observations){
    const n=config.size,traps=new Set();
    for(const m of placements)for(let i=0;i<9;i++)if((m.cellTypes?.[i]||[m.block.cells[i].type]).every(t=>t==='TRAP'))traps.add(mod(m.origin.r+Math.floor(i/3),n)*n+mod(m.origin.c+i%3,n));
    if(!traps.size)return {valid:true};
    const actions=new Map(),ends=new Set();
    for(const o of observations){if(!o.clock||o.clock.round<1)continue;const turn=(o.clock.round-1)*(config.playerCount||1)+o.clock.player;if(o.kind==='turnEnd')ends.add(turn);if(o.kind==='action')actions.set(turn+':'+o.clock.step,{...o,turn});}
    const sorted=[...actions.values()].sort((a,b)=>a.turn-b.turn||a.clock.step-b.clock.step),parities=new Map([...traps].map(k=>[k,new Set([0])])),unknown=()=>{for(const k of traps)parities.set(k,new Set([0,1]));};
    let previous=null;
    for(let i=0;i<sorted.length;i++){
      const o=sorted[i];
      if(!previous?(o.turn!==0||o.clock.step!==1):o.turn===previous.turn?o.clock.step!==previous.clock.step+1:o.turn!==previous.turn+1||!ends.has(previous.turn)||o.clock.step!==1)unknown();
      const k=mod(o.r,n)*n+mod(o.c,n),continues=sorted[i+1]?.turn===o.turn&&sorted[i+1].clock.step===o.clock.step+1;
      if(o.arrival&&traps.has(k)){
        const next=new Set([...parities.get(k)].map(p=>1-p).filter(p=>!continues||p===1));
        if(!next.size)return {valid:false,reason:'trapStop',player:o.clock.player,round:o.clock.round,step:o.clock.step,r:o.r,c:o.c};
        parities.set(k,next);
      }
      previous=o;
    }
    return {valid:true};
  }
  // Unknown turns add one parity variable per BUTTON, never independent variables per door.
  // This preserves linked-door correlations without guessing an unlocated player's path.
  function check(config,placements,observations,includeDoorStates=false){
    for(const selection of [...(config.eventSelections||[]),...(config.eventSelection?[config.eventSelection]:[])]){
      const actions=observations.filter(o=>o.kind==='action'&&o.clock?.player===selection.player&&o.clock.round===selection.round);
      if(placements.length*9<config.size*config.size&&[...selection.coin,...selection.button].some(e=>!actions.some(o=>o.arrival&&o.clock.step===e.step)))continue;
      if(actions.some(o=>o.arrival&&!placements.some(m=>mod(o.r-m.origin.r,config.size)<3&&mod(o.c-m.origin.c,config.size)<3)))continue;
      if(!observations.some(o=>o.kind==='action'&&o.clock?.player===selection.player&&o.clock.round===selection.round))continue;
      const events=eventsForTurn(config,placements,observations,selection.player,selection.round);
      const key=list=>JSON.stringify(list.map(e=>[e.step,e.block,e.row,e.col]));
      if(key(events.coin)!==key(selection.coin)||key(events.button)!==key(selection.button))return {valid:false,uncertain:false,presses:0,reason:'eventSelection'};
    }
    const traps=trapCheck(config,placements,observations);if(!traps.valid)return {...traps,uncertain:false,presses:0};
    const coins=coinBounds(config,placements.map(m=>[m]),observations);if(!coins.valid)return {...coins,uncertain:false,presses:0};
    const timed=observations.filter(o=>o.clock),n=config.size;
    if(!timed.length&&!includeDoorStates)return {valid:true,uncertain:false,presses:0};
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
    for(const report of config.playerButtonCounts||[]){
      const part=timed.filter(o=>o.clock.round===report.round&&o.clock.player===report.player),actions=new Map();
      for(const o of part.filter(o=>o.kind==='action'))actions.set(o.clock.step,o);
      const arrivals=[...actions.values()].filter(o=>o.arrival),known=arrivals.filter(o=>cell(o.r,o.c)?.attach==='BUTTON').length,unknown=arrivals.filter(o=>!cell(o.r,o.c)).length;
      const complete=part.some(o=>o.kind==='turnEnd')&&Array.from({length:Math.max(0,...actions.keys())},(_,i)=>i+1).every(step=>actions.has(step));
      if(known>report.count||complete&&known+unknown<report.count)return {valid:false,uncertain:!complete,presses:known,reason:'playerButtonCount'};
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
    function unknown(round){if(config.buttonCounts?.[round]===0||!buttons.size)return;uncertain=true;for(const links of buttons.values()){const bit=1n<<BigInt(variable++);for(const k of links)doors.get(k).bits^=bit;}}
    const stage=o=>o.kind==='pass'||o.kind==='hit'?0:o.kind==='action'?1:2;
    const sorted=[...new Map(timed.map(o=>[JSON.stringify({...o,index:undefined}),o])).values()].sort((a,b)=>a.clock.round-b.clock.round||a.clock.player-b.clock.player||a.clock.step-b.clock.step||stage(a)-stage(b));
    const turns=new Map();for(const o of sorted){const k=o.clock.round+':'+o.clock.player;if(!turns.has(k))turns.set(k,[]);turns.get(k).push(o);}
    const count=config.playerCount||Math.max(1,...timed.map(o=>o.clock.player+1));let previous=-1;
    for(const list of turns.values()){
      const clock=list[0].clock,turn=clock.round===0?-1:(clock.round-1)*count+clock.player;
      for(let missing=previous+1;missing<turn;missing++)unknown(Math.floor(missing/count)+1);
      let lastStep=0,missingActions=false;const actions=new Set(list.filter(o=>o.kind==='action').map(o=>o.clock.step));
      for(const o of list){
        if(o.clock.round>0&&o.clock.step<1000000&&o.clock.step>lastStep){if(o.clock.step>lastStep+1)unknown(clock.round);lastStep=o.clock.step;}
        if(o.clock.round>0&&o.clock.step===1000000&&!actions.size&&!missingActions){unknown(clock.round);missingActions=true;}
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
      if(clock.round>0&&!list.some(o=>o.kind==='turnEnd'))unknown(clock.round);
      previous=Math.max(previous,turn);
    }
    const result={valid:true,uncertain,presses};
    if(includeDoorStates){
      result.doorStates={};
      for(const [key,state] of doors){let bits=state.bits,value=state.value;
        while(bits){const row=basis.get(bits.toString(2).length-1);if(!row)break;bits^=row.bits;value^=row.value;}
        result.doorStates[key]=bits||cells.size<n*n&&timed.length?'unknown':value?'closed':'open';
      }
    }
    return result;
  }
  const api={check,coinBounds,buttonBounds,trapCheck,eventsForTurn};if(typeof module!=='undefined')module.exports=api;else root.LongNightTimeline=api;
})(globalThis);
