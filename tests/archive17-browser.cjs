const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive17.json'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:18000});
  const visited=page.locator('#board-0 .visited');
  assert.equal(await page.locator('.walking-assumption-details,.assumption-gallery').count(),0,'standalone no-portal example galleries are removed');
  assert.equal(await visited.count(),11);
  assert.equal(await page.locator('#board-0 .visited[data-block-candidates]').count(),11);
  assert.equal(await page.locator('#board-0 [data-block-candidates]:not(.visited)').count(),7);
  for(const id of ['4','8']){
   assert.equal(await page.locator('#board-0 [data-known-block="'+id+'"]').count(),9);
   assert.equal(await page.locator('#board-0 [data-known-block="'+id+'"].terrain-UNKNOWN').count(),0);
   assert(await page.locator('#board-0 [data-known-block="'+id+'"]:not(.visited) .wall').count()>0);
   await page.locator('#board-0 .visited[data-known-block="'+id+'"]').first().click();
   assert.match(await page.locator('#block-candidate-popup h3').textContent(),new RegExp('已确认区块 '+id+' · 1 种候选放置'));
   assert.equal(await page.locator('#block-candidate-popup [data-candidate-block="'+id+'"]').count(),1);
   assert.equal(await page.locator('#block-candidate-popup .pointed-cell').count(),1);
   await page.locator('[data-close-block-popup]').click();
  }
  await page.locator('#board-1 [data-block-candidates]').first().click();
  assert.match(await page.locator('#block-candidate-popup h3').textContent(),/待定区块/);
  assert(await page.locator('#block-candidate-popup [data-candidate-block]').count()>1);
  for(const index of [0,1]){
   if(index)await page.locator('#board-1 [data-block-candidates]').first().click();
   const choice=page.locator('#block-candidate-popup [data-candidate-block]').nth(index),id=await choice.getAttribute('data-candidate-block');
   const origin=await choice.locator('.block-preview').evaluate(el=>({r:el.dataset.originR,c:el.dataset.originC}));
   await choice.locator('[data-candidate-example]').click();
   const example=page.locator('.block-candidate-example');
   assert(await example.isVisible());
   assert.equal(await example.locator('.preview-cell').count(),81);
   assert.equal(await example.locator('[data-example-player="0"]').count(),1);
   assert.equal(await example.locator('[data-example-player="1"]').count(),1);
   assert.match(await example.locator('h4').textContent(),new RegExp('区块 '+id+' 的一种可能全图'));
   assert((await example.locator('[data-preview-r="'+origin.r+'"][data-preview-c="'+origin.c+'"]').getAttribute('title')).startsWith(id+' · '));
   assert.equal(await page.locator('#block-candidate-popup').count(),0);
   assert.equal(await page.locator('#position-example').count(),1);
   assert(await example.evaluate(el=>el.previousElementSibling.id==='all-boards'));
  }
  assert.deepEqual(errors,[]);console.log('Archive 17 candidate browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
