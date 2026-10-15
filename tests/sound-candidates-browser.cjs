const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),JSON.parse(fs.readFileSync('tests/fixtures/sound-source-portal.json','utf8')));await page.reload();
  await page.waitForFunction(()=>document.querySelector('#board-0 [data-sound-candidate]'),{},{timeout:60000});
  const cells=page.locator('#board-0 [data-sound-candidate]');assert.equal(await cells.count(),11);
  assert((await cells.first().getAttribute('title')).includes('2号第1回合第3步声源候选'));assert.equal(await cells.first().locator('.sound-source-marker').textContent(),'?');
  await cells.first().click();assert(await page.locator('#sound-candidate-detail').isVisible());assert((await page.locator('#sound-candidate-detail').textContent()).includes('当前路径解释'));
  const gallery=page.locator('#sound-candidate-detail .sound-pattern-gallery');assert(await gallery.count()>0);
  assert(!(await gallery.first().textContent()).match(/单区块|双区块|三区块/));assert(await gallery.locator('.route-steps').count()>0);assert(await gallery.locator('.block-preview').count()>0);
  assert.equal(await gallery.locator('.current-marker').first().textContent(),'2');
  const before=await gallery.locator('.block-preview').count();await page.locator('[data-sound-more]').first().click();assert(await gallery.locator('.block-preview').count()>before);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#board-0 [data-sound-candidate]'),{},{timeout:60000});assert.equal(await cells.count(),11);
  await page.setViewportSize({width:1366,height:900});await cells.first().click();assert(await page.locator('#sound-candidate-detail').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'artifacts/sound-source-desktop.png',fullPage:true});
  await page.locator('#undo').click();await page.waitForFunction(()=>!document.querySelector('[data-sound-candidate]'),{},{timeout:60000});assert(!(await page.locator('#sound-candidate-detail').isVisible()));
  assert.deepEqual(errors,[]);console.log('Sound-source UI passed: candidate cells, hover title, click details, shift, reload, desktop layout, undo.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
