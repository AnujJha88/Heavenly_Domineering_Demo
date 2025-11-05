// Mosaic Mayhem – Alternating Play/Explore (Repeated) + CGT
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const modeSelect = document.getElementById('modeSelect');
const modeDisplay = document.getElementById('modeDisplay');
const turnEl = document.getElementById('turn');
const topYEl = document.getElementById('topY');
const movesAvailEl = document.getElementById('movesAvail');

const builderToggle = document.getElementById('builderToggle');
const allSmallToggle = document.getElementById('allSmallToggle');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const exploreBtn = document.getElementById('exploreBtn');
const repeatsLabel = document.getElementById('repeatsLabel');
const repeatsInput = document.getElementById('repeatsInput');

const zoomEl = document.getElementById('zoom');
const showGridEl = document.getElementById('showGrid');
const themeToggle = document.getElementById('themeToggle');

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const resetBtn = document.getElementById('resetBtn');

const genBtn = document.getElementById('genBtn');
const polySizeInput = document.getElementById('polySize');
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const fileInput = document.getElementById('fileInput');

const cgtDepthEl = document.getElementById('cgtDepth');
const cgtEvalEl = document.getElementById('cgtEval');
const cgtComputeBtn = document.getElementById('cgtComputeBtn');
const cgtCopyBtn = document.getElementById('cgtCopyBtn');
const cgtExportBtn = document.getElementById('cgtExportBtn');
const cgtOut = document.getElementById('cgtOut');

const logEl = document.getElementById('log');

let mode = 'play'; // Current mode

// Visual config
let CELL = 32; // zoom
const PAD = 16;
const GHOST_ALPHA = 0.28;

// Sparse state
let cells = new Set();          
let occ = new Map();            
let current = 'Left';           
let bounds = {minX:0,minY:0,maxX:0,maxY:0};
let hoverCell = null;

// History
let undoStack = [];
let redoStack = [];
let anim = null;

// Helpers (unchanged)
const key = (x,y)=>`${x},${y}`;
const parseKey = s => { const [x,y]=s.split(',').map(Number); return {x,y}; };
function getCss(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function log(msg){
  const el = document.createElement('div');
  el.className = 'entry';
  const ts = new Date().toLocaleTimeString();
  el.textContent = `[${ts}] ${msg}`;
  logEl.prepend(el);
}

function computeBounds(){
  if (cells.size===0){ bounds={minX:0,minY:0,maxX:0,maxY:0}; return; }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of cells){ const {x,y}=parseKey(s); minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); }
  bounds={minX,minY,maxX,maxY};
  const dpr=window.devicePixelRatio||1;
  const w=(maxX-minX+1)*CELL + PAD*2;
  const h=(maxY-minY+1)*CELL + PAD*2;
  canvas.width=Math.max(200, Math.floor(w*dpr));
  canvas.height=Math.max(160, Math.floor(h*dpr));
  canvas.style.width=`${Math.max(200,w)}px`;
  canvas.style.height=`${Math.max(160,h)}px`;
  ctx.setTransform(dpr,0,0,dpr,0,0);
}

function toPx(x,y){ return { px:(x-bounds.minX)*CELL+PAD, py:(y-bounds.minY)*CELL+PAD }; }
function isEmptyLocal(oMap,x,y){ return cells.has(key(x,y)) && (!(oMap.has(key(x,y))) || oMap.get(key(x,y))===0); }
function isEmpty(x,y){ return isEmptyLocal(occ,x,y); }

function getTopYLocal(oMap){
  let top=Infinity;
  for(const s of cells){ const {x,y}=parseKey(s); if(isEmptyLocal(oMap,x,y)) top=Math.min(top,y); }
  return top===Infinity ? -1 : top;
}
function getTopY(){ return getTopYLocal(occ); }

function legalMoves(side){
  const topY=getTopY();
  const moves=[];
  if(topY===-1) return moves;
  if(side==='Left'){
    for(const s of cells){ const {x,y}=parseKey(s); if(y!==topY) continue; if(isEmpty(x,y) && isEmpty(x,y+1)) moves.push({side,kind:'V',x,y}); }
  }else{
    for(const s of cells){ const {x,y}=parseKey(s); if(y!==topY) continue; if(isEmpty(x,y) && isEmpty(x+1,y)) moves.push({side,kind:'H',x,y}); }
  }
  return moves;
}

