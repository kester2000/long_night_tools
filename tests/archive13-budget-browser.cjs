const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright'),j=require('./fixtures/player-zero-candidates.json');
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(process.cwd(),decodeURIComponent(req.url.split('?')[0]));fs.readFile(file,(err,data)=>{if(err)return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(data);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{for(const url of [require('node:url').pathToFileURL(path.resolve('index.html')).href,`http://127.0.0.1:${server.address().port}/index.html`]){
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),j);await page.reload();
  await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),{},{timeout:14000}).catch(async e=>{console.log('STATUS',await page.locator('#analysis-status').textContent(),'ERRORS',errors);throw e;});
  for(const player of [0,1]){
   const host=page.locator('#board-'+player).locator('..').locator('..');
   assert.equal(await host.locator('.assumption-gallery > .assumption-example .preview-cell').count(),81);
   assert((await host.locator('.assumption-gallery > .assumption-example .path-dot').count())>0);
   if(player===1)assert((await host.locator('.assumption-gallery > .assumption-example h4').textContent()).includes('传送门'));
  }
  assert.deepEqual(errors,[]);
  fs.mkdirSync('artifacts',{recursive:true});await page.screenshot({path:'artifacts/archive13-'+(url.startsWith('file:')?'file':'worker')+'.png',fullPage:true});
  console.log(url.startsWith('file:')?'file archive 13 passed':'worker archive 13 passed');await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
