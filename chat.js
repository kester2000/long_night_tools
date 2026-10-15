(()=>{
  'use strict';
  const E=window.LongNight,M=window.LongNightMessages,$=id=>document.getElementById(id),STORE='long-night-message-notebook-v2';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function viewOffset(id=activeView){const node=renderNode||team?.nodes.find(n=>n.id===id+':'+shownSegment(id));return node?.verification?.status==='verified'?E.displayOffset(node.solution):{r:0,c:0,aligned:false};}
  const xy=(p,id=activeView)=>{const o=viewOffset(id),n=model.config.size;return '('+(E.mod(p.r-o.r,n)+1)+', '+(E.mod(p.c-o.c,n)+1)+')';},symbols={EMPTY:'·',GRASS:'♧',WATER:'≈',PORTAL:'◎',ONEWAYPORTAL:'◉',EXIT:'↗',TRAP:'⌁',HEAT:'♨',BERRY:'❧',HEART:'♥'};
  let journal={version:2,base:E.newState(),messages:[]},built,model,replay,selected,solution,inferred=new Map(),editing=null,worker=null,generation=0,timer,phase=0;
  let activeView=0,team=null,displayObservations=[],setup={},renderingSmart=false,possibleTerrain=new Map(),renderNode=null,renderBirth=null,importMode='replace',inputReceiver=null,previewTimer;
  function settings(j=journal){const out={};for(const m of j.messages)for(const i of M.parse(m.text).items){if(i.kind==='identity')out.self=i.id;if(i.kind==='config'){if(i.values.mode)out.mode=i.values.mode;if(i.values.playerCount)out.count=i.values.playerCount;}}return out;}
  function ready(s=setup){return !!s.mode&&!!s.count&&Number.isInteger(s.self)&&s.self<s.count;}
  function checkInput(j,text){const s=settings(j),items=M.parse(text).items;if(!ready(s)&&items.some(i=>['walls','trajectory','hear','firstSound'].includes(i.kind)))throw new Error('请先填写模式、人数和自己的编号，再输入地图信息。');if(s.count&&Number.isInteger(s.self)&&s.self>=s.count)throw new Error('自己的编号必须小于玩家人数。');if(s.count&&j.messages.some(m=>M.parse(m.text).items.some(i=>(i.player!=null&&i.player>=s.count)||(['walls','hear'].includes(i.kind)&&(m.view??s.self??0)>=s.count))))throw new Error('已有信息的玩家编号超出已填写的人数，请先修正人数或对应消息。');}
  const localLimits=new Map(),localExpanded=new Map(),fragmentChoices=new Map();
  let soundSelection=null,routePlayer=null;
  $('sound-candidate-detail').addEventListener('click',event=>{const button=event.target.closest('[data-sound-more]');if(!button)return;const route=button.closest('[data-sound-route]')?.dataset.soundRoute;localLimits.set(button.dataset.soundMore,(localLimits.get(button.dataset.soundMore)||6)+6);renderSoundDetail();if(route!=null)$('sound-candidate-detail').querySelector('[data-sound-route="'+route+'"]').open=true;});
  function soundAt(player,r,c){return (team?.soundCandidates||[]).filter(h=>h.listenerNode===player+':'+shownSegment(player)).flatMap(h=>h.cells.filter(p=>p.r===r&&p.c===c).map(p=>({h,...p})));}
  function soundTitle(items){return items.map(p=>`${p.h.player}号第${p.h.round}回合第${p.h.step}步声源候选 · ${p.h.direction} · ${[...new Set(p.branches.flatMap(b=>b.blocks.map(m=>m.id)))].join(' / ')}号区块${p.branches.some(b=>b.status!=='verified')?' · 含待验证分支':''} · 点击查看详细可能`).join('；');}
  function routeCard(c,player,index,coordinatePlayer=player){
    const stop=c.blocks.find(b=>window.LongNightLocal.inside(c.focus,b,model.config.size));
    const eventName=step=>step.kind==='hit'?E.DIRS[step.dir]+'向撞击':step.kind==='entry'?'进入传送门':step.kind==='space'?'亚空间中':step.teleport?'从配对出口出现':'成功移动';
    return '<article class="route-card"><h5>解释 '+index+' · '+(c.status==='verified'?'完整地图验证通过':'验证尚未完成')+'</h5><p>最终停留点 '+xy(c.focus,coordinatePlayer)+(stop?' · '+esc(stop.id+'「'+E.byId.get(stop.id).name+'」')+' 第 '+(E.mod(c.focus.r-stop.origin.r,model.config.size)+1)+' 行、第 '+(E.mod(c.focus.c-stop.origin.c,model.config.size)+1)+' 列':' · 区块待定位')+'</p>'+blockPreview(c,c.focus,player,c.observations)+'<table class="route-steps"><thead><tr><th>回合 / 步</th><th>行动解释</th><th>地面位置 / 区块</th><th>地形与声音</th></tr></thead><tbody>'+c.steps.map(step=>'<tr><td>'+step.clock.round+' / '+step.clock.step+'</td><td>'+esc(eventName(step))+'</td><td>'+(step.kind==='space'?'尚未回到地面':xy(step,coordinatePlayer)+(step.block?' · '+esc(step.block.id)+' 第 '+(step.block.lr+1)+' 行、第 '+(step.block.lc+1)+' 列':''))+'</td><td>'+esc(step.types.map(t=>E.TYPES[t]).join(' / '))+(step.sound?' · '+(step.sound==='PAPA'?'啪嗒':step.sound==='SHASHA'?'沙沙':'无声'):'')+'</td></tr>').join('')+'</tbody></table>'+(c.reasons.length?'<p>墙壁解释：'+c.reasons.map(r=>esc(r.from)+' 的'+E.DIRS[r.dir]+'侧由 '+esc(r.provider)+' 的'+E.DIRS[E.OPP[r.dir]]+'侧墙补足').join('；')+'。</p>':'')+'<p class="map-footnote">图中 '+player+' 号标记是本方案的最终停留点。此图解释当前全部已录入路线和墙壁线索；未展示的区域仍有多种可能。</p></article>';
  }
  function renderSoundDetail(){
    const host=$('sound-candidate-detail');if(!host)return;
    const items=soundSelection?soundAt(soundSelection.player,soundSelection.r,soundSelection.c):[];host.hidden=!items.length;
    if(!items.length){host.innerHTML='';$('sound-map-candidates')?.remove();return;}
    host.innerHTML='<h3>声源位置 '+xy(soundSelection,soundSelection.player)+' · 当前路径解释</h3>'+items.map(item=>'<h4>'+esc(item.h.player+'号第'+item.h.round+'回合第'+item.h.step+'步 · '+item.h.direction)+'</h4><p>在此问号格固定声音来源，结合双方完整路线和墙壁线索核对。</p>'+item.branches.map((branch,i)=>{
      const local=window.LongNightSoundCandidates.patterns(model.config,branch),result=window.LongNightRouteExplanations.explain(model.config,{...branch,observations:branch.conditionalObservations,focus:branch.focus||soundSelection,pending:branch.status==='unknown'},local,item.h.player),key='sound:'+soundSelection.player+':'+soundSelection.r+':'+soundSelection.c+':'+i,limit=localLimits.get(key)||3;
      return '<details class="route-explanations" data-sound-route="'+i+'" open><summary>路线方案 '+branch.route+' · 已找到 '+result.cases.length+' 种路径解释</summary><div class="sound-pattern-gallery">'+(result.pending?'<p>仍有分支待验证，当前列表不是全部可能。</p>':'')+result.cases.slice(0,limit).map((c,index)=>routeCard(c,item.h.player,index+1,soundSelection.player)).join('')+(result.cases.length>limit?'<button type="button" data-sound-more="'+key+'">继续显示路径解释</button>':'')+(!result.cases.length?'<p>该位置的完整路径解释仍在核对，暂不展示不完整的拼图。</p>':'')+'</div></details>';
    }).join('')).join('');
    separateMaps(host,'sound-map-candidates','声源定位候选地图');
  }
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
    soundSelection=null;renderSoundDetail();fragmentChoices.clear();setup=settings();activeView=journal.view??setup.self??0;team=null;$('perspective-info').replaceChildren();$('combined-info').replaceChildren();$('map-candidates').replaceChildren();if($('combined-layouts')){$('combined-layouts').hidden=true;$('combined-layouts').innerHTML='';}if(worker)worker.terminate();worker=null;++generation;
    built=M.build(journal.base,M.liveMessages(journal.messages),choices);built.resolvedChoices=choices;$('turn-advice').textContent='正在核对本轮线索与相对位置…';activeView=Math.min(activeView,built.count-1);model=built.views[activeView].model;replay=E.replay(model.segments[shownSegment()],model.config.size);selected={r:replay.r,c:replay.c};solution=null;inferred=new Map();phase=0;
    displayObservations=replay.observations;renderMessages();renderOptions();renderGameStatus();renderSoundChecklist();$('setup-hint').textContent=ready()?'设置已填写 · 私聊固定归本人 · 点击地图只切换查看':'请先填写模式、人数和自己的编号，或在对话框中输入这三项。';
    if(!ready()){ $('turn-advice').textContent='请先填写人数、模式、自己的编号及本局开局区块。';$('view-tabs').innerHTML='';$('block-radar').hidden=true;$('all-boards').innerHTML='<p class="setup-empty">填写模式、人数和编号后，同时展示所有玩家地图。</p>';$('map-summary').innerHTML='';$('view-hint').textContent='';$('analysis-status').textContent='等待设置';$('pairs').innerHTML='';$('pair-status').textContent='等待设置';$('reasoning').textContent='';$('candidates').innerHTML='';$('candidate-count').textContent='—';$('layout').innerHTML='';$('phase-select').innerHTML='';$('sources').innerHTML='';$('local-results').innerHTML='';$('undo').disabled=!journal.messages.length;return;}
    renderViews();renderBoard();renderSources();$('local-results').innerHTML='<p>先核对各玩家自己的完整路线解释…</p>';$('pairs').innerHTML='<p>每次输入、修改或撤销后，自动重算全部视角。</p>';$('pair-status').textContent='计算中';
    $('undo').disabled=!journal.messages.length;
    if(!model.config.pool.trim()){
      $('setup-hint').textContent='还需填写开局图中的本局区块编号；不会默认使用整个模式池。';
      $('analysis-status').textContent='等待开局区块图';$('turn-advice').textContent='请先在左侧填写开局区块图中的编号。已有轨迹和墙壁仍保留，确定本局区块池后再推理。';
      $('local-results').textContent='等待本局区块池，尚未枚举候选。';$('pairs').textContent='填写开局区块后再进行两两拼接。';$('pair-status').textContent='等待区块池';$('reasoning').textContent='';$('candidate-count').textContent='—';$('candidates').innerHTML='';$('layout').innerHTML='';$('phase-select').innerHTML='';return;
    }
    $('analysis-status').textContent='推理中';$('reasoning').innerHTML='<p>正在把新消息与已有线索交叉核对…</p>';$('candidate-count').textContent='…';$('candidates').innerHTML='';$('layout').innerHTML='';$('phase-select').innerHTML='';
    const nodes=window.LongNightLocal.nodes(built);
    const request={id:++generation,config:{...model.config,routePresentation:true},nodes,notebook:{base:journal.base,messages:M.liveMessages(journal.messages),self:built.self,count:built.count,choices},soundRelations:window.LongNightSoundCandidates.hearings(built),relations:built.relations.filter(h=>!['首次','被屏蔽'].includes(h.direction))};
    if(worker)worker.terminate();worker=null;
    if(location.protocol!=='file:')try{worker=new Worker('worker.js');worker.onmessage=e=>receive(e.data);worker.onerror=()=>{worker.terminate();worker=null;receive({id:request.id,error:'后台推理失败，请刷新后重试。'});};}catch{}
    if(worker)worker.postMessage(request);else setTimeout(()=>{try{const hypotheses=window.LongNightHypotheses.all(request.config,request.notebook),resolved=window.LongNightHypotheses.choiceUpdates(hypotheses,choices);if(resolved){receive({id:request.id,resolvedChoices:resolved});return;}const constrained=window.LongNightHypotheses.constrainNodes(request.nodes,request.relations,hypotheses);const result=window.LongNightTeam.solve(request.config,constrained.nodes,constrained.relations,local=>receive({id:request.id,local}),progress=>receive({id:request.id,progress}));result.hypotheses=hypotheses;result.soundCandidates=window.LongNightSoundCandidates.analyze(request.config,window.LongNightSoundCandidates.attach(result.nodes,hypotheses),request.soundRelations);receive({id:request.id,team:result});}catch(error){receive({id:request.id,error:error.message});}},0);
    if(scroll)$('messages').scrollTop=$('messages').scrollHeight;
  }
  function receive(data){
    if(data.id!==generation)return;
    if(data.progress){
      const p=data.progress;
      $('analysis-status').textContent=p.stage==='combined'?`全员合并验证 · 已检查 ${p.checked} 种对齐 · 保留 ${p.found} 张地图`:p.stage==='sounds'?`逐格核对声源 · ${p.player}号第${p.step}步`:p.stage==='hypotheses'?'核对声音 / 静音移动的地面与传送门分支':p.stage==='perspectives'?`核对${p.player}号路线、声音、墙壁与完整地图`:p.stage==='local'?`匹配${p.player}号当前路线的完整路线方案`:p.stage==='pairs'?`对齐${p.a}号与${p.b}号 · 已检查 ${p.checked}/${p.total} 个平移位置`:p.enumerating?`地图推理已完成 · 枚举${p.player}号完整路线解释 · 搜索 ${p.searchSteps} 次 · 找到 ${p.found} 个组合`:`地图推理已完成 · 核对${p.player}号完整路线解释 · 已验证 ${p.checks} 个方案 · 保留 ${p.kept} 个`;
      return;
    }
    if(data.resolvedChoices){rebuild(false,data.resolvedChoices);return;}
    if(data.error){$('analysis-status').textContent='需要检查';$('reasoning').innerHTML='<p class="error">'+esc(data.error)+'</p>';return;}
    team=data.local||data.team;
    for(const node of team.nodes)node.advice=node.id===node.player+':'+built.views[node.player].model.active?window.LongNightAdvice.perspective(built,team,node.player):[];
    activateView();renderLocal();renderSoundDetail();
    $('turn-advice').innerHTML='<h3>对局提示 · '+built.self+'号</h3>'+window.LongNightAdvice.summarize(built,team).map(t=>'<p>'+esc(t)+'</p>').join('');
    if(data.local){
      if(data.local.pairs.length)renderPairs();
      $('analysis-status').textContent=['aligned','history'].includes(data.local.stage)?'地图推理与对齐已完成 · 继续核对完整路线解释':'各视角结论已更新 · 继续匹配完整路线方案';
      if(!data.local.pairs.length)$('pair-status').textContent='尚未完成两两对齐，已有结论见各玩家地图';
      return;
    }
    renderPairs();$('analysis-status').textContent=team.nodes.some(n=>n.local?.triplesPending)?'地图推理已完成 · 部分历史方案的整图验证待定':'推理已完成';
  }
  function renderGameStatus(){
    const panel=$('game-status');panel.hidden=!ready();if(!ready()){panel.textContent='';return;}
    const rows=window.LongNightAdvice.status(built),me=rows[built.self];
    panel.innerHTML='<h3>对局状态 · '+rows.filter(p=>p.alive).length+'/'+built.count+' 人未记录退场</h3><p>'+(!me.alive?'你'+esc(me.reason):me.target==null?'暂无捕捉目标':'你追捕 '+me.target+' 号 · '+me.hunter+' 号追捕你')+'</p><div class="status-players">'+rows.map(p=>'<button type="button" data-status-view="'+p.id+'" class="'+(p.alive?'':'retired')+'"><b>'+p.id+'号'+(p.id===built.self?' · 我':'')+'</b><span>'+esc(p.alive?(p.target==null?'暂无目标':'目标 '+p.target+'号'):p.reason)+'</span><small>已录入至第 '+p.round+' 回合'+(p.coins!=null?' · 上次公示金币 '+p.coins:'')+(p.pending.length?' · 待补轨迹 '+p.pending.join('、')+' 回合':'')+'</small></button>').join('')+'</div><small>根据已录入记录更新；点击玩家展示整局移动路径；私聊始终归本人。</small>';
  }
  function renderRadar(){
    const panel=$('block-radar');if(!ready()){panel.hidden=true;return;}
    const radar=window.LongNightAdvice.radar(built,team,activeView);panel.hidden=!radar;if(!radar){panel.textContent='';return;}
    panel.innerHTML='<h3>'+activeView+'号 · 当前位置区块雷达</h3><p>'+ (radar.verified?'唯一性验证：'+esc(radar.verified)+'「'+esc(E.byId.get(radar.verified).name)+'」':radar.ids.length+' 种候选'+(radar.gap?'，另有区块外道路可能':''))+'</p><div class="radar-blocks">'+radar.ids.slice(0,16).map(id=>'<span>'+esc(id)+' · '+esc(E.byId.get(id).name)+'</span>').join('')+'</div><small>'+(radar.ids.length>16?'另有 '+(radar.ids.length-16)+' 种，详见区块候选。 ':'')+'候选数量不代表概率；仅描述当前片段，待定位片段之间未强行连接。</small>';
  }
  $('game-status').addEventListener('click',event=>{const button=event.target.closest('[data-status-view]');if(!button)return;const player=+button.dataset.statusView;if(routePlayer===player){routePlayer=null;renderPlayerRoute();return;}routePlayer=player;activeView=routePlayer;journal.view=activeView;save();activateView();});
  function visibleGroups(){
    const ids=[built.self,...built.views.map(v=>v.id).filter(id=>id!==built.self)].map(id=>id+':'+shownSegment(id));
    return window.LongNightTeam.viewGroups(team,ids);
  }
  function groupRoot(player){return +(visibleGroups().find(g=>g.some(id=>+id.split(':')[0]===player))?.[0].split(':')[0]??player);}
  function groupTitle(group){const players=group.map(id=>+id.split(':')[0]);return (players.includes(built.self)?'我的视角':players[0]+'号视角')+(players.length>1?' · 已合并 '+players.map(p=>p+'号').join('、'):' · 尚未合并');}
  function renderViews(){
    $('view-tabs').innerHTML=visibleGroups().map(g=>{const id=+g[0].split(':')[0];return `<button type="button" data-view="${id}" aria-pressed="${id===activeView}">${groupTitle(g)}</button>`;}).join('');
    $('view-hint').textContent=`${visibleGroups().length} 个独立视角同时展示 · 当前输入的私信属于 ${built.self} 号`;
  }
  function activateView(){
    activeView=groupRoot(activeView);
    model=built.views[activeView].model;replay=E.replay(model.segments[shownSegment()],model.config.size);selected={r:replay.r,c:replay.c};phase=0;
    const node=team?.nodes.find(n=>n.id===activeView+':'+shownSegment());solution=node?.solution;displayObservations=node?.mergedObservations||replay.observations;inferred=solution?E.inferredTerrain(solution,model.config.size):new Map();
    renderViews();renderBoard();if(soundSelection)renderSoundDetail();renderSources();renderRadar();if($('message-input').value.trim())previewInput();if(solution){renderResult();renderLayout();}
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
    clearCombinedPreview();combinedPinned=null;
    closeBlockPopup();
    const saved={activeView,model,replay,selected,inferred,displayObservations,possibleTerrain};
    $('perspective-info').replaceChildren();$('map-candidates').replaceChildren();
    $('all-boards').innerHTML=built.views.map(v=>`<section class="player-map ${v.id===activeView?'active-map':''}" data-map-view="${v.id}"><h3>${v.id}号视角${v.id===built.self?' · 自己':''}<small>${v.id===built.self?'公屏 + 本人私聊':'公屏线索'}</small></h3>${fragmentPicker(v)}<div class="board-wrap"><div class="board" id="board-${v.id}" aria-label="${v.id}号相对地图"></div></div><p id="summary-${v.id}" class="map-footnote"></p></section>`).join('');
    for(const v of built.views){activeView=v.id;model=v.model;replay=E.replay(model.segments[shownSegment()],model.config.size);const node=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id));displayObservations=node?.mergedObservations||replay.observations;inferred=node?confirmedTerrain(node):new Map();possibleTerrain=node?E.terrainPossibilities(certifiedSolution(node),model.config.size):new Map();renderingSmart=!!node;selected=v.id===saved.activeView?saved.selected:{r:-1,c:-1};renderSingleBoard($('board-'+v.id));const routes=new Set(v.roundEnds.map(end=>end.round)).size;const total=model.segments.reduce((sum,s)=>sum+E.replay(s,model.config.size).observations.length,0),historical=shownSegment(v.id)!==model.active;$('summary-'+v.id).textContent=`已识别 ${routes} 回合轨迹 · 共保存 ${total} 条线索 · 此片段 ${replay.observations.length} 条 · ${v.id}号${historical?'此前最后已知位置':'位置'} ${xy(replay)}${model.segments.length>1?' · 片段 '+(shownSegment(v.id)+1):''}${historical?' · 当前片段尚未定位':''}${viewOffset().aligned?' · 区块边界已对齐（3×3）':''}`;}
    for(const v of built.views){const node=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id));if(node?.advice?.length)$('summary-'+v.id).insertAdjacentHTML('afterend','<div class="perspective-advice" aria-label="'+v.id+'号推理结论"><h4>'+v.id+'号 · 推理结论与区分线索</h4>'+node.advice.map(t=>'<p>'+esc(t)+'</p>').join('')+'</div>');}
    for(const v of built.views){const known=team?.nodes.find(n=>n.id===v.id+':'+shownSegment(v.id))?.verification?.blocks||[];if(known.length)$('summary-'+v.id).textContent+=' · 已补齐确定区块：'+known.map(b=>b.id+'（'+E.byId.get(b.id).name+'）').join('、');}
    renderHypotheses();
    for(const v of built.views)$('summary-'+v.id).insertAdjacentHTML('afterend','<div class="player-local" id="player-local-'+v.id+'"></div>');
    renderingSmart=false;
    ({activeView,model,replay,selected,inferred,displayObservations,possibleTerrain}=saved);
    if(team)renderLocal();
    mergeVisibleBoards();
    renderCombinedLayouts();
    organizeBoardInformation();
    renderPlayerRoute();
    $('map-summary').textContent=`${visibleGroups().length} 个独立视角 · ${team?'已合并确定推理':'已录入的直接线索'} · 当前接收私信：${built.self}号 · 选中格 ${xy(selected)}`;
  }
  function roundColor(round){return round==null?'#778899':'hsl('+E.mod((round-1)*137.508+18,360)+' 78% 42%)';}
  function routeLegend(view){const rounds=[...new Set(view.model.segments.flatMap(s=>s.events.filter(e=>e.kind==='move'||e.kind==='teleport').map(e=>e.clock?.round)))].sort((a,b)=>(a??-1)-(b??-1));return '<span class="route-round-legend">'+rounds.map(r=>'<span><i style="background:'+roundColor(r)+'"></i>第 '+(r??'?')+' 回合</span>').join('')+'</span>';}
  function routeSvg(segment,n,shift,offset){
    const log=E.replay(segment,n).log;let previous={r:Math.floor(n/2),c:Math.floor(n/2)},number=0,lines='',hits='';const stops=new Map();
    const display=p=>({x:E.mod(p.c+shift.dc-offset.c,n)+.5,y:E.mod(p.r+shift.dr-offset.r,n)+.5});
    for(const e of log){
      if(e.kind!=='move'&&e.kind!=='teleport')continue;
      const from=display(previous),to=display(e),round=e.clock?.round,color=roundColor(round),lane=((round??0)%5-2)*.035;number++;
      const title='第 '+(e.clock?.round??'?')+' 回合 · 第 '+(e.clock?.step??number)+' 步'+(e.kind==='teleport'?' · 传送':e.outcome==='hit'?' · 向'+E.DIRS[e.dir]+'撞墙':e.outcome==='space'?' · 亚空间':'');
      if(e.kind==='move'&&e.outcome==='move'){
        const [dr,dc]=E.V[e.dir];
        // Duplicate the short edge across the torus boundary, never draw a line through the whole map.
        for(const dx of [-n,0,n])for(const dy of [-n,0,n])lines+='<path data-route-round="'+(round??'?')+'" style="stroke:'+color+'" d="M '+(from.x+dx+dr*lane)+' '+(from.y+dy-dc*lane)+' l '+dc+' '+dr+'"><title>'+esc(title)+'</title></path>';
      }
      if(e.kind==='move'&&e.outcome==='hit'){
        const [dr,dc]=E.V[e.dir],x=from.x+dc*.36+dr*lane,y=from.y+dr*.36-dc*lane;
        hits+='<g class="route-hit" data-hit-dir="'+e.dir+'" data-route-round="'+(round??'?')+'" style="--round-color:'+color+'"><title>'+esc(title)+'</title><path class="hit-attempt" d="M '+from.x+' '+from.y+' L '+x+' '+y+'"/><path class="hit-cross" d="M '+(x-.08)+' '+(y-.08)+' l .16 .16 M '+(x-.08)+' '+(y+.08)+' l .16 -.16"/></g>';
      }
      const key=to.x+','+to.y+':'+round;if(!stops.has(key))stops.set(key,{x:to.x+lane,y:to.y+lane,round,color,numbers:[],titles:[]});stops.get(key).numbers.push(number);stops.get(key).titles.push(title);
      previous={r:e.r,c:e.c};
    }
    const points=[...stops.values()].map(p=>'<g data-route-round="'+(p.round??'?')+'" style="--round-color:'+p.color+'"><title>'+esc(p.titles.join('；'))+'</title><circle cx="'+p.x+'" cy="'+p.y+'" r=".20"/><text x="'+p.x+'" y="'+(p.y+.07)+'">'+(p.numbers.length===1?p.numbers[0]:p.numbers[0]+'…'+p.numbers.at(-1))+'</text></g>').join('');
    return '<svg class="game-route-overlay" viewBox="0 0 '+n+' '+n+'" aria-label="'+routePlayer+'号移动路径" data-route-player="'+routePlayer+'"><g class="route-lines">'+lines+'</g><g class="route-points">'+points+'</g><g class="route-hits">'+hits+'</g></svg>';
  }
  function renderPlayerRoute(){
    document.querySelectorAll('.game-route-overlay,.game-route-caption').forEach(el=>el.remove());$('unlocated-player-routes')?.remove();
    document.querySelectorAll('[data-status-view]').forEach(el=>{el.setAttribute('aria-pressed',String(+el.dataset.statusView===routePlayer));});
    if(routePlayer==null||!built.views[routePlayer])return;
    const view=built.views[routePlayer],n=view.model.config.size,roots=[...$('all-boards').querySelectorAll(':scope > .player-map')],unlocated=[];
    for(let segment=0;segment<view.model.segments.length;segment++){
      const data=view.model.segments[segment];if(!data.events.some(e=>e.kind==='move'||e.kind==='teleport'))continue;
      const id=routePlayer+':'+segment;
      let attached=false;
      for(const card of roots){
        const root=+card.dataset.mapView,rootId=root+':'+shownSegment(root),node=team?.nodes.find(n=>n.id===rootId),shift=id===rootId?{dr:0,dc:0}:node?.verification?.status==='verified'&&!node.fusionConflict?node.joined?.find(j=>j.id===id):null;
        if(!shift)continue;
        const board=$('board-'+root);board.insertAdjacentHTML('beforeend',routeSvg(data,n,shift,viewOffset(root)));attached=true;
        if(!card.querySelector('.game-route-caption'))card.querySelector('h3').insertAdjacentHTML('afterend','<p class="game-route-caption">'+routePlayer+'号 · 整局已记录路径 <button type="button" data-clear-player-route>隐藏路径</button><small>数字为片段内行动顺序；× 标出撞墙方向，悬停查看详情。再次点击同一玩家可取消。</small>'+routeLegend(view)+'</p>');
        break;
      }
      if(!attached)unlocated.push({segment,data});
    }
    const extra=document.createElement('section');extra.id='unlocated-player-routes';
    extra.innerHTML=unlocated.map(({segment,data})=>'<article><h4>'+routePlayer+'号 · 片段 '+(segment+1)+'（位置尚未与主图连通）</h4><div class="unlocated-route-map" style="--route-size:'+n+'">'+routeSvg(data,n,{dr:0,dc:0},{r:0,c:0})+'</div></article>').join('');
    if(view.ambiguities.length||view.pending.length)extra.insertAdjacentHTML('afterbegin','<p>部分回合路径尚待定位或补录；这里只连接已记录的移动，不猜测缺失路线。</p>');
    if(!view.model.segments.some(s=>s.events.some(e=>e.kind==='move')))extra.insertAdjacentHTML('afterbegin','<p>'+routePlayer+'号暂无已记录的移动路径。</p>');
    if(extra.innerHTML){extra.insertAdjacentHTML('afterbegin',routeLegend(view));$('all-boards').after(extra);}
  }
  document.addEventListener('click',event=>{if(event.target.closest('[data-clear-player-route]')){routePlayer=null;renderPlayerRoute();}});
  function certifiedSolution(node){
    const s=node.solution,blocks=node.verification?.blocks||[];
    if(!s||s.irregular||!blocks.length)return s;
    return {...s,phases:s.phases.filter(p=>blocks.every(b=>p.domains.some(d=>d.some(m=>m.id===b.id&&m.origin.r===b.origin.r&&m.origin.c===b.origin.c)))).map(p=>({...p,domains:p.domains.map(d=>{const b=blocks.find(b=>d.some(m=>m.origin.r===b.origin.r&&m.origin.c===b.origin.c));return b?d.filter(m=>m.id===b.id):d;})}))};
  }
  function blockPossibilities(node){
    const s=certifiedSolution(node);if(!s||s.irregular)return '<p>当前地图仅支持局部区块候选，请点击格子查看。</p>';
    return '<details class="block-options" open><summary>已确认区块与待选区块</summary><p>坐标为区块左上角；待选项仍可能需要进一步验证。</p>'+s.phases.map((p,i)=>'<details '+(s.phases.length===1?'open':'')+'><summary>对齐 '+(i+1)+' · '+xy({r:p.pr,c:p.pc})+'</summary><div class="block-options-grid">'+p.domains.map((d,j)=>{const origin=p.slots[j],known=node.verification?.blocks.find(b=>b.origin.r===origin.r&&b.origin.c===origin.c),ids=[...new Set(d.map(m=>m.id))];return '<div class="slot"><b>'+xy(origin)+' · '+(known?'已确认':'待选 '+ids.length+' 种')+'</b><small>'+ids.map(id=>esc(id+' '+E.byId.get(id).name)).join('、')+'</small></div>';}).join('')+'</div></details>').join('')+'</details>';
  }
  function completeLayouts(node){
    const result=node.completeLayouts;if(!result?.layouts)return '';
    if(result.overflow)return '<p class="map-footnote">完整拼接超过 8 种，继续补充线索后列举。</p>';
    const layouts=result.layouts;
    return '<details class="complete-layouts"><summary>'+(result.complete?'全部 '+layouts.length+' 种完整拼接':'已找到 '+layouts.length+' 种完整拼接 · 搜索未完成')+'</summary>'+(result.complete?'':'<p>以下仅为已验证方案，尚不能确定总数。</p>')+layouts.map((blocks,i)=>'<details><summary>拼接方案 '+(i+1)+'</summary><p>模板图展示初始墙边；动态地形和门状态以主图为准。</p>'+blockPreview({blocks},replay,activeView,node.mergedObservations||node.observations)+'<p>'+blocks.map(b=>esc(b.id+' '+E.byId.get(b.id).name)+' '+xy(b.origin)).join('；')+'</p></details>').join('')+'</details>';
  }
  let combinedPreview=null,combinedPinned=null;
  function clearCombinedPreview(){
    if(combinedPreview){combinedPreview.wrap.hidden=false;combinedPreview.overlay.remove();combinedPreview=null;}
    document.querySelectorAll('.combined-map').forEach(el=>el.classList.remove('previewing'));
  }
  function previewCombined(button){
    if(combinedPreview?.button===button)return;
    clearCombinedPreview();closeBlockPopup();
    const card=$('board-'+button.dataset.player)?.closest('.player-map'),wrap=card?.querySelector(':scope > .board-wrap');if(!wrap)return;
    const overlay=document.createElement('div');overlay.className='combined-main-preview';
    overlay.innerHTML='<div class="preview-caption">候选 '+button.dataset.combined+' · 临时预览 <button type="button" data-exit-preview>返回确定地图</button></div>';
    overlay.append(button.querySelector('.block-preview').cloneNode(true));
    const route=wrap.querySelector('.game-route-overlay');if(route)overlay.querySelector('.block-preview').append(route.cloneNode(true));
    wrap.hidden=true;wrap.after(overlay);combinedPreview={wrap,overlay,button};button.classList.add('previewing');
    overlay.querySelector('button').onclick=()=>{combinedPinned=null;clearCombinedPreview();};
  }
  function renderCombinedLayouts(){
    clearCombinedPreview();combinedPinned=null;
    let host=$('combined-layouts');if(!host){
      host=document.createElement('section');host.id='combined-layouts';$('all-boards').after(host);
      host.addEventListener('pointerover',event=>{const button=event.target.closest('[data-combined]');if(button)previewCombined(button);});
      host.addEventListener('pointerleave',()=>{if(combinedPinned)previewCombined(combinedPinned);else clearCombinedPreview();});
      host.addEventListener('focusin',event=>{const button=event.target.closest('[data-combined]');if(button)previewCombined(button);});
      host.addEventListener('focusout',event=>{if(!host.contains(event.relatedTarget)){if(combinedPinned)previewCombined(combinedPinned);else clearCombinedPreview();}});
      host.addEventListener('click',event=>{
        const button=event.target.closest('[data-combined]');if(button){combinedPinned=button;previewCombined(button);return;}
        if(event.target.closest('[data-more-combined]')){localLimits.set('combined',(localLimits.get('combined')||24)+24);renderCombinedLayouts();}
      });
    }
    const result=team?.combined;host.hidden=!result;$('all-boards').classList.toggle('with-combined-gallery',!!result);
    if(!result){host.innerHTML='';$('combined-info').replaceChildren();return;}
    const player=groupRoot(built.self),nodeId=player+':'+shownSegment(player),limit=localLimits.get('combined')||24;let index=0;
    const title='候选地图 · '+(result.complete?result.count+' 张':'至少 '+result.count+' 张（尚未穷举）');
    $('combined-info').innerHTML='<h3>'+title+'</h3><p>相对位置 '+result.cases.length+' 种；同时核对已定位轨迹、声音方位、区块唯一性与出生条件。</p>'+(result.unlocated.length?'<p>尚未定位的片段：'+esc(result.unlocated.join('、'))+'，不计入当前拼接数量。</p>':'')+(result.spawnPending?'<p>部分出生条件或路线分支仍待验证。</p>':'');
    host.innerHTML='<h3>'+title+'</h3><p>悬停在主图预览 · 点击保留 · Esc 返回确定地图</p><div class="combined-thumbnail-grid">'+result.cases.map(c=>{
      const reference=c.joined.find(j=>j.id===nodeId)||c.joined[0],root=+reference.id.split(':')[0],n=model.config.size,shift=p=>({r:E.mod(p.r-reference.dr,n),c:E.mod(p.c-reference.dc,n)}),positions=c.joined.map(j=>{
        const [id,seg]=j.id.split(':').map(Number),at=E.replay(built.views[id].model.segments[seg],n);
        return {player:id,segment:seg,r:E.mod(at.r+j.dr-reference.dr,n),c:E.mod(at.c+j.dc-reference.dc,n),birth:seg===0?{r:E.mod(Math.floor(n/2)+j.dr-reference.dr,n),c:E.mod(Math.floor(n/2)+j.dc-reference.dc,n)}:null};
      });
      return c.layouts.map(layout=>{const number=++index;if(number>limit)return '';const blocks=layout.map(b=>({...b,origin:shift(b.origin)}));
        return '<button type="button" class="combined-map" data-combined="'+number+'" data-player="'+root+'" aria-label="预览候选地图 '+number+'"><span>候选 '+number+'</span>'+blockPreview({blocks,players:positions,birth:null},positions[0],root,[])+'</button>';
      }).join('');
    }).join('')+'</div>'+(index>limit?'<button type="button" data-more-combined>继续显示（'+Math.min(index,limit)+' / '+index+'）</button>':'');
  }
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){combinedPinned=null;clearCombinedPreview();}});
  function mergeVisibleBoards(){
    for(const group of visibleGroups()){
      const rootId=+group[0].split(':')[0],host=$('board-'+rootId).closest('.player-map'),node=team?.nodes.find(n=>n.id===group[0]);
      if(node){const before={activeView,model,replay};activeView=rootId;model=built.views[rootId].model;replay=E.replay(model.segments[shownSegment(rootId)],model.config.size);if(group.length>1)host.querySelector('h3').insertAdjacentHTML('afterend','<p class="map-footnote merged-positions">'+group.map(id=>{const j=node.joined.find(j=>j.id===id),[player,segment]=id.split(':').map(Number),v=built.views[player],n=model.config.size,at=E.replay(v.model.segments[segment],n),shift=p=>({r:E.mod(p.r+j.dr,n),c:E.mod(p.c+j.dc,n)});return player+'号'+(segment===0?' · 出生点 '+xy(shift({r:Math.floor(n/2),c:Math.floor(n/2)})):' · 此片段不含出生点')+' · '+(segment===v.model.active&&!v.ambiguities.length&&built.players[player].alive?'当前位置':'历史最后位置')+' '+xy(shift(at));}).join('；')+'</p>');host.insertAdjacentHTML('beforeend',blockPossibilities(node)+(team?.combined?'':completeLayouts(node)));({activeView,model,replay}=before);}
      host.querySelector('h3').textContent=groupTitle(group);
      if(group.length<2)continue;
      host.dataset.mergedPlayers=group.map(id=>id.split(':')[0]).join(',');host.querySelector('h3').textContent=groupTitle(group);
      for(const id of group.slice(1)){
        const player=+id.split(':')[0],card=$('board-'+player).closest('.player-map');
        card.querySelector(':scope > .board-wrap').hidden=true;
        const detail=document.createElement('details');detail.className='merged-player-detail';const summary=document.createElement('summary');summary.textContent=player+'号路线与片段';detail.append(summary,card);host.append(detail);
      }
    }
  }
  function confirmedTerrain(node){
    const all=E.inferredTerrain(certifiedSolution(node),model.config.size),out=new Map(),n=model.config.size;
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
    const drawingSolution=currentNode?certifiedSolution(currentNode):null;possibleTerrain=E.terrainPossibilities(drawingSolution,n);
    const doors=E.inferredDoors(model.config,drawingSolution,knownBlocks,displayObservations),wallKinds=E.inferredWallKinds(model.config,drawingSolution,knownBlocks);
    if(renderingSmart)for(const [k,value] of E.inferredWalls(model.config,drawingSolution)){const [rr,cc]=k.split(/[,:]/).map(Number);if(!knownBlocks.some(b=>E.mod(rr-b.origin.r,n)<3&&E.mod(cc-b.origin.c,n)<3)||edges.has(k))continue;const [r,c,d]=k.split(/[,:]/).map(Number);inferredEdgeKeys.add(k);inferredEdgeKeys.add(E.key(E.mod(r+E.V[d][0],n),E.mod(c+E.V[d][1],n))+':'+E.OPP[d]);edge(r,c,d,value);}
    for(const o of displayObservations){const k=E.key(o.r,o.c);if(!observations.has(k))observations.set(k,[]);observations.get(k).push(o);}
    const nearby=new Set();for(const o of displayObservations)for(const [dr,dc] of [[0,0],...E.V])nearby.add(E.key(E.mod(o.r+dr,n),E.mod(o.c+dc,n)));
    board.style.gridTemplateColumns=`repeat(${n},1fr)`;board.style.gridTemplateRows=`repeat(${n},1fr)`;
    board.innerHTML=Array.from({length:n*n},(_,i)=>{
      const offset=viewOffset(),r=E.mod(Math.floor(i/n)+offset.r,n),c=E.mod(i%n+offset.c,n),k=E.key(r,c),obs=observations.get(k)||[],me=r===replay.r&&c===replay.c;
      const node=renderNode||team?.nodes.find(n=>n.id===activeView+':'+shownSegment());const others=(renderingSmart?node?.joined||[]:[]).filter(j=>j.id!==node.id).map(j=>{const [player,segment]=j.id.split(':').map(Number),at=E.replay(built.views[player].model.segments[segment],n);return {player,segment,historical:segment!==built.views[player].model.active||!built.players[player].alive||!!built.views[player].ambiguities.length,r:E.mod(at.r+j.dr,n),c:E.mod(at.c+j.dc,n)};}).filter(p=>p.r===r&&p.c===c);
      const births=(renderingSmart?node?.joined||[]:[]).filter(j=>j.id!==node.id&&j.id.endsWith(':0')&&E.mod(Math.floor(n/2)+j.dr,n)===r&&E.mod(Math.floor(n/2)+j.dc,n)===c).map(j=>j.id.split(':')[0]);
      const type=obs.findLast(o=>o.kind==='terrain')?.value,sound=obs.findLast(o=>o.kind==='sound')?.value,guess=inferred.get(k),colorType=type||guess||(sound==='PAPA'?'WATER':sound==='SHASHA'?'GRASS':'UNKNOWN'),birth=(renderBirth??shownSegment()===0)&&r===Math.floor(n/2)&&c===Math.floor(n/2),knownBlock=knownBlocks.find(b=>E.mod(r-b.origin.r,n)<3&&E.mod(c-b.origin.c,n)<3);let walls='';
      for(let d=0;d<4;d++){const kinds=wallKinds.get(k+':'+d);if(kinds?.length===1&&kinds[0]===2){walls+=`<i title="已确认树篱；同回合同方向连续移动才能冲刺穿过" class="wall d${d} hedge-edge"></i>`;continue;}const door=doors.get(k+':'+d);if(door){const state=door.state==='closed'?'关闭':door.state==='open'?'开启':'待定';walls+=`<i title="确定是门；${door.observed?'最近观察为'+state+'，此后按钮可能改变开关状态':'开关状态'+state}" class="wall d${d} door-edge door-${door.state}"></i>`;continue;}const values=edges.get(k+':'+d);if(!values)continue;const solid=values.has('墙'),hit=values.has('撞'),open=values.has('空')||values.has('通行');walls+=`<i title="${inferredEdgeKeys.has(k+':'+d)?(solid?'候选一致推断有障碍边；具体构造仍待确认':'候选一致推断为空边'):solid?'报告为墙':hit?'曾向此方向撞到障碍，可能是墙、门、树篱或箱子':'报告为空或曾成功通过'}" class="wall d${d} ${solid?'solid-edge':hit?'hit-edge':'open-edge'} ${solid&&open?'conflict':''}"></i>`;}

      const soundCandidates=!renderNode?soundAt(activeView,r,c):[];const label=(soundCandidates.length?soundTitle(soundCandidates)+'；':'' )+`相对位置 ${xy({r,c})}${knownBlock?'，完整确定区块 '+knownBlock.id+'（'+E.byId.get(knownBlock.id).name+'）':''}${birth?'，'+activeView+'号出生点':''}${me?'，'+activeView+'号'+(shownSegment()!==model.active||!built.players[activeView].alive?'历史位置':'最后已知位置'):''}${!type&&!guess&&sound?'，'+(sound==='PAPA'?'水声，具体地形待定':'草丛声，具体地形待定'):''}${type?'，确认'+E.TYPES[type]:guess?'，候选一致推断'+E.TYPES[guess]:''}${!knownBlock?'，待定区块：悬停或点击查看候选区块图':''}`;
      return `<button ${!knownBlock&&renderingSmart&&!renderNode?'data-block-candidates="'+activeView+'" ':''}${soundCandidates.length?'data-sound-candidate="true" ':''}${knownBlock?'data-known-block="'+esc(knownBlock.id)+'"':''} class="cell terrain-${colorType} ${knownBlock?'determined-cell':''} ${me?'me':''} ${visited.has(k)?'visited':''} ${r===selected.r&&c===selected.c?'selected':''}" data-r="${r}" data-c="${c}" title="${esc(label)}" aria-label="${esc(label)}"><span class="coord">${Math.floor(i/n)+1}·${i%n+1}</span>${birth||births.length?'<span class="birth-marker" title="'+[...(birth?[activeView]:[]),...births].join('、')+'号出生点">'+[...(birth?[activeView]:[]),...births].join('·')+'</span>':''}${me?'<span class="symbol current-marker" title="'+activeView+'号'+(shownSegment()!==model.active||!built.players[activeView].alive?'历史位置':'最后已知位置')+'">'+activeView+'</span>':type?`<span>${symbols[type]}</span>`:sound?`<span>${sound==='SHASHA'?'♧':'≈'}</span>`:guess&&guess!=='EMPTY'?`<span class="inferred-symbol">${symbols[guess]}</span>`:visited.has(k)?'·':''}${others.length?`<small class="other-players current-marker" title="${others.map(p=>p.player+'号'+(p.historical?'历史位置':'当前位置')).join(' · ')}">${others.map(p=>p.player+'号').join(' · ')}</small>`:''}${!knownBlock&&renderingSmart?'<span class="terrain-possibilities" aria-hidden="true">?</span>':''}${soundCandidates.length?'<span class="sound-source-marker" title="点击查看声音来源与路线候选">?</span>':''}${walls}</button>`;
    }).join('');
    // Reference boundaries are DISPLAY grid lines. Never use viewOffset, phase or
    // world coordinates here: only the cells move during automatic alignment.
    if(n%3===0)board.insertAdjacentHTML('beforeend','<span class="block-grid" aria-hidden="true">'+Array.from({length:n/3-1},(_,i)=>{const at=(i+1)*3;return `<i class="block-grid-line vertical" style="grid-column:${at}"></i><i class="block-grid-line horizontal" style="grid-row:${at}"></i>`;}).join('')+'</span>');

  }
  // Keep the candidate gallery attached to the pointed map, independent of the active input view.
  let blockPopup=null,blockPopupCell=null,blockPopupPinned=false,blockPopupTimer;
  function closeBlockPopup(){clearTimeout(blockPopupTimer);blockPopup?.remove();blockPopup=null;blockPopupCell=null;blockPopupPinned=false;}
  function showBlockPopup(cell,pinned=false){
    clearTimeout(blockPopupTimer);
    if(blockPopupCell===cell&&blockPopup){blockPopupPinned ||= pinned;return;}
    if(blockPopupPinned&&!pinned)return;
    closeBlockPopup();
    const player=+cell.dataset.blockCandidates,r=+cell.dataset.r,c=+cell.dataset.c,n=built.views[player].model.config.size;
    const node=team?.nodes.find(node=>node.id===player+':'+shownSegment(player)),s=node&&certifiedSolution(node),candidates=new Map();
    for(const phase of s?.phases||[])for(const domain of phase.domains)for(const m of domain){
      if(E.mod(r-m.origin.r,n)>=3||E.mod(c-m.origin.c,n)>=3)continue;
      const key=m.id+'@'+m.origin.r+','+m.origin.c;
      if(!candidates.has(key))candidates.set(key,m);
    }
    blockPopup=document.createElement('aside');blockPopup.id='block-candidate-popup';blockPopup.setAttribute('role','dialog');blockPopup.setAttribute('aria-label','待定区块候选图');blockPopupCell=cell;blockPopupPinned=pinned;
    blockPopup.innerHTML='<button type="button" data-close-block-popup aria-label="关闭候选区块">×</button><h3>待定区块 · '+candidates.size+' 种候选放置</h3><p>方框标出所指格子。区块边缘为模板墙边；候选仍需与整图核对。</p><div class="block-popup-gallery">'+[...candidates.values()].map(m=>{
      const lr=E.mod(r-m.origin.r,n),lc=E.mod(c-m.origin.c,n);
      let index=0;
      const preview=blockPreview({blocks:[m],birth:null},{r:-1,c:-1},player,[]).replace(/class="preview-cell/g,()=> 'class="preview-cell'+(index++===lr*3+lc?' pointed-cell':''));
      return '<article data-candidate-block="'+esc(m.id)+'"><b>'+esc(m.id+' · '+E.byId.get(m.id).name)+'</b><small>所指格：第 '+(lr+1)+' 行、第 '+(lc+1)+' 列</small>'+preview+'</article>';
    }).join('')+'</div>'+(!candidates.size?'<p>区块位置仍待推理，暂未得到可列举的候选区块。</p>':'');
    document.body.append(blockPopup);
    const rect=cell.getBoundingClientRect(),box=blockPopup.getBoundingClientRect();
    blockPopup.style.left=Math.max(8,Math.min(rect.right+10,innerWidth-box.width-8))+'px';
    blockPopup.style.top=Math.max(8,Math.min(rect.top,innerHeight-box.height-8))+'px';
    blockPopup.addEventListener('pointerenter',()=>clearTimeout(blockPopupTimer));
    blockPopup.addEventListener('pointerleave',()=>{if(!blockPopupPinned)blockPopupTimer=setTimeout(closeBlockPopup,180);});
    blockPopup.querySelector('[data-close-block-popup]').onclick=closeBlockPopup;
  }
  $('all-boards').addEventListener('pointerover',event=>{const cell=event.target.closest('[data-block-candidates]');if(cell)showBlockPopup(cell);});
  $('all-boards').addEventListener('pointerout',event=>{if(!blockPopupPinned&&!event.relatedTarget?.closest?.('[data-block-candidates],#block-candidate-popup'))blockPopupTimer=setTimeout(closeBlockPopup,180);});
  $('all-boards').addEventListener('focusin',event=>{const cell=event.target.closest('[data-block-candidates]');if(cell)showBlockPopup(cell);});
  $('all-boards').addEventListener('click',event=>{const cell=event.target.closest('[data-block-candidates]');if(cell&&!event.target.closest('.sound-source-marker')){event.stopImmediatePropagation();showBlockPopup(cell,true);}},true);
  document.addEventListener('click',event=>{if(blockPopup&&!event.target.closest('#block-candidate-popup,[data-block-candidates]'))closeBlockPopup();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeBlockPopup();});
  function blockPreview(candidate,focus,player,observations){
    const n=model.config.size;
    const span=axis=>candidate.blocks.map(b=>b.origin[axis]).map(start=>({start,length:Math.max(...candidate.blocks.map(b=>E.mod(b.origin[axis]-start,n)))+3})).sort((a,b)=>a.length-b.length)[0];
    const rs=candidate.players?{start:E.mod(viewOffset(player).r,n),length:n}:span('r'),cs=candidate.players?{start:E.mod(viewOffset(player).c,n),length:n}:span('c'),rows=rs.length,cols=cs.length,origin={r:rs.start,c:cs.start},visited=new Set(observations.filter(o=>o.kind==='pass').map(o=>E.key(o.r,o.c)));
    return `<div class="block-preview" style="grid-template-columns:repeat(${cols},1fr)">${Array.from({length:rows*cols},(_,index)=>{
      const r=E.mod(origin.r+Math.floor(index/cols),n),c=E.mod(origin.c+index%cols,n),entry=candidate.blocks.find(b=>E.mod(r-b.origin.r,n)<3&&E.mod(c-b.origin.c,n)<3);if(!entry)return '<span class="preview-void" title="此处不属于本路径解释"></span>';const block=E.byId.get(entry.id),i=E.mod(r-entry.origin.r,n)*3+E.mod(c-entry.origin.c,n),cell=block.cells[i],types=entry.cellTypes?.[i]||[cell.type],type=types.length===1?types[0]:'UNKNOWN';let walls='';
      for(let d=0;d<4;d++){const rr=E.mod(r+E.V[d][0],n),cc=E.mod(c+E.V[d][1],n),other=candidate.blocks.find(b=>E.mod(rr-b.origin.r,n)<3&&E.mod(cc-b.origin.c,n)<3);let w=cell.walls[d];if(other){const j=E.mod(rr-other.origin.r,n)*3+E.mod(cc-other.origin.c,n);w=Math.max(w,E.byId.get(other.id).cells[j].walls[E.OPP[d]]);}if(w)walls+=`<i title="${w===2?'树篱：需同回合同方向冲刺穿过':w===3?'模板初始门状态：关闭':w===4?'模板初始门状态：开启':'普通墙壁'}" class="wall d${d} ${w===2?'hedge-edge':w===3?'door-edge door-closed':w===4?'door-edge door-open':'solid-edge'}"></i>`;}
      const allBirths=(candidate.players||[]).filter(p=>p.birth?.r===r&&p.birth.c===c),allPositions=(candidate.players||[]).filter(p=>p.r===r&&p.c===c);const me=!candidate.players&&r===focus.r&&c===focus.c,birth=candidate.birth!==undefined?!!candidate.birth&&r===candidate.birth.r&&c===candidate.birth.c:shownSegment(player)===0&&r===Math.floor(n/2)&&c===Math.floor(n/2);return `<span class="preview-cell terrain-${type}" title="${esc(entry.id+' · '+types.map(t=>E.TYPES[t]).join('/'))}">${allBirths.length?'<b class="birth-marker" title="出生点">'+allBirths.map(p=>p.player).join('·')+'</b>':''}${allPositions.length?'<b class="player-number current-marker" title="当前位置或历史最后位置">'+allPositions.map(p=>p.player).join('·')+'</b>':''}${birth?`<b class="birth-marker" title="${player}号出生点">${player}</b>`:''}${me?`<b class="player-number current-marker" title="${player}号当前位置">${player}</b>`:visited.has(E.key(r,c))?'<b class="path-dot">•</b>':type==='UNKNOWN'?'?':type!=='EMPTY'?symbols[type]:''}<small>${i===0?esc(entry.id):''}</small>${walls}</span>`;
    }).join('')}</div>`;
  }
  function renderLocal(){
    for(const view of built.views){
      const host=$('player-local-'+view.id),node=team?.nodes.find(n=>n.id===view.id+':'+shownSegment(view.id));if(!host)continue;
      if(!node?.local||node.local.waiting||node.local.pending){host.innerHTML='<p class="map-footnote">'+view.id+'号 · 当前路径解释'+(node?.local?.waiting?'：尚无可定位路线':'正在核对')+'</p>';continue;}
      const hypothesis=team.hypotheses?.find(h=>h.player===view.id&&h.segment===node.segment);if(hypothesis&&!node.routeAlternatives)node.routeAlternatives=hypothesis.groups.filter(g=>!g.excluded).flatMap(g=>g.alternatives||[]);
      const result=window.LongNightRouteExplanations.forNode(model.config,node),key=view.id+':routes',limit=localLimits.get(key)||3;
      host.innerHTML='<article class="local-player"><h4>'+view.id+'号 · 当前路径的完整解释</h4><p>已找到 '+result.cases.length+' 种路径解释。每个方案同时说明路线、传送、最终位置和墙壁约束。</p>'+(result.pending?'<p class="warning">仍有分支未完成验证，以下方案不能代表全部可能。</p>':'')+result.cases.slice(0,limit).map((c,i)=>'<details class="route-explanations" '+(i===0?'open':'')+'><summary>解释 '+(i+1)+' · '+(c.status==='verified'?'完整地图支持':'待验证')+'</summary>'+routeCard(c,view.id,i+1)+'</details>').join('')+(!result.cases.length?'<p>尚未得到完整解释，保留未定位或待验证状态。</p>':'')+(result.cases.length>limit?'<button type="button" data-local-more="'+key+'">继续显示路径解释</button>':'')+'</article>';
      separateMaps(host,'route-maps-'+view.id,view.id+'号路线候选地图');
    }
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-local-more]');if(!button)return;const key=button.dataset.localMore;localLimits.set(key,(localLimits.get(key)||3)+3);renderLocal();});
  function separateMaps(source,id,title){
    const previous=$(id),open=new Set(previous?[...previous.querySelectorAll('details[open]')].map(d=>d.id):[]);if(previous?.open)open.add(id);previous?.remove();
    const maps=[...source.querySelectorAll('.block-preview,.board-wrap')].filter(m=>!m.hidden);
    if(!maps.length)return;
    const gallery=document.createElement('details');gallery.id=id;gallery.className='candidate-map-group';gallery.open=open.has(id);const heading=document.createElement('summary');heading.textContent=title+' · '+maps.length+' 张';gallery.append(heading);
    maps.forEach((map,i)=>{const entry=document.createElement('details');entry.id=id+'-'+i;entry.className='candidate-map';entry.open=open.has(entry.id);const caption=document.createElement('summary');caption.textContent=map.closest('.route-card,.hypothesis-map,.portal-after-view')?.querySelector('h3,h4,h5')?.textContent||'候选地图 '+(i+1);entry.append(caption);const button=document.createElement('button');button.type='button';button.dataset.showMap=entry.id;button.textContent='查看候选地图 '+(i+1);map.replaceWith(button);entry.append(map);gallery.append(entry);});
    $('map-candidates').append(gallery);
  }
  function organizeBoardInformation(){
    const information=$('perspective-info');
    for(const view of built.views){
      const card=$('board-'+view.id)?.closest('.player-map');if(!card)continue;
      const info=document.createElement('section');info.className='perspective-information';info.dataset.infoPlayer=view.id;
      const heading=document.createElement('h3');heading.textContent=view.id+'号 · 已有信息与推理';info.append(heading);
      const elements=[...card.children].filter(el=>el.matches('.map-footnote,.perspective-advice,.player-local,.block-options,.hypothesis-details,.portal-after-view'));
      elements.forEach(el=>info.append(el));
      separateMaps(info,'perspective-candidates-'+view.id,view.id+'号条件候选地图');
      information.append(info);
      for(const details of card.querySelectorAll(':scope > .complete-layouts')){details.open=false;details.querySelector('summary').prepend(view.id+'号 · ');for(const p of details.querySelectorAll('p'))info.append(p);$('map-candidates').append(details);}
    }
    // Merged members keep their fragment controls in the information panel.
    for(const detail of $('all-boards').querySelectorAll('.merged-player-detail'))information.append(detail);
    const cards=[...$('all-boards').children].filter(el=>el.matches('.player-map'));
    const score=card=>{const node=team?.nodes.find(n=>n.id===card.dataset.mapView+':'+shownSegment(+card.dataset.mapView)),known=node?.verification?.blocks.length||0,full=known===model.config.size*model.config.size/9;card.dataset.mapCertainty=full?'complete':'partial';if(full){const label=document.createElement('small');label.className='map-certainty';label.textContent='地图已完全确定';card.querySelector('h3').append(label);}return (full?10000:0)+known*100+(node?.joined?.length||1);};
    cards.map((card,index)=>({card,index,score:score(card)})).sort((a,b)=>b.score-a.score||a.index-b.index).forEach(({card})=>$('all-boards').append(card));
  }
  document.addEventListener('click',event=>{
    const show=event.target.closest('[data-show-map]');if(show){const map=$(show.dataset.showMap);if(!map)return;for(let parent=map;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;window.LongNightWorkspace?.reveal('maps');map.scrollIntoView({block:'nearest'});return;}
    const fragment=event.target.closest('[data-fragment]');if(fragment&&!$('all-boards').contains(fragment)){fragmentChoices.set(+fragment.dataset.fragmentPlayer,+fragment.dataset.fragment);activeView=+fragment.dataset.fragmentPlayer;journal.view=activeView;save();activateView();}
  });
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
    const reports=(team?.soundCandidates||[]).filter(h=>h.listenerNode===activeView+':'+shownSegment());$('sources').innerHTML=reports.map(h=>'<p>'+esc(h.player+'号第'+h.round+'回合第'+h.step+'步：'+h.direction)+' · '+h.initialCount+' 格方位范围 → '+h.cells.length+' 格保留候选（含待验证项）。地图上的黄色 ? 可悬停并点击查看。</p>').join('')+(names.length?names.map(name=>{const result=E.locate(s.sounds,name,model.config.size);return `<div class="source">${esc(name)} · ${result.cells.length} 个可能位置${result.cells.length===1?' '+xy(result.cells[0]):''}</div>`;}).join(''):'<p>贴入其他玩家的方位私信和完整轨迹后，在这里查看。</p>');
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
  $('all-boards').addEventListener('click',event=>{if(event.target.closest('[data-clear-player-route],.hypothesis-details summary,.player-local,.block-options,.complete-layouts,.merged-player-detail > summary'))return;const card=event.target.closest('[data-map-view]');if(!card)return;const pick=event.target.closest('[data-fragment]');if(pick)fragmentChoices.set(+pick.dataset.fragmentPlayer,+pick.dataset.fragment);activeView=+card.dataset.mapView;journal.view=activeView;save();const cell=event.target.closest('.portal-after-view')?null:event.target.closest('[data-r]');activateView();if(team)renderLocal();if(cell){selected={r:+cell.dataset.r,c:+cell.dataset.c};soundSelection=cell.dataset.soundCandidate?{player:activeView,...selected}:null;renderBoard();renderSoundDetail();if(soundSelection)$('sound-candidate-detail').scrollIntoView({block:'nearest'});if(solution)renderResult();}});
  $('phase-select').addEventListener('change',()=>{phase=+$('phase-select').value;renderLayout();});
  $('export').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(journal,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='长夜消息存档.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('import').addEventListener('click',()=>{importMode='replace';$('import-file').click();});
  $('merge-import').remove();
  $('import-file').addEventListener('change',safe(async()=>{const file=$('import-file').files[0];$('import-file').value='';if(!file)return;if(file.size>6*1024*1024)throw new Error('存档超过 6 MB。');const next=validate(JSON.parse(await file.text()));
    if(importMode==='merge'){const result=window.LongNightJournal.merge(journal,next);if(!result.added){toast('没有新记录，已跳过 '+result.duplicates+' 条重复消息。');return;}journal=result.journal;toast('合并了 '+result.added+' 条消息，跳过 '+result.duplicates+' 条重复消息。');}
    else{if(!await confirm('载入存档？','当前对局将被替换；如需保留，请先导出。'))return;journal=next;}
    migration=false;resetEditor();save();rebuild();}));
  function resetGame(){routePlayer=null;localExpanded.clear();localLimits.clear();journal={version:2,base:E.newState(),messages:[]};migration=false;resetEditor();save();rebuild();document.querySelector('.menu').open=false;toast('已重置，请重新填写模式、人数、编号及开局区块。');}
  $('reset-game').addEventListener('click',resetGame);$('new-game').addEventListener('click',resetGame);
  rebuild();if(loadError)toast(loadError,true);
})();


