const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  async function send(text){const before=await page.locator('.message').count();await page.locator('#message-input').fill(text);await page.locator('#send').click();await page.waitForFunction(n=>document.querySelectorAll('.message').length===n+1,before);}
  await send('模式经典\n玩家人数：3\n我是0号');
  await page.locator('[data-status-view="2"]').click();
  await send('【第1回合】\n[2号]玩家本回合的完整行动轨迹：\n↑(↑撞)');
  await page.locator('#message-input').fill('【开局】墙空空墙');await page.locator('#input-preview').waitFor({state:'visible'});
  assert.equal(await page.locator('#input-receiver').inputValue(),'0');assert(await page.locator('#input-receiver').isDisabled());
  await page.locator('#send').click();await page.waitForFunction(()=>document.querySelectorAll('.message').length===3);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.at(-1).view),0);
  assert.equal(await page.locator('#board-0 .cell:has(.birth-marker) .solid-edge').count(),2);assert.equal(await page.locator('#board-2 .cell:has(.birth-marker) .solid-edge').count(),0);
  await send('【第1回合】\n[1号]玩家本回合的完整行动轨迹：\n[→沙沙](←撞)');
  assert.equal(await page.locator('#sound-check-count').textContent(),'1 步');assert((await page.locator('#sound-check-items').textContent()).includes('首次发声，未听到方位'));
  await page.locator('[data-sound-request="0"]').click();assert((await page.locator('#message-input').inputValue()).includes('[1号(第1步)]'));
  await page.locator('#message-input').press('End');await page.locator('#message-input').pressSequentially('移动进入【树丛】！本局首次发声，不会向其他人发出声响');await page.locator('#send').click();
  await page.waitForFunction(()=>document.querySelectorAll('.message').length===5);assert(await page.locator('#sound-checklist').isHidden());
  await page.locator('#undo').click();assert(await page.locator('#sound-checklist').isVisible());await page.reload();assert(await page.locator('#sound-checklist').isVisible());
  await send('【第1回合】\n[1号(第1步)]你听见了来自【正上方】的沙沙声！');assert(await page.locator('#sound-checklist').isHidden());
  await page.locator('.menu summary').click();assert.equal(await page.locator('#merge-import').count(),0);
  const j=require('./fixtures/five-player-first-sound.json');j.messages.push({id:'foreign',view:2,text:'【开局】墙墙墙空'});
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),j);await page.reload();
  assert((await page.locator('.message').last().textContent()).includes('已隔离'));
  assert((await page.locator('#sound-check-items').textContent()).includes('2号 · 第1回合 · 第8步'));
  await send('2号第1回合第8步首次发声');assert(await page.locator('#sound-checklist').isHidden());
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('Live visibility browser QA passed: fixed self receiver, public routes, source checklist, confirmations, undo, reload, isolated import and mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
