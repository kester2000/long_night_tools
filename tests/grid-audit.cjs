const assert=require('node:assert/strict');

// Passed into page.evaluate: measurements only, no application state changes.
function readReferenceGrid(){
 return Array.from(document.querySelectorAll('.board')).map((board,index)=>{
  const cells=Array.from(board.querySelectorAll(':scope > .cell')),n=Math.sqrt(cells.length),rect=board.getBoundingClientRect();
  const lines=Array.from(board.querySelectorAll('.block-grid-line')).map(line=>{
   const vertical=line.classList.contains('vertical'),k=Number(vertical?line.style.gridColumn:line.style.gridRow),a=cells[vertical?k-1:(k-1)*n].getBoundingClientRect(),b=cells[vertical?k:k*n].getBoundingClientRect(),r=line.getBoundingClientRect();
   return {axis:vertical?'x':'y',k,center:vertical?r.x+r.width/2-rect.x:r.y+r.height/2-rect.y,expected:vertical?(a.right+b.left)/2-rect.x:(a.bottom+b.top)/2-rect.y,pointerEvents:getComputedStyle(line).pointerEvents};
  });
  return {id:board.id||'cloned-'+index,n,width:rect.width,height:rect.height,overlays:board.querySelectorAll(':scope > .block-grid').length,hidden:board.querySelector('.block-grid')?.getAttribute('aria-hidden'),lines};
 });
}
function assertReferenceGrid(boards){
 assert(boards.length,'expected visible map boards');
 for(const b of boards){
  assert.equal(b.overlays,b.n%3===0?1:0,b.id+' must have exactly one fixed overlay, or none for irregular grids');
  assert.equal(b.lines.length,b.n%3===0?2*(b.n/3-1):0,b.id+' line count');
  if(b.lines.length)assert.equal(b.hidden,'true');
  for(const axis of ['x','y'])assert.deepEqual(b.lines.filter(l=>l.axis===axis).map(l=>l.k),b.n%3===0?Array.from({length:b.n/3-1},(_,i)=>(i+1)*3):[]);
  for(const l of b.lines){assert(Math.abs(l.center-l.expected)<.1,`${b.id} ${l.axis}${l.k}: line ${l.center} misses cell gap ${l.expected}`);assert.equal(l.pointerEvents,'none');}
 }
}
function assertReferenceUnmoved(before,after){
 assertReferenceGrid(after);assert.deepEqual(after.map(b=>b.id),before.map(b=>b.id),'map set changed unexpectedly while shifting');
 for(let i=0;i<before.length;i++){
  const a=before[i],b=after[i];assert(Math.abs(a.width-b.width)<.1&&Math.abs(a.height-b.height)<.1,a.id+' board resized while shifting');
  assert.equal(a.lines.length,b.lines.length);
  for(let j=0;j<a.lines.length;j++)assert(Math.abs(a.lines[j].center-b.lines[j].center)<.1,a.id+' reference moved during map shift');
 }
}
module.exports={readReferenceGrid,assertReferenceGrid,assertReferenceUnmoved};
