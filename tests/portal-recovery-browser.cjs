const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
const E=require('../engine');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  for(const url of [process.env.LONG_NIGHT_URL||'http://127.0.0.1:4173',pathToFileURL(path.resolve('index.html')).href]){
   const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url);
   const base=E.newState();base.config.pool=E.pool(base.config).map(b=>b.id).join(' ');base.segments[0].anchors=[{id:'E7',r:2,c:3}];
   const journal={version:2,base,messages:['模式幻变\n玩家人数：2\n我是0号\n区块池：'+base.config.pool,'[0号]玩家本回合的完整行动轨迹：\n[←未知]↑[↑啪嗒](↓撞)'].map((text,i)=>({id:String(i),text,view:0}))};
   const load=async j=>{await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),j);await page.reload();try{await page.waitForFunction(()=>/^(推理已完成|地图推理已完成 · 部分历史方案)/.test(document.querySelector('#analysis-status').textContent),{},{timeout:60000});}catch(error){console.error({errors,status:await page.locator('#analysis-status').textContent(),advice:await page.locator('#turn-advice').textContent(),toast:await page.locator('#toast').textContent()});throw error;}};
   await load(journal);
   let advice=await page.locator('#turn-advice').textContent();assert(advice.includes('已启用传送门补充推理'));assert(advice.includes('第1步进入传送门，第3步'));
   assert(!advice.includes('整图矛盾'));assert.equal(await page.locator('#board-0').count(),1);
   await load(require('./fixtures/silent-zero-portal.json'));advice=await page.locator('#turn-advice').textContent();
   for(const text of ['0号第1回合第10步进入传送门，第12步','0号第3回合第1步进入传送门，第3步','0号第3回合第5步进入传送门，第7步','金币拾取候选：第14步'])assert(advice.includes(text),text);
   assert.deepEqual(errors,[]);console.log(url+': automatic recovery and real saved coin/portal game passed');await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