function legalAllSmallPlaceLocal(oMap){
  const topY=getTopYLocal(oMap);
  if(topY===-1) return null;
  for(const s of cells){ const {x,y}=parseKey(s); if(y!==topY) continue; if(isEmptyLocal(oMap,x,y)) return {x,y}; }
  return null;
}

// Rendering
function crispLineRect(x,y,w,h){ const o=0.5; ctx.strokeRect(Math.floor(x)+o,Math.floor(y)+o,Math.floor(w)-1,Math.floor(h)-1); }

function drawTileBackground(x,y){
  const {px,py}=toPx(x,y);
  const even=((x+y)&1)===0;
  ctx.fillStyle=even?getCss('--tile-a'):getCss('--tile-b');
  ctx.fillRect(px,py,CELL,CELL);
  ctx.strokeStyle=getCss('--tile-border');
  ctx.lineWidth=1; crispLineRect(px,py,CELL,CELL);
}

function drawSubsetGrid(){
  if(!showGridEl?.checked) return;
  ctx.lineWidth=1;
  for(const s of cells){
    const {x,y}=parseKey(s); const {px,py}=toPx(x,y);
    ctx.strokeStyle=getCss('--grid-line-strong'); crispLineRect(px,py,CELL,CELL);
    ctx.strokeStyle=getCss('--grid-line');
    ctx.beginPath();
    ctx.moveTo(px, py + CELL/2 + 0.5); ctx.lineTo(px+CELL, py + CELL/2 + 0.5);
    ctx.moveTo(px + CELL/2 + 0.5, py); ctx.lineTo(px + CELL/2 + 0.5, py + CELL);
    ctx.stroke();
  }
}

function drawTopRowGlow(){
  const topY=getTopY(); if(topY===-1) return;
  const {px,py}=toPx(bounds.minX,topY);
  const width=(bounds.maxX-bounds.minX+1)*CELL;
  ctx.save(); ctx.shadowColor='rgba(255,214,0,0.6)'; ctx.shadowBlur=18; ctx.fillStyle='rgba(255,214,0,0.12)'; ctx.fillRect(px,py,width,CELL); ctx.restore();
  const grad=ctx.createLinearGradient(px,py,px,py+CELL);
  grad.addColorStop(0,'rgba(255,214,0,0.22)'); grad.addColorStop(1,'rgba(255,214,0,0.06)');
  ctx.fillStyle=grad; ctx.fillRect(px,py,width,CELL);
}

function drawPiece(x,y,color,edge){
  const {px,py}=toPx(x,y);
  ctx.fillStyle=color; ctx.fillRect(px+2,py+2,CELL-4,CELL-4);
  const g=ctx.createLinearGradient(px,py,px,py+CELL);
  g.addColorStop(0,'rgba(255,255,255,0.15)'); g.addColorStop(1,'rgba(0,0,0,0.15)');
  ctx.fillStyle=g; ctx.fillRect(px+2,py+2,CELL-4,CELL-4);
  ctx.strokeStyle=edge; ctx.lineWidth=1.5; crispLineRect(px+2,py+2,CELL-4,CELL-4);
}

function drawAllPieces(oMap){
  for(const s of cells){
    const {x,y}=parseKey(s);
    const v=oMap.get(key(x,y))||0;
    if(v===2) drawPiece(x,y,getCss('--blue'), getCss('--blue-edge'));
    else if(v===3) drawPiece(x,y,getCss('--red'), getCss('--red-edge'));
    else if(v===4) drawPiece(x,y,getCss('--green'), getCss('--green-edge'));
  }
}

