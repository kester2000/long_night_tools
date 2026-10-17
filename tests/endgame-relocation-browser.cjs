const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright'),j=require('./fixtures/endgame-relocation.json');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(process.cwd(),decodeURIComponent(req.url.split('?')[0]));fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{for(const url of [require('node:url').pathToFileURL(path.resolve('index.html')).href,`http://127.0.0.1:${server.address().port}/index.html`]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify({...j,messages:j.messages.slice(0,7)})),j);await page.reload();assert.equal(await page.locator('#analysis-status').textContent(),'等待行动轨迹');
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),j);const start=Date.now();await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent==='推理已完成',{},{timeout:6000});
  assert(Date.now()-start<4500);
  assert((await page.locator('#historical-map h3').textContent()).includes('8 个区块'));
  assert((await page.locator('[data-relocation-player="0"]').textContent()).includes('2 个位置候选'));
  assert((await page.locator('[data-relocation-player="2"]').textContent()).includes('2 个位置候选'));
  assert.equal(await page.locator('#historical-map .relocation-candidate').count(),4);
  assert.equal(await page.locator('#historical-map .preview-cell').count(),72);
  assert.equal(await page.locator('#historical-map .current-marker').count(),0);
  assert.deepEqual(errors,[]);
  const geometry=await page.locator('#historical-map .block-preview').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,first:el.firstElementChild.getBoundingClientRect().width,last:el.lastElementChild.getBoundingClientRect().width}));
  assert(Math.abs(geometry.width-geometry.height)<3,JSON.stringify(geometry));assert(Math.abs(geometry.first-geometry.last)<1);
  await page.waitForFunction(()=>document.querySelector('#coin-question-dialog').open);
  assert((await page.locator('.coin-question-text').textContent()).includes('第 6 回合'));
  const stored=await page.evaluate(()=>localStorage.getItem('long-night-message-notebook-v2'));
  await page.locator('[data-coin-answer="unknown"]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('long-night-message-notebook-v2')),stored);
  await page.getByRole('button',{name:'补充关键金币线索'}).click();
  await page.locator('[data-coin-answer="'+(url.startsWith('file:')?'yes':'no')+'"]').click();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent==='推理已完成'&&document.querySelector('[data-relocation-player="0"]')?.textContent.includes('1 个位置候选'),{},{timeout:6000});
  assert((await page.locator('#historical-map .preview-cell').count())>=72);
  await page.screenshot({path:'artifacts/endgame-'+(url.startsWith('file:')?'file':'worker')+'.png',fullPage:true});
  console.log(url.startsWith('file:')?'file endgame passed':'worker endgame passed');
  await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
