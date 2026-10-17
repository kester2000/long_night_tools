const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright'),journal=require('./fixtures/opening-walls.json');
(async()=>{
 const server=http.createServer((req,res)=>fs.readFile(path.join(process.cwd(),decodeURIComponent(req.url.split('?')[0])),(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url.endsWith('.css')?'text/css':'text/html');res.end(data);}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{for(const url of [require('node:url').pathToFileURL(path.resolve('index.html')).href,`http://127.0.0.1:${server.address().port}/index.html`]){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),journal);await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'));
  const own=page.locator('[data-map-view="1"]');
  assert.equal(await own.locator('.assumption-gallery > .assumption-example .preview-cell').count(),81);
  assert.equal(await page.locator('[data-map-view="0"] .assumption-example').count(),0);
  assert.deepEqual(errors,[]);
  const empty={...journal,messages:journal.messages.filter(m=>!m.text.includes('【开局】'))};
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),empty);await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent==='等待墙壁或行动线索');
  assert.equal(await page.locator('.assumption-example').count(),0);
  console.log(url.startsWith('file:')?'file opening walls passed':'worker opening walls passed');await page.close();
 }}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
