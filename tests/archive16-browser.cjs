const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive16.json'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:18000});
  assert.equal(await page.locator('#board-0 .possible-position').count(),0);
  assert.equal(await page.locator('#board-0 [data-known-block="45"]').count(),9);
  await page.screenshot({path:'artifacts/archive16.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('Archive 16 browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
