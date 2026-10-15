const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/five-player-first-sound.json'));await page.reload();
  await page.locator('#message-input').fill('2号第1回合第8步首次发声');await page.locator('#preview-type').filter({hasText:'首次发声线索'}).waitFor();await page.locator('#send').click();
  await page.waitForFunction(()=>document.querySelector('#turn-advice').textContent.includes('第10步从配对出口出现'),{},{timeout:60000});
  assert((await page.locator('#turn-advice').textContent()).includes('出口啪嗒可被掩盖'));
  assert(await page.locator('#portal-after-board-2 .cell.me .hit-edge.d2').count());
  await page.reload();await page.waitForFunction(()=>document.querySelector('#turn-advice').textContent.includes('第10步从配对出口出现'),{},{timeout:60000});
  await page.setViewportSize({width:1366,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('First-sound browser QA passed: supplemental input preview, masked step-ten exit, saved annotation, desktop.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
