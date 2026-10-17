const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive17.json'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:18000});
  await page.locator('#board-1 [data-block-candidates]').first().click();
  await page.locator('[data-candidate-example]').first().click();
  const example=page.locator('#position-example.block-candidate-example');
  assert.equal(await page.locator('#block-candidate-popup').count(),0);
  assert(await example.evaluate(el=>el.previousElementSibling.id==='all-boards')); 
  await page.locator('[data-status-view="1"]').click();
  assert(await example.isVisible(),'player selection preserves the open example');
  assert.equal(await example.locator('.game-route-overlay[data-route-player="1"]').count(),1);
  assert.equal(await page.locator('.detailed-route-steps').count(),0);
  assert.equal(await example.locator('.route-hit[data-route-round="1"][data-route-step="9"]').count(),1);
  assert(await example.locator('.route-overflow').count()>0,'revisited cells use grouped labels');
  assert.equal(await example.locator('[data-example-player]').count(),2);
  await page.locator('[data-status-view="0"]').click();
  assert.equal(await example.locator('.game-route-overlay[data-route-player="1"]').count(),0);
  assert.equal(await example.locator('.game-route-overlay[data-route-player="0"]').count(),1);
  assert(await example.locator('[data-route-round="1"]').count()>0);
  assert(await example.locator('[data-route-round="2"]').count()>0);
  assert((await example.locator('.route-stop text:not(.route-overflow)').allTextContents()).every(t=>/^\d+·\d+/.test(t)));
  require('node:fs').mkdirSync('artifacts',{recursive:true});
  await example.screenshot({path:'artifacts/detailed-routes.png'});
  await page.locator('[data-status-view="0"]').click();
  assert.equal(await example.locator('.game-route-overlay,.detailed-route-steps').count(),0);
  assert.equal(await example.locator('.preview-cell').count(),81);
  assert.deepEqual(errors,[]);console.log('Detailed routes browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
