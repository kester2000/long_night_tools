const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/twist-first-round-papa.json'));await page.reload();
  await page.waitForFunction(()=>document.querySelectorAll('[data-hypothesis="portal"]').length===2,{},{timeout:60000});
  assert((await page.locator('#turn-advice').textContent()).includes('第2步到8号区块'));
  const details=page.locator('#board-2').locator('..').locator('..').locator('.hypothesis-details');await details.locator('summary').click();
  const ground=page.locator('[data-hypothesis="ground"]');assert((await ground.textContent()).includes('13「镜面迷宫A」、E7「亚空间逃生舱A」'));
  assert.equal(await ground.locator('[data-known-block]').count(),18);
  for(const portal of await page.locator('[data-hypothesis="portal"]').all()){
   assert.equal(await portal.locator('.cell.me .hit-edge.d3').count(),1);
   assert((await portal.locator('.cell.me').getAttribute('title')).includes('传送门'));
  }
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('First-round branch browser QA passed: conditional 13/E7, crossing example, two portal routes with final collisions, mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
