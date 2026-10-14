const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  async function send(text){const before=await page.locator('.message').count();await page.locator('#message-input').fill(text);await page.locator('#send').click();await page.waitForFunction(n=>document.querySelectorAll('.message').length===n+1,before);}
  await send('模式经典\n玩家人数：4\n我是0号');
  assert((await page.locator('#game-status').textContent()).includes('你追捕 3 号 · 1 号追捕你'));
  await page.locator('.rule-options summary').click();await page.locator('#capture-target').selectOption('NEXT');
  assert((await page.locator('#game-status').textContent()).includes('你追捕 1 号 · 3 号追捕你'));
  await page.locator('#brawl-mode').check();await send('[0号]玩家本回合的完整行动轨迹：\n→(逃生)');
  assert((await page.locator('#game-status').textContent()).includes('4/4'));
  assert.equal(await page.locator('[data-fragment-player="0"]').count(),2);
  await page.reload();assert(await page.locator('#brawl-mode').isChecked());assert.equal(await page.locator('#capture-target').inputValue(),'NEXT');
  await send('[1号]乙【已出局】\n【第 1 回合】\n←');
  assert((await page.locator('#game-status').textContent()).includes('3/4'));assert((await page.locator('#game-status').textContent()).includes('你追捕 2 号'));
  await page.locator('[data-status-view="2"]').click();assert((await page.locator('#view-hint').textContent()).includes('2 号'));
  await page.locator('#undo').click();assert((await page.locator('#game-status').textContent()).includes('4/4'));
  await page.screenshot({path:'artifacts/game-status-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#game-status').screenshot({path:'artifacts/game-status-mobile.png'});
  assert.deepEqual(errors,[]);console.log('Game status browser checks passed (desktop, mobile, persistence, undo, view switch).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
