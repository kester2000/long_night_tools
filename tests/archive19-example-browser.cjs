const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const server=process.env.LONG_NIGHT_TEST_URL==='serve'?require('node:child_process').spawn(process.execPath,['server.cjs'],{windowsHide:true,stdio:['ignore','pipe','inherit']}):null;
 if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited: '+code)));});
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server?'http://127.0.0.1:4173':process.env.LONG_NIGHT_TEST_URL||require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive19.json'));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:20000});
  await page.locator('#show-any-example').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-event-first]').length===4,null,{timeout:40000}).catch(async error=>{console.error(await page.locator('#position-example').innerText(),errors);throw error;});
  assert.match(await page.locator('#position-example').innerText(),/金币有 4 种方案，按钮有 5 种方案/);
  assert.equal(await page.locator('#position-example .preview-cell').count(),0);
  let combinations=0;
  for(let first=0;first<4;first++){
   await page.locator('[data-event-first="'+first+'"]').click();
   assert.equal(await page.locator('#position-example .preview-cell').count(),0,'changing the first choice removes the stale map');
   const count=await page.locator('[data-event-second]').count();assert(count>0);
   for(let second=0;second<count;second++){
    await page.locator('[data-event-second="'+second+'"]').click();
    assert.equal(await page.locator('#position-example .preview-cell').count(),81);
    combinations++;
   }
  }
  assert.equal(combinations,5);
  assert.match(await page.locator('.event-map').innerText(),/第 18 步.*49/);
  assert.match(await page.locator('.event-map').innerText(),/第 13 步.*45/);
  assert.equal(await page.locator('#position-example [data-example-player]').count(),2);
  assert.equal(await page.locator('#show-any-example').isDisabled(),false);
  assert.match(await page.locator('#position-example').innerText(),/满足已录入全员线索/);
  // The durable result survives a page reload and is used by a fresh worker.
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:20000});
  await page.locator('#show-any-example').click();
  await page.waitForFunction(()=>document.querySelector('#position-example')?.dataset.cacheMode==='exact',null,{timeout:10000});
  assert.equal(await page.locator('[data-event-first]').count(),4);
  assert.match(await page.locator('.search-cache-note').innerText(),/缓存/);
  // Updating the archive cancels the dedicated worker and discards its result.
  await page.locator('#show-any-example').click();
  await page.locator('#undo').click();
  assert.equal(await page.locator('#position-example').count(),0);
  assert.equal(await page.locator('#show-any-example').isDisabled(),false);
  assert.deepEqual(errors,[]);
  console.log('Archive 19 example choices and persistent cache passed');
 }finally{await browser.close();server?.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
