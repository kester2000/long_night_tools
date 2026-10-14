(()=>{
  'use strict';
  const E=window.LongNight,M=window.LongNightMessages,$=id=>document.getElementById(id),STORE='long-night-message-notebook-v2';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function viewOffset(id=activeView){const node=renderNode||team?.nodes.find(n=>n.id===id+':'+shownSegment(id)),auto=node?.verification?.status==='verified'?E.displayOffset(node.solution):{r:0,c:0,aligned:false},shift=journal.mapShifts?.[id]||{r:0,c:0};return {...auto,r:auto.r-shift.r,c:auto.c-shift.c,aligned:auto.aligned&&E.mod(shift.r,3)===0&&E.mod(shift.c,3)===0};}
  const xy=(p,id=activeView)=>{const o=viewOffset(id),n=model.config.size;return '('+(E.mod(p.r-o.r,n)+1)+', '+(E.mod(p.c-o.c,n)+1)+')';},symbols={EMPTY:'·',GRASS:'♧',WATER:'≈',PORTAL:'◎',ONEWAYPORTAL:'◉',EXIT:'↗',TRAP:'⌁',HEAT:'♨',BERRY:'❧',HEART:'♥'};
  let journal={version:2,base:E.newState(),messages:[]},built,model,replay,selected,solution,inferred=new Map(),editing=null,worker=null,generation=0,timer,phase=0;
  let activeView=0,team=null,displayObservations=[],setup={},renderingSmart=false,possibleTerrain=new Map(),renderNode=null,renderBirth=null,importMode='replace',inputReceiver=null,previewTimer,quickDraft=[];
  function settings(j=journal){const out={};for(const m of j.messages)for(const i of M.parse(m.text).items){if(i.kind==='identity')out.self=i.id;if(i.kind==='config'){if(i.values.mode)out.mode=i.values.mode;if(i.values.playerCount)out.count=i.values.playerCount;}}return out;}
  function ready(s=setup){return !!s.mode&&!!s.count&&Number.isInteger(s.self)&&s.self<s.count;}
  function checkInput(j,text){const s=settings(j),items=M.parse(text).items;if(!ready(s)&&items.some(i=>['walls','trajectory','hear','firstSound'].includes(i.kind)))throw new Error('请先填写模式、人数和自己的编号，再输入地图信息。');if(s.count&&Number.isInteger(s.self)&&s.self>=s.count)throw new Error('自己的编号必须小于玩家人数。');if(s.count&&j.messages.some(m=>M.parse(m.text).items.some(i=>(i.player!=null&&i.player>=s.count)||(['walls','hear'].includes(i.kind)&&(m.view??s.self??0)>=s.count))))throw new Error('已有信息的玩家编号超出已填写的人数，请先修正人数或对应消息。');}
  const localLimits=new Map(),localExpanded=new Map(),fragmentChoices=new Map();
  function shownSegment(id=activeView){const v=built.views[id],segments=v.model.segments,choice=fragmentChoices.get(id);if(Number.isInteger(choice)&&choice>=0&&choice<segments.length)return choice;const current=v.model.active;if(E.replay(segments[current],v.model.config.size).observations.length)return current;for(let i=segments.length-1;i>=0;i--)if(E.replay(segments[i],v.model.config.size).observations.length)return i;return current;}
  function fragmentPicker(v){if(v.model.segments.length<2)return '';return `<div class="fragment-picker" aria-label="${v.id}号地图碎片">${v.model.segments.map((segment,i)=>`<button type="button" data-fragment-player="${v.id}" data-fragment="${i}" aria-pressed="${shownSegment(v.id)===i}">片段 ${i+1} · ${E.replay(segment,v.model.config.size).observations.length} 条${i===v.model.active?' · 当前':''}</button>`).join('')}</div>`;}

  let migration=false,loadError='',draftBlocks=new Set();
  const modeNames={TWIST:'幻变',CLASSIC:'经典',WILD:'狂野',CRAZY:'疯狂',BUTTON:'按钮',TRAP:'陷阱',OPEN:'空旷',SILENT:'无声'};
  function validate(raw){
    if(raw?.version===1)return {version:2,base:E.validateState(raw),messages:[]};
    if(raw?.version!==2||!Array.isArray(raw.messages)||raw.messages.length>2000||raw.messages.some(m=>typeof m.id!=='string'||typeof m.text!=='string'||m.text.length>30000||(m.view!=null&&(!Number.isInteger(m.view)||m.view<0||m.view>7))))throw new Error('消息存档格式无效。');
    const j={version:2,base:E.validateState(raw.base),messages:raw.messages.map(m=>({id:m.id,text:m.text,...(m.view!=null?{view:m.view}:{}),...(m.receiverConfirmed===true?{receiverConfirmed:true}:{})}))};
    if(typeof raw.openingImage==='string'&&raw.openingImage.length<=1800000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(raw.openingImage))j.openingImage=raw.openingImage;
    if(new Set(j.messages.map(m=>m.id)).size!==j.messages.length)throw new Error('存档消息标识重复。');
    j.mapShifts={};for(const [id,shift] of Object.entries(raw.mapShifts||{}))if(/^[0-7]$/.test(id)&&Number.isInteger(shift?.r)&&Number.isInteger(shift?.c)&&Math.abs(shift.r)<=10000&&Math.abs(shift.c)<=10000)j.mapShifts[id]={r:shift.r,c:shift.c};
    j.view=Number.isInteger(raw.view)&&raw.view>=0&&raw.view<8?raw.view:0;M.build(j.base,M.liveMessages(j.messages));return j;
  }
  try{
    const saved=localStorage.getItem(STORE),legacy=localStorage.getItem('long-night-player-notebook-v1');
    if(saved){journal=validate(JSON.parse(saved));migration=journal.base.segments.some(s=>s.events.length||s.sounds.length);}else if(legacy){journal=validate(JSON.parse(legacy));migration=journal.base.segments.some(s=>s.events.length||s.sounds.length);}
  }catch(error){loadError='读取存档失败：'+error.message+'。原存档未删除。';}
  function toast(text,error=false){clearTimeout(timer);$('toast').textContent=text;$('toast').className=error?'error':'';$('toast').hidden=false;timer=setTimeout(()=>$('toast').hidden=true,error?8000:4000);}
  function safe(fn){return async e=>{try{await fn(e);}catch(error){toast(error.message,true);}};}
  function save(){try{localStorage.setItem(STORE,JSON.stringify(journal));$('save-status').textContent='已自动保存';}catch{$('save-status').textContent='自动保存不可用，请导出记录';}}
  async function confirm(title,text){$('confirm-title').textContent=title;$('confirm-text').textContent=text;const dialog=$('confirm-dialog');dialog.returnValue='cancel';dialog.showModal();return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='ok'),{once:true}));}
  function resetEditor(){editing=null;inputReceiver=null;$('message-input').value='';$('input-preview').hidden=true;$('send').innerHTML='发送并推理 <span>↗</span>';$('input-hint').textContent='整段粘贴即可 · Ctrl + Enter 发送';}
  function previewInput(){
    const text=$('message-input').value.trim();$('input-preview').hidden=!text;if(!text)return;
    try{const p=M.inspect(text),labels={walls:'墙壁',trajectory:'轨迹',hear:'方向私信',personalSound:'地形私信',firstSound:'首次发声',status:'退场状态',coins:'金币公示',feature:'特殊地形',doorCount:'按钮计数',config:'设置',identity:'身份'};
      $('preview-type').textContent=p.type;$('preview-summary').textContent=Object.entries(p.counts).map(([k,v])=>(labels[k]||k)+' '+v+' 条').join(' · ')||'保留为笔记';
      const receiver=setup.self??built.self;$('input-receiver').innerHTML='<option value="'+receiver+'">'+receiver+'号 · 我</option>';$('input-receiver').value=receiver;$('input-receiver').disabled=true;
      const issues=[...p.warnings];if(p.items.some(i=>i.kind==='trajectory'&&i.player===receiver&&i.tokens.some(t=>t.direction&&!['首次','被屏蔽'].includes(t.direction))))issues.push('本人轨迹包含方向标注，可能选错了私信接收者。');
      if(M.liveMessages([...journal.messages,{id:'preview',text,view:receiver}]).at(-1).excluded)issues.unshift('这段包含他人的专属信息，请补贴公屏版本。');
      if(p.privateInput)issues.unshift('私聊只归给你（'+receiver+'号）；公屏轨迹按原文玩家编号归属。');$('preview-warning').textContent=issues.join(' ');
    }catch(error){$('preview-type').textContent='输入需要修正';$('preview-summary').textContent='';$('preview-warning').textContent=error.message;}
  }
  $('message-input').addEventListener('input',()=>{clearTimeout(previewTimer);previewTimer=setTimeout(previewInput,120);});
  $('input-receiver').addEventListener('change',()=>{inputReceiver=+$('input-receiver').value;previewInput();});
  function renderQuick(){ $('quick-draft').textContent=quickDraft.join('')||'尚未记录行动'; }
  document.querySelector('.quick-controls').addEventListener('click',event=>{const button=event.target.closest('[data-quick]');if(!button)return;const value=button.dataset.quick;
    if(/[↑↓←→]/.test(value))quickDraft.push(value);else{const last=quickDraft.at(-1);
      if(value==='首次'){
        if(!last||!/^\[[↑↓←→](?:沙沙|啪嗒)\]$/.test(last)){toast('先给该步标记沙沙或啪嗒，再标记首次发声。',true);return;}
        quickDraft[quickDraft.length-1]=last.slice(0,-1)+'(首次)]';
      }else{if(!last||!/^[↑↓←→]$/.test(last)){toast('先选一个方向，再标记声音或撞墙。',true);return;}quickDraft[quickDraft.length-1]=value==='撞'?'('+last+'撞)':'['+last+value+']';}
    }renderQuick();});
  function useQuick(text){$('message-input').value=text;inputReceiver=activeView;previewInput();$('message-input').focus();}
  const quickRound=()=>{const round=+$('quick-round').value;if(!Number.isInteger(round)||round<1||round>9999)throw new Error('速记回合应为 1–9999。');return round;};
  $('quick-route').addEventListener('click',safe(()=>{if(!ready())throw new Error('先填写模式、人数和本人编号。');if(!quickDraft.length)throw new Error('先记录行动。');useQuick('【第 '+quickRound()+' 回合】\n['+activeView+'号]玩家本回合的完整行动轨迹：\n'+quickDraft.join(''));}));
  $('quick-clear').addEventListener('click',()=>{quickDraft=[];renderQuick();});
  $('quick-wall-choices').innerHTML=E.DIRS.map((name,id)=>'<label>'+name+' <select data-quick-wall="'+id+'" aria-label="速记'+name+'侧墙壁"><option>?</option><option>墙</option><option>空</option></select></label>').join('');
  $('quick-walls').addEventListener('click',safe(()=>useQuick('【第 '+quickRound()+' 回合】\n您所在位置的四周墙壁信息：\n'+[...document.querySelectorAll('[data-quick-wall]')].map(s=>s.value).join(''))));
  const rules=[
    ['捕捉与顺位','默认捕捉上家。点杀开启时只在行动结束同格触发；关闭后路过也会触发。捕捉或普通逃生后跳过退场者，首轮捕捉保护会传送双方。'],
    ['隐匿与地图片段','真实公屏轨迹中的 <隐匿行动> 或 � 表示未知移动。工具保留此前路线，并把之后路线放到新的待定位片段；隐藏方向不会自动补齐。'],
    ['传送门与亚空间','进入传送门后任意移动两步到配对出口。亚空间内四墙为空，玩家仍在入口格；出生在门上不自动触发传送。啪嗒也可能是水洼。'],
    ['树篱、门与撞墙','树篱的四墙反馈为空，同回合连续同方向可冲刺通过。撞击也可能来自箱子或门，不能直接画成实墙。按钮会改变关联门状态。'],
    ['首响、心跳与静音','首次进入发声地形不通知别人方向。心脏在第1/4/7/10/13/16/19步掩盖声音，但不免除捕捉或强停风险。静音时无声箭头仍可能进入传送门；入门后的两步不按地面移动绘制。静音开关与无声区块池是不同设置。'],
    ['金币与门公告','完整行动后单独输入金币公示、门变化公告，会关联此前完成的回合；补录历史公告请写第N回合。没有捕捉记录时，金币数量用于筛选当回合经过的未消耗金币格；同格重复经过只计一次。只说获得金币按至少1枚处理，标题金币数只表示持有量。'],
    ['陷阱与热源','陷阱按全局进入次数奇数放行、偶数强停。本人进入任意热源后，再次进入任意热源会强停；热浪提示本身不等于踩到热源。'],
    ['屏蔽器、小太阳与热浪','屏蔽器附近3×3隐藏方向，小太阳附近5×5产生热浪，热源附近3×3也有热浪。两种箱子都可以推动，初始区块中心不等于当前所在格。'],
    ['候选与唯一验证','候选表示线索尚未排除的可能，数量不是概率。预算内找到一张完整地图只是存在见证；只有排除其他区块身份后才补画确定区块。10×10只做局部匹配。'],
    ['信息可见性','仅输入公屏原文与本人私聊。点击别人的地图不改变私聊归属。旧存档中的他人私聊整段隔离，需补贴公屏版本；赛后全知地图不属于实战证据。'],
    ['炸弹与BOSS','站在炸弹上结束行动可拆弹，经过并尝试离开会引爆；隐匿也会引爆。当前只接收部分退场信息与BOSS原文附注，未模拟完整BOSS移动。']
  ];
  function renderRules(){const q=$('rule-search').value.trim();$('rule-book').innerHTML=rules.filter(row=>row.join(' ').includes(q)).map(([title,text])=>'<article><h4>'+esc(title)+'</h4><p>'+esc(text)+'</p></article>').join('')||'<p>没有匹配的规则。</p>';}
  $('rule-search').addEventListener('input',renderRules);renderRules();
  let soundRequests=[];
  function renderSoundChecklist(){
    soundRequests=ready()&&!built.model.config.silent?M.soundChecklist(journal.messages):[];
    $('sound-checklist').hidden=!soundRequests.length;$('sound-check-count').textContent=soundRequests.length+' 步';
    $('sound-check-items').innerHTML=soundRequests.map((row,i)=>'<article><p><b>'+row.player+'号 · 第'+row.round+'回合 · 第'+row.step+'步</b> '+esc(row.state)+'</p><p>'+esc(row.prompt)+'</p><button type="button" data-sound-request="'+i+'">补贴这一步</button></article>').join('');
  }
  $('sound-check-items').addEventListener('click',event=>{
    const button=event.target.closest('[data-sound-request]');if(!button)return;
    const row=soundRequests[+button.dataset.soundRequest];$('input-hint').textContent=row.prompt;
    if(!$('message-input').value.trim()){$('message-input').value='【第 '+row.round+' 回合】\n['+row.player+'号(第'+row.step+'步)]\n';previewInput();}
    $('message-input').setSelectionRange($('message-input').value.length,$('message-input').value.length);
    $('message-input').focus();
  });
  function rebuild(scroll=false,choices={}){
    $('block-radar').hidden=true;
    fragmentChoices.clear();setup=settings();activeView=journal.view??setup.self??0;team=null;if(worker)worker.terminate();worker=null;++generation;
    built=M.build(journal.base,M.liveMessages(journal.messages),choices);built.resolvedChoices=choices;$('turn-advice').textContent='正在核对本轮线索与相对位置…';activeView=Math.min(activeView,built.count-1);model=built.views[activeView].model;replay=E.replay(model.segments[shownSegment()],model.config.size);selected={r:replay.r,c:replay.c};solution=null;inferred=new Map();phase=0;
    displayObservations=replay.observations;renderMessages();renderOptions();renderGameStatus();renderSoundChecklist();$('setup-hint').textContent=ready()?'设置已填写 · 私聊固定归本人 · 点击地图只切换查看':'请先填写模式、人数和自己的编号，或在对话框中输入这三项。';
    if(!ready()){ $('turn-advice').textContent='请先填写人数、模式、自己的编号及本局开局区块。';$('view-tabs').innerHTML='';$('block-radar').hidden=true;$('all-boards').innerHTML='<p class="setup-empty">填写模式、人数和编号后，同时展示所有玩家地图。</p>';$('map-summary').innerHTML='';$('view-hint').textContent='';$('analysis-status').textContent='等待设置';$('pairs').innerHTML='';$('pair-status').textContent='等待设置';$('reasoning').textContent='';$('candidates').innerHTML='';$('candidate-count').textContent='—';$('layout').innerHTML='';$('phase-select').innerHTML='';$('sources').innerHTML='';$('local-results').innerHTML='';$('undo').disabled=!journal.messages.length;return;}
    renderViews();renderBoard();renderSources();$('local-results').innerHTML='<p>先核对各玩家自己的单 / 双 / 三区块图案…</p>';$('pairs').innerHTML='<p>每次输入、修改或撤销后，自动重算全部视角。</p>';$('pair-status').textContent='计算中';
    $('undo').disabled=!journal.messages.length;
    if(!model.config.pool.trim()){
      $('setup-hint').textContent='还需填写开局图中的本局区块编号；不会默认使用整个模式池。';
      $('analysis-status').textContent='等待开局区块图';$('turn-advice').textContent='请先在左侧填写开局区块图中的编号。已有轨迹和墙壁仍保留，确定本局区块池后再推理。';
      $('local-results').textContent='等待本局区块池，尚未枚举候选。';$('pairs').textContent='填写开局区块后再进行两两拼接。';$('pair-status').textContent='等待区块池';$('reasoning').textContent='';$('candidate-count').textContent='—';$('candidates').innerHTML='';$('layout').innerHTML='';$('phase-select').innerHTML='';return;
    }
    $('analysis-status').textContent='推理中';$('reasoning').innerHTML='<p>正在把新消息与已有线索交叉核对…</p>';$('candidate-count').textContent='…';$('candidates').innerHTML='';$('layout').innerHTML='';$('phase-select').innerHTML='';
    const nodes=window.LongNightLocal.nodes(built);
    const request={id:++generation,config:model.config,nodes,notebook:{base:journal.base,messages:M.liveMessages(journal.messages),self:built.self,count:built.count,choices},relations:built.relations.filter(h=>!['首次','被屏蔽'].includes(h.direction))};
    if(worker)worker.terminate();worker=null;
    if(location.protocol!=='file:')try{worker=new Worker('worker.js');worker.onmessage=e=>receive(e.data);worker.onerror=()=>{worker.terminate();worker=null;receive({id:request.id,error:'后台推理失败，请刷新后重试。'});};}catch{}
    if(worker)worker.postMessage(request);else setTimeout(()=>{try{const hypotheses=window.LongNightHypotheses.all(request.config,request.notebook),resolved=window.LongNightHypotheses.choiceUpdates(hypotheses,choices);if(resolved){receive({id:request.id,resolvedChoices:resolved});return;}const result=window.LongNightTeam.solve(request.config,request.nodes,request.relations,local=>receive({id:request.id,local}),progress=>receive({id:request.id,progress}));result.hypotheses=hypotheses;receive({id:request.id,team:result});}catch(error){receive({id:request.id,error:error.message});}},0);
    if(scroll)$('messages').scrollTop=$('messages').scrollHeight;
  }
  function receive(data){
    if(data.id!==generation)return;
    if(data.progress){
      const p=data.progress;
      $('analysis-status').textContent=p.stage==='hypotheses'?'核对声音 / 静音移动的地面与传送门分支':p.stage==='perspectives'?`核对${p.player}号路线、声音、墙壁与完整地图`:p.stage==='local'?`匹配${p.player}号当前路线的局部区块组合`:p.stage==='pairs'?`对齐${p.a}号与${p.b}号 · 已检查 ${p.checked}/${p.total} 个平移位置`:p.enumerating?`地图推理已完成 · 枚举${p.player}号历史三区块 · 搜索 ${p.searchSteps} 次 · 找到 ${p.found} 个组合`:`地图推理已完成 · 核对${p.player}号历史三区块 · 已验证 ${p.checks} 个方案 · 保留 ${p.kept} 个`;
      return;
    }
    if(data.resolvedChoices){rebuild(false,data.resolvedChoices);return;}
    if(data.error){$('analysis-status').textContent='需要检查';$('reasoning').innerHTML='<p class="error">'+esc(data.error)+'</p>';return;}
    team=data.local||data.team;
    for(const node of team.nodes)node.advice=node.id===node.player+':'+built.views[node.player].model.active?window.LongNightAdvice.perspective(built,team,node.player):[];
    activateView();renderLocal();
    $('turn-advice').innerHTML='<h3>对局提示 · '+built.self+'号</h3>'+window.LongNightAdvice.summarize(built,team).map(t=>'<p>'+esc(t)+'</p>').join('');
    if(data.local){
      if(data.local.pairs.length)renderPairs();
      $('analysis-status').textContent=['aligned','history'].includes(data.local.stage)?'地图推理与对齐已完成 · 继续核对历史三区块':'各视角结论已更新 · 继续匹配局部组合';
      if(!data.local.pairs.length)$('pair-status').textContent='尚未完成两两对齐，已有结论见各玩家地图';
      return;
    }
    renderPairs();$('analysis-status').textContent=team.nodes.some(n=>n.local?.triplesPending)?'地图推理已完成 · 部分历史方案的整图验证待定':'推理已完成';
  }
  function renderGameStatus(){
    const panel=$('game-status');panel.hidden=!ready();if(!ready()){panel.textContent='';return;}
    const rows=window.LongNightAdvice.status(built),me=rows[built.self];
    panel.innerHTML='<h3>对局状态 · '+rows.filter(p=>p.alive).length+'/'+built.count+' 人未记录退场</h3><p>'+(!me.alive?'你'+esc(me.reason):me.target==null?'暂无捕捉目标':'你追捕 '+me.target+' 号 · '+me.hunter+' 号追捕你')+'</p><div class="status-players">'+rows.map(p=>'<button type="button" data-status-view="'+p.id+'" class="'+(p.alive?'':'retired')+'"><b>'+p.id+'号'+(p.id===built.self?' · 我':'')+'</b><span>'+esc(p.alive?(p.target==null?'暂无目标':'目标 '+p.target+'号'):p.reason)+'</span><small>已录入至第 '+p.round+' 回合'+(p.coins!=null?' · 上次公示金币 '+p.coins:'')+(p.pending.length?' · 待补轨迹 '+p.pending.join('、')+' 回合':'')+'</small></button>').join('')+'</div><small>根据已录入记录更新；点击玩家切换地图；私聊始终归本人。</small>';
  }
  function renderRadar(){
    const panel=$('block-radar');if(!ready()){panel.hidden=true;return;}
    const radar=window.LongNightAdvice.radar(built,team,activeView);panel.hidden=!radar;if(!radar){panel.textContent='';return;}
    panel.innerHTML='<h3>'+activeView+'号 · 当前位置区块雷达</h3><p>'+ (radar.verified?'唯一性验证：'+esc(radar.verified)+'「'+esc(E.byId.get(radar.verified).name)+'」':radar.ids.length+' 种候选'+(radar.gap?'，另有区块外道路可能':''))+'</p><div class="radar-blocks">'+radar.ids.slice(0,16).map(id=>'<span>'+esc(id)+' · '+esc(E.byId.get(id).name)+'</span>').join('')+'</div><small>'+(radar.ids.length>16?'另有 '+(radar.ids.length-16)+' 种，详见区块候选。 ':'')+'候选数量不代表概率；仅描述当前片段，待定位片段之间未强行连接。</small>';
  }
  $('game-status').addEventListener('click',event=>{const button=event.target.closest('[data-status-view]');if(!button)return;activeView=+button.dataset.statusView;journal.view=activeView;save();activateView();});
  function renderViews(){
    $('view-tabs').innerHTML=built.views.map(v=>`<button type="button" data-view="${v.id}" aria-pressed="${v.id===activeView}">${v.id}号${v.id===built.self?' · 我':''}<small>${v.model.segments.reduce((sum,s)=>sum+E.replay(s,model.config.size).observations.length,0)} 条线索</small></button>`).join('');
    $('view-hint').textContent=`所有视角同时展示 · 当前输入的私信属于 ${activeView} 号`;
  }
  function activateView(){
    model=built.views[activeView].model;replay=E.replay(model.segments[shownSegment()],model.config.size);selected={r:replay.r,c:replay.c};phase=0;
    const node=team?.nodes.find(n=>n.id===activeView+':'+shownSegment());solution=node?.solution;displayObservations=node?.mergedObservations||replay.observations;inferred=solution?E.inferredTerrain(solution,model.config.size):new Map();
    renderViews();renderBoard();renderSources();renderRadar();if($('message-input').value.trim())previewInput();if(solution){renderResult();renderLayout();}
  }
  function renderPairs(){}
  $('view-tabs').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;activeView=+button.dataset.view;journal.view=activeView;save();activateView();});

  function renderMessages(){
    const live=M.liveMessages(journal.messages);
    const intro=migration?'<div class="empty"><p>旧版记录已保留为对局基础。</p><small>现在开始，每次粘贴都能整段撤销。若要重新录入开局，可在右上角新建对局。</small></div>':'';
    $('messages').innerHTML=intro+(journal.messages.length?journal.messages.map((m,i)=>{
      const report=built.reports[i],excluded=live[i].excluded;
      return `<article class="message" data-message="${esc(m.id)}"><div class="message-header"><span>输入 ${i+1} · ${excluded?'已隔离':M.inspect(m.text).privateInput?'本人私聊':'公屏 / 设置'}</span><button data-edit="${esc(m.id)}">编辑</button><button data-remove="${esc(m.id)}">撤销这段</button></div><pre class="message-raw">${esc(m.text)}</pre><div class="reply">${excluded?'<p class="warning">已隔离：含他人私聊或赛后专属信息，请补贴公屏版本。原文保留但不参与实战推理。</p>':''}${report.summary.map(s=>`<p>${esc(s)}</p>`).join('')}${report.warnings.map(s=>`<p class="warning">${esc(s)}</p>`).join('')}</div></article>`;
    }).join(''):'<div class="empty"><p>先贴一条开局墙壁私信就好。</p><small>之后继续贴完整行动轨迹，我会自动记录经过的格子与声响。先填写必填设置；私聊固定归本人，点击地图只切换查看。公开轨迹自动按编号分配。</small></div>');
  }
  function renderBoard(){
    const saved={activeView,model,replay,selected,inferred,displayObservations,possibleTerrain};
    $('all-boards').innerHTML=built.views.map(v=>`<section class="player-map ${v.id===activeView?'active-map':''}" data-map-view="${v.id}"><h3>${v.id}号视角${v.id===built.self?' · 自己':''}<small>${v.id===built.self?'公屏 + 本人私聊':'公屏线索'}</small></h3>${mapShiftControls(v.id)}${fragmentPicker(v)}<div class="board-wrap"><div class="board" id="board-${v.id}" aria-label="${v.id}号相对地图"></div></div><p id="summary-${v.id}" class="map-footnote"></p></section>`).join('');
    for(const v of built.views){activeView=v.id;model=v.model;replay=E.replay(model.segments[shownSegment()],model.config.size);const node=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id));displayObservations=node?.mergedObservations||replay.observations;inferred=node?confirmedTerrain(node):new Map();possibleTerrain=new Map();renderingSmart=!!node;selected=v.id===saved.activeView?saved.selected:{r:-1,c:-1};renderSingleBoard($('board-'+v.id));const routes=new Set(v.roundEnds.map(end=>end.round)).size;const total=model.segments.reduce((sum,s)=>sum+E.replay(s,model.config.size).observations.length,0),historical=shownSegment(v.id)!==model.active;$('summary-'+v.id).textContent=`已识别 ${routes} 回合轨迹 · 共保存 ${total} 条线索 · 此片段 ${replay.observations.length} 条 · ${v.id}号${historical?'此前最后已知位置':'位置'} ${xy(replay)}${model.segments.length>1?' · 片段 '+(shownSegment(v.id)+1):''}${historical?' · 当前片段尚未定位':''}${viewOffset().aligned?' · 区块边界已对齐（3×3）':''}`;}
    for(const v of built.views){const node=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id));if(node?.advice?.length)$('summary-'+v.id).insertAdjacentHTML('afterend','<div class="perspective-advice" aria-label="'+v.id+'号推理结论"><h4>'+v.id+'号 · 推理结论与区分线索</h4>'+node.advice.map(t=>'<p>'+esc(t)+'</p>').join('')+'</div>');}
    for(const v of built.views){const known=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id))?.verification?.blocks||[];if(known.length)$('summary-'+v.id).textContent+=' · 已补齐确定区块：'+known.map(b=>b.id+'（'+E.byId.get(b.id).name+'）').join('、');}
    renderHypotheses();
    for(const v of built.views)$('summary-'+v.id).insertAdjacentHTML('afterend','<div class="player-local" id="player-local-'+v.id+'"></div>');
    renderingSmart=false;
    ({activeView,model,replay,selected,inferred,displayObservations,possibleTerrain}=saved);
    if(team)renderLocal();
    $('map-summary').textContent=`${built.count} 个玩家视角 · ${team?'已合并确定推理':'已录入的直接线索'} · 当前接收私信：${activeView}号 · 选中格 ${xy(selected)}`;
  }
  function mapShiftControls(id){
    const shift=journal.mapShifts?.[id]||{r:0,c:0},n=model.config.size,moved=E.mod(shift.r,n)||E.mod(shift.c,n);
    return `<div class="map-shift" aria-label="${id}号地图整体平移"><span>挪图</span>${['↑','↓','←','→'].map((arrow,d)=>`<button type="button" data-shift-player="${id}" data-shift-dir="${d}" aria-label="${id}号地图整体向${E.DIRS[d]}挪一格" title="整体向${E.DIRS[d]}挪一格，边界循环">${arrow}</button>`).join('')}<button type="button" data-shift-player="${id}" data-shift-dir="reset" ${moved?'':'disabled'} title="恢复自动对齐位置">复位</button><small>${n%3===0?'黄线固定 · 只挪地图':'仅移动显示'}</small></div>`;
  }
  function confirmedTerrain(node){
    const all=E.inferredTerrain(node.solution,model.config.size),out=new Map(),n=model.config.size;
    for(const b of node.verification?.blocks||[])for(let i=0;i<9;i++){
      const k=E.key(E.mod(b.origin.r+Math.floor(i/3),n),E.mod(b.origin.c+i%3,n));
      if(all.has(k))out.set(k,all.get(k));
    }
    // Sound and genuine quiet arrivals can establish a cell before its whole block is unique.
    for(const o of node.mergedObservations||node.observations||[])if(o.kind==='sound'||o.kind==='quiet'){
      const k=E.key(o.r,o.c);if(all.has(k))out.set(k,all.get(k));
    }
    for(const h of team?.hypotheses||[])if(h.confirmedPortal&&node.id===h.player+':'+h.segment)out.set(E.key(h.entry.r,h.entry.c),'PORTAL');
    return out;
  }
  function renderHypotheses(){
    const hypotheses=[...(team?.hypotheses||[])];
    for(const v of built.views)if(!hypotheses.some(h=>h.player===v.id)){
      const segment=shownSegment(v.id),frames=window.LongNightHypotheses.portalFrames(v.model.config,[v.model],segment);
      if(frames)hypotheses.push({player:v.id,segment,confirmedPortal:true,portalViews:frames});
    }
    for(const hypothesis of hypotheses){
      activeView=hypothesis.player;model=built.views[activeView].model;
      const host=$('board-'+activeView).closest('.player-map');
      if(hypothesis.confirmedPortal&&hypothesis.portalViews){
        const frames=hypothesis.portalViews,connected=!built.views[activeView].ambiguities.length;
        if(connected)$('summary-'+activeView).insertAdjacentHTML('afterend','<details class="hypothesis-details portal-timeline"><summary>传送前后分图 · 完整对齐图保留在上方</summary><div class="portal-timeline-content"></div></details>');
        else host.querySelector('h3').insertAdjacentHTML('beforeend','<small>进入传送门前 · 含入口</small>');
        const frameHost=connected?host.querySelector('.portal-timeline-content'):null;
        const alternatives=frames.afterAlternatives?.length>1?frames.afterAlternatives:null;
        const drawingFrames=[['before',frames.before],...(alternatives?alternatives.map((f,i)=>['after',f,i]):[['after',frames.after]])];
        for(const [side,frame,variant] of drawingFrames){
          const after=side==='after',id=after?'portal-after-board-'+activeView+(variant!=null?'-'+variant:''):connected?'portal-before-board-'+activeView:'board-'+activeView;
          const frameMarkup='<section class="portal-after-view"><h4>'+activeView+'号 · '+(after?'从传送门出来后':'进入传送门前 · 含入口')+'</h4><div class="board-wrap"><div class="board" id="'+id+'" aria-label="'+activeView+'号'+(after?'出门后':'入门前')+'视角"></div></div><p class="map-footnote">'+(after?'以出口为独立坐标起点，入口与出口之间的两步不画成地面移动。'+(frames.exitCount>1?'入口与出口的相对位置仍有 '+frames.exitCount+' 种可能；这里仅展示各方案共同的出口后线索。':'入口与出口的相对位置已确定。'):'保留出生点至入口的路线；此图中的玩家编号表示进入时的位置。')+'</p></section>';
          if(connected)frameHost.insertAdjacentHTML('beforeend',frameMarkup);
          else if(after)(host.querySelector('.portal-after-view:last-of-type')||$('summary-'+activeView)).insertAdjacentHTML('afterend',frameMarkup);
          if(after&&variant!=null){
            const section=$(id).closest('section');
            section.querySelector('h4').textContent=activeView+'号 · 出门后完整路线 · 方案 '+(variant+1)+' / '+alternatives.length;
            section.querySelector('.map-footnote').textContent='完整保留此方案的连续啪嗒、无声移动和最终撞墙。第 '+frame.teleports.map(t=>t.step).join('、')+' 步从传送门出来；亚空间内两步不作为地面位移。不同方案分别展示，不再只画交集。';
          }
          renderNode={id:'portal-frame-'+activeView+'-'+side,solution:frame.solution||E.solveMap(model.config,frame.observations),observations:frame.observations,verification:{blocks:[]},joined:[]};renderBirth=!after&&hypothesis.segment===0;
          const at=frame.positions.length===1?frame.positions[0]:{r:-1,c:-1};
          replay={...at,trace:frame.trace,observations:frame.observations};displayObservations=frame.observations;renderingSmart=true;inferred=confirmedTerrain(renderNode);possibleTerrain=new Map();selected={r:-1,c:-1};
          renderSingleBoard($(id));
          if(after&&frame.positions.length>1)for(const p of frame.positions)$(id).querySelector('[data-r="'+p.r+'"][data-c="'+p.c+'"]').insertAdjacentHTML('beforeend','<span class="other-players current-marker" title="出门后的可能位置">'+activeView+'?</span>');
        }
        if(!connected)$('summary-'+activeView).textContent='上图截至进入传送门；下方'+(alternatives?alternatives.length+'个完整候选图':'出口视角')+'保留后续路线、声音与撞墙，尚未唯一的方案分别展示。';
        continue;
      }
      const facts=window.LongNightAdvice.hypothesis(hypothesis);
      host.insertAdjacentHTML('beforeend','<details class="hypothesis-details"><summary>'+(hypothesis.confirmedPortal?'已确定进入传送门 · 展开出口候选':'展开'+(hypothesis.silentUnknown?'静音移动':hypothesis.maskedUnknown?'心跳掩盖步':hypothesis.recoveryUnknown?'补充入口':'啪嗒')+'的分支推理与完整候选图')+'</summary><div class="hypothesis-content">'+facts.map(line=>'<p class="hypothesis-fact">'+esc(line)+'</p>').join('')+'</div></details>');
      const container=host.querySelector('.hypothesis-content');
      for(const group of hypothesis.groups){
        const name='第 '+hypothesis.round+' 回合第 '+hypothesis.step+' 步'+(group.kind==='ground'?'未入门假设':'入门假设');
        if(group.excluded){container.insertAdjacentHTML('beforeend','<section class="hypothesis-excluded"><b>'+activeView+'号 · '+name+'：已排除</b><p>'+esc(group.reasons.join('；')||'没有符合全部线索的区块方案')+'</p></section>');continue;}
        const drawings=group.alternatives?.length?group.alternatives:[group];
        for(const [variant,drawing] of drawings.entries()){
        const id='hypothesis-board-'+activeView+'-'+group.kind+(variant?'-'+variant:'');
        renderNode={id:activeView+':'+hypothesis.segment,solution:drawing.solution,verification:drawing.verification,joined:[]};renderBirth=hypothesis.segment===0;
        const positions=drawing.positions.filter(p=>!p.inSpace),single=positions.length===1&&!drawing.inSpace?positions[0]:{r:-1,c:-1};
        replay={...single,trace:drawing.trace,observations:drawing.observations};displayObservations=drawing.observations;renderingSmart=true;inferred=confirmedTerrain(renderNode);possibleTerrain=new Map();selected={r:-1,c:-1};
        const note=group.kind==='ground'?'本假设只表示所标注的这一步未入门；后续仍可能进入传送门，按后续行动逐步验证。':'所标注的这一步入门，之后任意移动两步从配对出口出现；亚空间方向不画成地面路线。';
        const status=drawing.inSpace?'仍可能在亚空间，剩余 '+drawing.remaining.join(' / ')+' 步；入口仅作定位参照。':positions.length>1?'当前位置有 '+positions.length+' 种可能，红色问号为候选位置。':positions.length?'已按此假设推演后续位置。':'后续位置已进入另一个待定位片段。';
        const blocks=drawing.verification.status==='verified'?drawing.verification.blocks:[];
        const detail=(drawing.entryBlocks?.length?' 此方案的入口区块候选：'+drawing.entryBlocks.join(' / ')+'。':'')+(blocks.length?' 此条件下锁定区块：'+blocks.map(b=>b.id+'「'+E.byId.get(b.id).name+'」').join('、')+'，已补画。':'');
        container.insertAdjacentHTML('beforeend','<section class="player-map smart-map hypothesis-map" data-hypothesis="'+group.kind+'" data-map-view="'+activeView+'"><h3>'+activeView+'号 · '+name+(drawings.length>1?' · 方案 '+(variant+1)+' / '+drawings.length:'')+'<small>第 '+hypothesis.round+' 回合第 '+hypothesis.step+' 步'+(hypothesis.silentUnknown?'静音移动':hypothesis.maskedUnknown?'心跳掩盖':hypothesis.recoveryUnknown?'补充入口':'啪嗒')+' · 条件假设</small></h3><div class="board-wrap"><div class="board" id="'+id+'" aria-label="'+activeView+'号'+name+'"></div></div><p class="map-footnote">'+esc(note+status+detail)+(drawing.pending?' 后续分支尚未穷举，保留待验证。':'')+'</p></section>');
        const board=$(id);renderSingleBoard(board);
        if(positions.length>1)for(const p of positions)board.querySelector('[data-r="'+p.r+'"][data-c="'+p.c+'"]').insertAdjacentHTML('beforeend','<span class="other-players current-marker" title="此假设下的可能位置">'+activeView+'?</span>');
        }
      }
    }
    renderNode=null;renderBirth=null;
  }
  function boardAppearance(board){
    return JSON.stringify([...board.children].map(cell=>({
      color:getComputedStyle(cell).backgroundColor,
      content:[...cell.children].filter(e=>!e.matches('.coord,.wall')).map(e=>e.textContent).join('')||cell.childNodes.length&&[...cell.childNodes].filter(e=>e.nodeType===3).map(e=>e.textContent).join('').trim(),
      walls:[...cell.querySelectorAll('.wall')].map(e=>[...e.classList].find(c=>/^d\d$/.test(c))+':'+getComputedStyle(e).backgroundColor).join(','),
      markers:[...cell.querySelectorAll('.birth-marker,.current-marker')].map(e=>(e.matches('.birth-marker')?'birth:':'current:')+e.textContent).join(',')
    })));
  }
  function renderSingleBoard(board){
    const n=model.config.size,visited=new Set(replay.trace.map(p=>E.key(p.r,p.c))),observations=new Map(),edges=new Map(),inferredEdgeKeys=new Set();
    function edge(r,c,d,value){const k=E.key(r,c)+':'+d;if(!edges.has(k))edges.set(k,new Set());edges.get(k).add(value);const rr=E.mod(r+E.V[d][0],n),cc=E.mod(c+E.V[d][1],n),other=E.key(rr,cc)+':'+E.OPP[d];if(!edges.has(other))edges.set(other,new Set());edges.get(other).add(value);}
    for(const o of displayObservations){if(o.kind==='walls')for(let d=0;d<4;d++){if(o.value[d]!=='?')edge(o.r,o.c,d,o.value[d]);}if(o.kind==='pass')edge(o.r,o.c,o.dir,'通行');if(o.kind==='hit')edge(o.r,o.c,o.dir,'撞');}
    const currentNode=renderNode||team?.nodes.find(node=>node.id===activeView+':'+shownSegment()),knownBlocks=renderingSmart?currentNode?.verification?.blocks||[]:[];
    const doors=E.inferredDoors(model.config,currentNode?.solution,knownBlocks,displayObservations);
    if(renderingSmart)for(const [k,value] of E.inferredWalls(model.config,currentNode?.solution)){const [rr,cc]=k.split(/[,:]/).map(Number);if(!knownBlocks.some(b=>E.mod(rr-b.origin.r,n)<3&&E.mod(cc-b.origin.c,n)<3)||edges.has(k))continue;const [r,c,d]=k.split(/[,:]/).map(Number);inferredEdgeKeys.add(k);inferredEdgeKeys.add(E.key(E.mod(r+E.V[d][0],n),E.mod(c+E.V[d][1],n))+':'+E.OPP[d]);edge(r,c,d,value);}
    for(const o of displayObservations){const k=E.key(o.r,o.c);if(!observations.has(k))observations.set(k,[]);observations.get(k).push(o);}
    const nearby=new Set();for(const o of displayObservations)for(const [dr,dc] of [[0,0],...E.V])nearby.add(E.key(E.mod(o.r+dr,n),E.mod(o.c+dc,n)));
    board.style.gridTemplateColumns=`repeat(${n},1fr)`;board.style.gridTemplateRows=`repeat(${n},1fr)`;
    board.innerHTML=Array.from({length:n*n},(_,i)=>{
      const offset=viewOffset(),r=E.mod(Math.floor(i/n)+offset.r,n),c=E.mod(i%n+offset.c,n),k=E.key(r,c),obs=observations.get(k)||[],me=r===replay.r&&c===replay.c;
      const node=renderNode||team?.nodes.find(n=>n.id===activeView+':'+shownSegment());const others=(renderingSmart?node?.joined||[]:[]).filter(j=>j.id!==node.id).map(j=>{const [player,segment]=j.id.split(':').map(Number),at=E.replay(built.views[player].model.segments[segment],n);return {player,segment,r:E.mod(at.r+j.dr,n),c:E.mod(at.c+j.dc,n)};}).filter(p=>p.segment===built.views[p.player].model.active&&built.players[p.player].alive&&!built.views[p.player].ambiguities.length&&p.r===r&&p.c===c);
      const type=obs.findLast(o=>o.kind==='terrain')?.value,sound=obs.findLast(o=>o.kind==='sound')?.value,guess=inferred.get(k),colorType=type||guess||(sound==='PAPA'?'WATER':sound==='SHASHA'?'GRASS':'UNKNOWN'),birth=(renderBirth??shownSegment()===0)&&r===Math.floor(n/2)&&c===Math.floor(n/2),knownBlock=knownBlocks.find(b=>E.mod(r-b.origin.r,n)<3&&E.mod(c-b.origin.c,n)<3),possible=renderingSmart&&!type&&!guess&&nearby.has(k)?possibleTerrain.get(k)||[]:[],alternatives=possible.length>1&&possible.length<=4?possible:[];let walls='';
      for(let d=0;d<4;d++){const door=doors.get(k+':'+d);if(door){const state=door.state==='closed'?'关闭':door.state==='open'?'开启':'待定';walls+=`<i title="确定是门；${door.observed?'最近观察为'+state+'，此后按钮可能改变开关状态':'开关状态'+state}" class="wall d${d} door-edge door-${door.state}"></i>`;continue;}const values=edges.get(k+':'+d);if(!values)continue;const solid=values.has('墙'),hit=values.has('撞'),open=values.has('空')||values.has('通行');walls+=`<i title="${inferredEdgeKeys.has(k+':'+d)?(solid?'候选一致推断有墙边构造，统一标黑；可能含门或树篱':'候选一致推断为空边'):solid?'报告为墙':hit?'曾向此方向撞到障碍，可能是墙、门、树篱或箱子':'报告为空或曾成功通过'}" class="wall d${d} ${solid?'solid-edge':hit?'hit-edge':'open-edge'} ${solid&&open?'conflict':''}"></i>`;}

      const label=`相对位置 ${xy({r,c})}${knownBlock?'，完整确定区块 '+knownBlock.id+'（'+E.byId.get(knownBlock.id).name+'）':''}${birth?'，'+activeView+'号出生点':''}${me?'，'+activeView+'号'+(shownSegment()!==model.active||!built.players[activeView].alive?'历史位置':'最后已知位置'):''}${!type&&!guess&&sound?'，'+(sound==='PAPA'?'水声，具体地形待定':'草丛声，具体地形待定'):''}${type?'，确认'+E.TYPES[type]:guess?'，候选一致推断'+E.TYPES[guess]:''}${alternatives.length?'，可能地形：'+alternatives.map(t=>E.TYPES[t]).join(' / '):''}`;
      return `<button ${knownBlock?'data-known-block="'+esc(knownBlock.id)+'"':''} class="cell terrain-${colorType} ${knownBlock?'determined-cell':''} ${me?'me':''} ${visited.has(k)?'visited':''} ${r===selected.r&&c===selected.c?'selected':''}" data-r="${r}" data-c="${c}" title="${esc(label)}" aria-label="${esc(label)}"><span class="coord">${Math.floor(i/n)+1}·${i%n+1}</span>${birth?'<span class="birth-marker" title="'+activeView+'号出生点">'+activeView+'</span>':''}${me?'<span class="symbol current-marker" title="'+activeView+'号'+(shownSegment()!==model.active||!built.players[activeView].alive?'历史位置':'最后已知位置')+'">'+activeView+'</span>':type?`<span>${symbols[type]}</span>`:sound?`<span>${sound==='SHASHA'?'♧':'≈'}</span>`:guess&&guess!=='EMPTY'?`<span class="inferred-symbol">${symbols[guess]}</span>`:visited.has(k)?'·':''}${others.length?`<small class="other-players current-marker" title="已对齐的玩家当前位置">${others.map(p=>p.player+'号').join(' · ')}</small>`:''}${alternatives.length?'<span class="terrain-possibilities" title="'+esc(alternatives.map(t=>E.TYPES[t]).join(' / '))+'">?</span>':''}${walls}</button>`;
    }).join('');
    // Reference boundaries are DISPLAY grid lines. Never use viewOffset, phase or
    // world coordinates here: only the cells move during manual/automatic alignment.
    if(n%3===0)board.insertAdjacentHTML('beforeend','<span class="block-grid" aria-hidden="true">'+Array.from({length:n/3-1},(_,i)=>{const at=(i+1)*3;return `<i class="block-grid-line vertical" style="grid-column:${at}"></i><i class="block-grid-line horizontal" style="grid-row:${at}"></i>`;}).join('')+'</span>');

  }
  function blockPreview(candidate,focus,player,observations){
    const n=model.config.size;
    const span=axis=>candidate.blocks.map(b=>b.origin[axis]).map(start=>({start,length:Math.max(...candidate.blocks.map(b=>E.mod(b.origin[axis]-start,n)))+3})).sort((a,b)=>a.length-b.length)[0];
    const rs=span('r'),cs=span('c'),rows=rs.length,cols=cs.length,origin={r:rs.start,c:cs.start},visited=new Set(observations.filter(o=>o.kind==='pass').map(o=>E.key(o.r,o.c)));
    return `<div class="block-preview" style="grid-template-columns:repeat(${cols},1fr)">${Array.from({length:rows*cols},(_,index)=>{
      const r=E.mod(origin.r+Math.floor(index/cols),n),c=E.mod(origin.c+index%cols,n),entry=candidate.blocks.find(b=>E.mod(r-b.origin.r,n)<3&&E.mod(c-b.origin.c,n)<3);if(!entry)return '<span class="preview-void" title="此处不属于这组三个区块"></span>';const block=E.byId.get(entry.id),i=E.mod(r-entry.origin.r,n)*3+E.mod(c-entry.origin.c,n),cell=block.cells[i],types=entry.cellTypes?.[i]||[cell.type],type=types.length===1?types[0]:'UNKNOWN';let walls='';
      for(let d=0;d<4;d++){const rr=E.mod(r+E.V[d][0],n),cc=E.mod(c+E.V[d][1],n),other=candidate.blocks.find(b=>E.mod(rr-b.origin.r,n)<3&&E.mod(cc-b.origin.c,n)<3);let w=cell.walls[d];if(other){const j=E.mod(rr-other.origin.r,n)*3+E.mod(cc-other.origin.c,n);w=Math.max(w,E.byId.get(other.id).cells[j].walls[E.OPP[d]]);}if(w)walls+=`<i title="${w===3?'模板初始门状态：关闭':w===4?'模板初始门状态：开启':'模板墙边'}" class="wall d${d} ${w===3?'door-edge door-closed':w===4?'door-edge door-open':'solid-edge'}"></i>`;}
      const me=r===focus.r&&c===focus.c,birth=shownSegment(player)===0&&r===Math.floor(n/2)&&c===Math.floor(n/2);return `<span class="preview-cell terrain-${type}" title="${esc(entry.id+' · '+types.map(t=>E.TYPES[t]).join('/'))}">${birth?`<b class="birth-marker" title="${player}号出生点">${player}</b>`:''}${me?`<b class="player-number current-marker" title="${player}号当前位置">${player}</b>`:visited.has(E.key(r,c))?'<b class="path-dot">•</b>':type==='UNKNOWN'?'?':type!=='EMPTY'?symbols[type]:''}<small>${i===0?esc(entry.id):''}</small>${walls}</span>`;
    }).join('')}</div>`;
  }
  function renderLocal(){
    $('local-results').innerHTML=built.views.map(v=>{const node=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id)),local=node?.local;if(!local)return `<article class="local-player"><h4>${v.id}号 · 这个片段暂无地图线索</h4></article>`;if(local.pending)return `<article class="local-player"><h4>${v.id}号 · 局部组合仍在枚举</h4><p>各视角已得到的结论先显示在地图下方；尚未完成的单 / 双 / 三区块数量不记为零。</p></article>`;if(local.waiting)return `<article class="local-player"><h4>${v.id}号 · 这个片段暂无可定位的地图线索${v.model.segments.length>1?'（其他片段已保存，可在地图上方切换）':''}</h4></article>`;
      const section=(label,allCandidates,includeFallback=false)=>{const fallback=allCandidates.filter(c=>c.spawn?.fallback),candidates=includeFallback?allCandidates:allCandidates.filter(c=>!c.spawn?.fallback);const limit=localLimits.get(v.id+':'+label)||6;return `<details class="local-candidates" data-local-section="${v.id}:${shownSegment(v.id)}:${label}" ${(localExpanded.get(v.id+':'+shownSegment(v.id)+':'+label)??(candidates.length>0&&local.singles.length+local.doubles.length+local.triples.length+(local.expanded?.length||0)<=3))?'open':''}><summary>${label}：${candidates.length} 种拼法${local.historyPending&&label.startsWith('三区块')?'（尚在核对，不是最终数量）':''}</summary>${candidates.length?`<div class="local-gallery">${candidates.slice(0,limit).map(c=>`<div class="local-candidate"><b>${c.blocks.map(b=>esc(b.id)).join(' + ')}${c.direction>=0?' · 第二块在'+E.DIRS[c.direction]+'方':''}</b>${c.verification==='unknown'?'<small>整图验证尚未完成，保留待选；不作为确定区块。</small>':c.partial?'<small>此前局部三区块仍通过当前整图验证，新路线可向外扩展。</small>':''}${blockPreview(c,c.patternFocus||local.focus,v.id,node.observations)}<small>玩家在首块第 ${c.lr+1} 行、第 ${c.lc+1} 列${c.spawn?.reason?'<br>'+esc(c.spawn.reason):''}${c.reasons?.length?'<br>'+c.reasons.map(r=>esc(r.from)+' 的'+E.DIRS[r.dir]+'侧墙需由 '+esc(r.provider)+' 的'+E.DIRS[E.OPP[r.dir]]+'侧补上').join('<br>'):''}</small></div>`).join('')}</div>${candidates.length>limit?`<button type="button" class="more-candidate-button" data-local-more="${v.id}:${label}">再显示 6 种拼法</button><details class="more-local"><summary>其余 ${candidates.length-limit} 种编号与位置</summary><p>${candidates.slice(limit).map(c=>c.blocks.map(b=>esc(b.id)).join('+')+(c.direction>=0?'('+E.DIRS[c.direction]+')':'')+' ['+(c.lr+1)+','+(c.lc+1)+']').join(' · ')}</p></details>`:''}`:local.historyPending&&label.startsWith('三区块')?'<p>仍在核对，暂不能断言没有三区块方案。</p>':'<p>没有能用这种范围覆盖全部已知图案的候选。</p>'}</details>${!includeFallback&&fallback.length?'<details class="spawn-fallback"><summary>'+label+'：另有 '+fallback.length+' 种仅回退出生方案候选</summary>'+section(label+'（回退出生）',fallback,true)+'</details>':''}`;};
      return `<article class="local-player"><h4>${v.id}号${v.model.segments.length>1?' · 片段 '+(shownSegment(v.id)+1):''} · 附近路线的区块拼法</h4><p>已知路线可由以下区块组合拼成：单区块 ${local.singles.length} 种${local.irregular?' · 10×10 保留道路间隔，暂不枚举规则相邻双区块':' · 双区块 '+local.doubles.length+' 种 · 三区块 '+(local.historyPending?'核对中（已找到 '+local.triples.length+' 种）':local.triples.length+' 种')+' · 自动扩展 '+(local.expanded?.length||0)+' 种'}。${!local.singles.length&&!local.doubles.length&&!local.triples.length&&!local.expanded?.length?'没有覆盖当前全部路线的小范围拼法；不代表旧组合被推翻，可能需要更多区块或继续搜索。':''}</p><p class="map-footnote">常规出生优先：出生点不在逃生舱区块，到所有逃生舱的可通行最短路径至少 5 格；源码回退方案保留在单独列表。未覆盖的地图路径仍待确定。</p>${node.retained?.length?'<details class="retained-patterns"><summary>此前 '+node.retained.length+' 种小范围拼法仍成立，已随路线扩展</summary><p>'+node.retained.map(c=>esc(c.blocks.map(b=>b.id+'@'+xy(b.origin,v.id)).join(' + '))+'：整图验证仍成立'+(c.extensions?'，已找到 '+c.extensions+' 种当前扩展':'，扩展列表尚未枚举到')).join('<br>')+'</p><p>原组合保留在更大范围的拼图中；三区块数量为零不代表旧组合被排除。</p></details>':''}${local.truncated?'<p class="warning">自动扩展搜索仍有未穷举的分支；以下数量为已找到的拼法，不据此排除其他可能。整图格子推理独立计算。</p>':''}${node.retainedSingles?.length?'<details class="retained-singles"><summary>此前单区块假设：'+node.retainedSingles.length+' 种尚未排除</summary><p>原位置保留；红色编号表示当时的位置，后续路线可以走出此区块。</p><div class="local-gallery">'+node.retainedSingles.map(c=>'<div class="local-candidate"><b>'+esc(c.blocks[0].id+'「'+E.byId.get(c.blocks[0].id).name+'」')+'</b>'+blockPreview(c,c.patternFocus,v.id,node.observations)+'<small>'+(c.verification==='verified'?'已找到符合新增线索的完整地图':'整图验证待定，暂不排除')+'</small></div>').join('')+'</div></details>':''}${section('单区块',local.singles)}${local.irregular?'':section('双区块',local.doubles)+section('三区块',local.triples)}${[...new Set((local.expanded||[]).map(c=>c.blocks.length))].sort((a,b)=>a-b).map(k=>section(k+'区块（自动扩展）',local.expanded.filter(c=>c.blocks.length===k))).join('')}<details><summary>当前位置的全部区块候选</summary><p>${local.focusCandidates.map(c=>esc(c.id)+'@'+xy(c.origin)).join(' · ')||'暂无候选'}</p></details></article>`;
    }).join('');
    [...$('local-results').children].forEach((article,i)=>{const host=$('player-local-'+built.views[i].id);if(host)host.replaceChildren(article);});
  }
  $('all-boards').addEventListener('toggle',event=>{const key=event.target.dataset.localSection;if(key)localExpanded.set(key,event.target.open);},true);
  $('all-boards').addEventListener('click',event=>{const button=event.target.closest('[data-local-more]');if(!button)return;const key=button.dataset.localMore;localLimits.set(key,(localLimits.get(key)||6)+6);renderLocal();});
  function renderResult(){
    const local=E.globallyFilter(E.matchBlocks(model.config,displayObservations,selected),solution),matches=local.matches,ids=[...new Set(matches.map(m=>m.id))];
    let html='';
    if(!matches.length&&!local.gap){
      html='<p class="error">这几条消息暂时拼不在一起。</p><p>请先检查是否漏贴回合轨迹、玩家编号是否正确，或中途发生了传送。你可以直接编辑或撤销任何一整段输入。</p>';
      const pass=replay.observations.find(o=>o.kind==='pass'&&replay.observations.some(w=>w.kind==='walls'&&w.r===o.r&&w.c===o.c&&w.value[o.dir]==='墙'));
      if(pass)html+=`<p class="warning">具体冲突：${xy(pass)}曾报告${E.DIRS[pass.dir]}方为墙，轨迹又表示从这里向${E.DIRS[pass.dir]}成功移动。若门发生变化，请保留对应回合信息。</p>`;
    }else if(!replay.observations.length)html='<p>等待第一条地图线索。起点放在中央，只是为了方便记录相对位置。</p>';
    else if(matches.length===1){const m=matches[0];html=`<p>选中格只剩 <strong>${esc(m.id)} · ${esc(m.name)}</strong> 一个区块位置候选。</p><p>它在区块内第 ${m.lr+1} 行、第 ${m.lc+1} 列。</p>`;}
    else html=`<p>选中格可能属于 <strong>${ids.length} 种区块</strong>，还有 ${matches.length} 个格内位置候选。</p><p>继续贴新的墙壁或行动信息，就能进一步排除。</p>`;
    if(local.gap)html+='<p>10×10 地图还保留区块之间道路空隙的可能。</p>';
    if(built.views[activeView].pending.length)html+=`<p class="warning">第 ${built.views[activeView].pending.join('、')} 回合的墙壁已暂存，等待对应的完整行动轨迹。</p>`;
    if(model.segments.length>1)html+=`<p class="warning">${activeView}号共保存 ${model.segments.length} 个独立片段。当前显示片段 ${shownSegment()+1}${shownSegment()!==model.active?'的历史路线，不能据此断定玩家现在的位置':'；未知位移前的路线可在地图上方切换查看'}。</p>`;
    const joined=team?.nodes.find(n=>n.id===activeView+':'+shownSegment())?.joined||[];if(joined.length>1)html+='<p>已叠加 '+(joined.length-1)+' 个唯一对齐的其他视角 / 片段的线索。</p>';if(team?.nodes.some(n=>n.fusionConflict))html+='<p class="warning">两两拼法无法同时组成一致地图，已暂停相关叠加。</p>';$('reasoning').innerHTML=html;
    $('candidate-count').textContent=matches.length+(local.gap?' + 空隙':'');
    $('candidates').innerHTML=matches.slice(0,200).map(m=>`<div class="candidate"><b>${esc(m.id)}</b>${esc(m.name)}<small>格内 ${m.lr+1} 行 ${m.lc+1} 列</small></div>`).join('')+(matches.length>200?'<p>仅展示前 200 项；继续提供线索可缩小候选。</p>':'');
  }
  function renderLayout(){
    if(!solution)return;
    if(solution.irregular){$('layout').innerHTML='<p>10×10 为不规则布局，当前提供局部区块匹配。</p>';return;}
    $('phase-select').innerHTML=solution.phases.map((p,i)=>`<option value="${i}" ${i===phase?'selected':''}>对齐 ${p.pr+1} · ${p.pc+1}</option>`).join('');
    const p=solution.phases[phase];if(!p){$('layout').innerHTML='<p>还没有满足约束的布局。</p>';return;}
    $('layout').style.gridTemplateColumns=`repeat(${model.config.size/3},1fr)`;
    $('layout').innerHTML=p.domains.map(d=>`<div class="slot"><b>${d.length===1?esc(d[0].id):d.length+'种'}</b><small>${d.length===1?esc(d[0].name):esc(d.slice(0,6).map(m=>m.id).join(' · '))+(d.length>6?' …':'')}</small></div>`).join('');
  }
  function renderSources(){
    const s=model.segments[shownSegment()],names=[...new Set(s.sounds.map(e=>e.source))];
    $('sources').innerHTML=names.length?names.map(name=>{const result=E.locate(s.sounds,name,model.config.size);return `<div class="source">${esc(name)} · ${result.cells.length} 个可能位置${result.cells.length===1?' '+xy(result.cells[0]):''}</div>`;}).join(''):'<p>贴入其他玩家的方位私信和完整轨迹后，在这里查看。</p>';
  }
  function renderOptions(){
    $('player-count').value=setup.count??'';$('game-mode').value=setup.mode??'';$('self-id').innerHTML='<option value="" disabled>请选择编号</option>'+Array.from({length:setup.count||0},(_,id)=>`<option value="${id}">${id}号</option>`).join('');$('self-id').value=setup.self??'';$('self-id').disabled=!setup.count;$('game-size').value=model.config.size;
    $('capture-target').value=model.config.captureTarget||model.target||'PREVIOUS';$('special-event').value=model.config.event;$('silent-mode').checked=!!model.config.silent;$('brawl-mode').checked=!!model.config.brawl;$('point-capture').checked=model.config.pointCapture!==false;
    draftBlocks=new Set(model.config.pool.trim().split(/\s+/).filter(Boolean));
    $('pool-count').textContent=setup.mode?model.config.pool?`已录入 ${draftBlocks.size} 个候选编号`:'必填 · 尚未录入':'先选择模式';
    $('pool-count').title='填写本局开局图片中实际公布的区块；仅选择模式不能确定本局区块池。';
    $('opening-block-ids').value=model.config.pool;$('opening-block-ids').disabled=!setup.mode;$('apply-blocks').disabled=!setup.mode;
    $('unknown-special-wrap').hidden=setup.mode!=='CRAZY';$('unknown-special').checked=false;
    if(!model.config.pool)$('block-picker').open=true;
    $('opening-image-preview').hidden=!journal.openingImage;$('opening-image-preview').src=journal.openingImage||'';$('remove-opening-image').hidden=!journal.openingImage;
    renderBlockChoices();
  }
  function renderBlockChoices(){
    const allowed=new Set(window.LongNightData.modes[setup.mode]||[]);
    // Explicit custom pools can legally override the mode; retain their selected IDs.
    $('block-choices').innerHTML=window.LongNightData.blocks.filter(b=>allowed.has(b.id)||(setup.mode&&model.config.pool&&draftBlocks.has(b.id))).map(b=>`<button type="button" class="block-choice" data-block="${esc(b.id)}" aria-pressed="${draftBlocks.has(b.id)}" title="${esc(b.name)}"><b>${esc(b.id)}</b><span>${esc(b.name)}</span></button>`).join('');
    $('draft-count').textContent=`已选 ${draftBlocks.size} 个`;
  }
  function addSetting(text){
    const next=E.clone(journal);next.messages.push({id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random(),text,view:activeView});if(!ready()&&ready(settings(next))){next.view=settings(next).self;next.messages.at(-1).view=next.view;}try{checkInput(next,text);}catch(error){renderOptions();throw error;}M.build(next.base,M.liveMessages(next.messages));journal=next;save();rebuild(true);
  }
  $('capture-target').addEventListener('change',safe(()=>addSetting('捕捉目标：'+($('capture-target').value==='NEXT'?'下家':'上家'))));
  $('special-event').addEventListener('change',safe(()=>addSetting('特殊事件：'+$('special-event').selectedOptions[0].textContent)));
  for(const [id,label] of [['silent-mode','静音'],['brawl-mode','大乱斗'],['point-capture','点杀']])$(id).addEventListener('change',safe(()=>addSetting(label+($(id).checked?'开启':'关闭'))));
  $('self-id').addEventListener('change',safe(()=>{if($('self-id').value==='')return;addSetting('我是'+$('self-id').value+'号');}));
  $('player-count').addEventListener('change',safe(()=>{if($('player-count').value)addSetting('玩家人数：'+$('player-count').value);}));
  $('game-mode').addEventListener('change',safe(()=>{if($('game-mode').value)addSetting('模式'+modeNames[$('game-mode').value]+'\n区块池：默认');}));
  $('game-size').addEventListener('change',safe(()=>addSetting('边长'+$('game-size').value)));
  $('block-choices').addEventListener('click',event=>{const button=event.target.closest('[data-block]');if(!button)return;const id=button.dataset.block;if(draftBlocks.has(id))draftBlocks.delete(id);else draftBlocks.add(id);button.setAttribute('aria-pressed',String(draftBlocks.has(id)));$('draft-count').textContent=`已选 ${draftBlocks.size} 个`;$('opening-block-ids').value=[...draftBlocks].join(' ');});
  $('opening-block-ids').addEventListener('input',()=>{draftBlocks=new Set($('opening-block-ids').value.toUpperCase().split(/[\s,，、;；]+/).filter(id=>E.byId.has(id)));renderBlockChoices();});
  $('apply-blocks').addEventListener('click',safe(()=>{const pool=M.openingPool($('opening-block-ids').value,setup.mode,$('unknown-special').checked);addSetting('区块池：'+pool);$('block-picker').open=false;}));
  $('default-blocks').addEventListener('click',()=>{draftBlocks.clear();$('opening-block-ids').value='';$('unknown-special').checked=false;renderBlockChoices();});
  async function readOpeningImage(file){
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WebP 区块图。');
    if(file.size>15000000)throw new Error('图片过大，请选择小于 15 MB 的开局图。');
    const url=URL.createObjectURL(file);try{
      const img=new Image();img.src=url;await img.decode();
      const scale=Math.min(1,1600/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const image=canvas.toDataURL('image/jpeg',.82);if(image.length>1800000)throw new Error('图片压缩后仍过大，请裁剪到区块图区域。');journal.openingImage=image;save();$('opening-image-preview').src=image;$('opening-image-preview').hidden=false;$('remove-opening-image').hidden=false;toast('区块图已保存，请对照图片填写或勾选编号；图片不会自动识别。');
    }finally{URL.revokeObjectURL(url);}
  }
  $('opening-image-file').addEventListener('change',safe(async()=>{await readOpeningImage($('opening-image-file').files[0]);$('opening-image-file').value='';}));
  $('opening-image-paste').addEventListener('paste',safe(async event=>{const file=[...event.clipboardData.items].find(i=>i.kind==='file'&&i.type.startsWith('image/'))?.getAsFile();if(!file)return;event.preventDefault();await readOpeningImage(file);}));
  $('remove-opening-image').addEventListener('click',()=>{delete journal.openingImage;save();$('opening-image-preview').removeAttribute('src');$('opening-image-preview').hidden=true;$('remove-opening-image').hidden=true;});
  $('message-form').addEventListener('submit',safe(event=>{
    event.preventDefault();const text=$('message-input').value.trim();if(!text)throw new Error('请粘贴一段机器人消息。');
    const next=E.clone(journal),receiver=setup.self??built.self;
    if(editing){const item=next.messages.find(m=>m.id===editing);if(!item)throw new Error('这段输入已被撤销。');item.text=text;item.view=receiver;item.receiverConfirmed=true;}
    else{
      if(next.messages.length>=2000)throw new Error('本对局消息已达上限，请导出存档并开启新对局。');
      if(/完整行动轨迹/.test(text)&&next.messages.some(m=>M.clean(m.text)===M.clean(text)))throw new Error('这段完整轨迹已输入过。若确实是另一个回合，请在开头加上「【第 2 回合】」等回合标记。');
      next.messages.push({id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random(),text,view:receiver,receiverConfirmed:true});
    }
    if(!ready()&&ready(settings(next))){next.view=settings(next).self;next.messages.at(-1).view=next.view;}
    const currentMessage=editing?next.messages.find(m=>m.id===editing):next.messages.at(-1);
    if(M.liveMessages(next.messages).find(m=>m.id===currentMessage.id)?.excluded)throw new Error('这段含他人的专属地形或心跳掩盖详情，请粘贴公屏原文或你自己的私聊版本。');

    try{checkInput(next,text);}catch(error){renderOptions();throw error;}M.build(next.base,M.liveMessages(next.messages));journal=next;resetEditor();save();rebuild(true);$('message-input').focus();
  }));
  $('message-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('message-form').requestSubmit();}if(e.key==='Escape'&&editing)resetEditor();});
  $('undo').addEventListener('click',()=>{journal.messages.pop();resetEditor();save();rebuild(true);});
  $('messages').addEventListener('click',safe(event=>{
    const edit=event.target.closest('[data-edit]'),remove=event.target.closest('[data-remove]');
    if(edit){const item=journal.messages.find(m=>m.id===edit.dataset.edit);editing=item.id;inputReceiver=null;activeView=Math.min(item.view??built.self,built.count-1);journal.view=activeView;activateView();$('message-input').value=item.text;previewInput();$('send').textContent='保存修改';$('input-hint').textContent='正在编辑 · 私聊固定归本人 · Esc 取消';$('message-input').focus();}
    if(remove){journal.messages=journal.messages.filter(m=>m.id!==remove.dataset.remove);resetEditor();save();rebuild();toast('已撤销整段文字，并重算后续线索。');}
  }));
  $('all-boards').addEventListener('click',event=>{if(event.target.closest('.hypothesis-details summary,.player-local'))return;const shift=event.target.closest('[data-shift-player]');if(shift){const id=+shift.dataset.shiftPlayer,n=model.config.size; journal.mapShifts??={};const old=journal.mapShifts[id]||{r:0,c:0};if(shift.dataset.shiftDir==='reset')delete journal.mapShifts[id];else{const [dr,dc]=E.V[+shift.dataset.shiftDir];journal.mapShifts[id]={r:E.mod(old.r+dr,n),c:E.mod(old.c+dc,n)};}save();renderBoard();renderSources();if(solution)renderResult();if(team)renderLocal();return;}const card=event.target.closest('[data-map-view]');if(!card)return;const pick=event.target.closest('[data-fragment]');if(pick)fragmentChoices.set(+pick.dataset.fragmentPlayer,+pick.dataset.fragment);activeView=+card.dataset.mapView;journal.view=activeView;save();const cell=event.target.closest('.portal-after-view')?null:event.target.closest('[data-r]');activateView();if(team)renderLocal();if(cell){selected={r:+cell.dataset.r,c:+cell.dataset.c};renderBoard();if(solution)renderResult();}});
  $('phase-select').addEventListener('change',()=>{phase=+$('phase-select').value;renderLayout();});
  $('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(journal,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='长夜消息存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('import').addEventListener('click',()=>{importMode='replace';$('import-file').click();});
  $('merge-import').remove();
  $('import-file').addEventListener('change',safe(async()=>{const file=$('import-file').files[0];$('import-file').value='';if(!file)return;if(file.size>6*1024*1024)throw new Error('存档超过 6 MB。');const next=validate(JSON.parse(await file.text()));
    if(importMode==='merge'){const result=window.LongNightJournal.merge(journal,next);if(!result.added){toast('没有新记录，已跳过 '+result.duplicates+' 条重复消息。');return;}journal=result.journal;toast('合并了 '+result.added+' 条消息，跳过 '+result.duplicates+' 条重复消息。');}
    else{if(!await confirm('载入存档？','当前对局将被替换；如需保留，请先导出。'))return;journal=next;}
    migration=false;resetEditor();save();rebuild();}));
  function resetGame(){localExpanded.clear();localLimits.clear();quickDraft=[];renderQuick();journal={version:2,base:E.newState(),messages:[]};migration=false;resetEditor();save();rebuild();document.querySelector('.menu').open=false;toast('已重置，请重新填写模式、人数、编号及开局区块。');}
  $('reset-game').addEventListener('click',resetGame);$('new-game').addEventListener('click',resetGame);
  rebuild();if(loadError)toast(loadError,true);
})();


