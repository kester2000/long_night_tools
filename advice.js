(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine'):root.LongNight;
  function perspective(built,team,id){
    const v=built.views[id],node=team?.nodes.find(x=>x.id===id+':'+v.model.active),lines=[];
    if(!node||team.conflict||node.fusionConflict||v.ambiguities.length)return lines;
    const singles=node.local?.singles||[],singleIds=[...new Set(singles.map(c=>c.blocks[0].id))];
    if(singleIds.length&&singleIds.length<=8)lines.push('完整覆盖目前已知路线的单区块方案：'+singleIds.map(id=>id+'「'+E.byId.get(id).name+'」').join('、')+'。这是优先核对的简洁解释，多区块拼接仍可能成立，不能据此直接认定区块。');
    if(!singleIds.length&&node.retainedSingles?.length){
      const verified=node.retainedSingles.filter(c=>c.verification==='verified'),pending=node.retainedSingles.filter(c=>c.verification!=='verified');
      const names=cs=>[...new Set(cs.map(c=>c.blocks[0].id))].map(id=>id+'「'+E.byId.get(id).name+'」').join('、');
      if(verified.length)lines.push('此前路线的单区块假设仍成立：'+names(verified)+'。这些原位置的区块均找到符合新增线索的完整地图；路线已向外延伸，当前单区块为0不等于它们被排除，也不代表当前位置仍在原区块。');
      if(pending.length)lines.push('此前单区块假设仍待整图验证：'+names(pending)+'；暂不排除，也不作为确定区块补画。');
    }
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
        probes.push({o,d,groups,score:[...groups.values()].reduce((sum,g)=>sum+g.size*g.size,0)});
      }
      probes.sort((a,b)=>a.score-b.score||(a.o.r===reference.r&&a.o.c===reference.c?-1:0)-(b.o.r===reference.r&&b.o.c===reference.c?-1:0)||a.d-b.d);
      const partitions=new Set();let count=0;
      for(const probe of probes){const signature=[...probe.groups.values()].map(g=>[...g].sort().join(',')).sort().join('|');if(partitions.has(signature))continue;partitions.add(signature);
        lines.push(`区分线索：若再次到达${label(probe.o)}的格子，记录${['上','下','左','右'][probe.d]}侧墙壁。${[...probe.groups].map(([wall,group])=>'若为'+wall+'，候选缩为'+[...group].join(' / ')).join('；')}。这是墙壁私信的预测，不保证移动试探安全。`);
        if(++count===2)break;
      }
      if(sound?.value==='SHASHA'&&domain.some(m=>m.cellTypes?.[E.mod(sound.r-origin.r,n)*3+E.mod(sound.c-origin.c,n)]?.includes('TRAP')))
        lines.push('沙沙后还能继续走，不能排除陷阱：源码规定陷阱奇数次进入发沙沙并放行，偶数次进入才无声强制停止。再次进入有停步风险。');
    }
    return lines;
  }
  function summarize(built,team){
    const self=built.self,v=built.views[self],n=v.model.config.size,lines=[];
    const node=team?.nodes.find(x=>x.id===self+':'+v.model.active),end=v.roundEnds.at(-1);
    const delta=x=>{x=E.mod(x,n);return x>n/2?x-n:x;};
    const relative=(r,c)=>[r?(r<0?'上':'下')+Math.abs(r)+'格':'',c?(c<0?'左':'右')+Math.abs(c)+'格':''].filter(Boolean).join('、')||'同一格';
    for(const capture of built.captures||[])lines.push(`${capture.player}号第${capture.round}回合捕捉${capture.target}号${capture.protected?'（首轮保护）':'，'+capture.target+'号已出局'}。${capture.aligned?'已用捕捉时同格的位置约束对齐地图。':'捕捉瞬间尚未定位，保留同格线索待验证。'}`);
    if(node&&!team.conflict&&!node.fusionConflict&&end?.locatable!==false&&!v.ambiguities.length){
      const at=E.replay(v.model.segments[v.model.active],n),target=E.targets(built.players,v.model.config.captureTarget)[self];
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
    for(const h of team?.hypotheses||[])if(h.confirmedPortal)lines.push(`${h.player}号第${h.round}回合第${h.step}步已确定进入传送门：地面路线已排除，入口已标紫；两步后从配对出口出现，具体出口仍保留${h.groups.find(g=>g.kind==='portal').cases}种路线候选。`);
    if(v.ambiguities.length)lines.push(v.ambiguities.some(a=>a.maskedUnknown)?'心跳掩盖步的落点尚未确定：保留继续地面移动和进入传送门两种分支；请展开该玩家地图下的分支图查看。':'啪嗒仍有水地面 / 传送门分支，分别核对后续行动和方向；唯一验证通过的分支会自动接回主地图。');
    if(team?.conflict)lines.push('当前信息存在冲突，暂不提供唯一相对位置，请核对私信接收者与回合。');
    if(!lines.length)lines.push('继续粘贴完整赛况及你的墙壁、声源方向私信；方向要结合声源的具体步数才能定位。');
    return lines;
  }
  const api={summarize,perspective};if(typeof module!=='undefined')module.exports=api;else root.LongNightAdvice=api;
})(globalThis);
