(function longNightPage(){
 'use strict';
  (globalThis.LongNightSources ||= {})['workspace.js']=longNightPage.toString();
 const STORE='long-night-workspace-v1',$=s=>document.querySelector(s),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const definitions=[
  ['setup','对局设置','⚙','left',260,['.game-options','.rule-options','#block-picker','#setup-hint']],
  ['input','消息输入','›','left',340,['#message-form','.under-composer','#sound-checklist']],
  ['history','消息记录','≡','left',260,['#messages']],
  ['maps','地图工作区','▦','center',600,['.map-panel']],
  ['info','信息与推理','≋','right',600,['#view-hint','#map-summary','#game-status','#block-radar','#turn-advice','#combined-info','#perspective-info','#sound-candidate-detail','#reasoning','#candidate-detail','#phase-select','#layout','#sources','.rules-help','.help']]
 ];
 const defaults=()=>({version:1,left:300,right:280,bottom:240,panels:Object.fromEntries(definitions.map(([id,,,,height],order)=>[id,{zone:definitions[order][3],order,height,width:520,x:340,y:80,collapsed:['history','rules','candidates','layout'].includes(id),hidden:false}]))});
 function validate(raw){
  if(!raw||raw.version!==1||!raw.panels)throw Error('不是有效的布局存档');
  const out=defaults();for(const key of ['left','right','bottom'])if(Number.isFinite(raw[key]))out[key]=clamp(raw[key],180,1000);
  for(const [id] of definitions){const p=raw.panels[id];if(!p)continue;const d=out.panels[id];if(['left','center','right','bottom','float'].includes(p.zone))d.zone=p.zone;for(const k of ['order','height','width','x','y'])if(Number.isFinite(p[k]))d[k]=clamp(p[k],k==='order'?0:k==='x'||k==='y'?0:120,4000);for(const k of ['collapsed','hidden'])d[k]=p[k]===true;}
  return out;
 }
 let stored={layouts:{}},state=defaults(),maximized=null,saveTimer,dragged=null,z=30;
 try{stored=JSON.parse(localStorage.getItem(STORE))||stored;state=validate(stored.current||defaults());if(!stored.layouts||typeof stored.layouts!=='object')stored.layouts={};}catch{stored={layouts:{}};}
 const main=$('main'),oldFooter=$('footer');document.body.classList.add('desktop-workspace');
 const workspace=document.createElement('div');workspace.id='workspace';workspace.innerHTML='<nav class="activity-bar" aria-label="窗口"><b>◒</b><div id="window-shortcuts"></div><button type="button" id="show-all-windows" title="显示全部窗口">⊞</button></nav><div class="dock-zone dock-left" data-zone="left"><span class="dock-empty">将窗口拖到此处</span></div><div class="workspace-splitter split-left" data-split="left" role="separator" tabindex="0" aria-label="左侧栏宽度"></div><div class="dock-zone dock-center" data-zone="center"><span class="dock-empty">将窗口拖到此处</span></div><div class="workspace-splitter split-right" data-split="right" role="separator" tabindex="0" aria-label="右侧栏宽度"></div><div class="dock-zone dock-right" data-zone="right"><span class="dock-empty">将窗口拖到此处</span></div><div class="workspace-splitter split-bottom" data-split="bottom" role="separator" tabindex="0" aria-label="底部面板高度"></div><div class="dock-zone dock-bottom" data-zone="bottom"><span class="dock-empty">将窗口拖到此处</span></div><div id="workspace-floats"></div><div id="workspace-drop-hint" hidden>拖到目标栏停靠，或使用窗口标题上的位置菜单</div>';
 const cards=new Map(),contents=new Map(definitions.map(([id,,,,,selectors])=>[id,selectors.map(s=>$(s)).filter(Boolean)]));
 for(const [id,title,icon,zone,height,selectors] of definitions){
  const nodes=contents.get(id),card=document.createElement('section');card.className='dock-panel';card.dataset.panel=id;
  const head=document.createElement('div');head.className='dock-title';head.draggable=true;head.innerHTML='<span class="dock-icon">'+icon+'</span><span class="dock-name">'+title+'</span><select class="dock-position" aria-label="'+title+'窗口位置"><option value="left">左侧</option><option value="center">中央</option><option value="right">右侧</option><option value="bottom">底部</option><option value="float">浮动</option></select><button type="button" data-panel-action="collapse" aria-label="折叠或展开'+title+'" title="折叠 / 展开">−</button><button type="button" data-panel-action="maximize" aria-label="最大化或还原'+title+'" title="最大化 / 还原">□</button><button type="button" data-panel-action="hide" aria-label="收起'+title+'到活动栏" title="收起到活动栏">×</button>';
  const body=document.createElement('div');body.className='dock-body';body.dataset.panelBody=id;
  for(const node of nodes){if(node.tagName==='DETAILS'&&id==='candidates'){node.open=true;node.classList.add('workspace-root-details');}body.append(node);}
  if(['status','branch'].includes(id)){const empty=document.createElement('p');empty.className='dock-placeholder';empty.textContent=id==='branch'?'点击地图上的黄色问号，在这里查看条件分支与区块拼图。':'对局设置完成后，这里显示玩家状态和区块雷达。';body.append(empty);}
  card.append(head,body);cards.set(id,card);workspace.querySelector('[data-zone="'+zone+'"]').append(card);
  head.addEventListener('dblclick',e=>{if(e.target.closest('button,select'))return;move(id,state.panels[id].zone==='float'?'center':'float');});
  head.addEventListener('dragstart',e=>{if(state.panels[id].zone==='float'||e.target.closest('button,select')){e.preventDefault();return;}dragged=id;e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move';workspace.classList.add('dragging-panels');$('#workspace-drop-hint').hidden=false;});
  head.addEventListener('dragend',clearDrag);
  head.addEventListener('pointerdown',e=>{
   if(e.button!==0||state.panels[id].zone!=='float'||e.target.closest('button,select'))return;
   const p=state.panels[id],start={x:e.clientX,y:e.clientY,px:p.x,py:p.y};card.style.zIndex=++z;head.setPointerCapture(e.pointerId);
   const motion=event=>{p.x=clamp(start.px+event.clientX-start.x,0,Math.max(0,workspace.clientWidth-card.offsetWidth));p.y=clamp(start.py+event.clientY-start.y,0,Math.max(0,workspace.clientHeight-card.offsetHeight));card.style.left=p.x+'px';card.style.top=p.y+'px';};
   const end=()=>{head.removeEventListener('pointermove',motion);head.removeEventListener('pointerup',end);head.removeEventListener('pointercancel',end);persist();};head.addEventListener('pointermove',motion);head.addEventListener('pointerup',end,{once:true});head.addEventListener('pointercancel',end,{once:true});
  });
  head.querySelector('select').addEventListener('change',e=>move(id,e.target.value));
  head.addEventListener('click',e=>{const action=e.target.closest('[data-panel-action]')?.dataset.panelAction;if(!action)return;
   if(action==='collapse'){state.panels[id].collapsed=!state.panels[id].collapsed;if(maximized===id)maximized=null;}
   if(action==='hide'){state.panels[id].hidden=true;if(maximized===id)maximized=null;}
   if(action==='maximize'){maximized=maximized===id?null:id;state.panels[id].collapsed=false;}
   apply();persist();
  });
  const shortcut=document.createElement('button');shortcut.type='button';shortcut.dataset.window=id;shortcut.title=title;shortcut.setAttribute('aria-label',title);shortcut.textContent=icon;shortcut.addEventListener('click',()=>reveal(id));workspace.querySelector('#window-shortcuts').append(shortcut);
 }
 const parking=document.createElement('div');parking.hidden=true;for(const id of ['local-results','pairs','pair-status']){const node=$('#'+id);if(node)parking.append(node);}document.body.append(parking);
 main.replaceWith(workspace);oldFooter.innerHTML='<span>LONG NIGHT · DESKTOP WORKSPACE</span><span id="layout-save-status">布局已自动保存</span><span>拖动标题换位 · 双击标题浮动 · 拖动分隔线调整大小</span>';
 const tools=document.createElement('div');tools.className='workspace-tools';tools.innerHTML='<span class="workspace-caption">长夜推理工作区</span><details class="workspace-layout-menu"><summary>布局 ▾</summary><div><label>布局名称 <input id="workspace-layout-name" value="我的工作布局" maxlength="40"></label><button id="save-named-layout" type="button">保存布局存档</button><label>已存布局 <select id="saved-layouts"><option value="">选择布局…</option></select></label><button id="export-layout" type="button">导出布局 JSON</button><button id="import-layout" type="button">导入布局 JSON</button><button id="reset-layout" type="button">恢复默认布局</button><small>只保存窗口位置与大小，对局记录独立保存。</small></div></details><input id="layout-import-file" type="file" accept=".json,application/json" hidden>';
 $('header').insertBefore(tools,$('#reset-game'));
 function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{stored.current=state;localStorage.setItem(STORE,JSON.stringify(stored));$('#layout-save-status').textContent='布局已自动保存';}catch{$('#layout-save-status').textContent='布局保存失败：请检查浏览器存储空间';}},120);}
 function listLayouts(){const select=$('#saved-layouts');select.replaceChildren(new Option('选择布局…',''));for(const name of Object.keys(stored.layouts))select.add(new Option(name,name));}
 function apply(){
  const width=workspace.clientWidth||innerWidth,available=Math.max(440,width-398),leftWidth=clamp(state.left,220,Math.min(width*.4,available-220)),rightWidth=clamp(state.right,220,Math.min(width*.35,available-leftWidth));workspace.style.setProperty('--left-width',leftWidth+'px');workspace.style.setProperty('--right-width',rightWidth+'px');workspace.style.setProperty('--bottom-height',clamp(state.bottom,140,Math.max(140,Math.min(workspace.clientHeight*.65,workspace.clientHeight-225)))+'px');
  for(const [id,card] of cards){const p=state.panels[id];card.hidden=p.hidden;card.classList.toggle('collapsed',p.collapsed);card.classList.toggle('floating',p.zone==='float');card.classList.toggle('maximized',maximized===id);card.style.order=p.order;card.style.setProperty('--panel-height',p.height+'px');card.style.width=p.zone==='float'?clamp(p.width,240,width-55)+'px':'';card.style.height=p.zone==='float'?p.height+'px':'';card.style.left=clamp(p.x,0,width-180)+'px';card.style.top=clamp(p.y,0,workspace.clientHeight-34)+'px';card.querySelector('.dock-title').draggable=p.zone!=='float';card.querySelector('.dock-position').value=p.zone;card.querySelector('[data-panel-action="collapse"]').textContent=p.collapsed?'＋':'−';card.querySelector('[data-panel-action="collapse"]').setAttribute('aria-expanded',String(!p.collapsed));
   const parent=p.zone==='float'?$('#workspace-floats'):workspace.querySelector('[data-zone="'+p.zone+'"]');if(card.parentElement!==parent)parent.append(card);
   const button=workspace.querySelector('[data-window="'+id+'"]');button.classList.toggle('window-hidden',p.hidden);button.setAttribute('aria-pressed',String(!p.hidden));
  }
 }
 function move(id,zone,before=null){maximized=null;const p=state.panels[id];p.zone=zone;p.hidden=false;const siblings=[...cards.keys()].filter(k=>k!==id&&state.panels[k].zone===zone).sort((a,b)=>state.panels[a].order-state.panels[b].order);const at=before?siblings.indexOf(before):-1;siblings.splice(at<0?siblings.length:at,0,id);siblings.forEach((k,i)=>state.panels[k].order=i);apply();persist();}
 function reveal(id){if(!cards.has(id))id='maps';const p=state.panels[id];p.hidden=false;p.collapsed=false;if(maximized&&maximized!==id)maximized=null;apply();cards.get(id).scrollIntoView({block:'nearest'});cards.get(id).classList.add('window-highlight');setTimeout(()=>cards.get(id).classList.remove('window-highlight'),700);persist();}
 function clearDrag(){dragged=null;workspace.classList.remove('dragging-panels');$('#workspace-drop-hint').hidden=true;workspace.querySelectorAll('.drop-target').forEach(e=>e.classList.remove('drop-target'));}
 for(const zone of workspace.querySelectorAll('.dock-zone')){zone.addEventListener('dragover',e=>{if(!dragged)return;e.preventDefault();e.dataTransfer.dropEffect='move';workspace.querySelectorAll('.drop-target').forEach(x=>x.classList.remove('drop-target'));zone.classList.add('drop-target');});zone.addEventListener('drop',e=>{if(!dragged)return;e.preventDefault();const target=e.target.closest('.dock-panel'),before=target&&e.clientY<target.getBoundingClientRect().top+target.offsetHeight/2?target.dataset.panel:null;move(dragged,zone.dataset.zone,before);clearDrag();});}
 for(const splitter of workspace.querySelectorAll('[data-split]')){
  const key=splitter.dataset.split;
  splitter.addEventListener('pointerdown',e=>{e.preventDefault();splitter.setPointerCapture(e.pointerId);document.body.classList.add('workspace-resizing');const initial=state[key],start=key==='bottom'?e.clientY:e.clientX;const motion=event=>{const delta=(key==='bottom'?event.clientY:event.clientX)-start;state[key]=clamp(initial+delta*(key==='left'?1:-1),key==='bottom'?140:220,key==='bottom'?workspace.clientHeight*.65:workspace.clientWidth*.4);apply();};const end=()=>{splitter.removeEventListener('pointermove',motion);document.body.classList.remove('workspace-resizing');persist();};splitter.addEventListener('pointermove',motion);splitter.addEventListener('pointerup',end,{once:true});});
  splitter.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();state[key]=clamp(state[key]+(['ArrowLeft','ArrowDown'].includes(e.key)?-20:20),180,900);apply();persist();});
 }
 const observer=new ResizeObserver(entries=>{for(const entry of entries){const id=entry.target.dataset.panel,p=state.panels[id];if(p.collapsed||maximized===id||p.hidden)continue;const w=Math.round(entry.target.offsetWidth),h=Math.round(entry.target.offsetHeight);if(p.zone==='float'&&w>220&&h>100&&(Math.abs(p.width-w)>2||Math.abs(p.height-h)>2)){p.width=w;p.height=h;persist();}else if(['left','right','center'].includes(p.zone)&&id!=='maps'&&entry.target.style.height&&h>100&&Math.abs(p.height-h)>2){p.height=h;persist();}}});for(const card of cards.values())observer.observe(card);
 const branch=$('#sound-candidate-detail');new MutationObserver(()=>{if(!branch.hidden)reveal('info');}).observe(branch,{attributes:true,attributeFilter:['hidden']});
 workspace.querySelector('#show-all-windows').addEventListener('click',()=>{for(const p of Object.values(state.panels))p.hidden=false;apply();persist();});
 $('#save-named-layout').addEventListener('click',()=>{const name=$('#workspace-layout-name').value.trim()||'我的工作布局';stored.layouts={...stored.layouts,[name]:JSON.parse(JSON.stringify(state))};listLayouts();$('#saved-layouts').value=name;persist();});
 $('#saved-layouts').addEventListener('change',e=>{if(!stored.layouts[e.target.value])return;state=validate(stored.layouts[e.target.value]);maximized=null;$('#workspace-layout-name').value=e.target.value;apply();persist();});
 $('#reset-layout').addEventListener('click',()=>{state=defaults();maximized=null;apply();persist();});
 $('#export-layout').addEventListener('click',()=>{const name=$('#workspace-layout-name').value.trim()||'长夜布局',url=URL.createObjectURL(new Blob([JSON.stringify({name,layout:state},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 $('#import-layout').addEventListener('click',()=>$('#layout-import-file').click());
 $('#layout-import-file').addEventListener('change',async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>100000)throw Error('布局文件过大');const data=JSON.parse(await file.text());state=validate(data.layout||data);maximized=null;apply();persist();$('#layout-save-status').textContent='布局已导入';}catch(error){$('#layout-save-status').textContent='导入失败：'+error.message;}});
 addEventListener('resize',apply);addEventListener('keydown',e=>{if(e.key==='Escape'&&maximized){maximized=null;apply();}if(e.ctrlKey&&e.shiftKey&&['1','2','3'].includes(e.key)){e.preventDefault();reveal({'1':'maps','2':'input','3':'history'}[e.key]);}});
 addEventListener('pagehide',()=>{try{stored.current=state;localStorage.setItem(STORE,JSON.stringify(stored));}catch{}});
 listLayouts();apply();window.LongNightWorkspace={reveal,getLayout:()=>JSON.parse(JSON.stringify(state))};
})();
