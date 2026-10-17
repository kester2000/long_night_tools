const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright'),j=require('./fixtures/three-second-hit.json');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(process.cwd(),decodeURIComponent(req.url.split('?')[0]));fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{for(const url of [require('node:url').pathToFileURL(path.resolve('index.html')).href,`http://127.0.0.1:${server.address().port}/index.html`]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify({...j,messages:j.messages.slice(0,7)})),j);await page.reload();assert.equal(await page.locator('#analysis-status').textContent(),'等待行动轨迹');
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),j);const start=Date.now();await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),{},{timeout:18000});
  assert(Date.now()-start<18000,'three player budgets plus joint alignment must remain bounded');
  assert(!(await page.locator('#analysis-status').textContent()).includes('无响应'),'normal per-player timeouts should finish without the watchdog');
  assert.equal(await page.locator('#board-2 [data-r="3"][data-c="4"] .d0.hit-edge').count(),1);
  assert.equal(await page.locator('#board-2 .birth-marker').count(),1);assert.deepEqual(errors,[]);
  console.log(url.startsWith('file:')?'file fallback player budgets passed':'worker player budgets passed');await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
