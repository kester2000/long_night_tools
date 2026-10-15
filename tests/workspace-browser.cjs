const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.LONG_NIGHT_BROWSER?{executablePath:process.env.LONG_NIGHT_BROWSER}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1680,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.evaluate(j=>localStorage.setItem('long-night-message-notebook-v2',JSON.stringify(j)),JSON.parse(fs.readFileSync('tests/fixtures/sound-source-portal.json','utf8')));await page.reload();
  await page.waitForFunction(()=>document.querySelector('#board-0 [data-sound-candidate]'),{},{timeout:60000});
  assert.equal(await page.locator('.dock-panel').count(),5);assert.equal(await page.locator('#message-input').count(),1);
  const history=page.locator('[data-panel="history"]');await history.locator('.dock-position').selectOption('right');assert.equal(await history.locator('..').getAttribute('data-zone'),'right');
  const input=page.locator('[data-panel="input"]');await input.locator('.dock-position').selectOption('right');assert.equal(await input.locator('..').getAttribute('data-zone'),'right');
  await input.locator('[data-panel-action="collapse"]').click();assert(await input.evaluate(e=>e.classList.contains('collapsed')));
  await input.locator('.dock-position').selectOption('bottom');assert.equal(await input.locator('..').getAttribute('data-zone'),'bottom');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('long-night-workspace-v1')).current.panels.input.zone==='bottom');
  await page.reload();await page.waitForFunction(()=>window.LongNightWorkspace);assert(await input.evaluate(e=>e.classList.contains('collapsed')));assert.equal(await input.locator('..').getAttribute('data-zone'),'bottom');
  await page.locator('[data-window="input"]').click();assert(!(await input.evaluate(e=>e.classList.contains('collapsed'))));
  await input.locator('.dock-position').selectOption('float');const title=input.locator('.dock-title'),before=await input.boundingBox();await title.hover();await page.mouse.down();await page.mouse.move(before.x+150,before.y+95,{steps:8});await page.mouse.up();const after=await input.boundingBox();assert(Math.abs(after.x-before.x)>20||Math.abs(after.y-before.y)>20);
  await input.locator('[data-panel-action="collapse"]').click();assert((await input.boundingBox()).height<=36);await input.locator('[data-panel-action="collapse"]').click();
  const size=await input.boundingBox();await page.mouse.move(size.x+size.width-3,size.y+size.height-3);await page.mouse.down();await page.mouse.move(size.x+size.width+45,size.y+size.height+35,{steps:8});await page.mouse.up();await page.waitForFunction(height=>window.LongNightWorkspace.getLayout().panels.input.height>height+20,size.height);
  await input.locator('[data-panel-action="maximize"]').click();assert(await input.evaluate(e=>e.classList.contains('maximized')));await page.keyboard.press('Escape');
  await input.locator('[data-panel-action="hide"]').click();assert(!(await input.isVisible()));await page.locator('[data-window="input"]').click();assert(await input.isVisible());await input.locator('.dock-position').selectOption('left');
  const splitter=page.locator('[data-split="left"]'),rect=await splitter.boundingBox(),old=await page.evaluate(()=>window.LongNightWorkspace.getLayout().left);await page.mouse.move(rect.x+2,rect.y+100);await page.mouse.down();await page.mouse.move(rect.x+72,rect.y+100,{steps:10});await page.mouse.up();assert((await page.evaluate(()=>window.LongNightWorkspace.getLayout().left))>old+40);
  await page.locator('.workspace-layout-menu > summary').click();await page.locator('#workspace-layout-name').fill('验证布局');await page.locator('#save-named-layout').click();await page.locator('#reset-layout').click();await page.locator('#saved-layouts').selectOption('验证布局');assert((await page.evaluate(()=>window.LongNightWorkspace.getLayout().left))>old+40);await page.locator('.workspace-layout-menu > summary').click();
  await page.locator('.workspace-layout-menu > summary').click();const downloadPromise=page.waitForEvent('download');await page.locator('#export-layout').click();const download=await downloadPromise;await download.saveAs('artifacts/workspace-layout-test.json');await page.locator('#reset-layout').click();await page.locator('#layout-import-file').setInputFiles(path.resolve('artifacts/workspace-layout-test.json'));await page.waitForFunction(()=>window.LongNightWorkspace.getLayout().left>340);
  await page.locator('#layout-import-file').setInputFiles({name:'bad-layout.json',mimeType:'application/json',buffer:Buffer.from('{"version":9}')});await page.waitForFunction(()=>document.querySelector('#layout-save-status').textContent.includes('导入失败'));await page.locator('.workspace-layout-menu > summary').click();
  await page.locator('#board-0 [data-sound-candidate] .sound-source-marker').first().click();assert(await page.locator('[data-panel="info"] [data-show-map]').count()>0);assert(await page.locator('[data-panel="info"]').isVisible());await page.locator('[data-panel="info"] #sound-candidate-detail [data-show-map]').first().click();assert(await page.locator('#sound-map-candidates .block-preview').first().isVisible());
  await page.screenshot({path:'artifacts/workspace-desktop.png',fullPage:true});assert.deepEqual(errors,[]);
  const layoutBeforeReset=await page.evaluate(()=>window.LongNightWorkspace.getLayout());await page.locator('#reset-game').click();assert.deepEqual(await page.evaluate(()=>window.LongNightWorkspace.getLayout()),layoutBeforeReset,'game reset does not reset layout');
  console.log('Desktop workspace passed: docking, collapse, floating drag, maximize, hiding, resizing, named layouts, reload and sound-branch interaction.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
