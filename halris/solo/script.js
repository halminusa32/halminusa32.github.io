import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJ4Ky4vXVR3nC2UPJWcVZ-tphs2oVu1ig",
    authDomain: "tetris-online-f63af.firebaseapp.com",
    databaseURL: "https://tetris-online-f63af-default-rtdb.firebaseio.com",
    projectId: "tetris-online-f63af",
    storageBucket: "tetris-online-f63af.firebasestorage.app",
    messagingSenderId: "16754605296",
    appId: "1:16754605296:web:fbf87f61787b4c5c009635"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const roomId = "solo-room-data";

const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

const ROWS = 20, COLS = 10, SIZE = 24;
// COLORSに進化後の黄色いI(i_evolved)を追加
const COLORS = { 
    i:'#00eeee', o:'#eeee00', t:'#aa00ee', s:'#00ee00', z:'#ee0000', j:'#0000ee', l:'#eeaa00',
    i_evolved: '#eeee00' 
};
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};

let board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let current = null, gameOver = false, holdPiece = null, canHold = true, bag = [], nextQueue = [];
let lockTimer = null, gameInterval = null;
let lockResetCount = 0;
const LOCK_DELAY = 500;
const MAX_LOCK_RESETS = 15;

// O-Spin判定用
let rotationTimestamps = [];
const O_SPIN_THRESHOLD = 5; 
let score = 0;

function sync() {
    if(!current || gameOver) return;
    set(ref(db, `games/${roomId}/player`), { board, pos: current.pos, type: current.type, shape: current.shape });
}

function refillBag() {
    let p = ['i','o','t','s','z','j','l'];
    for(let i=p.length-1; i>0; i--) { let j=Math.floor(Math.random()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
    bag = [...p];
}

function updateNextQueue() {
    while(nextQueue.length < 5) { if(bag.length === 0) refillBag(); nextQueue.push(bag.pop()); }
}

function collide(b, p) {
    for (let y=0; y<p.shape.length; y++) {
        for (let x=0; x<p.shape[y].length; x++) {
            if (p.shape[y][x]) {
                let ny = p.pos.y + y, nx = p.pos.x + x;
                if (ny >= ROWS || nx < 0 || nx >= COLS || (ny >= 0 && b[ny][nx] !== null)) return true;
            }
        }
    }
    return false;
}

function rotate(dir = 1) {
    if (gameOver || !current) return;

    // 連打記録
    const now = Date.now();
    rotationTimestamps.push(now);
    while(rotationTimestamps.length > 0 && now - rotationTimestamps[0] > 1000) rotationTimestamps.shift();

    // 進化判定：Oミノの時に秒間5回以上回転
    if (current.type === 'o' && rotationTimestamps.length >= O_SPIN_THRESHOLD) {
        current.type = 'i_evolved';
        current.shape = JSON.parse(JSON.stringify(SHAPES['i'])); // ディープコピー
        canvas.style.filter = 'brightness(2) saturate(2)';
        setTimeout(() => { canvas.style.filter = 'none'; }, 150);
    }

    const prevShape = current.shape;
    const prevPos = { ...current.pos };

    // 回転処理
    if (dir === 1) {
        current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    } else {
        current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length - 1 - i]));
    }

    const kicks = [[0,0], [-1,0], [1,0], [0,1], [-1,1], [1,1], [0,2], [-1,2], [1,2], [0,-1], [-1,-1], [1,-1]];
    let success = false;
    for (let k of kicks) {
        current.pos.x = prevPos.x + k[0];
        current.pos.y = prevPos.y + k[1];
        if (!collide(board, current)) { success = true; break; }
    }

    if (!success) { current.shape = prevShape; current.pos = prevPos; }
    else { handleMoveReset(); sync(); }
}

function handleMoveReset() {
    if (!current) return;
    const isGrounded = collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape });
    if (isGrounded) { if (lockResetCount < MAX_LOCK_RESETS) { lockResetCount++; resetLockTimer(); } }
    else { resetLockTimer(); }
}

function resetLockTimer() { if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } }

function lockPiece() {
    if (!current || gameOver) return;
    if (!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) {
        lockTimer = null; return;
    }

    current.shape.forEach((r,y) => r.forEach((v,x) => {
        if (v) {
            let ny = current.pos.y + y;
            let nx = current.pos.x + x;
            if (ny >= 0 && ny < ROWS) board[ny][nx] = COLORS[current.type];
        }
    }));

    let nextB = board.filter(r => r.some(c => c === null));
    let linesCleared = ROWS - nextB.length;
    while (nextB.length < ROWS) nextB.unshift(Array(COLS).fill(null));
    board = nextB;
    score += linesCleared * 100;
    
    lockTimer = null;
    rotationTimestamps = [];
    spawn();
}

