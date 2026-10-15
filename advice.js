(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine'):root.LongNight;
  function perspective(built,team,id){
    const v=built.views[id],node=team?.nodes.find(x=>x.id===id+':'+v.model.active),lines=[];
    if(!node||team.conflict||node.fusionConflict||v.ambiguities.length)return lines;
    const retained=node.retainedSingles?.filter(c=>c.verification==='verified')||[];
    if(retained.length)lines.push('此前经过的区块仍有完整地图支持：'+[...new Set(retained.map(c=>c.blocks[0].id))].map(id=>id+'「'+E.byId.get(id).name+'」').join('、')+'。路线已向外延伸，请结合当前完整路线核对。');
    const s=node.solution,config=v.model.config,n=config.size,observations=node.mergedObservations||node.observations;
    if(!s||s.irregular||s.phases.length!==1||node.verification?.status!=='verified')return lines;
    const p=s.phases[0];
    lines.push('已录入线索共同锁定了唯一的3×3区块边界；边界确定不等于区块种类已经确定。');
    if(node.verification.blocks?.length)lines.push('已通过唯一性验证的完整区块：'+node.verification.blocks.map(b=>b.id+'「'+E.byId.get(b.id).name+'」').join('、')+'，已补入智能推理地图。');
    const label=o=>o.clock?`第${o.clock.round}回合第${o.clock.step}步`:'已走过的格子';
    for(let k=0;k<p.slots.length;k++){
      const origin=p.slots[k],domain=p.domains[k],ids=[...new Set(domain.map(m=>m.id))];
      if(ids.length<2||ids.length>6)continue;
      const inside=o=>E.mod(o.r-origin.r,n)<3&&E.mod(o.c-origin.c,n)<3;
      const visits=observations.filter(o=>o.kind==='action'&&o.arrival&&inside(o));
      if(!visits.length)continue;
      const sound=observations.find(o=>o.kind==='sound'&&inside(o)),reference=sound||visits[0];
      const proof=ids.map(id=>E.verifyCompleteLayout(config,{...s,phases:[{...p,domains:p.domains.map((d,i)=>i===k?d.filter(m=>m.id===id):d)}]},observations,2000));
      lines.push(`${label(reference)}${sound?'发声格':'经过的格子'}所在区块只剩${ids.length}种候选：${ids.map(id=>id+'「'+E.byId.get(id).name+'」').join('、')}。${proof.every(x=>x.status==='verified')?'每一种都找到了满足本视角已录入线索的完整地图，因此暂时不能任选一种补满。':'其中仍有待完成整图验证的分支，暂不补满。'}`);
      // Recommend observations at visited cells, using both sides of INTERNAL edges.
      // External seams, changing doors and movable boxes cannot predict a fixed reply.
      const probes=[];
      for(const o of new Map(visits.map(o=>[E.key(o.r,o.c),o])).values())for(let d=0;d<4;d++){
        const r=E.mod(o.r-origin.r,n),c=E.mod(o.c-origin.c,n),rr=r+E.V[d][0],cc=c+E.V[d][1];
        if(rr<0||rr>2||cc<0||cc>2)continue;
        if(observations.some(x=>x.r===o.r&&x.c===o.c&&x.kind==='walls'&&x.value[d]!=='?'))continue;
        const answers=domain.map(m=>{if(E.hasBoxes(m.block))return null;const w=Math.max(m.block.cells[r*3+c].walls[d],m.block.cells[rr*3+cc].walls[E.OPP[d]]);return config.dynamicDoors&&(w===3||w===4)?null:E.wallFeedback(w);});
        if(answers.some(a=>a==null))continue;
        const groups=new Map();domain.forEach((m,i)=>{if(!groups.has(answers[i]))groups.set(answers[i],new Set());groups.get(answers[i]).add(m.id);});
        if(groups.size<2||[...groups.values()].some(a=>[...a].some(id=>[...groups.values()].filter(g=>g.has(id)).length>1)))continue;
        probes.push({o,d,groups,worst:Math.max(...[...groups.values()].map(g=>g.size)),score:[...groups.values()].reduce((sum,g)=>sum+g.size*g.size,0)});
      }
      probes.sort((a,b)=>a.worst-b.worst||a.score-b.score||(a.o.r===reference.r&&a.o.c===reference.c?-1:0)-(b.o.r===reference.r&&b.o.c===reference.c?-1:0)||a.d-b.d);
      const partitions=new Set();let count=0;
      for(const probe of (id===built.self?probes:[])){const signature=[...probe.groups.values()].map(g=>[...g].sort().join(',')).sort().join('|');if(partitions.has(signature))continue;partitions.add(signature);
        lines.push(`区分线索：若再次到达${label(probe.o)}的格子，记录${['上','下','左','右'][probe.d]}侧墙壁。${[...probe.groups].map(([wall,group])=>'若为'+wall+'，候选缩为'+[...group].join(' / ')).join('；')}。本区块候选最坏剩 ${probe.worst} 种；这是墙壁私信的预测，不保证移动试探安全。`);
        if(++count===2)break;
      }
      if(sound?.value==='SHASHA'&&domain.some(m=>m.cellTypes?.[E.mod(sound.r-origin.r,n)*3+E.mod(sound.c-origin.c,n)]?.includes('TRAP')))
        lines.push('沙沙后还能继续走，不能排除陷阱：源码规定陷阱奇数次进入发沙沙并放行，偶数次进入才无声强制停止。再次进入有停步风险。');
    }
    return lines;
  }
  function status(built){
    const config=built.views[built.self].model.config,targets=E.targets(built.players,config.captureTarget||built.model.target);
    return built.players.map((player,id)=>({id,alive:player.alive,reason:player.reason||'未记录退场',coins:player.coins,target:targets[id],hunter:targets.findIndex(t=>t===id),round:Math.max(0,...built.views[id].roundEnds.map(e=>e.round)),pending:built.views[id].pending}));
  }
  function radar(built,team,id){
    const v=built.views[id],node=team?.nodes.find(n=>n.id===id+':'+v.model.active);
    if(!node||team.conflict||node.fusionConflict||v.ambiguities.length)return null;
    const at=E.replay(v.model.segments[v.model.active],v.model.config.size),obs=node.mergedObservations||at.observations;
    if(!obs.length)return null;
    const local=E.globallyFilter(E.matchBlocks(v.model.config,obs,at),node.solution),ids=[...new Set(local.matches.map(m=>m.id))];
    const certain=node.verification?.status==='verified'&&node.verification.blocks?.find(b=>E.mod(at.r-b.origin.r,v.model.config.size)<3&&E.mod(at.c-b.origin.c,v.model.config.size)<3);
    return {ids,gap:local.gap,verified:certain?.id||null,segment:v.model.active};
  }
  function practical(built){
    const self=built.self,v=built.views[self],lines=[],config=v.model.config;
    const coinBlocks=E.pool(config).filter(b=>b.cells.some(c=>c.attach==='COIN')).map(b=>b.id+'「'+b.name+'」').join('、');
    for(const gain of config.coinGains||[]){
      if((config.coinTransferRounds||[]).includes(gain.round))lines.push(`${gain.player}号第${gain.round}回合获得金币；该回合有捕捉或抢夺记录，保留转移来源，暂不强制绑定金币格。`);
      else lines.push(`${gain.player}号第${gain.round}回合获得${gain.max==null?'至少'+gain.min:gain.min}枚金币：当回合路线必须经过相应数量的未消耗金币格，候选区块为${coinBlocks||'无（请核对区块池）'}；已用于筛选完整路线与地图，重复经过同格只计一次。`);
    }
    for(const [round,count] of Object.entries(config.buttonCounts||{}))lines.push(`第${round}回合门公告：全体玩家共触发按钮${count}次；用于核对已定位落点，双方完整路线与全图确定后核对总数。`);
    for(const segment of v.model.segments){let entry=null;for(const e of segment.events){
      if(e.portalLink)entry=e;
      if(e.kind==='teleport'&&entry){lines.push(`你第${entry.clock.round}回合第${entry.clock.step}步进入传送门，第${e.clock.step}步从配对出口出现；中间两步不产生地面平移${config.silent?'，静音下没有啪嗒提示':''}。`);entry=null;}
    }}
    const walls=v.model.segments.flatMap(s=>s.events).filter(e=>e.kind==='observe');
    if(!walls.some(e=>e.clock?.round===0))lines.push('待补充：你自己的开局四墙（上 / 下 / 左 / 右）。');
    const missingWalls=v.roundEnds.filter(end=>!walls.some(e=>e.clock?.round===end.round));
    if(missingWalls.length)lines.push('待核对本人四墙：第 '+missingWalls.map(e=>e.round).join('、')+' 回合尚未录入。请补贴当时实际收到的消息；主动停止、退场或终局可能没有发送，不从赛后地图反推。');
    lines.push('信息来源：所有人的公屏轨迹 + 你自己的私聊。可补贴机器人私聊「完整赛况 文字」中的方向历史、本人地形与心跳掩盖提示；保留回合和步数。首次发声、心跳掩盖、隐匿及退场可能不发送方向，屏蔽提示也请保留。');
    if(config.heartPresence===true&&!config.silent)lines.push('心跳节拍：每回合第 1 / 4 / 7 / 10 / 13 / 16 / 19 步可能掩盖地形声。捕捉、陷阱和热源仍会生效，不能当作安全路线。');
    const visits=v.model.segments.flatMap(s=>E.replay(s,config.size).observations).filter(o=>o.kind==='terrain'&&o.value==='HEAT');
    if(visits.length)lines.push('你已有进入热源的明确记录；源码规定之后再进入任何热源会强制停止本回合。');
    const traps=v.model.segments.flatMap(s=>E.replay(s,config.size).observations).filter(o=>o.kind==='terrain'&&o.value==='TRAP');
    if(traps.length)lines.push('已确认踩入陷阱 '+traps.length+' 次；陷阱触发次数由所有玩家共享，奇数次放行、偶数次强停，个人记录不足以保证下一次放行。');
    return lines;
  }
  function hypothesis(h){
    const lines=[],label=`${h.player}号第${h.round}回合第${h.step}步`,names=ids=>ids.map(id=>id+'「'+E.byId.get(id).name+'」').join('、');
    if(h.recovery)lines.push(h.recovery==='reopened'?`${h.player}号原先接上的路线已出现矛盾，已自动撤回旧选择并重新检查传送门入口。`:`${h.player}号原有路线无法解释全部线索，已自动在声音未知或可能被心跳掩盖的步骤补充传送门假设；只有通过完整验证的唯一方案才会接回主地图。`);
    if(h.groundOnly?.status==='impossible')lines.push(`${h.player}号全程按地面移动的解释已排除：与已录入的行动、墙壁及地图约束矛盾。${h.requiresPortal?'已验证存在传送门路线，因此至少经过一次传送门。':'正在核对传送门路线，尚未完成的分支保持待验证。'}`);
    if(h.truncated&&h.search)lines.push(`${h.player}号传送搜索已检查${h.search.visited}个节点，还有${h.search.pending}个分支待验证；不能据此声称没有传送。`);
    for(const g of h.groups){
      const condition=g.kind==='ground'?'若未进入传送门':'若进入传送门';
      if(g.excluded){lines.push(label+'：'+condition+'，此分支已排除。');continue;}
      if(g.verification.status==='verified'&&g.verification.blocks.length)lines.push(label+'：'+condition+'，该分支锁定完整区块 '+names(g.verification.blocks.map(b=>b.id))+'；仅在此条件下成立。');
      const example=g.alternatives?.find(a=>!a.pending&&a.exampleRoute?.length);
      if(g.kind==='ground'&&example)lines.push('地面分支的一张可行整图举例：'+example.exampleRoute.slice(0,6).map(o=>`第${o.clock?.step||'?'}步到${o.id}号区块第${o.lr+1}行第${o.lc+1}列（${o.types.map(t=>E.TYPES[t]).join(' / ')}）`).join(' → ')+'。路线可以跨区块，不能只按同一个3×3区块排除；举例中的非锁定区块仍可有其他选择。');
      if(g.kind==='portal'){
        const ids=[...new Set((g.alternatives||[]).flatMap(a=>a.entryBlocks))];
        lines.push(label+'：'+condition+'，'+(g.pending?'仍有待验证路线':'保留 '+(g.alternatives?.length||g.cases)+' 种完整路线')+(ids.length&&ids.length<=8?'；入口区块候选为 '+names(ids):'')+'。亚空间内两步不按箭头画地面位移，出口后的声音和撞墙按各方案分别保留。');
      }
    }
    return lines;
  }
  function summarize(built,team){
    const self=built.self,v=built.views[self],n=v.model.config.size,lines=[];
    const node=team?.nodes.find(x=>x.id===self+':'+v.model.active),end=v.roundEnds.at(-1);
    const delta=x=>{x=E.mod(x,n);return x>n/2?x-n:x;};
    const relative=(r,c)=>[r?(r<0?'上':'下')+Math.abs(r)+'格':'',c?(c<0?'左':'右')+Math.abs(c)+'格':''].filter(Boolean).join('、')||'同一格';
    if(v.model.config.brawl)lines.push('大乱斗：逃生只计分并随机传送，玩家仍存活；原逃生落点不是传送后的当前位置。');
    if(v.model.config.pointCapture===false)lines.push('已关闭点杀：路过目标也会触发捕捉。');
    lines.push(...practical(built));
    for(const view of built.views)if(view.model.portalRecovery)lines.push(`${view.id}号已启用传送门补充推理：重新检查此前声音未知或可能被心跳掩盖的入口，按配对出口、后续撞墙和公告验证。`);
    for(const other of built.views.filter(v=>v.id!==self))for(const segment of other.model.segments){let entry=null;for(const e of segment.events){
      if(e.portalLink)entry=e;
      if(e.kind==='teleport'&&entry){lines.push(`${other.id}号第${entry.clock.round}回合第${entry.clock.step}步进入传送门，${e.clock.round!==entry.clock.round?'第'+e.clock.round+'回合':''}第${e.clock.step}步从配对出口出现；亚空间内两步不按地面移动绘制${other.model.config.silent?'，静音下也会发生传送':''}。`);entry=null;}
    }}
    if(node?.solution&&!v.ambiguities.length)for(const gain of v.model.config.coinGains||[]){
      if(gain.player!==self||(v.model.config.coinTransferRounds||[]).includes(gain.round))continue;
      const obs=node.mergedObservations||node.observations,arrivals=obs.filter(o=>o.kind==='action'&&o.arrival),steps=new Set();
      for(const o of arrivals.filter(o=>o.clock?.player===self&&o.clock.round===gain.round)){
        if(arrivals.some(p=>p.r===o.r&&p.c===o.c&&p.clock&&(p.clock.round<o.clock.round||p.clock.round===o.clock.round&&(p.clock.player<self||p.clock.player===self&&p.clock.step<o.clock.step))))continue;
        if(node.solution.phases.some(p=>p.domains.some(d=>d.some(m=>E.mod(o.r-m.origin.r,n)<3&&E.mod(o.c-m.origin.c,n)<3&&m.block.cells[E.mod(o.r-m.origin.r,n)*3+E.mod(o.c-m.origin.c,n)].attach==='COIN'))))steps.add(o.clock.step);
      }
      if(steps.size)lines.push(`你第${gain.round}回合的金币拾取候选：第${[...steps].sort((a,b)=>a-b).join('、')}步；已排除已知此前经过及重复经过的金币格。`);
    }
    for(const other of built.views)for(const e of other.model.segments.flatMap(s=>s.events).filter(e=>e.firstSound))lines.push(`${other.id}号第${e.clock.round}回合第${e.clock.step}步为本局首次发声：此前未隐匿移动已排除发声地形，心跳掩盖也算此前发声；“首次”本身不提供方位。`);
    for(const h of team?.hypotheses||[])lines.push(...hypothesis(h));
    for(const capture of built.captures||[])lines.push(`${capture.player}号第${capture.round}回合捕捉${capture.target}号${capture.protected?'（首轮保护）':'，'+capture.target+'号已出局'}。${capture.aligned?'已用捕捉时同格的位置约束对齐地图。':'捕捉瞬间尚未定位，保留同格线索待验证。'}`);
    if(node&&!team.conflict&&!node.fusionConflict&&end?.locatable!==false&&!v.ambiguities.length){
      const at=E.replay(v.model.segments[v.model.active],n),target=E.targets(built.players,v.model.config.captureTarget||v.model.target)[self];
      for(const joined of node.joined||[]){const [id,segment]=joined.id.split(':').map(Number),other=built.views[id],last=other.roundEnds.at(-1);
        if(id===self||segment!==other.model.active||!built.players[id].alive||other.ambiguities.length||last?.locatable===false||!last)continue;
        const p=E.replay(other.model.segments[segment],n);
        lines.push(`${id}号${id===target?'（你的捕捉目标）':''}第${last.round}回合末，在你第${end?.round||0}回合末位置的${relative(delta(p.r+joined.dr-at.r),delta(p.c+joined.dc-at.c))}。这是对应回合的已知位置；尚未录入的行动可能改变它。`);
      }
      for(const other of built.views){
        if(other.id===self||!built.players[other.id].alive||other.ambiguities.length)continue;
        const id=other.id+':'+other.model.active,pair=team.pairs?.find(p=>p.a===node.id&&p.b===id||p.b===node.id&&p.a===id),last=other.roundEnds.at(-1);
        if(!pair||pair.offsets.length<2||!last||last.locatable===false)continue;
        const p=E.replay(other.model.segments[other.model.active],n),sign=pair.a===node.id?1:-1,positions=[...new Set(pair.offsets.map(o=>relative(delta(p.r+sign*o.dr-at.r),delta(p.c+sign*o.dc-at.c))))];
        lines.push(`${other.id}号第${last.round}回合末，相对你第${end?.round||0}回合末仍有${positions.length}个候选位置${positions.length<=8?'：'+positions.join('；'):''}。方向已参与排除，但还不足以唯一定位；继续补充对方行动或新的方向私信。`);
      }
      const blocks=node.verification?.status==='verified'?node.verification.blocks:[];
      if(blocks.length)lines.push(`已验证${blocks.length}个完整区块，智能地图补齐这些区块；其余区域仍保留未知。`);
    }
    const hears=built.views.flatMap(x=>x.hears).filter(h=>h.a!==h.b),used=built.relations.filter(h=>h.kind!=='capture');
    if(hears.length)lines.push(`方向私信：${used.length}/${hears.length}条已接入主地图${used.length<hears.length?'；传送分支中仍会用已定位的声源步数和接收者位置筛选，出口未唯一时暂不接回主图':''}。`);
    if(v.model.config.heartPresence===false)lines.push('公开行动中出现了应被心跳覆盖的地形声，已排除心脏区块；无声移动也参与排除必然发声的地形。');
    if(v.model.config.heartPresence===true)lines.push('已确认本局存在心脏：完整地图必须包含51号。每回合第1/4/7/10/13/16/19步的地形声可能被掩盖；这些步只显示箭头时，也会检查是否进入传送门。');
    if(v.model.config.heartConflict)lines.push('心跳信息互相冲突，请核对公开轨迹与私聊记录。');
    for(const h of team?.hypotheses||[])if(h.confirmedPortal){
      const portal=h.groups.find(g=>g.kind==='portal'),exits=portal.alternatives?.flatMap(a=>a.teleports).filter(e=>e.round===h.round&&e.step===h.step+2)||[];
      const maskedExit=exits.length&&v.model.config.heartPresence===true&&h.step+2<=19&&(h.step+1)%3===0;
      lines.push(`${h.player}号第${h.round}回合第${h.step}步已确定进入传送门：地面路线已排除，入口已标紫；${exits.length?'第'+(h.step+2)+'步':'两步后'}从配对出口出现，具体出口仍保留${portal.cases}种路线候选。${maskedExit?'出门步恰逢心跳，出口啪嗒可被掩盖；没有显示啪嗒不等于没有传送。':''}`);
    }
    if(v.ambiguities.length)lines.push(v.ambiguities.some(a=>a.silentUnknown)?'静音移动仍可能进入传送门：按各分支核对后续行动、金币和门公告，亚空间内两步不画作地面移动；尚未搜完的分支保留待验证。':v.ambiguities.some(a=>a.maskedUnknown)?'心跳掩盖步的落点尚未确定：保留继续地面移动和进入传送门两种分支；请展开该玩家地图下的分支图查看。':'啪嗒仍有水地面 / 传送门分支，分别核对后续行动和方向；唯一验证通过的分支会自动接回主地图。');
    if(team?.conflict)lines.push('当前信息存在冲突，暂不提供唯一相对位置，请核对私信接收者与回合。');
    if(!lines.length)lines.push('继续粘贴完整赛况及你的墙壁、声源方向私信；方向要结合声源的具体步数才能定位。');
    return lines;
  }
  const api={summarize,perspective,status,radar,practical,hypothesis};if(typeof module!=='undefined')module.exports=api;else root.LongNightAdvice=api;
})(globalThis);
