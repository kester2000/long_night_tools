const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const E=require('../engine'),Timeline=require('../timeline');
const source=fs.readFileSync(require.resolve('../chat.js'),'utf8');
const body=source.slice(source.indexOf('  function blockPreview('),source.indexOf('  function renderLocal()'));
const preview=new Function('model','team','E','window','shownSegment','viewOffset','esc','symbols','positionMarker',body+';return blockPreview;')(
 {config:{size:3,playerCount:1,dynamicDoors:true}},null,E,{LongNightTimeline:Timeline},()=>0,()=>({r:0,c:0}),String,{},()=>''
);
test('candidate preview renders every coin and button independently of player and path markers',()=>{
 const b=E.byId.get('45'),html=preview({blocks:[{id:'45',origin:{r:0,c:0}}],birth:null},{r:0,c:0},0,[]);
 assert.equal((html.match(/attachment-coin/g)||[]).length,b.cells.filter(c=>c.attach==='COIN').length);
 assert.equal((html.match(/attachment-button/g)||[]).length,b.cells.filter(c=>c.attach==='BUTTON').length);
 assert(html.includes('金币（模板初始位置，可能已被拾取）'));
 assert(html.includes('门当前状态：'));
 assert(!html.includes('模板初始门状态'));
});
test('full candidate preview aligns its own 3 by 3 blocks even while the main map is unaligned',()=>{
 const render=new Function('model','team','E','window','shownSegment','viewOffset','esc','symbols','positionMarker',body+';return blockPreview;')(
  {config:{size:9,playerCount:1,dynamicDoors:true}},null,E,{LongNightTimeline:Timeline},()=>0,()=>({r:0,c:0}),String,{},()=>''
 );
 const blocks=Array.from({length:9},(_,i)=>({id:'5',origin:{r:(Math.floor(i/3)*3+1)%9,c:(i%3*3+2)%9}}));
 const html=render({blocks,players:[],birth:null},{r:0,c:0},0,[]);
 assert(html.includes('data-origin-r="1" data-origin-c="2"'));
 const coords=[...html.matchAll(/class="preview-cell[^>]*data-preview-r="(\d+)" data-preview-c="(\d+)"/g)].map(m=>[+m[1],+m[2]]);
 assert.equal(coords.length,81);assert.deepEqual(coords[0],[1,2]);assert.deepEqual(coords[20],[3,4]);
});
test('candidate maps hide unwalked template terrain until no more than two blocks remain unknown',()=>{
 const T=require('../team'),blocks=Array.from({length:9},(_,i)=>({id:String(i+1),origin:{r:Math.floor(i/3)*3,c:i%3*3}}));
 const node={id:'0:0',verification:{status:'verified',blocks:blocks.slice(0,6)},observations:[{kind:'action',arrival:true,r:0,c:0}]};
 const render=new Function('model','team','E','window','shownSegment','viewOffset','esc','symbols','positionMarker',body+';return blockPreview;')(
  {config:{size:9,playerCount:1,dynamicDoors:true}},{nodes:[node]},E,{LongNightTimeline:Timeline,LongNightTeam:T},()=>0,()=>({r:0,c:0}),String,{},()=>''
 );
 const html=()=>render({blocks,players:[],birth:null},{r:0,c:0},0,node.observations);
 assert.equal((html().match(/class="preview-cell/g)||[]).length,1);
 assert.equal((html().match(/class="preview-void/g)||[]).length,80);
 node.verification.blocks=blocks.slice(0,7);
 assert.equal((html().match(/class="preview-cell/g)||[]).length,81);
});