function drawGhost(x,y){
  const topY=getTopY(); if(topY===-1) return;
  ctx.save(); ctx.globalAlpha=GHOST_ALPHA;
  if(current==='Left'){
    if(y===topY && isEmpty(x,y) && isEmpty(x,y+1)){
      const a=toPx(x,y), b=toPx(x,y+1);
      ctx.fillStyle=getCss('--ghost'); ctx.fillRect(a.px+2,a.py+2,CELL-4,CELL-4); ctx.fillRect(b.px+2,b.py+2,CELL-4,CELL-4);
      ctx.globalAlpha=1; ctx.strokeStyle=getCss('--blue-edge'); ctx.lineWidth=2; crispLineRect(a.px+2,a.py+2,CELL-4,CELL-4); crispLineRect(b.px+2,b.py+2,CELL-4,CELL-4);
    }
  }else{
    if(y===topY && isEmpty(x,y) && isEmpty(x+1,y)){
      const a=toPx(x,y), b=toPx(x+1,y);
      ctx.fillStyle=getCss('--ghost'); ctx.fillRect(a.px+2,a.py+2,CELL-4,CELL-4); ctx.fillRect(b.px+2,b.py+2,CELL-4,CELL-4);
      ctx.globalAlpha=1; ctx.strokeStyle=getCss('--red-edge'); ctx.lineWidth=2; crispLineRect(a.px+2,a.py+2,CELL-4,CELL-4); crispLineRect(b.px+2,b.py+2,CELL-4,CELL-4);
    }
  }
  ctx.restore();
}

function renderBase(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for(const s of cells){ const {x,y}=parseKey(s); drawTileBackground(x,y); }
  drawSubsetGrid();
}

function render(){
  if(anim) return;
  renderBase();
  drawTopRowGlow();
  drawAllPieces(occ);
  if(mode === 'play' && !builderToggle.checked && hoverCell) drawGhost(hoverCell.x, hoverCell.y);
  leftBtn.classList.toggle('active', current === 'Left' && mode === 'play');
  rightBtn.classList.toggle('active', current === 'Right' && mode === 'play');
  exploreBtn.disabled = mode !== 'explore';
  repeatsLabel.style.display = mode === 'explore' ? 'flex' : 'none';
}

// Interaction
canvas.addEventListener('mousemove', e=>{
  if(mode === 'play'){ const p = eventToCell(e); hoverCell = p; render(); }
});
canvas.addEventListener('mouseleave', ()=>{ if(mode === 'play') { hoverCell=null; render(); } });
canvas.addEventListener('click', e=>{
  if(mode === 'play'){ const p = eventToCell(e); if(!p) return; if(builderToggle.checked){ toggleCell(p.x,p.y); return; } placeMove(p.x,p.y); }
});

function eventToCell(e){
  const rect=canvas.getBoundingClientRect();
  const xpx=e.clientX-rect.left-PAD, ypx=e.clientY-rect.top-PAD;
  const gx=Math.floor(xpx/CELL)+bounds.minX, gy=Math.floor(ypx/CELL)+bounds.minY;
  if(!cells.has(key(gx,gy))) return null;
  return {x:gx,y:gy};
}

// Mode handling
modeSelect.onchange = () => {
  mode = modeSelect.value;
  modeDisplay.textContent = mode === 'play' ? 'Play (Alternating)' : 'Explore (Repeated Sims)';
  current = 'Left';
  if(mode === 'play'){ leftBtn.disabled = false; rightBtn.disabled = false; canvas.style.cursor = 'default'; }
  else { leftBtn.disabled = true; rightBtn.disabled = true; canvas.style.cursor = 'not-allowed'; }
  updateHUD(); render();
};

// Moves (Play: auto-alternate on success)
function pushUndo(){
  undoStack.push({occ:new Map(occ), current, cells:new Set(cells), mode, allSmall: allSmallToggle.checked });
  if(undoStack.length>200) undoStack.shift();
  redoStack.length=0;
}
function undo(){ if(!undoStack.length) return;
  const s=undoStack.pop(); redoStack.push({occ:new Map(occ), current, cells:new Set(cells), mode, allSmall: allSmallToggle.checked });
  occ=s.occ; current=s.current; cells=s.cells; mode=s.mode; allSmallToggle.checked=s.allSmall; modeSelect.value=mode; modeDisplay.textContent = mode === 'play' ? 'Play (Alternating)' : 'Explore (Repeated Sims)';
  computeBounds(); render(); updateHUD(); log('Undo');
}
function redo(){ if(!redoStack.length) return;
  const s=redoStack.pop(); undoStack.push({occ:new Map(occ), current, cells:new Set(cells), mode, allSmall: allSmallToggle.checked });
  occ=s.occ; current=s.current; cells=s.cells; mode=s.mode; allSmallToggle.checked=s.allSmall; modeSelect.value=mode; modeDisplay.textContent = mode === 'play' ? 'Play (Alternating)' : 'Explore (Repeated Sims)';
  computeBounds(); render(); updateHUD(); log('Redo');
}

