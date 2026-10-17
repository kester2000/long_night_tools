const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/hedge-empty-feedback.json'));await page.reload();
  const edge=page.locator('#board-0 [data-r="5"][data-c="3"] .d3.open-hit-edge');await edge.waitFor();
  assert((await edge.getAttribute('title')).includes('树篱'));assert((await edge.evaluate(el=>getComputedStyle(el).backgroundImage)).includes('gradient'));
  assert.equal(await page.locator('#board-0 [data-r="5"][data-c="4"] .d2.open-hit-edge').count(),1);
  await page.locator('#undo').click();await page.waitForFunction(()=>!document.querySelector('#board-0 .open-hit-edge'));
  assert.deepEqual(errors,[]);console.log('hedge feedback browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