function spawn(type = null) {
    resetLockTimer();
    lockResetCount = 0;
    let t = type || nextQueue.shift();
    updateNextQueue();
    let startX = (t === 'o') ? 4 : 3;
    current = { pos:{x: startX, y: 0}, shape:SHAPES[t], type:t };
    canHold = true;
    drawNext(); drawHold();
    if (collide(board, current)) showGameOver();
    sync();
}

function drop() {
    if(gameOver || !current) return;
    current.pos.y++;
    if (collide(board, current)) { current.pos.y--; }
    else { resetLockTimer(); sync(); }
}

function hold() {
    if (!canHold || gameOver) return;
    let t = holdPiece === 'i_evolved' ? 'i' : holdPiece; // 進化版は通常Iとして保存
    holdPiece = current.type === 'i_evolved' ? 'i' : current.type;
    if (t) spawn(t); else spawn();
    canHold = false; drawHold();
}

function drawBlock(c, x, y, color, op = 1, sz = SIZE) {
    c.globalAlpha = op; c.fillStyle = color; c.fillRect(x * sz, y * sz, sz - 0.5, sz - 0.5); c.globalAlpha = 1;
}

function drawGhost() {
    if (!current) return;
    let g = { ...current.pos };
    while (!collide(board, { pos: { x: g.x, y: g.y + 1 }, shape: current.shape })) g.y++;
    current.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v && g.y+y >= 0) drawBlock(ctx, g.x+x, g.y+y, COLORS[current.type], 0.2); }));
}

function drawHold() {
    hCtx.clearRect(0,0,60,60);
    if (!holdPiece) return;
    const offX = (holdPiece === 'i' || holdPiece === 'o') ? 0.5 : 1;
    SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(hCtx, x+offX, y+1, COLORS[holdPiece], 1, 15); }));
}

function drawNext() {
    nCtx.clearRect(0,0,60,180);
    for(let i=0; i<4; i++) {
        let t = nextQueue[i];
        if(!t) continue;
        const offX = (t === 'i' || t === 'o') ? 0.5 : 1;
        SHAPES[t].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(nCtx, x+offX, y+1+(i*3), COLORS[t], 1, 15); }));
    }
}

function handleLocking() {
    if (!current || gameOver) return;
    const isGrounded = collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape });
    if (isGrounded) { if (!lockTimer) lockTimer = setTimeout(lockPiece, LOCK_DELAY); } 
    else { resetLockTimer(); }
}

function update() {
    handleLocking();
    ctx.fillStyle = '#151515'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=>{ if(c) drawBlock(ctx, x, y, c); }));
    if(current) { 
        drawGhost(); 
        current.shape.forEach((r,y)=>r.forEach((v,x)=>{ 
            if(v && current.pos.y+y >= 0) drawBlock(ctx, current.pos.x+x, current.pos.y+y, COLORS[current.type]); 
        })); 
    }
    if (!gameOver) requestAnimationFrame(update);
}

function showGameOver() {
    gameOver = true;
    if (gameInterval) clearInterval(gameInterval);
    board = board.map(row => row.map(() => '#ffffff'));
    document.getElementById('game-over-screen').style.display = 'flex';
}

function resetGame() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    gameOver = false; holdPiece = null; canHold = true; bag = []; nextQueue = [];
    score = 0; rotationTimestamps = [];
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    if (gameInterval) clearInterval(gameInterval);
    refillBag(); updateNextQueue(); spawn(); update();
    gameInterval = setInterval(drop, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('play').onclick = resetGame;
    document.getElementById('restart-button').onclick = resetGame;
});

document.addEventListener('keydown', e => {
    if(gameOver || !current) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') { current.pos.x--; if(collide(board,current)) current.pos.x++; else { handleMoveReset(); sync(); } }
    if (k === 'arrowright') { current.pos.x++; if(collide(board,current)) current.pos.x--; else { handleMoveReset(); sync(); } }
    if (k === 'arrowdown') drop();
    if (k === 'arrowup' || k === 'x') rotate(1);
    if (k === 'z') rotate(-1);
    if (k === ' ') { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) current.pos.y++; lockPiece(); }
    if (k === 'c' || k === 'shift') hold();
});

const touch = (id, fn) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('touchstart', (e) => { e.preventDefault(); if(!gameOver && current) fn(); }, {passive:false});
};
touch('ctrl-left', () => { current.pos.x--; if(collide(board,current)) current.pos.x++; else { handleMoveReset(); sync(); } });
touch('ctrl-right', () => { current.pos.x++; if(collide(board,current)) current.pos.x--; else { handleMoveReset(); sync(); } });
touch('ctrl-down', drop);
touch('ctrl-up', () => { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) current.pos.y++; lockPiece(); });
touch('ctrl-rot-r', () => rotate(1)); touch('ctrl-rot-l', () => rotate(-1)); touch('ctrl-hold', hold);
