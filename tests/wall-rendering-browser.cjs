const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.LONG_NIGHT_PLAYWRIGHT||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.LONG_NIGHT_BROWSER});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   let api;Object.defineProperty(window,'LongNightTeam',{get:()=>api,set:value=>{api={...value,solve(config,nodes){
    const E=window.LongNight,ids=['47','42','48','49','50','2','6','13','E15'],anchors=ids.map((id,i)=>({id,r:Math.floor(i/3)*3,c:i%3*3})),solution=E.solveMap({...config,exitCount:null},[],anchors),verification=E.certifyBlocks({...config,exitCount:null},solution,[]);
    const doors=E.inferredDoors(config,solution,verification.blocks),seen=new Set(),observations=[];
    for(const [key] of doors){if(seen.has(key))continue;const [r,c,d]=key.split(/[,:]/).map(Number),reverse=E.key(E.mod(r+E.V[d][0],9),E.mod(c+E.V[d][1],9))+':'+E.OPP[d];seen.add(key);seen.add(reverse);const walls=['?','?','?','?'];walls[d]=observations.length?'空':'墙';observations.push({r,c,kind:'walls',value:walls.join(''),clock:{player:0,round:1,step:observations.length+1}});if(observations.length===2)break;}
    return {nodes:nodes.map(node=>({...node,solution,verification,joined:[{id:node.id,dr:0,dc:0}],mergedObservations:observations,local:{pending:true},completeLayouts:E.verifyCompleteLayout({...config,exitCount:null},solution,[],5000,{limit:8})})),pairs:[],conflict:false};
   }};}});
  });
  await page.goto(require('node:url').pathToFileURL(path.resolve('index.html')).href);
  await page.locator('#message-input').fill('模式疯狂\n玩家人数：1\n我是0号\n区块池：47 42 48 49 50 2 6 13 E15');await page.locator('#send').click();
  await page.waitForFunction(()=>document.querySelector('#board-0 .hedge-edge'),null,{timeout:15000});
  for(const [cls,file] of [['hedge-edge','hedge'],['door-closed','door'],['door-open','dooropen']]){
   const edges=page.locator('#board-0 .wall.'+cls);assert(await edges.count()>0,cls);
   for(const style of await edges.evaluateAll(els=>els.map(el=>({image:getComputedStyle(el).backgroundImage,vertical:el.matches('.d2,.d3')}))))assert(style.image.endsWith('/'+file+'_'+(style.vertical?'col':'row')+'.png")'),style.image);
  }
  assert(await page.locator('#board-0 .door-unknown').count()>0);
  await page.locator('.complete-layouts > summary').click();await page.locator('.complete-layouts > details > summary').first().click();
  const preview=page.locator('.complete-layouts .block-preview').first();assert(await preview.locator('.hedge-edge').count()>0);assert(await preview.locator('.door-closed,.door-open').count()>0);
  const images=await page.evaluate(async()=>Promise.all(['wall','hedge','door','dooropen','empty'].flatMap(name=>['row','col'].map(axis=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im.naturalWidth>0);im.onerror=()=>resolve(false);im.src='assets/lgtbot/classic/walls/'+name+'_'+axis+'.png';})))));
  assert(images.every(Boolean),'all original textures load');
  await page.locator('#board-0').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/lgtbot-wall-styles.png'});
  assert.deepEqual(errors,[]);console.log('Main and candidate maps: lgtbot hedge, closed/open door textures, both orientations and unknown door state passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
