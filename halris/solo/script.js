import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJ4Ky4vXVR3nC2UPJWcVZ-tphs2oVu1ig",
    authDomain: "tetris-online-f63af.firebaseapp.com",
    databaseURL: "https://tetris-online-f63af-default-rtdb.firebaseio.com",
    projectId: "tetris-online-f63af"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const roomId = "solo-room-data";

const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

const ROWS = 20, COLS = 10, SIZE = 24;
const O_SPIN_THRESHOLD = 10; 

const COLORS = { i:'#00eeee', o:'#eeee00', t:'#6730bf', s:'#00ee00', z:'#ff4d4d', j:'#006eff', l:'#eeaa00', o_huge: '#eeee00' };
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};

const SRS_KICKS = {
    "0->1": [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]], "1->0": [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
    "1->2": [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]], "2->1": [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
    "2->3": [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]], "3->2": [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
    "3->0": [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]], "0->3": [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]]
};

let board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let current = null, gameOver = false, holdPiece = null, canHold = true, bag = [], nextQueue = [];
let gameInterval = null, requestID = null, rotationState = 0;
let rotationTimestamps = [], score = 0, totalLines = 0, comboCount = -1, isBackToBack = false;

// スコア表示更新
function addScore(pts) { 
    score += pts; 
    const scoreEl = document.getElementById('score-display');
    if(scoreEl) scoreEl.innerText = score; 
}

function sync() {
    if(gameOver || !current) return;
    set(ref(db, `games/${roomId}/player`), { board, pos: current.pos, type: current.type, shape: current.shape });
}

function refillBag() {
    let p = ['i','o','t','s','z','j','l'];
    for(let i=p.length-1; i>0; i--) { let j=Math.floor(Math.random()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
    bag = [...p];
}

function updateNextQueue() { while(nextQueue.length < 5) { if(bag.length === 0) refillBag(); nextQueue.push(bag.pop()); } }

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
    const oldS = JSON.parse(JSON.stringify(current.shape)), oldP = {...current.pos}, oldRS = rotationState;
    if (dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length - 1 - i]));
    rotationState = (rotationState + dir + 4) % 4;

    let success = false;
    let kicks = SRS_KICKS[`${oldRS}->${rotationState}`] || [[0,0]];
    for (let k of kicks) {
        current.pos.x = oldP.x + k[0]; current.pos.y = oldP.y - k[1];
        if (!collide(board, current)) { success = true; break; }
    }
    if (!success) { current.shape = oldS; current.pos = oldP; rotationState = oldRS; } 
    else { rotationTimestamps.push(Date.now()); sync(); }
}

function calculateScore(cleared, isSpin) {
    let base = 0, isDiff = false;
    if (isSpin) {
        isDiff = true;
        if (cleared === 0) base = 100;
        else if (cleared === 1) base = 800;
        else if (cleared === 2) base = 1200;
        else if (cleared === 3) base = 1600; 
    } else {
        if (cleared === 1) base = 100;
        else if (cleared === 2) base = 300;
        else if (cleared === 3) base = 500;
        else if (cleared === 4) { base = 800; isDiff = true; }
    }
    if (cleared > 0) {
        if (isDiff) { if (isBackToBack) base *= 1.5; isBackToBack = true; }
        else isBackToBack = false;
        comboCount++; base += comboCount * 50;
    } else comboCount = -1;
    return Math.floor(base);
}

function lockPiece() {
    if (!current || gameOver) return;
    current.shape.forEach((r,y) => r.forEach((v,x) => {
        if (v) { let ny = current.pos.y + y, nx = current.pos.x + x; if (ny >= 0) board[ny][nx] = COLORS[current.type]; }
    }));

    let nextB = board.filter(r => r.some(c => c === null));
    let cleared = ROWS - nextB.length;
    
    // スコア加算
    addScore(calculateScore(cleared, rotationTimestamps.length > 0));
    totalLines += cleared;
    document.getElementById('line-count').innerText = totalLines;
    
    while (nextB.length < ROWS) nextB.unshift(Array(COLS).fill(null));
    board = nextB;

    // ★ パフェ（パーフェクトクリア）判定 ★
    const isAllClear = board.every(row => row.every(cell => cell === null));
    if (isAllClear && cleared > 0) {
        addScore(3500); 
        console.log("PERFECT CLEAR!");
    }

    rotationTimestamps = []; spawn();
}

