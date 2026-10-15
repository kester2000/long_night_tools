const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  async function send(text){const before=await page.locator('.message').count();await page.locator('#message-input').fill(text);await page.locator('#send').click();await page.waitForFunction(n=>document.querySelectorAll('.message').length===n+1,before);}
  await send('模式经典\n玩家人数：4\n我是0号');
  await page.locator('#message-input').fill('[1号]乙\n【第 1 回合】\n[→沙沙(正上)]');await page.locator('#input-preview').waitFor({state:'visible'});assert((await page.locator('#preview-type').textContent()).includes('私聊完整赛况'));
  assert(await page.locator('#input-receiver').isDisabled());assert.equal(await page.locator('#input-receiver').inputValue(),'0');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelectorAll('.message').length===2);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.at(-1).view),0);await page.locator('[data-status-view="2"]').click();
  await send('【第 3 回合】\n[2号]玩家本回合的完整行动轨迹：\n[→沙沙]');await page.locator('[data-window="rules"]').click();await page.locator('.rules-help summary').click();await page.locator('#rule-search').fill('屏蔽器');assert((await page.locator('#rule-book').textContent()).includes('推动'));
  await page.locator('.menu summary').click();assert.equal(await page.locator('#merge-import').count(),0);
  await page.reload();assert((await page.locator('#view-hint').textContent()).includes('2 号'));assert.equal(await page.locator('#board-3 .solid-edge').count(),0);
  await page.locator('#reset-game').click();await send('模式经典\n玩家人数：2\n我是0号');await send('区块池：1 2 3 4 5 6 7 8 9 10 11 12 E1 E2 E3 E4');await send('【开局】\n墙空空墙');await page.locator('#block-radar').waitFor({state:'visible',timeout:60000});assert((await page.locator('#block-radar').textContent()).includes('候选'));
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'artifacts/workbuddy-desktop.png',fullPage:true});assert.deepEqual(errors,[]);console.log('Optimization browser QA passed: fixed self receiver, rules, reload and block radar.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
