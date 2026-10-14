(function(root){
  'use strict';
  const E=typeof module!=='undefined'?require('./engine.js'):root.LongNight;
  const arrows={'↑':0,'↓':1,'←':2,'→':3};
  const clean=s=>s.replace(/\r/g,'').replace(/\\([()[\]])/g,'$1').replace(/(?:<|&lt;)隐匿行动(?:>|&gt;)/g,'(隐匿行动)').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]*>/g,'').trim();
  function expandReport(text){
    const lines=text.split('\n'),out=[],lastRounds=new Map(),statuses=[];let player=null,snapshot=false;
    for(let i=0;i<lines.length;i++){
      const line=lines[i],heading=line.match(/^\s*(?:\[|【)(\d+)号(?:】|\])([^\n]*)$/);
      if(heading){
        if(/超时|挂机|退出游戏/.test(heading[2])){player=null;out.push(line);continue;}
        if(/(?:获得|拾取|捡到|吃到|吃了|抢夺).*金币/.test(heading[2])){player=null;out.push(line);continue;}
        if(/完整行动轨迹|本回合行动轨迹|正在行动中/.test(heading[2])){
          player=null;
          if(/正在行动中/.test(heading[2])){const id=+heading[1];if(snapshot)out.push('【第 '+((lastRounds.get(id)||0)+1)+' 回合】');out.push(line);}
          else out.push(line);
        }else if(!/第\s*\d+步|你听见|声响|方向/.test(heading[2])){player=+heading[1];snapshot=true;if(/【已出局】|【逃生舱撤离】/.test(heading[2]))statuses.push({kind:'status',player,reason:heading[2].includes('【已出局】')?'已出局':'已逃生'});const coins=heading[2].match(/\[🪙(\d+)\]/);if(coins)statuses.push({kind:'coins',player,count:+coins[1]});out.push('');}
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
    return {text:out.join('\n'),snapshot,statuses};
  }
  function parse(text){
    const expanded=expandReport(clean(text).replace(/\[([↑↓←→])掩盖\[([^\]]+)\]\]/g,'[$1掩盖$2]')),raw=expanded.text,items=[...expanded.statuses],warnings=[];
    if(raw.length>30000)throw new Error('一次消息最多 30000 字，请分段粘贴。');
    const identity=raw.match(/(?:我是|我的(?:玩家)?(?:编号|号码)(?:是|为)?|自己是)\s*\[?(\d+)\s*号?/);
    if(identity){if(+identity[1]>7)throw new Error('玩家编号应为 0–7。');items.push({kind:'identity',id:+identity[1]});}
    const size=raw.match(/(?:边长|地图大小|地图边长|本局游戏地图为)\s*[:：为是]?\s*(9|10|12)(?!\d)|(?:【|\[)(9|10|12)\s*[*×x]\s*\2(?:】|\])/);
    if(size)items.push({kind:'config',values:{size:+(size[1]||size[2])}});
    const mode=raw.match(/(?:模式\s*[:：为是]?\s*|「)(经典|幻变|狂野|疯狂|按钮|陷阱|空旷|无声)(?:模式)?/);
    if(mode)items.push({kind:'config',values:{mode:({经典:'CLASSIC',幻变:'TWIST',狂野:'WILD',疯狂:'CRAZY',按钮:'BUTTON',陷阱:'TRAP',空旷:'OPEN',无声:'SILENT'})[mode[1]],pool:''}});
    const event=raw.match(/特殊事件\s*[:：为是]?\s*(无|怠惰的园丁|营养过剩|雨天小故事)|【(怠惰的园丁|营养过剩|雨天小故事)】/);
    if(event)items.push({kind:'config',values:{event:({无:'NONE',怠惰的园丁:'LAZYGARDENER',营养过剩:'OVERGROWTH',雨天小故事:'RAINSTORY'})[event[1]||event[2]]}});
    const mute=raw.match(/静音\s*[:：为是]?\s*(开启|关闭)|【静音】/);if(mute)items.push({kind:'config',values:{silent:mute[1]!=='关闭'}});
    const target=raw.match(/捕捉目标\s*(?:变更为|[:：为是])?\s*(上家|下家)/);if(target)items.push({kind:'config',values:{captureTarget:target[1]==='下家'?'NEXT':'PREVIOUS'}});
    const brawl=raw.match(/大乱斗(?:模式)?\s*[:：为是]?\s*(开启|关闭)|【大乱斗模式】/);if(brawl)items.push({kind:'config',values:{brawl:brawl[1]!=='关闭'}});
    const point=raw.match(/点杀\s*[:：为是]?\s*(开启|关闭)|【关闭点杀】/);if(point)items.push({kind:'config',values:{pointCapture:point[1]==='开启'}});
    const heart=raw.match(/(?:本局|这局)(没有|无|有|存在)\s*(?:巨大的)?心脏|心脏\s*[:：为是]?\s*(存在|有|无|没有)/);
    if(heart)items.push({kind:'config',values:{heartPresence:!['没有','无'].includes(heart[1]||heart[2])}});
    const pool=raw.match(/(?:本局(?:公开)?区块(?:池)?|区块池|自定义区块|区块)\s*[:：]\s*((?:(?:[ESes]?\d+)\s*[,，、\s]*)+)/);
    if(/区块池\s*[:：]\s*(?:默认|模式池)/.test(raw))items.push({kind:'config',values:{pool:''}});
    if(pool){const value=pool[1].toUpperCase().match(/[ES]?\d+/g).join(' ');E.pool({...E.newState().config,pool:value});items.push({kind:'config',values:{pool:value}});}
    const count=raw.match(/(?:玩家人数|玩家数量|游戏人数|人数)\s*[:：为是=]?\s*(\d+)|(?:共|共有)\s*(\d+)\s*(?:名|位|个)?玩家/);
    if(count){const playerCount=+(count[1]||count[2]);if(playerCount<1||playerCount>8)throw new Error('玩家人数应为 1–8。');items.push({kind:'config',values:{playerCount}});}
    const exits=raw.match(/(?:逃生(?:舱|区块)(?:数量|数)?|出口数)\s*[:：为是=]\s*(\d+)/);
    if(exits){if(+exits[1]>16)throw new Error('逃生区块数量最多 16。');items.push({kind:'config',values:{exitCount:+exits[1]}});}
    for(const match of raw.matchAll(/玩家\s*(?:\[|【)?(\d+)号(?:】|\])?\s*退出游戏/g))items.push({kind:'status',player:+match[1],reason:'退出游戏',at:match.index});
    for(const match of raw.matchAll(/(?:\[|【)?(\d+)\s*号(?:[：:][^\]】\n]*[】\]]|[】\]])?\s*(?:获得|拾取|捡到|吃到|吃了)(?:了)?\s*(?:(\d+)\s*枚?\s*)?金币(?:[（(]当前共持有\s*(\d+)\s*枚[）)])?/g)){
      const rounds=[...raw.slice(0,match.index).matchAll(/第\s*(\d+)\s*回合/g)];
      items.push({kind:'coins',player:+match[1],count:match[3]===undefined?null:+match[3],gained:match[2]===undefined?null:+match[2],pickup:true,round:rounds.length?+rounds.at(-1)[1]:null,at:match.index});
    }
    if(/声响方向被屏蔽|本回合只提醒第一声/.test(raw)||/\((?:被屏蔽)\)/.test(raw))items.push({kind:'feature',value:'JAMMERBOX'});
    if(/\[热浪(?:\(第\d+步\))?\]|移动进入【热浪范围】|[↑↓←→]热浪/.test(raw))items.push({kind:'feature',value:'HEAT'});
    for(const match of raw.matchAll(/门曾被按钮触发，(?:共)?发生\s*(\d+)\s*次变化/g)){const rounds=[...raw.slice(0,match.index).matchAll(/第\s*(\d+)\s*回合/g)];items.push({kind:'doorCount',count:+match[1],round:rounds.length?+rounds.at(-1)[1]:null,at:match.index});}
    for(const match of raw.matchAll(/抢夺了[^\n]*金币/g)){const rounds=[...raw.slice(0,match.index).matchAll(/第\s*(\d+)\s*回合/g)];items.push({kind:'coinTransfer',round:rounds.length?+rounds.at(-1)[1]:null,at:match.index});}
    if(/\[BOSS(?:-|\])|邦邦所在位置|沉重的喘息声/.test(raw))warnings.push('包含 BOSS 信息：已保留原文；当前未模拟 BOSS 路线与捕捉。');
    const walls=/[墙空?？](?:[\s,，、]*[墙空?？]){3}/g;let wallEnd=0;
    for(const match of raw.matchAll(walls)){
      const before=raw.slice(0,match.index),rounds=[...before.matchAll(/【第\s*(\d+)\s*回合】/g)];
      const openingMatches=[...before.matchAll(/(?:【|\[)开局(?:】|\])/g)],opening=!!openingMatches.length&&(!rounds.length||openingMatches.at(-1).index>rounds.at(-1).index);
      let player=[...before.matchAll(/(?:\[|【)(\d+)号(?:】|\])/g)].at(-1);
      if(player&&/您所在位置|你所在位置/.test(before.slice(player.index)))player=null;
      const context=before.slice(Math.max(before.lastIndexOf('四周墙壁信息')-150,wallEnd));wallEnd=match.index+match[0].length;
      if(/邦邦所在位置|BOSS[^\n]*四周墙壁信息/.test(context)){warnings.push('检测到 BOSS 四墙播报，已保留原文，不归给玩家。');continue;}
      const publicOwner=[...context.matchAll(/玩家\s*(?:\[|【)?\s*(\d+)\s*号(?:】|\])?[^\n]*(?:超时|挂机|停止|未行动)/g)].at(-1);
      if(publicOwner)player=[null,publicOwner[1]];
      else if(/(?:超时|挂机)[^\n]*(?:未行动|停止)|玩家[^\n]*超时/.test(context)&&!player){warnings.push('公屏四墙的玩家编号未识别，未计入任何地图；请补上 [N号] 再录入。');continue;}
      items.push({kind:'walls',value:E.parseWalls(match[0]),opening,round:!opening&&rounds.length?+rounds.at(-1)[1]:null,player:player?+player[1]:null,at:match.index});
    }
    const header=/(?:\[|【)(\d+)号(?:】|\])[^\n]*?(?:完整行动轨迹|本回合行动轨迹|正在行动中)\s*[:：]\s*/g;
    const headers=[...raw.matchAll(header)];
    for(let h=0;h<headers.length;h++){
      const match=headers[h],start=match.index+match[0].length;
      let body=raw.slice(start,h+1<headers.length?headers[h+1].index:undefined);
      body=body.split(/(?:您所在位置|四周墙壁信息|\[\d+号\(第\s*\d+\s*步\)\]|你听见了|声响方向被屏蔽|记录附注：)/)[0];
      const roundMatches=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      const tokens=[],tokenPattern=/\[([^\[\]]*)\]|\(([^()]*)\)|([↑↓←→](?:沙沙|啪嗒|啪啪|啪)?)(?:\s*[×xX*]\s*(\d+))?|(�)/g;
      for(const token of body.matchAll(tokenPattern)){
        if(token[5]){tokens.push({kind:'hidden',steps:1});continue;}
        const content=token[1]??token[2]??token[3],arrow=content.match(/[↑↓←→]/)?.[0];
        if(arrow){
          if(/炸飞出局/.test(content)){tokens.push({kind:'marker',value:'炸飞出局',step:true});continue;}
          const sound=/沙沙/.test(content)?'SHASHA':/啪嗒|啪啪|啪/.test(content)?'PAPA':'';
          const terrain=/浆果丛/.test(content)?'BERRY':/热源/.test(content)?'HEAT':'';
          const direction=/首次(?:发声)?/.test(content)?'首次':content.match(/\((正上|正下|正左|正右|左上|右上|左下|右下|同格|被屏蔽)\)/)?.[1]||null;
          const count=token[4]?+token[4]:1;if(count<1||count>200)throw new Error('合并移动次数需为 1–200。');
          for(let i=0;i<count;i++)tokens.push({kind:'move',dir:arrows[arrow],outcome:/撞|炸飞出局/.test(content)?'hit':'move',sound,terrain,direction,masked:/掩盖/.test(content),merged:count>1,quiet:!sound&&!terrain&&content.trim()===arrow});
        }else if(/^(?:本局)?首次(?:发声)?$/.test(content.trim())){
          const previous=tokens.findLast(t=>t.kind==='move');if(previous)previous.direction='首次';
        }else if(/隐匿/.test(content))tokens.push({kind:'hidden',steps:null});
        else if(/传送|捕捉|逃生|陷阱|热源|浆果丛|出局/.test(content))tokens.push({kind:'marker',value:content});
      }
      if(!tokens.length)warnings.push(`${match[1]}号的轨迹没有可识别的方向，已保留原文。`);
      items.push({kind:'trajectory',player:+match[1],tokens,round:roundMatches.length?+roundMatches.at(-1)[1]:null,hidden:tokens.some(t=>t.kind==='hidden'),snapshot:expanded.snapshot,partial:/正在行动中/.test(match[0]),at:match.index});
    }
    const soundPattern=/(?:\[|【)(\d+)号(?:\(第\s*(\d+)\s*步\))?(?:】|\])\s*(?:(?!\n\s*(?:\[|【)).)*?(?:来自【(正上|正下|正左|正右|左上|右上|左下|右下)(?:方)?】|声响方向被屏蔽|本局首次发声|进入了你所在|进入了你的小树丛|同一片液体|一臂之遥|汗毛直立，有人来了|看来是有人来了)[^\n]*/gs;
    for(const match of raw.matchAll(soundPattern)){
      if(/完整行动轨迹|本回合行动轨迹|正在行动中/.test(match[0]))continue;
      const priorRounds=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      items.push({kind:'hear',round:priorRounds.length?+priorRounds.at(-1)[1]:null,player:+match[1],step:match[2]?+match[2]:null,direction:match[3]||(/被屏蔽/.test(match[0])?'被屏蔽':/首次发声/.test(match[0])?'首次':'同格'),at:match.index});
    }
    for(const match of raw.matchAll(/(?:玩家\s*)?(\d+)号\s*(?:玩家\s*)?(?:第\s*(\d+)\s*回合\s*)?第\s*(\d+)\s*步\s*(?:是|为|明确标了是|明确为|：|:)?\s*(?:本局)?首次发声/g)){
      const rounds=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      items.push({kind:'firstSound',player:+match[1],round:match[2]?+match[2]:rounds.length?+rounds.at(-1)[1]:null,step:+match[3],at:match.index});
    }
    // Private movement feedback supplements the public route, including sounds hidden by heartbeats.
    for(const match of raw.matchAll(/(?:\[|【)第\s*(\d+)\s*步(?:\]|】)[^\n]*?(?:移动发出|移动进入)[^\n]*?(啪嗒声|啪啪声|沙沙声|树丛|浆果丛)[^\n]*/g)){
      const rounds=[...raw.slice(0,match.index).matchAll(/【第\s*(\d+)\s*回合】/g)];
      items.push({kind:'personalSound',step:+match[1],round:rounds.length?+rounds.at(-1)[1]:null,sound:/沙沙|树丛|浆果丛/.test(match[2])?'SHASHA':'PAPA',masked:/心跳.*掩盖|掩盖.*心跳/.test(match[0]),firstSound:/首次发声/.test(match[0]),at:match.index});
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
      if(old&&old.snapshot&&item.snapshot&&!old.partial&&!item.partial){
        const core=t=>JSON.stringify(t.tokens.filter(x=>x.kind==='move'||x.kind==='hidden').map(x=>[x.kind,x.dir,x.outcome]));
        const detail=t=>t.tokens.reduce((n,x)=>n+!!x.sound+2*!!x.masked+3*!!x.terrain+!!x.direction,0);
        if(core(old)===core(item)&&detail(old)>detail(item)){item.skipReplay=true;continue;}
      }
      if(old&&((!old.partial&&item.partial)||(old.partial===item.partial&&old.hidden===item.hidden&&JSON.stringify(old.tokens)===JSON.stringify(item.tokens))))item.skipReplay=true;
      else{if(old)old.skipReplay=true;latest.set(key,item);}
    }
    // Standalone end-of-round broadcasts inherit the preceding completed turn,
    // never a later message or the selected map. Explicit round labels win.
    const completed=new Map();let currentRound=0;
    for(const p of parsed)for(const item of p.items){
      if(item.kind==='trajectory'&&!item.partial){completed.set(item.player,item.round);currentRound=item.round;}
      if((item.kind==='doorCount'||item.kind==='coinTransfer'||item.kind==='coins'&&item.pickup)&&item.round==null){
        item.round=item.kind==='coins'?completed.get(item.player)??(currentRound||null):currentRound||null;
        item.inferredRound=item.round!=null;
      }
    }
    // Direction annotations belong to the query receiver, not to the globally
    // selected copy of a player's route. Preserve them even if that route is
    // replaced by a later public snapshot or another listener's private report.
    for(const p of parsed){const embedded=[];
      for(const item of p.items.filter(i=>i.kind==='trajectory')){let step=0;
        for(const t of item.tokens){if(t.kind==='hidden'){step+=t.steps||0;continue;}if(t.kind!=='move')continue;step++;
          if(t.direction)embedded.push({kind:'hear',player:item.player,round:item.round,step,direction:t.direction,embedded:true,at:item.at+.1});
        }
      }
      p.items.push(...embedded);p.items.sort((a,b)=>(a.at??-1)-(b.at??-1));
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
      const token=route?.item.tokens.filter(t=>t.kind==='move'||t.kind==='hidden')[sound.step-1];
      if(!token||token.outcome==='hit'){
        parsed[index].warnings.push('第 '+sound.step+' 步声音尚未找到对应的成功移动；请补充回合号和完整轨迹。');continue;
      }
      token.sound=sound.sound;token.masked=sound.masked;token.quiet=false;sound.linkedRound=route.item.round;sound.player=player;
      if(sound.firstSound)parsed[index].items.push({kind:'firstSound',player,round:route.item.round,step:sound.step,at:sound.at});
    }
    // First terrain sound is game-wide, including sounds masked by a heartbeat.
    // Preserve this positive annotation even when a later public report replaces
    // the private copy carrying it. Hidden actions do not set trigger_sound.
    for(let index=0;index<parsed.length;index++)for(const first of parsed[index].items.filter(i=>i.kind==='firstSound'||i.kind==='hear'&&i.direction==='首次'&&i.step)){
      const candidates=routes.filter(r=>r.item.player===first.player&&(first.round==null||r.item.round===first.round));
      const route=candidates.filter(r=>r.index<=index).at(-1)||candidates[0];
      const token=route?.item.tokens.filter(t=>t.kind==='move'||t.kind==='hidden')[first.step-1];
      if(!token||token.kind!=='move'||token.outcome!=='move'){
        parsed[index].warnings.push('首次发声第 '+first.step+' 步尚未找到对应成功移动，请补充回合号和完整轨迹。');continue;
      }
      token.firstSound=true;token.audible=true;token.quiet=false;first.linkedRound=route.item.round;
      for(const prior of routes.filter(r=>r.item.player===first.player&&r.item.round<=route.item.round)){
        if(prior.item.hidden)continue;
        const moves=prior.item.tokens.filter(t=>t.kind==='move'||t.kind==='hidden'),limit=prior.item.round===route.item.round?first.step-1:moves.length;
        for(const t of moves.slice(0,limit))if(t.kind==='move'&&t.outcome==='move'){
          if(t.sound||t.audible||t.masked)throw new Error(`${first.player}号首次发声标注与此前已录入的地形声或心跳掩盖声冲突，请核对回合和步数。`);
          t.beforeFirstSound=true;
        }
      }
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
      const moves=route.item.tokens.filter(t=>t.kind==='move'||t.kind==='hidden');if(moves.length<hear.step)continue;
      const prior=moves.slice(0,hear.step-1);
      if(prior.some(t=>t.sound||t.terrain==='BERRY'))continue;
      const possible=prior.flatMap((t,i)=>t.outcome==='move'&&!t.merged&&hasHeart&&i<19&&i%3===0?[i]:[]);
      if(possible.length===1){moves[possible[0]].audible=true;hear.priorSoundStep=possible[0]+1;}
    }
    return parsed;
  }
  function receiverFor(message,parsed,self){const receiver=message.view??self,hears=parsed.items.filter(i=>i.kind==='hear');return !message.receiverConfirmed&&hears.length&&hears.every(h=>h.player===receiver)&&receiver!==self?self:receiver;}
  function buildOne(base,messages,view,defaultView,choices={},assumptions={}){
    const model=E.clone(base),reports=[],metadata={self:0,round:0,completed:new Set(),pending:new Map(),ends:new Map(),sourceSteps:new Map(),sourcePending:new Map()};
    model.portalRecovery=!!choices.__portalRecovery;
    const ambiguities=[],branchErrors=[],lifecycle=[];let space=null;
    const parsed=prepare(messages);
    let heartPresent=false,heartAbsent=false;
    for(const p of parsed)for(const route of p.items.filter(i=>i.kind==='trajectory'&&!i.skipReplay&&!i.hidden)){let step=0;for(const t of route.tokens)if(t.kind==='move'){step++;if(t.masked)heartPresent=true;else if(t.sound&&(step-1)%3===0&&step<=19)heartAbsent=true;}}
    const explicitHeart=parsed.flatMap(p=>p.items).filter(i=>i.kind==='config'&&typeof i.values.heartPresence==='boolean').at(-1)?.values.heartPresence;
    model.config.heartPresence=explicitHeart??(heartPresent&&heartAbsent?null:heartAbsent?false:heartPresent?true:null);
    const assumedHeart=assumptions.heartPresence===true||Object.values(choices).some(c=>c?.requiresHeart);
    if(assumedHeart){if(model.config.heartPresence===false)branchErrors.push('补充的传送门假设需要心跳掩盖，但已知本局没有心脏');else model.config.heartPresence=true;}
    model.config.heartConflict=heartPresent&&heartAbsent;
    const brawl=parsed.flatMap(p=>p.items).filter(i=>i.kind==='config'&&typeof i.values.brawl==='boolean').at(-1)?.values.brawl??!!base.config.brawl;
    model.config.requiredFeatures=[...new Set([...(base.config.requiredFeatures||[]),...parsed.flatMap(p=>p.items).flatMap(i=>i.kind==='feature'?[i.value]:i.kind==='coins'&&(i.count>0||i.pickup&&(i.gained==null||i.gained>0))?['COIN']:[])])];
    model.config.buttonCounts={...(base.config.buttonCounts||{})};for(const p of parsed)for(const item of p.items)if(item.kind==='doorCount'&&item.round!=null)model.config.buttonCounts[item.round]=item.count;
    const gains=new Map((base.config.coinGains||[]).map(g=>[g.player+':'+g.round,g]));
    for(const p of parsed)for(const item of p.items)if(item.kind==='coins'&&item.pickup&&item.round!=null){
      const key=item.player+':'+item.round,old=gains.get(key);
      if(item.gained!=null||!old)gains.set(key,{player:item.player,round:item.round,min:item.gained??1,max:item.gained});
    }
    model.config.coinGains=[...gains.values()];
    model.config.coinTransferRounds=[...new Set([...(base.config.coinTransferRounds||[]),...parsed.flatMap(p=>p.items).filter(i=>i.kind==='coinTransfer'||i.kind==='trajectory'&&i.tokens.some(t=>t.kind==='marker'&&/捕捉/.test(t.value))).map(i=>i.round).filter(r=>r!=null)])];
    // Look ahead in the same player's next two actions. An actual collision is impossible inside subspace.
    const routes=parsed.flatMap((p,index)=>p.items.filter(i=>i.kind==='trajectory'&&!i.skipReplay).map(item=>({item,index})));
    for(let ri=0;ri<routes.length;ri++){const route=routes[ri];for(let ti=0;ti<route.item.tokens.length;ti++){
      const token=route.item.tokens[ti];if(token.kind!=='move'||token.outcome==='hit')continue;
      const after=[];let stopped=false,lastRound=route.item.round;
      for(let rj=ri;rj<routes.length&&after.length<2&&!stopped;rj++){
        const next=routes[rj].item;if(next.player!==route.item.player)continue;
        if(rj>ri){if(next.hidden||(lastRound!=null&&next.round!=null&&next.round!==lastRound+1))break;lastRound=next.round;}
        for(let tj=rj===ri?ti+1:0;tj<next.tokens.length&&after.length<2;tj++){const t=next.tokens[tj];if(t.kind==='hidden'||t.kind==='marker'&&/传送|捕捉|逃生|隐匿/.test(t.value)){stopped=true;break;}if(t.kind==='move')after.push(t);}
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
        if(item.kind==='feature'){summary.push(item.value==='JAMMERBOX'?'确认本局存在屏蔽器；屏蔽器可推动，未按初始中心强行定位。':'确认本局存在热源或小太阳；热浪范围受热源类型及箱子推动影响。');continue;}
        if(item.kind==='coins'){
          if(item.count!=null)summary.push(item.player+'号公开持有 '+item.count+' 枚金币');
          if(item.pickup){const label=item.player+'号'+(item.round?'第 '+item.round+' 回合':'本回合')+'获得'+(item.gained==null?'至少 1': ' '+item.gained)+' 枚金币';summary.push(label+(item.inferredRound?'（已关联此前行动）':'')+'；'+(!item.round?'请补充回合号以筛选路线。':model.config.coinTransferRounds.includes(item.round)?'本回合存在捕捉，暂保留抢夺来源，不强制踩到金币格。':'用于筛选当回合经过的未消耗金币格，重复经过同格不重复计数。'));}continue;
        }
        if(item.kind==='doorCount'){summary.push((item.round?'第 '+item.round+' 回合':'本回合')+'全体玩家共触发按钮 '+item.count+' 次'+(item.inferredRound?'（已关联此前行动）':'')+'；'+(item.round?'用于核对按钮落点总数及门状态。':'请补上【第 N 回合】以用于推理。'));continue;}
        if(item.kind==='coinTransfer'){summary.push('已记录金币抢夺'+(item.round?'，归属第 '+item.round+' 回合':'，回合待补充')+'；不把抢夺数量当作踩中金币格的次数。');continue;}
        if(item.kind==='status'){summary.push(item.player+'号：'+item.reason+'（赛况状态）');continue;}
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
          if(item.player===receiver&&item.tokens.some(t=>t.direction&&!['首次','被屏蔽'].includes(t.direction)))warnings.push('当前接收者的本人轨迹带有声源方向标注；这通常是其他玩家收到的私聊赛况，请核对接收者。');
          if(item.skipReplay){warnings.push('同玩家同回合已有更新记录，没有再次累计移动。');continue;}
          if(item.player!==metadata.self){
            const source=item.player+'号';let step=0,ambiguous=false;
            if(item.hidden){seg().sounds.push({kind:'reset',source});warnings.push(source+'含隐匿，已重置其位置候选。');}
            for(const t of item.tokens){
              if(t.kind==='hidden'){step+=t.steps||0;seg().sounds.push({kind:'reset',source});continue;}
              if(t.kind==='marker'){if(/传送|捕捉|逃生/.test(t.value))seg().sounds.push({kind:'reset',source});continue;}
              step++;
              if(ambiguous){seg().sounds.push({kind:'reset',source});ambiguous=false;}
              seg().sounds.push({kind:'move',source,dir:t.dir,outcome:t.outcome});
              for(const hear of metadata.sourcePending.get(source)||[])if(hear.step===step){
                if(hear.segment===model.active)seg().sounds.push({kind:'hear',source,direction:hear.direction,listener:hear.listener});
                else warnings.push('一条旧声响属于不同的相对地图片段，暂未混入当前定位。');
              }
              if(t.sound==='PAPA'&&!t.noSubspace)ambiguous=true;
            }
            metadata.sourcePending.delete(source);metadata.sourceSteps.set(source,step);summary.push(`记录 ${source} ${step} 步公开轨迹`);continue;
          }
          const round=item.round||metadata.round+1;
          if(metadata.completed.has(round)){warnings.push(`第 ${round} 回合轨迹已录入，没有再次累计移动。`);continue;}
          const eventStarts=model.segments.map(s=>s.events.length);
          let moves=0,hits=0,uncertain=false,cut=false,step=0,relocation=null;const heartPossible=E.pool(model.config).some(b=>b.cells.some(c=>c.type==='HEART'));
          for(const t of item.tokens){
            if(t.kind==='hidden'){step+=t.steps||0;space=null;newSegment();cut=false;uncertain=false;warnings.push('轨迹含真实隐匿标记，保留标记前路线，后续从新片段记录；隐藏方向未作猜测。');continue;}
            if(t.kind==='marker'){
              if(t.step)step++;
              if(/出局/.test(t.value))lifecycle.push({kind:'retire',player:view,round,step,reason:t.value,index});
              if(/捕捉|逃生/.test(t.value))lifecycle.push({kind:/捕捉/.test(t.value)?'capture':'escape',brawl,protected:/首轮/.test(t.value)||round===1&&/捕捉/.test(t.value),player:view,round,step,index,segment:model.active,r:pos().r,c:pos().c,locatable:!cut});
              if(/逃生/.test(t.value)&&!cut){const at=pos();seg().events.push({kind:'observe',r:at.r,c:at.c,terrain:'EXIT'});summary.push('逃生成功：确认逃生舱位置');}
              if(/逃生/.test(t.value)&&brawl){relocation='brawl';space=null;cut=true;uncertain=true;}
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
            const maskedUnknown=model.config.heartPresence===true&&step<=19&&(step-1)%3===0&&!t.merged&&!t.sound&&!t.terrain&&!item.hidden&&!t.beforeFirstSound;
            const silentUnknown=model.config.silent&&!t.sound&&!t.terrain&&!item.hidden&&!t.beforeFirstSound;
            // Only reopen missing information; confirmed silence, terrain and
            // the first-sound boundary must never be erased to invent a portal.
            const recoveryUnknown=!!choices.__portalRecovery&&!t.sound&&!t.terrain&&!item.hidden&&!t.beforeFirstSound&&(!t.quiet||heartPossible&&!t.merged&&step<=19&&(step-1)%3===0);
            const requiresHeart=recoveryUnknown&&t.quiet&&!maskedUnknown&&!silentUnknown;
            const possibleEntry=t.sound==='PAPA'||maskedUnknown||silentUnknown||recoveryUnknown||t.firstSound&&!t.sound;
            seg().events.push({kind:'move',dir:t.dir,outcome:t.outcome,sound:t.sound,terrain:t.terrain,audible:!!t.audible,masked:!!t.masked,firstSound:!!t.firstSound,beforeFirstSound:!!t.beforeFirstSound,hidden:item.hidden,clock:{round,player:view,step},nonPortalSound:!!t.noSubspace&&possibleEntry&&t.outcome==='move',quiet:(t.quiet||t.beforeFirstSound)&&t.outcome==='move'&&!item.hidden&&!model.config.silent&&(t.beforeFirstSound||!(heartPossible&&!t.merged&&(step-1)%3===0&&step<=19))});
            if(t.firstSound)summary.push(`第 ${step} 步为本局首次发声：此前未隐匿的移动排除会发声的地形，即使心跳掩盖也计入此前发声；本步不提供声源方向。`);
            const point=pos();steps.push({index,round,step,r:point.r,c:point.c,segment:model.active});
            if(t.outcome==='hit')hits++;else moves++;
            if(t.noSubspace&&possibleEntry&&t.outcome==='move')summary.push((silentUnknown?'静音移动':maskedUnknown?'心跳掩盖步':'水声')+'后的两步内发生撞击，排除进入亚空间；已按普通地面路线继续绘制。');
            if(possibleEntry&&!t.noSubspace&&t.outcome==='move'){
              if(choice?.kind==='ground')seg().events.push({kind:'observe',r:point.r,c:point.c,nonPortalSound:true});
              else if(choice?.kind==='portal'){
                seg().events.push({kind:'observe',r:point.r,c:point.c,terrain:'PORTAL',portalLink:{dr:choice.dr,dc:choice.dc}});
                space={remaining:2,dr:choice.dr,dc:choice.dc,entry:{r:point.r,c:point.c},segment:model.active};
              }else{ambiguities.push({key:choiceKey,index,round,step,segment:model.active,maskedUnknown,silentUnknown,recoveryUnknown,requiresHeart,entry:{r:point.r,c:point.c}});cut=true;uncertain=true;}
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
    const assumptions={heartPresence:Object.values(choicesByPlayer).some(choices=>Object.values(choices).some(c=>c?.requiresHeart))?true:null};
    const views=Array.from({length:count},(_,id)=>({id,...buildOne(base,messages,id,self,choicesByPlayer[id]||{},assumptions)}));
    for(const v of views){v.model.config.playerCount=count;
      if(v.model.config.exitCount==null)v.model.config.exitCount=Math.min(E.pool(v.model.config).filter(b=>b.id.startsWith('E')).length,v.model.config.size===12?4:Math.max(1,Math.floor(count/2)));
      v.model.players=Array.from({length:count},(_,id)=>base.players[id]||{name:id+'号',alive:true});}
    const relations=[];
    for(const v of views)for(const h of v.hears){
      if(h.a===h.b){v.reports[h.index].warnings.push('声源与私信接收者相同，方向未用于推理；请在输入预览中确认这是谁收到的私聊赛况。');continue;}
      if(!views[h.b]||!h.step)continue;
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
    // Replay source streams by game time, then insert both early and late private
    // bearings at the corresponding step. Paste order must not change locate().
    for(const v of views)for(let si=0;si<v.model.segments.length;si++){
      const original=v.model.segments[si].sounds,sounds=original.filter(e=>!/^\d+号$/.test(e.source));
      for(const other of views){if(other.id===v.id)continue;const source=other.id+'号';
        if(v.hears.some(h=>h.b===other.id&&!h.step&&h.segment===si)){sounds.push(...original.filter(e=>e.source===source));continue;}
        for(let oi=0;oi<other.model.segments.length;oi++){
          if(oi)sounds.push({kind:'reset',source});
          for(const event of other.model.segments[oi].events){
            if(event.kind==='teleport'){sounds.push({kind:'reset',source});continue;}
            if(event.kind!=='move')continue;
            sounds.push({kind:'move',source,dir:event.dir,outcome:event.outcome});
            for(const h of relations.filter(h=>h.a===v.id&&h.b===other.id&&h.segment===si&&h.round===event.clock?.round&&h.step===event.clock?.step))sounds.push({kind:'hear',source,direction:h.direction,listener:h.listener});
          }
        }
        if(other.ambiguities.length)sounds.push({kind:'reset',source});
      }
      v.model.segments[si].sounds=sounds;
    }
    const players=Array.from({length:count},(_,id)=>({name:id+'号',alive:base.players[id]?.alive!==false})),events=views.flatMap(v=>v.lifecycle).sort((a,b)=>a.round-b.round||a.player-b.player||a.step-b.step),captures=[];
    for(const event of events){
      if(event.kind==='retire'){players[event.player].alive=false;players[event.player].reason=event.reason;continue;}
      if(event.kind==='escape'&&event.brawl)continue;
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
    // Snapshot headers describe current status, not the time of earlier captures.
    for(const p of parsed)for(const item of p.items)if(item.kind==='status'){players[item.player].alive=false;players[item.player].reason=item.reason;}
    for(const p of parsed)for(const item of p.items)if(item.kind==='coins'&&item.count!=null)players[item.player].coins=item.count;
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
  // The live UI consumes this projection; original journal text stays exportable.
  function liveMessages(messages){
    let self=0;for(const m of messages)for(const i of parseCached(m.text).items)if(i.kind==='identity')self=i.id;
    return messages.map(m=>{
      const p=inspect(m.text),foreign=(m.view??self)!==self;
      const foreignDetail=p.items.some(i=>i.kind==='trajectory'&&(i.player!==self&&i.tokens.some(t=>t.masked||t.terrain)||i.player===self&&i.tokens.some(t=>t.direction&&!['首次','被屏蔽'].includes(t.direction))));
      const privateData=p.items.some(i=>['hear','personalSound','feature'].includes(i.kind)||i.kind==='walls'&&i.player==null||i.kind==='trajectory'&&i.tokens.some(t=>t.direction||t.masked||t.terrain));
      if(foreignDetail||foreign&&privateData)return {...m,text:'附注：此段含他人私聊或赛后专属信息，已隔离；请补贴公屏原文。',excluded:true};
      return {...m,view:self,receiverConfirmed:true};
    });
  }
  function soundChecklist(messages){
    const live=liveMessages(messages),parsed=prepare(live);let self=0;
    for(const p of parsed)for(const i of p.items)if(i.kind==='identity')self=i.id;
    const routes=parsed.flatMap((p,index)=>p.items.filter(i=>i.kind==='trajectory').map(item=>({item,index})));
    const hears=parsed.flatMap((p,index)=>p.items.filter(i=>i.kind==='hear').map(h=>{
      if(h.round!=null)return h;const matches=routes.filter(r=>r.item.player===h.player);
      const route=matches.filter(r=>r.index<=index).at(-1)||matches[0];return {...h,round:route?.item.round};
    }));
    const rows=[];const prior=new Set();
    for(const p of parsed)for(const route of p.items.filter(i=>i.kind==='trajectory'&&!i.skipReplay)){
      let step=0;
      for(const t of route.tokens){
        if(t.kind==='hidden'){step+=t.steps||0;continue;}if(t.kind!=='move')continue;step++;
        if(t.outcome!=='move'||!(t.sound||t.audible||t.masked))continue;
        if(route.hidden)continue;
        const earlier=prior.has(route.player);prior.add(route.player);
        if(route.player===self||t.masked)continue;
        const heard=hears.some(h=>h.player===route.player&&h.step===step&&h.round===route.round);
        if(heard||t.firstSound)continue;
        rows.push({player:route.player,round:route.round,step,sound:t.sound,earlier,
          state:'首次发声，未听到方位（默认，待核对）',
          prompt:route.player+'号第'+route.round+'回合第'+step+'步：请粘贴公屏该步的完整提示（含是否首次发声），或者你自己私聊收到的方位；保留回合、玩家编号和步数。'+(earlier?'此前已有发声记录，请特别核对这一步未听到方位的原因。':'')});
      }
    }
    return rows;
  }
  function inspect(text){
    const parsed=parseCached(text),items=parsed.items,counts={};for(const item of items)counts[item.kind]=(counts[item.kind]||0)+1;
    const privateInput=items.some(i=>['walls','hear','personalSound'].includes(i.kind)||i.kind==='trajectory'&&i.tokens.some(t=>t.direction||t.masked||t.terrain));
    const type=parsed.snapshot?(privateInput?'私聊完整赛况':'公开完整赛况'):counts.firstSound?'首次发声线索':counts.hear?'声响私信':counts.walls?'墙壁信息':counts.trajectory?'行动轨迹':counts.config?'对局设置':counts.coins?'金币线索':counts.doorCount?'门变化公告':counts.coinTransfer?'金币抢夺':counts.feature?'特殊地形提示':'附注';
    return {...parsed,counts,privateInput,type};
  }
  const api={soundChecklist,liveMessages,inspect,openingPool,parse:parseCached,build,buildHypothesis:buildOne,clean,receiverFor};if(typeof module!=='undefined')module.exports=api;else root.LongNightMessages=api;
})(globalThis);
