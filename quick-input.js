(function longNightModule(root){
  'use strict';
  (root.LongNightSources ||= {})['quick-input.js']=longNightModule.toString();
  function compose({kind,player,round,route,walls,direction,step,sound}){
    if(!Number.isInteger(round)||round<0)throw new Error('回合须为非负整数，0 表示开局。');
    const header=round===0?'【开局】':`【第 ${round} 回合】`;
    if(kind==='walls'){
      if(!/^[墙空?？]{4}$/.test(walls))throw new Error('按上下左右填写四个墙、空或 ?。');
      return header+'\n您所在位置的四周墙壁信息，按照 上下左右 顺序分别是：\n'+walls;
    }
    if(!Number.isInteger(player)||player<0||player>7)throw new Error('玩家编号须为 0–7。');
    if(round===0)throw new Error('轨迹与声音须填写实际回合。');
    if(kind==='trajectory'){
      if(!route?.trim())throw new Error('请先录入轨迹。');
      return header+`\n[${player}号]玩家本回合的完整行动轨迹：\n`+route.trim();
    }
    if(!Number.isInteger(step)||step<1)throw new Error('声音步数须为正整数。');
    if(!['正上方','正下方','正左方','正右方','左上方','右上方','左下方','右下方'].includes(direction)||!['沙沙','啪嗒'].includes(sound))throw new Error('请选择声响与方位。');
    return header+`\n[${player}号(第${step}步)]你听见了来自【${direction}】的${sound}声！`;
  }
  function mount(){
    const form=document.getElementById('message-form'),input=document.getElementById('message-input');
    const box=document.createElement('details');box.className='secondary quick-input';
    box.innerHTML='<summary>手动速记 · 生成后核对再发送</summary><p>私聊墙壁与声音始终归本人。回合 0 仅用于开局墙壁。</p><label>类型 <select data-q="kind"><option value="trajectory">轨迹</option><option value="walls">本人墙壁</option><option value="hear">听到的方位</option></select></label> <label>玩家 <input data-q="player" type="number" min="0" max="7" value="0"></label> <label>回合 <input data-q="round" type="number" min="0" value="1"></label><p><label>轨迹 <input data-q="route" placeholder="↑[→沙沙](↓撞)"></label></p><p data-q="arrows"></p><label>四墙 <input data-q="walls" value="????" maxlength="4" aria-label="上下左右四墙"></label><p><label>声源步数 <input data-q="step" type="number" min="1" value="1"></label> <select data-q="direction" aria-label="声音方位">'+['正上方','正下方','正左方','正右方','左上方','右上方','左下方','右下方'].map(x=>'<option>'+x+'</option>').join('')+'</select> <select data-q="sound" aria-label="声响"><option>沙沙</option><option>啪嗒</option></select></p><button type="button" data-q="generate">生成到输入框</button><p data-q="error" role="status"></p>';
    form.prepend(box);const q=k=>box.querySelector('[data-q="'+k+'"]');
    for(const text of ['↑','↓','←','→','[↑沙沙]','[↓啪嗒]','(↑撞)','(逃生)']){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>{q('route').value+=text;};q('arrows').append(b);}
    q('generate').onclick=()=>{try{if(input.value.trim())throw new Error('输入框已有文字，请先发送或清空，避免覆盖。');const data={};for(const k of ['kind','player','round','route','walls','direction','step','sound'])data[k]=q(k).value;for(const k of ['player','round','step'])data[k]=Number(data[k]);input.value=compose(data);input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();q('error').textContent='已生成，请核对玩家、回合与原文后发送。';}catch(e){q('error').textContent=e.message;}};
  }
  if(typeof module!=='undefined')module.exports={compose};else mount();
})(globalThis);