function updateHUD(){
  modeDisplay.textContent = mode === 'play' ? 'Play (Alternating)' : 'Explore (Repeated Sims)';
  turnEl.textContent=current;
  const topY=getTopY(); topYEl.textContent=topY;
  movesAvailEl.textContent = legalMoves(current).length || (allSmallToggle.checked && legalAllSmallPlaceLocal(occ) ? 1 : 0);
}

function animatePlace(cellsPlaced, color, edge, done){
  const t0=performance.now(), D=120;
  function frame(t){
    const k=Math.min(1,(t-t0)/D);
    renderBase(); drawTopRowGlow(); drawAllPieces(occ);
    for(const {x,y} of cellsPlaced){
      const {px,py}=toPx(x,y); const inset=(1-k)*(CELL/2-2);
      ctx.fillStyle=color; ctx.fillRect(px+2+inset,py+2+inset,CELL-4-2*inset,CELL-4-2*inset);
      ctx.strokeStyle=edge; ctx.lineWidth=1.5; crispLineRect(px+2+inset,py+2+inset,CELL-4-2*inset,CELL-4-2*inset);
    }
    if(hoverCell && mode === 'play') drawGhost(hoverCell.x,hoverCell.y);
    if(k<1) anim=requestAnimationFrame(frame); else { anim=null; done&&done(); }
  }
  anim=requestAnimationFrame(frame);
}

function placeMove(x,y){ // Auto-alternate BEFORE animation
  if(mode !== 'play') return;
  const topY=getTopY(); if(topY===-1) return;
  const avail=legalMoves(current);
  const isDominoAvail = avail.length>0;
  
  if(current==='Left' && y===topY && isEmpty(x,y) && isEmpty(x,y+1)){
    pushUndo();
    occ.set(key(x,y),2); occ.set(key(x,y+1),2);
    log(`${current} places vertical at (${x},${y})`);
    const wasLeft = 'Left';
    current = 'Right'; // Switch IMMEDIATELY
    updateHUD(); render(); // Show new player RIGHT NOW
    animatePlace([{x,y},{x,y:y+1}], getCss('--blue'), getCss('--blue-edge'), ()=>{ 
      render(); 
    });
    return;
  }
  
  if(current==='Right' && y===topY && isEmpty(x,y) && isEmpty(x+1,y)){
    pushUndo();
    occ.set(key(x,y),3); occ.set(key(x+1,y),3);
    log(`${current} places horizontal at (${x},${y})`);
    const wasRight = 'Right';
    current = 'Left'; // Switch IMMEDIATELY
    updateHUD(); render(); // Show new player RIGHT NOW
    animatePlace([{x,y},{x:x+1,y}], getCss('--red'), getCss('--red-edge'), ()=>{ 
      render(); 
    });
    return;
  }
  
  if(!isDominoAvail && allSmallToggle.checked){
    const g=legalAllSmallPlaceLocal(occ);
    if(g && g.x===x && g.y===y){
      pushUndo(); occ.set(key(x,y),4);
      log(`${current} places 1x1 at (${x},${y})`);
      const wasPlayer = current;
      current = current === 'Left' ? 'Right' : 'Left'; // Switch IMMEDIATELY
      updateHUD(); render(); // Show new player RIGHT NOW
      animatePlace([{x,y}], getCss('--green'), getCss('--green-edge'), ()=>{ 
        render(); 
      });
      return;
    }
  }
}


// Explore: Repeated simulations
function cloneState(){
  return { occ: new Map(occ), current, cells: new Set(cells), allSmall: allSmallToggle.checked };
}

