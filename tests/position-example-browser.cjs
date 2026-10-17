const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive17.json'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:18000});
  assert.equal(await page.locator('.walking-assumption-details').count(),0);
  assert.equal(await page.getByText('展开假设图：完全没有走过传送门',{exact:true}).count(),0);
  const marker=page.locator('#board-0 [data-position-player="1"][data-position-status="verified"]').first();
  const at=await marker.evaluate(el=>({r:el.parentElement.dataset.r,c:el.parentElement.dataset.c}));
  await marker.click();
  assert.equal(await page.locator('#position-example .preview-cell').count(),81);
  assert.equal(await page.locator('#position-example [data-preview-r="'+at.r+'"][data-preview-c="'+at.c+'"] [data-example-player="1"]').count(),1);
  assert.equal(await page.locator('#position-example [data-example-player="0"]').count(),1);
  assert.equal(await page.locator('#block-candidate-popup').count(),0,'position marker must take priority over block popup');
  assert.deepEqual(errors,[]);console.log('Precise position example browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
