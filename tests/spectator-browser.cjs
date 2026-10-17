const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  async function send(text){const before=await page.locator('.message').count();await page.locator('#message-input').fill(text);await page.locator('#send').click();await page.waitForFunction(n=>document.querySelectorAll('.message').length===n+1,before);}
  await send('模式经典\n玩家人数：3');await page.locator('#self-id').selectOption('spectator');
  await page.waitForFunction(()=>document.querySelector('#game-status').textContent.includes('未代入任何玩家'));
  await send('【第1回合】\n[0号]玩家本回合的完整行动轨迹：\n↑');
  assert((await page.locator('#game-status').textContent()).includes('未代入任何玩家'));
  assert(!(await page.locator('#game-status').textContent()).includes('· 我'));
  await page.locator('#message-input').fill('【开局】墙空空墙');await page.locator('#send').click();
  assert((await page.locator('#toast').textContent()).includes('观战'));assert.equal(await page.locator('.message').count(),3);
  await page.reload();assert.equal(await page.locator('#self-id').inputValue(),'spectator');
  await page.locator('#self-id').selectOption('1');await page.waitForFunction(()=>document.querySelector('#game-status').textContent.includes('1号 · 我'));
  assert.deepEqual(errors,[]);console.log('spectator browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
