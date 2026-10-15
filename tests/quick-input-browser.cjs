const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  async function send(text){const count=await page.locator('.message').count();await page.locator('#message-input').fill(text);await page.locator('#send').click();await page.waitForFunction(n=>document.querySelectorAll('.message').length===n+1,count);}
  await send('模式经典\n玩家人数：3\n我是1号');
  await page.locator('summary').filter({hasText:'手动速记'}).click();
  await page.locator('[data-q="player"]').fill('2');await page.locator('[data-q="route"]').fill('↑(↓撞)');await page.locator('[data-q="generate"]').click();
  assert((await page.locator('#message-input').inputValue()).includes('[2号]'));await page.locator('#send').click();await page.waitForFunction(()=>document.querySelectorAll('.message').length===2);
  await page.locator('[data-q="kind"]').selectOption('walls');await page.locator('[data-q="round"]').fill('0');await page.locator('[data-q="walls"]').fill('墙空空墙');await page.locator('[data-q="generate"]').click();await page.locator('#send').click();await page.waitForFunction(()=>document.querySelectorAll('.message').length===3);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('long-night-message-notebook-v2')).messages.at(-1).view),1);
  await page.locator('[data-q="generate"]').click();await page.locator('#send').click();await page.locator('#toast').waitFor({state:'visible'});assert.equal(await page.locator('.message').count(),3);
  await send('待核对的普通笔记');assert((await page.locator('#messages').textContent()).includes('1 段未识别'));
  await page.locator('#message-input').fill('未发送草稿');await page.locator('[data-q="generate"]').click();assert((await page.locator('[data-q="error"]').textContent()).includes('避免覆盖'));
  await page.locator('.menu summary').click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出文字局况',exact:true}).click();assert.equal((await download).suggestedFilename(),'长夜文字局况.txt');
  assert.deepEqual(errors,[]);console.log('quick input browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
