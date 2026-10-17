const assert=require('node:assert/strict'),path=require('node:path'),E=require('../engine');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.LONG_NIGHT_BROWSER});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
 async function load(route){const texts=['模式幻变\n玩家人数：2\n我是0号\n区块池：1 2 3 4 5 6 7 8 51 E1',route];await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),{version:2,base:E.newState(),messages:texts.map((text,i)=>({id:String(i),text,view:0})),view:1});await page.reload();await page.waitForFunction(()=>document.querySelector('#sound-question-dialog').open,{},{timeout:7000});}
 await load('[0号]玩家本回合的完整行动轨迹：\n↑(←撞)');assert((await page.locator('.sound-question-text').textContent()).includes('心脏'));
 const before=await page.evaluate(()=>localStorage.getItem('long-night-message-notebook-v2'));await page.locator('[data-sound-answer="unknown"]').click();assert.equal(await page.evaluate(()=>localStorage.getItem('long-night-message-notebook-v2')),before);
 await page.locator('[data-confirm-sound]').click();await page.locator('#sound-question-dialog textarea').fill('[第 1 步] 移动发出【啪嗒声】，声响被巨大的心跳声掩盖，其他玩家未能察觉');await page.locator('[data-sound-answer="yes"]').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.length===3);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.at(-1).view),0);
 await load('[1号]玩家本回合的完整行动轨迹：\n[↑沙沙](←撞)');assert((await page.locator('.sound-question-text').textContent()).includes('声源方向'));
 await page.locator('#sound-question-dialog textarea').fill('你听见了来自【正上方】的沙沙声！');await page.locator('[data-sound-answer="yes"]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.length===3);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.at(-1).view),0);
 assert.deepEqual(errors,[]);console.log('sound confirmations passed');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
