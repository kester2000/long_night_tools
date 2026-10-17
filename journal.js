(function longNightModule(root){
  'use strict';
  (root.LongNightSources ||= {})['journal.js']=longNightModule.toString();
  const E=typeof module!=='undefined'?require('./engine'):root.LongNight;
  const M=typeof module!=='undefined'?require('./messages'):root.LongNightMessages;
  const meaningfulBase=j=>j.base.segments.some(s=>s.events.length||s.sounds.length||s.anchors.length);
  function merge(current,incoming){
    if(meaningfulBase(current)||meaningfulBase(incoming))throw new Error('带旧版对局基础的存档无法安全合并，请使用消息版记录。');
    const a=M.build(current.base,current.messages),b=M.build(incoming.base,incoming.messages);
    for(const key of ['size','mode','event','silent','brawl','pointCapture','captureTarget','exitCount','dynamicDoors']){
      const defaults={silent:false,brawl:false,pointCapture:true,captureTarget:'PREVIOUS'};
      if((a.model.config[key]??defaults[key])!==(b.model.config[key]??defaults[key]))throw new Error('两份记录的对局设置不一致：'+key+'。请先修正设置。');
    }
    if(a.count!==b.count)throw new Error('两份记录的人数不同，不能合并。');
    const pool=j=>(j.model.config.pool||'').split(/\s+/).filter(Boolean).sort().join(' ');
    if(pool(a)!==pool(b))throw new Error('两份记录的本局区块池不同，不能合并。');
    const next=E.clone(current),seen=new Set(),routes=new Map();let added=0,duplicates=0;
    const signature=(text,view)=>view+'|'+M.clean(text);
    const core=t=>JSON.stringify(t.tokens.filter(x=>x.kind==='move'||x.kind==='hidden').map(x=>x.kind==='hidden'?['hidden']: [x.dir,x.outcome]));
    function scan(message,owner,record){
      const p=M.parse(message.text);
      for(const t of p.items.filter(i=>i.kind==='trajectory')){
        if(t.round==null&&!p.snapshot)throw new Error('合并要求行动轨迹带明确的【第 N 回合】；请先补充回合号。');
        const key=t.player+':'+t.round,old=routes.get(key);
        if(old&&old!==core(t))throw new Error(t.player+'号第 '+t.round+' 回合轨迹冲突，请先核对原文。');
        if(record)routes.set(key,core(t));
      }
      if(record)seen.add(signature(message.text,message.view??owner));
      return p;
    }
    for(const m of current.messages)scan(m,a.self,true);
    for(const m of incoming.messages){
      const p=scan(m,b.self,false);
      // Identity and global settings belong to each owner's notebook. Compatible
      // settings were checked above; spatial data retains its original receiver.
      if(p.items.length&&p.items.every(i=>i.kind==='config'||i.kind==='identity'))continue;
      if(p.items.some(i=>i.kind==='identity'||i.kind==='config'))throw new Error('含设置与地图混合输入的消息请先拆分，再合并。');
      const view=m.view??b.self,key=signature(m.text,view);
      if(seen.has(key)){duplicates++;continue;}
      scan(m,b.self,true);seen.add(key);
      const usedIds=new Set(next.messages.map(m=>m.id));let id;do{id=globalThis.crypto?.randomUUID?.()||'merge-'+Date.now()+'-'+Math.random();}while(usedIds.has(id));
      next.messages.push({id,text:m.text,view,receiverConfirmed:true});added++;
    }
    if(next.messages.length>2000)throw new Error('合并后消息超过 2000 条，请分局保存。');
    M.build(next.base,next.messages);return {journal:next,added,duplicates};
  }
  const api={merge};if(typeof module!=='undefined')module.exports=api;else root.LongNightJournal=api;
})(globalThis);