function spawn(type = null) {
    let t = type || nextQueue.shift(); updateNextQueue();
    current = { pos:{x:3, y:0}, shape:SHAPES[t], type:t };
    if (collide(board, current)) showGameOver();
    canHold = true; drawNext(); drawHold(); sync();
}

function drop() {
    if(gameOver || !current) return;
    current.pos.y++;
    if (collide(board, current)) { current.pos.y--; lockPiece(); }
    else { addScore(1); sync(); }
}

function hardDrop() {
    if(gameOver || !current) return;
    let d = 0;
    while(!collide(board, {pos:{x:current.pos.x, y:current.pos.y+1}, shape:current.shape})) { current.pos.y++; d++; }
    addScore(d * 2); lockPiece();
}

function hold() {
    if (!canHold || gameOver) return;
    let t = holdPiece; holdPiece = current.type;
    if (t) spawn(t); else spawn();
    canHold = false; drawHold();
}

function drawBlock(c, x, y, color, op = 1, sz = SIZE) { c.globalAlpha = op; c.fillStyle = color; c.fillRect(x*sz, y*sz, sz-1, sz-1); c.globalAlpha = 1; }

function update() {
    if (gameOver) return;
    ctx.fillStyle = '#2e2e2e'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=>{ if(c) drawBlock(ctx, x, y, c); }));
    if(current) current.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(ctx, current.pos.x+x, current.pos.y+y, COLORS[current.type]); }));
    requestID = requestAnimationFrame(update);
}

function showGameOver() { gameOver = true; document.getElementById('game-over-screen').style.display = 'flex'; }

function resetGame() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    gameOver = false; score = 0; totalLines = 0; comboCount = -1; isBackToBack = false;
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    document.getElementById('score-display').innerText = "0";
    document.getElementById('line-count').innerText = "0";
    refillBag(); updateNextQueue(); spawn(); update();
    if(gameInterval) clearInterval(gameInterval); gameInterval = setInterval(drop, 1000);
}

document.getElementById('play').onclick = resetGame;
document.getElementById('restart-button').onclick = resetGame;

window.addEventListener('keydown', e => {
    if(gameOver || !current) return;
    const k = e.key.toLowerCase();
    if(k === 'arrowleft') { current.pos.x--; if(collide(board, current)) current.pos.x++; }
    if(k === 'arrowright') { current.pos.x++; if(collide(board, current)) current.pos.x--; }
    if(k === 'arrowdown') drop();
    if(k === 'arrowup' || k === 'x') rotate(1);
    if(k === 'z') rotate(-1);
    if(e.key === ' ') hardDrop();
    if(k === 'c') hold();
});

const bind = (id, fn) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('touchstart', (e)=>{e.preventDefault(); fn();});
};
bind('ctrl-left', () => { current.pos.x--; if(collide(board,current)) current.pos.x++; });
bind('ctrl-right', () => { current.pos.x++; if(collide(board,current)) current.pos.x--; });
bind('ctrl-down', drop);
bind('ctrl-up', hardDrop);
bind('ctrl-rot-r', () => rotate(1));
bind('ctrl-rot-l', () => rotate(-1));
bind('ctrl-hold', hold);

function drawHold() { hCtx.clearRect(0,0,60,60); if(holdPiece) SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(hCtx, x, y, COLORS[holdPiece], 1, 15); })); }
function drawNext() { nCtx.clearRect(0,0,60,180); nextQueue.slice(0,4).forEach((t,i)=>SHAPES[t].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(nCtx, x, y+(i*3), COLORS[t], 1, 15); }))); }
