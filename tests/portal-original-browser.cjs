const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
 await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/left-left-portal.json'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:30000});
 assert.equal(await page.locator('#board-0').isVisible(),true);
 assert.equal(await page.locator('#board-0 .cell').count(),81);
 assert(await page.locator('.assumption-gallery').count()>0);
 assert.match(await page.locator('.original-route-note').first().innerText(),/原路线图保留/);
 assert.match(await page.locator('.assumption-gallery').first().textContent(),/可能走过传送门|搜索未完成，不能判定没有传送/);
 await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/silent-zero-portal.json'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:30000});
 assert.equal(await page.locator('#board-0 .cell').count(),81);
 assert.equal(await page.locator('#board-0').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('Portal alternatives retain the original board');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

