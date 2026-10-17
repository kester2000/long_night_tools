const assert=require('node:assert/strict'),{chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(require('node:path').resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),require('./fixtures/archive18.json'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#analysis-status').textContent.includes('完成'),null,{timeout:18000});
  assert.equal(await page.locator('#all-boards > .player-map').count(),1);
  const card=page.locator('#all-boards > .player-map');
  assert.deepEqual((await card.getAttribute('data-merged-players')).split(',').sort(),['0','1']);
  assert.equal(await card.locator('.possible-position').count(),0);
  const board=card.locator(':scope > .board-wrap > .board');
  for(const r of [3,4])assert.match(await board.locator('[data-r="'+r+'"][data-c="4"]').getAttribute('class'),/terrain-EMPTY/,'confirmed quiet arrivals should be white, not gray');
  assert((await board.locator('.current-marker').allTextContents()).some(t=>t.endsWith('0')));
  assert((await board.locator('.current-marker').allTextContents()).some(t=>t.endsWith('1')));
  for(const player of [0,1]){await page.locator('[data-status-view="'+player+'"]').click();assert.equal(await board.locator('.game-route-overlay[data-route-player="'+player+'"]').count(),1);}
  assert.equal(await page.locator('.detailed-route-steps,[id^="perspective-candidates-"]').count(),0);
  assert(await page.locator('#show-any-example').evaluate(el=>el.parentElement.lastElementChild===el),'example button is at the bottom of the map module');
  await page.locator('#show-any-example').click();
  assert.equal(await page.locator('#position-example .preview-cell').count(),81);
  assert.equal(await page.locator('#position-example [data-example-player]').count(),2);
  for(const host of [board,page.locator('#position-example')]){
   assert(await host.locator('.attachment-coin').count()>0);
   assert(await host.locator('.attachment-button').count()>0);
   const icons=await host.locator('.preview-attachment').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el),a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return {image:s.backgroundImage,size:s.backgroundSize,x:Math.abs(a.x+a.width/2-b.x-b.width/2),y:Math.abs(a.y+a.height/2-b.y-b.height/2),ratio:a.width/b.width};}));
   assert(icons.every(i=>i.image.includes('assets/lgtbot/classic/')&&i.size==='contain'&&i.x<2&&i.y<2&&i.ratio>.85));
  }
  assert.equal(await page.locator('#position-example .game-route-overlay[data-route-player="1"]').count(),1);
  await page.locator('[data-status-view="0"]').click();
  assert.equal(await page.locator('#position-example .game-route-overlay[data-route-player="0"]').count(),1);
  assert.equal(await page.locator('.detailed-route-steps').count(),0);
  assert.deepEqual(errors,[]);console.log('Archive 18 automatically merged browser passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
