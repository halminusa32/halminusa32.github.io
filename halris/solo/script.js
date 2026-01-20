// 冒頭に生存確認用のアラート（動いたら消してOK）
console.log("Solo script loaded");

const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

const ROWS = 20, COLS = 10, SIZE = 24;
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#aa00ee', s:'#00ee00', z:'#ee0000', j:'#0000ee', l:'#eeaa00' };
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};

let board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let current = null, score = 0, gameOver = false;
let holdPiece = null, canHold = true, bag = [], nextQueue = [];
let lockTimer = null;
const LOCK_DELAY = 500;

function drawBlock(c, x, y, color, op = 1, sz = SIZE) {
    c.globalAlpha = op; c.fillStyle = color; c.fillRect(x * sz, y * sz, sz - 0.5, sz - 0.5); c.globalAlpha = 1;
}

function refillBag() {
    let p = ['i','o','t','s','z','j','l'];
    for(let i=p.length-1; i>0; i--) { let j=Math.floor(Math.random()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
    bag = [...p];
}

function updateNextQueue() {
    while(nextQueue.length < 5) { if(bag.length === 0) refillBag(); nextQueue.push(bag.pop()); }
}

function spawn(type = null) {
    clearTimeout(lockTimer); lockTimer = null;
    let t = type || nextQueue.shift(); updateNextQueue();
    current = { pos:{x:3, y:0}, shape:SHAPES[t], type:t };
    canHold = true; drawNext(); drawHold();
    if (collide(board, current)) gameOver = true;
}

function collide(b, p) {
    for (let y=0; y<p.shape.length; y++) {
        for (let x=0; x<p.shape[y].length; x++) {
            if (p.shape[y][x]) {
                let ny = p.pos.y + y, nx = p.pos.x + x;
                if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS || b[ny][nx] !== null) return true;
            }
        }
    }
    return false;
}

function drop() {
    if(gameOver || !current) return;
    current.pos.y++;
    if (collide(board, current)) {
        current.pos.y--;
        if (!lockTimer) lockTimer = setTimeout(lockPiece, LOCK_DELAY);
        return;
    }
}

function lockPiece() {
    if (!current || gameOver) return;
    if (!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) {
        lockTimer = null; return;
    }
    current.shape.forEach((r,y) => r.forEach((v,x) => {
        if (v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type];
    }));
    let nb = board.filter(r => r.some(c => c === null));
    let cleared = ROWS - nb.length;
    while (nb.length < ROWS) nb.unshift(Array(COLS).fill(null));
    board = nb; 
    score += cleared * 100;
    document.getElementById('score').innerText = score;
    clearTimeout(lockTimer); lockTimer = null; spawn();
}

function hardDrop() { if(gameOver || !current) return; while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) current.pos.y++; lockPiece(); }

function rotate(dir) {
    const prev = current.shape;
    if(dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length-1-i]));
    if (collide(board, current)) current.shape = prev;
    else if(lockTimer){ clearTimeout(lockTimer); lockTimer=setTimeout(lockPiece, LOCK_DELAY); }
}

function hold() { if(!canHold || gameOver) return; let t = holdPiece; holdPiece = current.type; if(t) spawn(t); else spawn(); canHold = false; }

function drawNext() {
    nCtx.clearRect(0,0,60,180);
    for(let i=0; i<4; i++) SHAPES[nextQueue[i]].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(nCtx,x+0.5,y+0.5+(i*2.8),COLORS[nextQueue[i]],1,15); }));
}

function drawHold() {
    hCtx.clearRect(0,0,60,60);
    if(holdPiece) SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(hCtx,x+0.5,y+0.5,COLORS[holdPiece],1,15); }));
}

function drawGhost() {
    let g = { ...current.pos }; while(!collide(board,{pos:{x:g.x,y:g.y+1},shape:current.shape})) g.y++;
    current.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(ctx,g.x+x,g.y+y,COLORS[current.type],0.2); }));
}

function update() {
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=>{ if(c) drawBlock(ctx,x,y,c); }));
    if(current){ drawGhost(); current.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(ctx,current.pos.x+x,current.pos.y+y,COLORS[current.type]); })); }
    if(!gameOver) requestAnimationFrame(update);
}

document.addEventListener('keydown', e => {
    if(!current || gameOver) return;
    const k = e.key.toLowerCase();
    if(k === 'arrowleft'){ current.pos.x--; if(collide(board,current)) current.pos.x++; }
    if(k === 'arrowright'){ current.pos.x++; if(collide(board,current)) current.pos.x--; }
    if(k === 'arrowdown') drop();
    if(k === 'arrowup' || k === 'x') rotate(1);
    if(k === 'z') rotate(-1);
    if(k === ' ') hardDrop();
    if(k === 'c' || k === 'shift') hold();
});

const touch = (id, fn) => document.getElementById(id).addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, {passive:false});
touch('ctrl-left', () => { current.pos.x--; if(collide(board,current)) current.pos.x++; });
touch('ctrl-right', () => { current.pos.x++; if(collide(board,current)) current.pos.x--; });
touch('ctrl-down', drop); touch('ctrl-up', hardDrop); touch('ctrl-rot-r', () => rotate(1)); touch('ctrl-rot-l', () => rotate(-1)); touch('ctrl-hold', hold);

// --- 133行目以降をこれに書き換え ---

// 全てをリセットしてゲームを開始する関数
function init() {
    console.log("Game Init Start");
    
    // 1. 変数の初期化
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    score = 0;
    gameOver = false;
    holdPiece = null;
    canHold = true;
    bag = [];
    nextQueue = [];

    // 2. 最初のミノを準備
    refillBag();
    updateNextQueue();
    spawn();

    // 3. 描画ループを開始
    update();

    // 4. 自動落下タイマー（1秒ごと）
    // setIntervalの戻り値を保持しておくと管理が楽になります
    const gameInterval = setInterval(() => {
        if (!gameOver) {
            drop();
        } else {
            clearInterval(gameInterval);
            alert("GAME OVER! SCORE: " + score);
        }
    }, 1000);
}

// ブラウザが画面の準備を100%終えた瞬間に init() を呼び出す
window.onload = init;
