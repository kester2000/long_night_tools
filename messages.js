(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.LongNight;
  const arrows={'↑':0,'↓':1,'←':2,'→':3};
  const clean=s=>s.replace(/\r/g,'').replace(/\\([()[\]])/g,'$1').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').trim();
  function expandReport(text){
    const lines=text.split('\n'),out=[],lastRounds=new Map();let player=null,snapshot=false;
    for(let i=0;i<lines.length;i++){
      const line=lines[i],heading=line.match(/^\s*(?:\[|【)(\d+)号(?:】|\])([^\n]*)$/);
      if(heading){
        if(/完整行动轨迹|本回合行动轨迹|正在行动中/.test(heading[2])){
          player=null;
          if(/正在行动中/.test(heading[2])){const id=+heading[1];if(snapshot)out.push('【第 '+((lastRounds.get(id)||0)+1)+' 回合】');out.push(line);}
          else out.push(line);
        }else if(!/第\s*\d+步|你听见|声响|方向/.test(heading[2])){player=+heading[1];snapshot=true;out.push('');}
        else out.push(line);
        continue;
      }
      const round=line.match(/^\s*【第\s*(\d+)\s*回合】\s*$/);
      if(round&&player!=null){
        const next=[];for(let j=i+1;j<lines.length&&!/^\s*(?:【第|\[\d+号\]|\[BOSS\]|\[额外信息\])/.test(lines[j]);j++)next.push(lines[j]);
        if(!/您所在位置|四周墙壁信息|你听见了/.test(next.join('\n'))){lastRounds.set(player,+round[1]);out.push(line,'['+player+'号]玩家本回合的完整行动轨迹：');continue;}
        player=null;
      }
      if(/^\s*\[(?:BOSS|额外信息)\]/.test(line)){player=null;out.push('\n记录附注：');}
      out.push(line);
    }
    return {text:out.join('\n'),snapshot};
  }
  function parse(text){
    const expanded=expandReport(clean(text).replace(/\[([↑↓←→])掩盖\[([^\]]+)\]\]/g,'[$1掩盖$2]')),raw=expanded.text,items=[],warnings=[];
    if(raw.length>30000)throw new Error('一次消息最多 30000 字，请分段粘贴。');
    const identity=raw.match(/(?:我是|我的(?:玩家)?(?:编号|号码)(?:是|为)?|自己是)\s*\[?(\d+)\s*号?/);
    if(identity){if(+identity[1]>7)throw new Error('玩家编号应为 0–7。');items.push({kind:'identity',id:+identity[1]});}
    const size=raw.match(/(?:边长|地图大小|地图边长|本局游戏地图为)\s*[:：为是]?\s*(9|10|12)(?!\d)|(?:【|\[)(9|10|12)\s*[*×x]\s*\2(?:】|\])/);
    if(size)items.push({kind:'config',values:{size:+(size[1]||size[2])}});
    const mode=raw.match(/(?:模式\s*[:：为是]?\s*|「)(经典|幻变|狂野|疯狂|按钮|陷阱|空旷|无声)(?:模式)?/);
    if(mode)items.push({kind:'config',values:{mode:({经典:'CLASSIC',幻变:'TWIST',狂野:'WILD',疯狂:'CRAZY',按钮:'BUTTON',陷阱:'TRAP',空旷:'OPEN',无声:'SILENT'})[mode[1]],pool:''}});
    const event=raw.match(/(?:特殊事件\s*[:：为是]?\s*|【)(怠惰的园丁|营养过剩|雨天小故事)(?:】)?/);
    if(event)items.push({kind:'config',values:{event:({怠惰的园丁:'LAZYGARDENER',营养过剩:'OVERGROWTH',雨天小故事:'RAINSTORY'})[event[1]]}});
    const mute=raw.match(/静音\s*[:：为是]?\s*(开启|关闭)|【静音】/);if(mute)items.push({kind:'config',values:{silent:mute[1]!=='关闭'}});
    const target=raw.match(/捕捉目标\s*[:：为是]?\s*(上家|下家)/);if(target)items.push({kind:'config',values:{captureTarget:target[1]==='下家'?'NEXT':'PREVIOUS'}});
    const heart=raw.match(/(?:本局|这局)(没有|无|有|存在)\s*(?:巨大的)?心脏|心脏\s*[:：为是]?\s*(存在|有|无|没有)/);
    if(heart)items.push({kind:'config',values:{heartPresence:!['没有','无'].includes(heart[1]||heart[2])}});
    const pool=raw.match(/(?:本局(?:公开)?区块(?:池)?|区块池|自定义区块|区块)\s*[:：]\s*((?:(?:[ESes]?\d+)\s*[,，、\s]*)+)/);
    if(/区块池\s*[:：]\s*(?:默认|模式池)/.test(raw))items.push({kind:'config',values:{pool:''}});
    if(pool){const value=pool[1].toUpperCase().match(/[ES]?\d+/g).join(' ');E.pool({...E.newState().config,pool:value});items.push({kind:'config',values:{pool:value}});}
    const count=raw.match(/(?:玩家人数|玩家数量|人数)\s*[:：为是=]?\s*(\d+)|(?:共|共有)\s*(\d+)\s*(?:名|位|个)?玩家/);
    if(count){const playerCount=+(count[1]||count[2]);if(playerCount<1||playerCount>8)throw new Error('玩家人数应为 1–8。');items.push({kind:'config',values:{playerCount}});}
    const exits=raw.match(/(?:逃生(?:舱|区块)(?:数量|数)?|出口数)\s*[:：为是=]\s*(\d+)/);
    if(exits){if(+exits[1]>16)throw new Error('逃生区块数量最多 16。');items.push({kind:'config',values:{exitCount:+exits[1]}});}
    const walls=/[墙空?？](?:[\s,，、]*[墙空?？]){3}/g;
    for(const match of raw.matchAll(walls)){
      const before=raw.slice(0,match.index),rounds=[...before.matchAll(/【第\s*(\d+)\s*回合】/g)];
      const openingMatches=[...before.matchAll(/(?:【|\[)开局(?:】|\])/g)],opening=!!openingMatches.length&&(!rounds.length||openingMatches.at(-1).index>rounds.at(-1).index);
      let player=[...before.matchAll(/(?:\[|【)(\d+)号(?:】|\])/g)].at(-1);
      if(player&&/您所在位置|你所在位置/.test(before.slice(player.index)))player=null;
      items.push({kind:'walls',value:E.parseWalls(match[0]),opening,round:!opening&&rounds.length?+rounds.at(-1)[1]:null,player:player?+player[1]:null,at:match.index});
    }
    const header=/(?:\[|【)(\d+)号(?:】|\])[^\n]*?(?:完整行动轨迹|本回合行动轨迹|正在行动中)\s*[:：]\s*/g;
    const headers=[...raw.matchAll(header)];
    for(let h=0;h<headers.length;h++){
      const match=headers[h],start=match.index+match[0].length;
      let body=raw.slice(start,h+1<headers.length?headers[h+1].index:undefined);
      body=body.split(/(?:您所在位置|四周墙壁信息|你听见了|声响方向被屏蔽|记录附注：)/)[0];
      const roundMatches=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      const tokens=[],tokenPattern=/\[([^\[\]]*)\]|\(([^()]*)\)|([↑↓←→](?:沙沙|啪嗒|啪啪|啪)?)(?:\s*[×xX*]\s*(\d+))?/g;
      for(const token of body.matchAll(tokenPattern)){
        const content=token[1]??token[2]??token[3],arrow=content.match(/[↑↓←→]/)?.[0];
        if(arrow){
          const sound=/沙沙/.test(content)?'SHASHA':/啪嗒|啪啪|啪/.test(content)?'PAPA':'';
          const terrain=/浆果丛/.test(content)?'BERRY':/热源/.test(content)?'HEAT':'';
          const direction=content.match(/\((正上|正下|正左|正右|左上|右上|左下|右下|同格|首次|被屏蔽)\)/)?.[1]||null;
          const count=token[4]?+token[4]:1;if(count<1||count>200)throw new Error('合并移动次数需为 1–200。');
          for(let i=0;i<count;i++)tokens.push({kind:'move',dir:arrows[arrow],outcome:/撞/.test(content)?'hit':'move',sound,terrain,direction,masked:/掩盖/.test(content),quiet:!sound&&!terrain&&content.trim()===arrow});
        }else if(/隐匿|传送|捕捉|逃生|陷阱|热源|浆果丛/.test(content))tokens.push({kind:'marker',value:content});
      }
      if(!tokens.length)warnings.push(`${match[1]}号的轨迹没有可识别的方向，已保留原文。`);
      items.push({kind:'trajectory',player:+match[1],tokens,round:roundMatches.length?+roundMatches.at(-1)[1]:null,hidden:/隐匿/.test(body),snapshot:expanded.snapshot,partial:/正在行动中/.test(match[0]),at:match.index});
    }
    const soundPattern=/(?:\[|【)(\d+)号(?:\(第\s*(\d+)\s*步\))?(?:】|\])[^\n]*?(?:来自【(正上|正下|正左|正右|左上|右上|左下|右下)(?:方)?】|声响方向被屏蔽|本局首次发声)[^\n]*/g;
    for(const match of raw.matchAll(soundPattern)){
      if(headers.some((h,i)=>match.index>=h.index&&(i+1===headers.length||match.index<headers[i+1].index)))continue;
      const priorRounds=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      items.push({kind:'hear',round:priorRounds.length?+priorRounds.at(-1)[1]:null,player:+match[1],step:match[2]?+match[2]:null,direction:match[3]||(/被屏蔽/.test(match[0])?'被屏蔽':'首次'),at:match.index});
    }
    // Private movement feedback supplements the public route, including sounds hidden by heartbeats.
    for(const match of raw.matchAll(/(?:\[|【)第\s*(\d+)\s*步(?:\]|】)[^\n]*?(?:移动发出|移动进入)[^\n]*?(啪嗒声|啪啪声|沙沙声)[^\n]*/g)){
      const rounds=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      items.push({kind:'personalSound',step:+match[1],round:rounds.length?+rounds.at(-1)[1]:null,sound:/沙沙/.test(match[2])?'SHASHA':'PAPA',masked:/心跳.*掩盖|掩盖.*心跳/.test(match[0]),at:match.index});
    }
    // Configuration precedes spatial information; remaining pieces preserve the pasted order.
    for(const item of items)if(item.player!=null&&(item.player<0||item.player>7))throw new Error('玩家编号应为 0–7。');
    items.sort((a,b)=>(a.at??-1)-(b.at??-1));
    if(!items.length)warnings.push('这段文字暂未识别到墙壁、完整轨迹或方位信息；已作为笔记保留，不会猜测位置。');
    return {items,warnings,snapshot:expanded.snapshot};
  }
  // parse() is pure but heavy (regex over full text). A bounded LRU keeps
  // repeated settings()/checkInput()/renderBoard()/build() scans cheap, because
  // those helpers re-parse the whole journal after every input. Trajectory
  // tokens MUST be cloned on every hit: buildOne()'s look-ahead writes
  // token.noSubspace in place, and a shared token would leak state between
  // rebuilds (e.g. dropping a later collision would keep the old exclusion).
  const parseCache=new Map();
  const cloneParsed=result=>({items:result.items.map(i=>i.kind==='trajectory'?{...i,tokens:i.tokens.map(t=>({...t}))}:{...i}),warnings:[...result.warnings],snapshot:result.snapshot});
  function parseCached(text){
    if(parseCache.has(text)){const hit=parseCache.get(text);parseCache.delete(text);parseCache.set(text,hit);return cloneParsed(hit);}
    const result=parse(text);
    if(parseCache.size>=512)parseCache.delete(parseCache.keys().next().value);
    parseCache.set(text,cloneParsed(result));
    return cloneParsed(result);
  }
  function prepare(messages){
    const parsed=messages.map(m=>parseCached(m.text)),rounds=new Map(),latest=new Map();
    for(const p of parsed)for(const item of p.items)if(item.kind==='trajectory'){
      if(item.round==null)item.round=(rounds.get(item.player)||0)+1;
      if(!item.partial)rounds.set(item.player,Math.max(rounds.get(item.player)||0,item.round));
      const key=item.player+':'+item.round,old=latest.get(key);
      if(old&&((!old.partial&&item.partial)||(old.partial===item.partial&&old.hidden===item.hidden&&JSON.stringify(old.tokens)===JSON.stringify(item.tokens))))item.skipReplay=true;
      else{if(old)old.skipReplay=true;latest.set(key,item);}
    }
    // Replay an updated historical turn at its first occurrence, so later full
    // reports cannot move round 1 behind an already-recorded round 2.
    const groups=new Map();
    for(const p of parsed)for(const item of p.items)if(item.kind==='trajectory'){
      const key=item.player+':'+item.round;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({p,item});
    }
    for(const group of groups.values()){
      const first=group[0],selected=group.find(x=>!x.item.skipReplay);if(!selected||selected===first)continue;
      const updated={...selected.item,at:first.item.at,skipReplay:false};
      for(const entry of group)entry.item.skipReplay=true;
      Object.assign(first.item,updated);first.p.warnings.push('此回合已按后续完整赛况补全，仍在原回合顺序重放。');
    }
    let self=0;for(const p of parsed)for(const item of p.items)if(item.kind==='identity')self=item.id;
    const routes=parsed.flatMap((p,index)=>p.items.filter(i=>i.kind==='trajectory'&&!i.skipReplay).map(item=>({index,item})));
    for(let index=0;index<parsed.length;index++)for(const sound of parsed[index].items.filter(i=>i.kind==='personalSound')){
      const player=messages[index].view??self,candidates=routes.filter(r=>r.item.player===player&&(sound.round==null||r.item.round===sound.round));
      const route=candidates.filter(r=>r.index<=index).at(-1)||candidates[0];
      const token=route?.item.tokens.filter(t=>t.kind==='move')[sound.step-1];
      if(!token||token.outcome==='hit'){
        parsed[index].warnings.push('第 '+sound.step+' 步声音尚未找到对应的成功移动；请补充回合号和完整轨迹。');continue;
      }
      token.sound=sound.sound;token.masked=sound.masked;token.quiet=false;sound.linkedRound=route.item.round;sound.player=player;
    }
    // A direction notification is never sent for the source's first terrain sound.
    // In the first turn, quiet public steps leave only heartbeat-masked arrivals
    // as possible earlier sounds. A single remaining arrival is positive evidence.
    const declaredHeart=parsed.flatMap(p=>p.items).filter(i=>i.kind==='config'&&typeof i.values.heartPresence==='boolean').at(-1)?.values.heartPresence;
    const hasHeart=declaredHeart??routes.some(r=>r.item.tokens.some(t=>t.masked));
    for(let index=0;index<parsed.length;index++)for(const hear of parsed[index].items.filter(i=>i.kind==='hear'&&i.step&& !['首次','被屏蔽'].includes(i.direction))){
      const candidates=routes.filter(r=>r.item.player===hear.player&&(hear.round==null||r.item.round===hear.round));
      const route=candidates.filter(r=>r.index<=index).at(-1)||candidates[0];
      if(!route||route.item.round!==1||route.item.hidden)continue;
      const moves=route.item.tokens.filter(t=>t.kind==='move');if(moves.length<hear.step)continue;
      const prior=moves.slice(0,hear.step-1);
      if(prior.some(t=>t.sound||t.terrain==='BERRY'))continue;
      const possible=prior.flatMap((t,i)=>t.outcome==='move'&&hasHeart&&i<19&&i%3===0?[i]:[]);
      if(possible.length===1){moves[possible[0]].audible=true;hear.priorSoundStep=possible[0]+1;}
    }
    return parsed;
  }
  function receiverFor(message,parsed,self){const receiver=message.view??self,hears=parsed.items.filter(i=>i.kind==='hear');return hears.length&&hears.every(h=>h.player===receiver)&&receiver!==self?self:receiver;}
  function buildOne(base,messages,view,defaultView,choices={}){
    const model=E.clone(base),reports=[],metadata={self:0,round:0,completed:new Set(),pending:new Map(),ends:new Map(),sourceSteps:new Map(),sourcePending:new Map()};
    const ambiguities=[],branchErrors=[],lifecycle=[];let space=null;
    const parsed=prepare(messages);
    let heartPresent=false,heartAbsent=false;
    for(const p of parsed)for(const route of p.items.filter(i=>i.kind==='trajectory'&&!i.skipReplay&&!i.hidden)){let step=0;for(const t of route.tokens)if(t.kind==='move'){step++;if(t.masked)heartPresent=true;else if(t.sound&&(step-1)%3===0&&step<=19)heartAbsent=true;}}
    const explicitHeart=parsed.flatMap(p=>p.items).filter(i=>i.kind==='config'&&typeof i.values.heartPresence==='boolean').at(-1)?.values.heartPresence;
    model.config.heartPresence=explicitHeart??(heartPresent&&heartAbsent?null:heartAbsent?false:heartPresent?true:null);
    model.config.heartConflict=heartPresent&&heartAbsent;
    // Look ahead in the same player's next two actions. An actual collision is impossible inside subspace.
    const routes=parsed.flatMap((p,index)=>p.items.filter(i=>i.kind==='trajectory'&&!i.skipReplay).map(item=>({item,index})));
    for(let ri=0;ri<routes.length;ri++){const route=routes[ri];for(let ti=0;ti<route.item.tokens.length;ti++){
      const token=route.item.tokens[ti];if(token.kind!=='move'||token.outcome==='hit')continue;
      const after=[];let stopped=false,lastRound=route.item.round;
      for(let rj=ri;rj<routes.length&&after.length<2&&!stopped;rj++){
        const next=routes[rj].item;if(next.player!==route.item.player)continue;
        if(rj>ri){if(next.hidden||(lastRound!=null&&next.round!=null&&next.round!==lastRound+1))break;lastRound=next.round;}
        for(let tj=rj===ri?ti+1:0;tj<next.tokens.length&&after.length<2;tj++){const t=next.tokens[tj];if(t.kind==='marker'&&/传送|捕捉|逃生|隐匿/.test(t.value)){stopped=true;break;}if(t.kind==='move')after.push(t);}
      }
      if(after.some(t=>t.outcome==='hit'))token.noSubspace=true;
    }}
    for(const p of parsed)for(const i of p.items)if(i.kind==='identity')metadata.self=i.id;
    metadata.self=view;if(view!==defaultView){model.segments=[{name:'初始轨迹',events:[],sounds:[],anchors:[]}];model.active=0;}const steps=[],hears=[];
    const seg=()=>model.segments[model.active];
    const pos=()=>E.replay(seg(),model.config.size);
    const newSegment=()=>{model.segments.push({name:'待定位片段 '+(model.segments.length+1),events:[],sounds:[],anchors:[]});model.active=model.segments.length-1;};
    const putWalls=(target,observation,at,inSpace)=>{if(inSpace){if(observation.walls.includes('墙'))branchErrors.push('亚空间内不会反馈墙壁');}else target.events.push({...observation,r:at.r,c:at.c});};
    for(let index=0;index<messages.length;index++){
      const p=parsed[index],summary=[],warnings=[...p.warnings],receiver=receiverFor(messages[index],p,defaultView);
      if(receiver!==(messages[index].view??defaultView))warnings.push(`这条声源私信原来归给了发声者本人，已自动按接收者 ${receiver} 号关联。`);
      for(const item of p.items){
        if(item.kind==='identity'){summary.push(`按 ${metadata.self} 号视角推理`);continue;}
        if(item.kind==='personalSound'){
          if(item.player===view&&item.linkedRound)summary.push(`${view}号第 ${item.linkedRound} 回合第 ${item.step} 步${item.sound==='PAPA'?'啪嗒声':'沙沙声'}${item.masked?'（心跳掩盖）':''}，已关联完整轨迹`);
          continue;
        }
        if(item.kind==='config'){
          if(item.values.size&&item.values.size!==model.config.size&&(base.segments.some(s=>s.events.length||s.sounds.length)||parsed.slice(0,index).some(p=>p.items.some(i=>['walls','trajectory','hear'].includes(i.kind))))){warnings.push('边长改变，已有相对路线不能直接换算；请新建对局后先输入边长。');continue;}
          Object.assign(model.config,item.values);summary.push('识别对局设置');continue;
        }
        if(item.kind==='walls'){
          if((item.player??receiver)!==view)continue;
          const observation={kind:'observe',walls:item.value};
          if(item.opening){const middle=Math.floor(model.config.size/2);model.segments[0].events.push({...observation,r:middle,c:middle,clock:{round:0,player:view,step:0}});summary.push('开局墙壁 '+item.value);}
          else if(item.round&&!metadata.completed.has(item.round)){
            if(!metadata.pending.has(item.round))metadata.pending.set(item.round,[]);metadata.pending.get(item.round).push({...observation,clock:{round:item.round,player:view,step:1000000}});summary.push(`第 ${item.round} 回合墙壁 ${item.value}（等待该回合轨迹）`);
          }else{const end=item.round?metadata.ends.get(item.round):null,at=end||pos();const target=end?model.segments[end.segment]:seg();putWalls(target,{...observation,clock:{round:item.round||metadata.round,player:view,step:1000000}},at,end?end.inSpace:!!space);summary.push((item.round?`第 ${item.round} 回合墙壁 `:'当前位置墙壁 ')+item.value);}
          continue;
        }
        if(item.kind==='trajectory'){
          if(item.skipReplay){warnings.push('同玩家同回合已有更新记录，没有再次累计移动。');continue;}
          if(item.player!==metadata.self){
            const source=item.player+'号';let step=0,ambiguous=false;
            if(item.hidden){seg().sounds.push({kind:'reset',source});warnings.push(source+'含隐匿，已重置其位置候选。');}
            for(const t of item.tokens){
              if(t.kind==='marker'){if(/传送|捕捉|逃生/.test(t.value))seg().sounds.push({kind:'reset',source});continue;}
              step++;
              if(ambiguous){seg().sounds.push({kind:'reset',source});ambiguous=false;}
              seg().sounds.push({kind:'move',source,dir:t.dir,outcome:t.outcome});
              for(const hear of metadata.sourcePending.get(source)||[])if(hear.step===step){
                if(hear.segment===model.active)seg().sounds.push({kind:'hear',source,direction:hear.direction,listener:hear.listener});
                else warnings.push('一条旧声响属于不同的相对地图片段，暂未混入当前定位。');
              }
              if(t.direction&&receiver===view){const at=pos();hears.push({a:view,b:item.player,listener:{r:at.r,c:at.c},segment:model.active,step,index,round:item.round,direction:t.direction,snapshot:item.snapshot});seg().sounds.push({kind:'hear',source,direction:t.direction,listener:{r:at.r,c:at.c}});}
              if(t.sound==='PAPA'&&!t.noSubspace)ambiguous=true;
            }
            metadata.sourcePending.delete(source);metadata.sourceSteps.set(source,step);summary.push(`记录 ${source} ${step} 步公开轨迹`);continue;
          }
          const round=item.round||metadata.round+1;
          if(metadata.completed.has(round)){warnings.push(`第 ${round} 回合轨迹已录入，没有再次累计移动。`);continue;}
          if(item.hidden){space=null;newSegment();warnings.push('轨迹含隐匿，未猜测隐藏位移，已开始待定位片段。');}
          const eventStarts=model.segments.map(s=>s.events.length);
          let moves=0,hits=0,uncertain=false,cut=false,step=0,relocation=null;const heartPossible=E.pool(model.config).some(b=>b.cells.some(c=>c.type==='HEART'));
          for(const t of item.tokens){
            if(t.kind==='marker'){
              if(/捕捉|逃生/.test(t.value))lifecycle.push({kind:/捕捉/.test(t.value)?'capture':'escape',protected:/首轮/.test(t.value)||round===1&&/捕捉/.test(t.value),player:view,round,step,index,segment:model.active,r:pos().r,c:pos().c,locatable:!cut});
              if(/逃生/.test(t.value)&&!cut){const at=pos();seg().events.push({kind:'observe',r:at.r,c:at.c,terrain:'EXIT'});summary.push('逃生成功：确认逃生舱位置');}
              else if(/传送/.test(t.value)){relocation=lifecycle.some(e=>e.kind==='capture'&&e.index===index&&e.round===round)?'capture':'teleport';space=null;cut=true;uncertain=true;}
              else if(/浆果丛|陷阱|热源/.test(t.value)&&!cut){const at=pos();seg().events.push({kind:'observe',r:at.r,c:at.c,terrain:/浆果丛/.test(t.value)?'BERRY':/陷阱/.test(t.value)?'TRAP':'HEAT'});}
              continue;
            }
            step++;if(cut)continue;
            if(space){
              if(t.outcome==='hit')branchErrors.push('亚空间内两步不能撞墙');
              space.remaining--;
              if(space.remaining>0){if(t.sound||t.terrain)branchErrors.push('亚空间第一步不会踩到地形并发声');seg().events.push({kind:'move',dir:t.dir,outcome:'space'});}
              else{
                if(t.quiet&&!model.config.silent&&!(heartPossible&&(step-1)%3===0&&step<=19)||t.sound&&t.sound!=='PAPA')branchErrors.push('离开亚空间时应在出口发出啪嗒声');
                seg().events.push({kind:'move',dir:t.dir,outcome:'space'},{kind:'teleport',dr:space.dr,dc:space.dc});
                const at=pos();seg().events.push({kind:'observe',r:at.r,c:at.c,terrain:'PORTAL',sound:t.sound==='PAPA'?'PAPA':''});space=null;
                steps.push({index,round,step,r:at.r,c:at.c,segment:model.active});
              }
              moves++;continue;
            }
            const choiceKey=index+':'+item.at+':'+step,choice=choices[choiceKey];
            const maskedUnknown=model.config.heartPresence===true&&step<=19&&(step-1)%3===0&&!t.sound&&!t.terrain&&!item.hidden;
            const possibleEntry=t.sound==='PAPA'||maskedUnknown;
            seg().events.push({kind:'move',dir:t.dir,outcome:t.outcome,sound:t.sound,terrain:t.terrain,audible:!!t.audible,nonPortalSound:!!t.noSubspace&&possibleEntry&&t.outcome==='move',quiet:!!t.quiet&&t.outcome==='move'&&!item.hidden&&!model.config.silent&&!(heartPossible&&(step-1)%3===0&&step<=19)});
            const point=pos();steps.push({index,round,step,r:point.r,c:point.c,segment:model.active});
            if(t.outcome==='hit')hits++;else moves++;
            if(t.noSubspace&&possibleEntry&&t.outcome==='move')summary.push((maskedUnknown?'心跳掩盖步':'水声')+'后的两步内发生撞击，排除进入亚空间；已按普通地面路线继续绘制。');
            if(possibleEntry&&!t.noSubspace&&t.outcome==='move'){
              if(choice?.kind==='ground')seg().events.push({kind:'observe',r:point.r,c:point.c,nonPortalSound:true});
              else if(choice?.kind==='portal'){
                seg().events.push({kind:'observe',r:point.r,c:point.c,terrain:'PORTAL',portalLink:{dr:choice.dr,dc:choice.dc}});
                space={remaining:2,dr:choice.dr,dc:choice.dc,entry:{r:point.r,c:point.c},segment:model.active};
              }else{ambiguities.push({key:choiceKey,index,round,step,segment:model.active,maskedUnknown,entry:{r:point.r,c:point.c}});cut=true;uncertain=true;}
            }
          }
          if(uncertain){
            newSegment();
            if(relocation)summary.push(relocation==='capture'?'捕捉后随机传送：已保留捕捉时的位置与同格线索，传送后开始新的待定位片段。':'已记录随机传送，传送后开始新的待定位片段。');
            if(!relocation||ambiguities.some(a=>a.index===index))warnings.push('出现水声 / 传送信息，后续可能包含亚空间位移。已保留整段原文，暂不把不确定路径硬接入地图；后续墙壁会定位新的片段。');
          }
          if(!item.partial&&!uncertain)seg().events.push({kind:'turn',clock:{round,player:view,step:1000000}});
          let clockStep=0;for(let si=0;si<model.segments.length;si++)for(const e of model.segments[si].events.slice(eventStarts[si]??0)){if(e.kind==='move')clockStep++;if(!e.clock)e.clock={round,player:view,step:clockStep};}
          metadata.round=Math.max(metadata.round,round);if(!item.partial)metadata.completed.add(round);
          const at=pos();metadata.ends.set(round,{r:at.r,c:at.c,segment:model.active,inSpace:!!space,locatable:!uncertain});for(const o of metadata.pending.get(round)||[])putWalls(seg(),o,at,!!space);metadata.pending.delete(round);
          summary.push(`${item.player}号第 ${round} 回合：确认移动 ${moves} 步${hits?'，撞墙 '+hits+' 次':''}`);continue;
        }
        if(item.kind==='hear'){
          if(receiver!==view)continue;
          if(item.priorSoundStep)summary.push(`${item.player}号第 ${item.step} 步能被听见，说明此前已发声；第1回合只有第 ${item.priorSoundStep} 步可能被心跳掩盖，已要求该步落点为会发声的地形，并分别验证地面与传送门路线。`);
          const at=pos(),source=item.player+'号';hears.push({a:view,b:item.player,listener:{r:at.r,c:at.c},segment:model.active,step:item.step,index,round:item.round,direction:item.direction});
          if(item.step){if(!metadata.sourcePending.has(source))metadata.sourcePending.set(source,[]);metadata.sourcePending.get(source).push({step:item.step,direction:item.direction,listener:{r:at.r,c:at.c},segment:model.active});summary.push(`${source}第 ${item.step} 步声源：${item.direction}（与完整轨迹自动关联）`);}
          else{seg().sounds.push({kind:'hear',source,direction:item.direction,listener:{r:at.r,c:at.c}});summary.push(`${source}声源：${item.direction}`);}
        }
      }
      reports.push({summary:[...new Set(summary)],warnings});
    }
    return {model,reports,self:metadata.self,pending:[...metadata.pending.keys()],steps,hears,ambiguities,branchErrors,space,lifecycle,roundEnds:[...metadata.ends].map(([round,end])=>({round,...end}))};
  }
  function build(base,messages,choicesByPlayer={}){
    const parsed=prepare(messages);let self=0,count=base.config.playerCount||base.players.length||4,highest=0;
    for(let k=0;k<parsed.length;k++){if(messages[k].view!=null&&parsed[k].items.some(i=>i.kind==='walls'||i.kind==='hear'))highest=Math.max(highest,messages[k].view);for(const i of parsed[k].items){if(i.kind==='identity')self=i.id;if(i.kind==='config'&&i.values.playerCount)count=i.values.playerCount;if(i.player!=null)highest=Math.max(highest,i.player);}}
    if(!Number.isInteger(count)||count<1||count>8)throw new Error('玩家人数应为 1–8。');
    const requested=count;count=Math.max(count,highest+1,self+1);
    const views=Array.from({length:count},(_,id)=>({id,...buildOne(base,messages,id,self,choicesByPlayer[id]||{})}));
    for(const v of views){v.model.config.playerCount=count;
      if(v.model.config.exitCount==null)v.model.config.exitCount=Math.min(E.pool(v.model.config).filter(b=>b.id.startsWith('E')).length,v.model.config.size===12?4:Math.max(1,Math.floor(count/2)));
      v.model.players=Array.from({length:count},(_,id)=>base.players[id]||{name:id+'号',alive:true});}
    const relations=[];
    for(const v of views)for(const h of v.hears){
      if(h.a===h.b||!views[h.b]||!h.step)continue;
      let source;
      if(h.round!=null)source=views[h.b].steps.find(s=>s.step===h.step&&s.round===h.round);
      else {
        const summaries=parsed.map((p,index)=>({index,items:p.items.filter(i=>i.kind==='trajectory'&&i.player===h.b)})).filter(p=>p.items.length);
        const closest=summaries.filter(p=>p.index<=h.index).at(-1)||summaries.find(p=>p.index>h.index);
        if(closest)source=views[h.b].steps.find(s=>s.index===closest.index&&s.step===h.step);
      }
      if(source){
        let listener=h.listener,segment=h.segment;
        const round=h.round??source.round;
        if(round!=null){const before=round-(h.a>h.b?1:0),end=v.roundEnds.filter(e=>e.round<=before).sort((a,b)=>b.round-a.round)[0];listener=end?{r:end.r,c:end.c}:{r:Math.floor(v.model.config.size/2),c:Math.floor(v.model.config.size/2)};segment=end?.segment||0;if(end?.inSpace||end?.locatable===false)continue;}
        relations.push({...h,round,listener,segment,source:{r:source.r,c:source.c},aNode:h.a+':'+segment,bNode:h.b+':'+source.segment});
      }
    }
    const players=Array.from({length:count},(_,id)=>({name:id+'号',alive:base.players[id]?.alive!==false})),events=views.flatMap(v=>v.lifecycle).sort((a,b)=>a.round-b.round||a.player-b.player||a.step-b.step),captures=[];
    for(const event of events){
      if(event.kind==='escape'){players[event.player].alive=false;players[event.player].reason='已逃生';continue;}
      const target=E.targets(players,views[event.player].model.config.captureTarget||base.target)[event.player];
      if(target==null)continue;
      const before=event.round-(target>event.player?1:0),end=views[target].roundEnds.find(e=>e.round===before),middle=Math.floor(views[event.player].model.config.size/2);
      const at=end||before===0?end||{r:middle,c:middle,segment:0}:null;
      const targetRoute=at&&views[target].model.segments[at.segment],validTarget=at&&!at.inSpace&&(before===0||targetRoute?.events.some(e=>e.kind==='turn'&&e.clock?.round===before));
      const capture={...event,target,aligned:!!(event.locatable&&validTarget)};captures.push(capture);
      if(capture.aligned)relations.push({kind:'capture',a:event.player,b:target,aNode:event.player+':'+event.segment,bNode:target+':'+at.segment,listener:{r:event.r,c:event.c},source:{r:at.r,c:at.c},direction:'同格',round:event.round});
      if(!event.protected){players[target].alive=false;players[target].reason='被'+event.player+'号捕捉';}
    }
    for(const v of views)v.model.players=E.clone(players);
    const reports=messages.map((m,k)=>{const owners=new Set(parsed[k].items.filter(i=>i.kind==='trajectory').map(i=>i.player)),owner=owners.size===1?[...owners][0]:null;return views[parsed[k].snapshot?receiverFor(m,parsed[k],self):owner??receiverFor(m,parsed[k],self)]?.reports[k]||views[self].reports[k];});
    if(count>requested&&reports.length)reports.at(-1).warnings.push('已有 '+(count-1)+' 号玩家的信息，人数至少为 '+count+'；保留这些信息并自动补齐视角。');
    const main=views[self];return {...main,self,views,count,relations,reports,captures,players};
  }
  function openingPool(text,mode,unknownSpecial=false){
    const tokens=text.trim().toUpperCase().replace(/(?:本局区块池|区块池)\s*[:：]/g,'').split(/[\s,，、;；]+/).filter(Boolean);
    if(!tokens.length)throw new Error('请按开局图填写普通区块和逃生舱编号。');
    if(tokens.some(id=>!E.byId.has(id)))throw new Error('区块编号无效：'+tokens.filter(id=>!E.byId.has(id)).join('、')+'。逃生舱使用 E 前缀，特殊区块使用 S 前缀。');
    if(unknownSpecial&&mode!=='CRAZY')throw new Error('只有疯狂模式需要填写隐藏的特殊区块。');
    if(unknownSpecial)tokens.push(...[...E.byId.keys()].filter(id=>id.startsWith('S')));
    return [...new Set(tokens)].join(' ');
  }
  const api={openingPool,parse,build,buildHypothesis:buildOne,clean,receiverFor};if(typeof module!=='undefined')module.exports=api;else root.LongNightMessages=api;
})(globalThis);