function singlePlayout(){
  const startState = cloneState();
  let state = cloneState();
  let simCurrent = startState.current;
  let passCount = 0;
  let movesLog = []; // Brief log for stats

  while(passCount < 2){
    const topY = getTopYLocal(state.occ);
    if(topY === -1){ movesLog.push('Terminal - no top row'); break; }

    const moves = legalMovesForSim(simCurrent, state);
    if(moves.length === 0){
      if(allSmallToggle.checked){
        const g = legalAllSmallPlaceLocal(state.occ);
        if(g){
          state.occ.set(key(g.x, g.y), 4);
          movesLog.push(`${simCurrent} places 1x1 at (${g.x},${g.y})`);
          passCount = 0;
          simCurrent = simCurrent === 'Left' ? 'Right' : 'Left';
          continue;
        }
      }
      movesLog.push(`${simCurrent} pass`);
      passCount++;
      simCurrent = simCurrent === 'Left' ? 'Right' : 'Left';
      continue;
    }

    const move = moves[Math.floor(Math.random() * moves.length)];
    if(move.kind === 'V'){
      state.occ.set(key(move.x, move.y), 2);
      state.occ.set(key(move.x, move.y+1), 2);
      movesLog.push(`${simCurrent} V at (${move.x},${move.y})`);
    } else if(move.kind === 'H'){
      state.occ.set(key(move.x, move.y), 3);
      state.occ.set(key(move.x+1, move.y), 3);
      movesLog.push(`${simCurrent} H at (${move.x},${move.y})`);
    }
    passCount = 0;
    simCurrent = simCurrent === 'Left' ? 'Right' : 'Left';
  }

  // Outcome: Last mover wins (simCurrent is next, so opponent won)
  const winner = simCurrent === 'Left' ? 'Right' : 'Left'; // Opponent of would-be next
  const remainingEmpties = cells.size - [...state.occ.values()].filter(v => v > 0).length;
  return { winner, empties: remainingEmpties, log: movesLog };
}

function runExplore(){
  if(mode !== 'explore') return;
  const repeats = Number(repeatsInput.value) || 1;
  let leftWins = 0, rightWins = 0, totalEmpties = 0;
  log(`Explore: Running ${repeats} repeated simulations...`);

  for(let i = 0; i < repeats; i++){
    const result = singlePlayout();
    if(result.winner === 'Left') leftWins++;
    else rightWins++;
    totalEmpties += result.empties;
    if(repeats === 1) log(`Sim ${i+1}: ${result.log.join('; ')} → ${result.winner} wins (${result.empties} empties)`);
  }

  if(repeats > 1){
    const leftRate = ((leftWins / repeats) * 100).toFixed(1);
    const rightRate = ((rightWins / repeats) * 100).toFixed(1);
    const avgEmpties = (totalEmpties / repeats).toFixed(1);
    log(`Explore stats (${repeats} sims): Left win rate ${leftRate}%, Right ${rightRate}%, Avg empties ${avgEmpties}`);
  }

  // Restore original (no change from sims)
  render(); updateHUD();
}

function legalMovesForSim(side, state){
  const topY = getTopYLocal(state.occ);
  const moves = [];
  if(topY === -1) return moves;
  if(side === 'Left'){
    for(const s of state.cells){ const {x,y} = parseKey(s); if(y !== topY) continue; if(isEmptyLocal(state.occ, x, y) && isEmptyLocal(state.occ, x, y+1)) moves.push({kind:'V', x, y}); }
  } else {
    for(const s of state.cells){ const {x,y} = parseKey(s); if(y !== topY) continue; if(isEmptyLocal(state.occ, x, y) && isEmptyLocal(state.occ, x+1, y)) moves.push({kind:'H', x, y}); }
  }
  return moves;
}

