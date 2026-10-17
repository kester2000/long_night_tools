const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{const server=process.env.LONG_NIGHT_TEST_URL==='serve'?require('node:child_process').spawn(process.execPath,['server.cjs'],{windowsHide:true,stdio:['ignore','pipe','inherit']}):null;
 if(server)await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server?'http://127.0.0.1:4173':require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
 await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive20.json'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:30000});
 await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await page.locator('#show-any-example').click();
 const check=async()=>{
 await page.waitForFunction(()=>document.querySelector('.confirmed-event-conclusion')?.textContent.includes('第 13 步'),null,{timeout:40000});
 await page.waitForFunction(()=>document.querySelectorAll('#board-1 [data-known-block="45"]').length===9&&document.querySelectorAll('#board-1 [data-known-block="49"]').length===9,null,{timeout:30000});
 assert.equal(await page.locator('#board-1 [data-known-block]').count(),18);
 assert.match(await page.locator('.confirmed-event-conclusion').innerText(),/第 18 步拾取 49/);
 };
 await check();await page.reload();await check();
 // A new round restores the same deductions without another long search.
 await page.evaluate(()=>{const j=JSON.parse(localStorage.getItem('long-night-message-notebook-v2'));j.messages.push({id:'round4',text:'[0号]玩家本回合的完整行动轨迹：\n↑',view:0});localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j));});
 await page.reload();await check();
 // Changing historical evidence must drop the derived facts.
 await page.evaluate(()=>{const j=JSON.parse(localStorage.getItem('long-night-message-notebook-v2'));j.messages[9].text+='↑';localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j));});
 await page.reload();await page.waitForTimeout(1000);assert.equal(await page.locator('.confirmed-event-conclusion').count(),0);
 assert.deepEqual(errors,[]);console.log('Archive20 confirmed events, certified blocks, reload and prefix restoration passed');
 }finally{await browser.close();server?.kill();}})().catch(e=>{console.error(e);process.exitCode=1});
