const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LONG_NIGHT_BROWSER});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  // Deterministic solver fixture: eight certified blocks, two possible ninth
  // blocks, and two reciprocally aligned players. Rendering uses real proofs.
  await page.addInitScript(()=>{
   let api;
   Object.defineProperty(window,'LongNightTeam',{get:()=>api,set:value=>{
    api={...value,solve(config,nodes){
     const E=window.LongNight,n=config.size;
     const results=nodes.map(node=>{
      const dr=node.player===1?6:0,dc=node.player===1?3:0;
      const anchors=Array.from({length:node.player===2?9:8},(_,i)=>({id:String(i+1),r:E.mod(Math.floor(i/3)*3+dr,n),c:E.mod(i%3*3+dc,n)}));
      const solution=E.solveMap({...config,exitCount:0},[],anchors);
      return {...node,solution,verification:E.certifyBlocks({...config,exitCount:0},solution,[]),completeLayouts:E.verifyCompleteLayout({...config,exitCount:0},solution,[],5000,{limit:8}),joined:node.player===2?[{id:node.id,dr:0,dc:0}]:[{id:node.id,dr:0,dc:0},{id:node.player===0?'1:0':'0:0',dr:node.player===0?3:6,dc:node.player===0?6:3}],mergedObservations:[],local:{pending:true}};
     });window.fixtureResults=results;return {nodes:results,pairs:[],conflict:false};
    }};
   }});
  });
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.locator('#message-input').fill('模式经典\n玩家人数：2\n我是0号\n区块池：1 2 3 4 5 6 7 8 9 10');await page.locator('#send').click();
  await page.waitForFunction(()=>document.querySelector('[data-merged-players]'),null,{timeout:15000}).catch(async error=>{console.log(await page.evaluate(()=>window.fixtureResults?.map(n=>({id:n.id,verification:n.verification,phases:n.solution.phases.length}))),await page.locator('#analysis-status').innerText(),await page.locator('#toast').innerText(),errors);throw error;});
  assert.equal(await page.locator('.dock-panel').count(),5);
  assert.equal(await page.locator('#all-boards > .player-map').count(),1);
  const board=page.locator('#board-0');
  assert.equal(await board.locator('[data-known-block="1"]').count(),9);
  assert.equal(await board.locator('[data-known-block="1"].terrain-UNKNOWN').count(),0);
  assert.equal(await board.locator('.birth-marker').count(),2);assert.equal(await board.locator('[data-r="7"][data-c="1"] .birth-marker').innerText(),'1');
  assert.equal(await board.locator('.current-marker').count(),2);
  assert((await page.locator('.block-options').innerText()).includes('待选 2 种'));
  assert((await page.locator('.complete-layouts > summary').innerText()).includes('全部 2 种'));
  assert.equal(await page.locator('.complete-layouts > details').count(),2);
  await page.locator('.complete-layouts > summary').click();await page.locator('.complete-layouts > details > summary').first().click();
  assert.equal(await page.locator('.complete-layouts > details').first().locator('.preview-cell').count(),81);assert(await page.locator('.complete-layouts > details').first().locator('.block-preview').isVisible());
  await page.screenshot({path:'artifacts/merged-layouts.png',fullPage:true});
  assert.equal(await page.locator('#view-tabs button').count(),1);
  const uncertain=board.locator('[data-block-candidates]').first();
  await uncertain.hover();
  await page.locator('#block-candidate-popup').waitFor();
  assert.deepEqual(await page.locator('#block-candidate-popup [data-candidate-block]').evaluateAll(els=>els.map(e=>e.dataset.candidateBlock).sort()),['10','9']);
  assert.equal(await page.locator('#block-candidate-popup .preview-cell').count(),18);
  assert.equal(await page.locator('#block-candidate-popup .pointed-cell').count(),2);
  await page.keyboard.press('Escape');
  await uncertain.click();
  await page.mouse.move(0,0);
  assert(await page.locator('#block-candidate-popup').isVisible());
  await page.screenshot({path:'artifacts/block-candidates-popup.png',fullPage:true});
  await page.keyboard.press('Escape');
  await page.locator('[data-status-view="1"]').click();
  assert.equal(await page.locator('#all-boards > .player-map').count(),1);
  assert.equal(await page.locator('#board-0 .birth-marker').count(),2);
  await page.locator('#message-input').fill('玩家人数：3');await page.locator('#send').click();
  await page.waitForFunction(()=>document.querySelector('#all-boards > .player-map')?.dataset.mapCertainty==='complete');
  assert.equal(await page.locator('#all-boards > .player-map').first().getAttribute('data-map-view'),'2');
  assert.equal(await page.locator('#all-boards > .player-map:visible').count(),2);
  assert.equal(await page.locator('#view-tabs button').count(),2);
  assert.equal(await page.locator('[data-panel=maps] .player-local,[data-panel=maps] .block-options').count(),0);
  assert.equal(await page.locator('#map-candidates .block-preview:visible').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Merged views, birth/current markers, confirmed nine-cell blocks, candidate lists, complete layouts and perspective switching passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