// Builder
function toggleCell(x,y){
  const k=key(x,y);
  if(!cells.has(k)){
    pushUndo(); cells.add(k); occ.set(k,0);
    if(!isConnected()){ cells.delete(k); occ.delete(k); log('Adding cell would disconnect? Rejected.'); }
    else log(`Add cell ${k}`);
  }else{
    pushUndo(); const v=occ.get(k)||0; cells.delete(k); occ.delete(k);
    if(cells.size>0 && !isConnected()){ cells.add(k); occ.set(k,v); log('Removal disconnects board. Rejected.'); }
    else log(`Remove cell ${k}`);
  }
  computeBounds(); render(); updateHUD();
}

function isConnected(){
  if(cells.size===0) return true;
  const arr=[...cells]; const s=parseKey(arr[0]);
  const q=[s]; const seen=new Set([key(s.x,s.y)]);
  while(q.length){
    const {x,y}=q.shift();
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy, kk=key(nx,ny);
      if(cells.has(kk) && !seen.has(kk)){ seen.add(kk); q.push({x:nx,y:ny}); }
    }
  }
  return seen.size===cells.size;
}

// Generator
function genPoly(n=16){
  pushUndo(); cells.clear(); occ.clear();
  let frontier=[{x:0,y:0}]; cells.add(key(0,0));
  while(cells.size<n){
    const base=frontier[Math.floor(Math.random()*frontier.length)];
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    const [dx,dy]=dirs[Math.floor(Math.random()*dirs.length)];
    const nx=base.x+dx, ny=base.y+dy, kk=key(nx,ny);
    if(!cells.has(kk)){ cells.add(kk); frontier.push({x:nx,y:ny}); }
  }
  for(const s of cells) occ.set(s,0);
  normalizeOrigin(); computeBounds(); render(); updateHUD(); log(`Generated polyomino of size ${n}`);
}
function normalizeOrigin(){
  let minX=Infinity,minY=Infinity;
  for(const s of cells){ const {x,y}=parseKey(s); minX=Math.min(minX,x); minY=Math.min(minY,y); }
  if(minX===0 && minY===0) return;
  const newCells=new Set(); const newOcc=new Map();
  for(const s of cells){ const {x,y}=parseKey(s); newCells.add(key(x-minX,y-minY)); }
  for(const [kk,v] of occ){ const {x,y}=parseKey(kk); newOcc.set(key(x-minX,y-minY), v); }
  cells=newCells; occ=newOcc;
}

// IO
function exportState(){
  const obj={ cells:[...cells].map(parseKey), occ:[...occ].map(([kk,v])=>({cell:parseKey(kk),v})), current, mode, allSmall: allSmallToggle.checked };
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='mosaic_mayhem.json'; a.click(); URL.revokeObjectURL(url);
}
function importState(file){
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const obj=JSON.parse(fr.result);
      pushUndo();
      cells=new Set(obj.cells.map(({x,y})=>key(x,y)));
      occ=new Map(obj.occ.map(({cell,v})=>[key(cell.x,cell.y),v]));
      current=obj.current||'Left'; mode=obj.mode||'play'; allSmallToggle.checked=!!obj.allSmall; modeSelect.value=mode;
      computeBounds(); render(); updateHUD(); log('Imported state');
    }catch(e){ log('Import failed: '+e.message); }
  };
  fr.readAsText(file);
}

// Reset
function reset(){
  const randSize = Math.floor(Math.random() * 9) + 12;
  genPoly(randSize);
  current = 'Left';
  mode = 'play'; modeSelect.value = 'play';
  updateHUD();
  render();
  log(`Reset with random board of size ${randSize}`);
}

// CGT (unchanged)
function cloneOcc(o){ return new Map(o); }
function stateKey(o){
  const arr=[];
  for(const s of cells){ const v=o.get(s)||0; arr.push([s,v]); }
  arr.sort((a,b)=> a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return JSON.stringify(arr);
}

function enumerateLeftOptions(o){
  const topY=getTopYLocal(o); if(topY===-1) return [];
  const opts=[];
  for(const s of cells){ const {x,y}=parseKey(s);
    if(y!==topY) continue;
    if(isEmptyLocal(o,x,y) && isEmptyLocal(o,x,y+1)){
      const no=cloneOcc(o); no.set(key(x,y),2); no.set(key(x,y+1),2); opts.push(no);
    }
  }
  if(opts.length===0 && allSmallToggle.checked){
    const g=legalAllSmallPlaceLocal(o);
    if(g){ const no=cloneOcc(o); no.set(key(g.x,g.y),4); opts.push(no); }
  }
  return opts;
}

function enumerateRightOptions(o){
  const topY=getTopYLocal(o); if(topY===-1) return [];
  const opts=[];
  for(const s of cells){ const {x,y}=parseKey(s);
    if(y!==topY) continue;
    if(isEmptyLocal(o,x,y) && isEmptyLocal(o,x+1,y)){
      const no=cloneOcc(o); no.set(key(x,y),3); no.set(key(x+1,y),3); opts.push(no);
    }
  }
  if(opts.length===0 && allSmallToggle.checked){
    const g=legalAllSmallPlaceLocal(o);
    if(g){ const no=cloneOcc(o); no.set(key(g.x,g.y),4); opts.push(no); }
  }
  return opts;
}

function enumerateLeftOptionsWithoutGreen(o){
  const topY=getTopYLocal(o); if(topY===-1) return [];
  const opts=[];
  for(const s of cells){ const {x,y}=parseKey(s); if(y!==topY) continue;
    if(isEmptyLocal(o,x,y) && isEmptyLocal(o,x,y+1)){
      const no=cloneOcc(o); no.set(key(x,y),2); no.set(key(x,y+1),2); opts.push(no);
    }
  }
  return opts;
}

function enumerateRightOptionsWithoutGreen(o){
  const topY=getTopYLocal(o); if(topY===-1) return [];
  const opts=[];
  for(const s of cells){ const {x,y}=parseKey(s); if(y!==topY) continue;
    if(isEmptyLocal(o,x,y) && isEmptyLocal(o,x+1,y)){
      const no=cloneOcc(o); no.set(key(x,y),3); no.set(key(x+1,y),3); opts.push(no);
    }
  }
  return opts;
}

function isTerminal(o){
  const L = enumerateLeftOptionsWithoutGreen(o);
  const R = enumerateRightOptionsWithoutGreen(o);
  if(L.length===0 && R.length===0){
    if(!allSmallToggle.checked) return true;
    const g = legalAllSmallPlaceLocal(o);
    return !g;
  }
  return false;
}

function mex(set) {
  let i=0; while(set.has(i)) i++; return i;
}

function computeGrundy(o, memo) {
  const k = stateKey(o);
  if (memo.has(k)) return memo.get(k).grundy;
  if (isTerminal(o)) {
    const g = 0;
    if(!memo.has(k)) memo.set(k, {grundy: g});
    else memo.get(k).grundy = g;
    return g;
  }
  const Lopts = enumerateLeftOptions(o);
  const Ropts = enumerateRightOptions(o);
  const allOpts = [...Lopts, ...Ropts];
  const gs = new Set();
  for (const opt of allOpts) {
    gs.add(computeGrundy(opt, memo));
  }
  const g = mex(gs);
  if(!memo.has(k)) memo.set(k, {grundy: g});
  else memo.get(k).grundy = g;
  return g;
}

function computeBracket(o, depth, memo) {
  const k = stateKey(o);
  if (!memo.has(k)) {
    memo.set(k, {left: [], right: [], bracket: '', grundy: -1, approx: false});
  }
  const node = memo.get(k);
  if (depth <= 0) {
    node.approx = true;
    node.bracket = '{…|…}';
    return node;
  }
  if (isTerminal(o)) {
    node.bracket = '0';
    node.grundy = 0;
    return node;
  }

  const Lopts = enumerateLeftOptions(o);
  const Ropts = enumerateRightOptions(o);
  const Lnodes = Lopts.map(no => computeBracket(no, depth-1, memo));
  const Rnodes = Ropts.map(no => computeBracket(no, depth-1, memo));

  const uniqueByBracket = (arr) => [...new Map(arr.map(n => [n.bracket, n])).values()];
  const Lu = uniqueByBracket(Lnodes);
  const Ru = uniqueByBracket(Rnodes);

  const ltxt = Lu.length ? Lu.map(n => n.bracket).join(', ') : '';
  const rtxt = Ru.length ? Ru.map(n => n.bracket).join(', ') : '';
  let bracket = `{${ltxt} | ${rtxt}}`;

  bracket = heuristicSimplifyEnhanced(Lu, Ru, bracket);

  node.left = Lu;
  node.right = Ru;
  node.bracket = bracket;
  node.grundy = computeGrundy(o, memo);

  return node;
}

function heuristicSimplifyEnhanced(Lu, Ru, fallback) {
  const only = (arr, s) => arr.length === 1 && arr[0].bracket === s;
  const empty = arr => arr.length === 0;

  if (empty(Lu) && empty(Ru)) return '0';

  if (only(Lu, '0') && empty(Ru)) return '1';
  if (empty(Lu) && only(Ru, '0')) return '-1';

  if (only(Lu, '0') && only(Ru, '0')) return '*';

  if (only(Lu, '0') && only(Ru, '1')) return '1/2';
  if (only(Lu, '1') && only(Ru, '0')) return '-1/2';

  if (only(Lu, '1') && only(Ru, '-1')) return '±1';

  if (only(Lu, '0') && only(Ru, '*')) return '↑';
  if (only(Lu, '*') && only(Ru, '0')) return '↓';

  if (only(Lu, '↑') && only(Ru, '0')) return '1/2';

  return fallback;
}

function stringifyBracketTree(node, indent=0, maxLines=300, linesObj={n:0}) {
  const pad = '  '.repeat(indent);
  if (linesObj.n > maxLines) return pad + '...';
  let out = `${pad}${node.bracket}`;
  if (cgtEvalEl.checked) out += ` (G=${node.grundy})`;
  out += '\n'; linesObj.n++;
  const showKids = (kids, lbl) => {
    if (!kids.length) return;
    out += `${pad}${lbl}:\n`;
    for (const k of kids) {
      out += stringifyBracketTree(k, indent+1, maxLines, linesObj);
      if (linesObj.n > maxLines) { out += `${pad}...\n`; break; }
    }
  };
  showKids(node.left, 'Left');
  showKids(node.right, 'Right');
  return out;
}

// Controls
leftBtn.onclick = () => { if(mode === 'play') { current = 'Left'; updateHUD(); render(); } };
rightBtn.onclick = () => { if(mode === 'play') { current = 'Right'; updateHUD(); render(); } };
exploreBtn.onclick = runExplore;
undoBtn.onclick=undo; redoBtn.onclick=redo; resetBtn.onclick=reset;
genBtn.onclick=()=>genPoly(Math.max(1, Math.min(400, Number(polySizeInput.value)||16)));
exportBtn.onclick=exportState; importBtn.onclick=()=>fileInput.click();
fileInput.onchange=e=>{ const f=e.target.files[0]; if(f) importState(f); };
builderToggle.onchange=()=>render();
allSmallToggle.onchange=()=>updateHUD();
zoomEl?.addEventListener('input', ()=>{ CELL=Number(zoomEl.value); computeBounds(); render(); updateHUD(); });
showGridEl?.addEventListener('change', render);
themeToggle?.addEventListener('change', ()=>{ document.documentElement.classList.toggle('light', themeToggle.checked); render(); });

cgtComputeBtn.onclick = ()=>{
  const depth = Math.max(1, Math.min(8, Number(cgtDepthEl.value)||4));
  const memo = new Map();
  const node = computeBracket(occ, depth, memo);
  const text = stringifyBracketTree(node);
  cgtOut.textContent = text;
  log(`CGT computed to depth ${depth}, Grundy: ${node.grundy}`);
};
cgtCopyBtn.onclick = ()=>{
  navigator.clipboard.writeText(cgtOut.textContent||'');
  log('CGT output copied');
};
cgtExportBtn.onclick = ()=>{
  const depth = Math.max(1, Math.min(8, Number(cgtDepthEl.value)||4));
  const memo = new Map();
  const node = computeBracket(occ, depth, memo);
  const payload = { depth, bracket: node.bracket, grundy: node.grundy, left: node.left.map(n => n.bracket), right: node.right.map(n => n.bracket) };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='mosaic_cgt.json'; a.click(); URL.revokeObjectURL(url);
};

// Init
reset();
