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
const roomId = "ai-battle-" + Math.random().toString(36).substring(7);

const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const eCanvas = document.getElementById('enemy-tetris'), eCtx = eCanvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

const ROWS = 20, COLS = 10, SIZE = 24;
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#aa00ee', s:'#00ee00', z:'#ee0000', j:'#0000ee', l:'#eeaa00' };
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};

let board, enemyBoard, current, gameOver, holdPiece, canHold, nextQueue;
let dropInterval, aiInterval, requestID, aiSpeed;
let playerGarbageBuffer = 0, aiGarbageBuffer = 0;

// --- 演出：ライン消去（ホワイトアウト） ---
async function clearLinesEffect(targetBoard) {
    let lines = [];
    targetBoard.forEach((row, y) => { if (row.every(cell => cell !== null && cell !== '#ffffff')) lines.push(y); });
    if (lines.length === 0) return 0;

    lines.forEach(y => targetBoard[y] = Array(COLS).fill('#ffffff')); // 白くする
    draw(); 
    await new Promise(r => setTimeout(r, 300)); // 0.3秒待機

    lines.forEach(y => {
        targetBoard.splice(y, 1);
        targetBoard.unshift(Array(COLS).fill(null));
    });
    return lines.length;
}

// --- お邪魔適用 ---
function applyGarbage(targetBoard, count) {
    for (let i = 0; i < count; i++) {
        targetBoard.shift();
        let row = Array(COLS).fill('#555');
        row[Math.floor(Math.random() * COLS)] = null;
        targetBoard.push(row);
    }
}

// --- AI：回転と設置の概念 ---
async function updateAI() {
    if (gameOver) return;
    const types = ['i','o','t','s','z','j','l'];
    const type = types[Math.floor(Math.random() * types.length)];
    let shape = SHAPES[type];
    
    // AIが回転を試行
    const rotations = Math.floor(Math.random() * 4);
    for(let i=0; i<rotations; i++) shape = shape[0].map((_, i) => shape.map(row => row[i]).reverse());

    // 一番低い場所を探す
    let heights = Array(COLS).fill(ROWS);
    for(let x=0; x<COLS; x++) {
        for(let y=0; y<ROWS; y++) { if(enemyBoard[y][x]) { heights[x] = y; break; } }
    }
    let bestX = 0, minH = 0;
    for(let x=0; x <= COLS - shape[0].length; x++) {
        let g = Math.max(...heights.slice(x, x + shape[0].length));
        if(g > minH) { minH = g; bestX = x; }
    }

    let y = 0;
    while(!collide(enemyBoard, {pos:{x:bestX, y:y+1}, shape})) y++;

    shape.forEach((r, sy) => r.forEach((v, sx) => {
        if (v && y+sy < ROWS) enemyBoard[y+sy][bestX+sx] = COLORS[type];
    }));

    const cleared = await clearLinesEffect(enemyBoard);
    if (cleared > 0) playerGarbageBuffer += (cleared === 4 ? 4 : cleared - 1 || 1);

    // AI設置後にお邪魔を適用
    applyGarbage(enemyBoard, aiGarbageBuffer);
    aiGarbageBuffer = 0;
    if (enemyBoard[0].some(c => c !== null)) showGameOver("YOU WIN!");
}

// --- プレイヤー：設置とお邪魔保留 ---
async function lockPiece() {
    if (!current || gameOver) return;
    current.shape.forEach((r,y) => r.forEach((v,x) => {
        if (v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type];
    }));

    const cleared = await clearLinesEffect(board);
    if (cleared > 0) aiGarbageBuffer += (cleared === 4 ? 4 : cleared - 1);

    // プレイヤー設置後にお邪魔を適用
    applyGarbage(board, playerGarbageBuffer);
    playerGarbageBuffer = 0;
    spawn();
}

function collide(b, p) {
    for (let y=0; y<p.shape.length; y++) {
        for (let x=0; x<p.shape[y].length; x++) {
            if (p.shape[y][x]) {
                let ny = p.pos.y + y, nx = p.pos.x + x;
                if (ny >= ROWS || nx < 0 || nx >= COLS || (ny >= 0 && b[ny][nx])) return true;
            }
        }
    }
    return false;
}

function spawn() {
    if(nextQueue.length < 5) {
        let p = ['i','o','t','s','z','j','l'];
        p.sort(() => Math.random() - 0.5);
        nextQueue.push(...p);
    }
    const type = nextQueue.shift();
    current = { pos: {x: 3, y: 0}, shape: SHAPES[type], type: type };
    canHold = true; drawNext(); drawHold();
    if (collide(board, current)) showGameOver("AI WIN!");
    sync();
}

function sync() { if(current && !gameOver) set(ref(db, `games/${roomId}/player`), { board, pos: current.pos, type: current.type, shape: current.shape }); }

function draw() {
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=> { if(c) drawBlock(ctx, x, y, c); }));
    if(current) current.shape.forEach((r,y)=>r.forEach((v,x)=> { if(v) drawBlock(ctx, current.pos.x+x, current.pos.y+y, COLORS[current.type]); }));
    
    eCtx.fillStyle = '#000'; eCtx.fillRect(0,0,eCanvas.width,eCanvas.height);
    enemyBoard.forEach((r,y)=>r.forEach((c,x)=> { if(c) drawBlock(eCtx, x, y, c, 24); }));

    document.getElementById('player-meter').style.height = `${(playerGarbageBuffer / ROWS) * 100}%`;
    document.getElementById('ai-meter').style.height = `${(aiGarbageBuffer / ROWS) * 100}%`;
}

function drawBlock(c, x, y, color, sz = SIZE) { c.fillStyle = color; c.fillRect(x*sz, y*sz, sz-1, sz-1); }
function drawHold() { hCtx.clearRect(0,0,60,60); if(holdPiece) SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=> { if(v) drawBlock(hCtx, x+0.5, y+0.5, COLORS[holdPiece], 15); })); }
function drawNext() { nCtx.clearRect(0,0,60,180); nextQueue.slice(0,4).forEach((t, i) => { SHAPES[t].forEach((r,y)=>r.forEach((v,x)=> { if(v) drawBlock(nCtx, x+0.5, y+0.5+i*3, COLORS[t], 15); })); }); }

function showGameOver(txt) { gameOver = true; clearInterval(dropInterval); clearInterval(aiInterval); document.getElementById('result-text').innerText = txt; document.getElementById('game-over-screen').style.display = 'flex'; }

function init(speed, label) {
    aiSpeed = speed; document.getElementById('ai-label').innerText = label;
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    enemyBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    nextQueue = []; holdPiece = null; gameOver = false; playerGarbageBuffer = 0; aiGarbageBuffer = 0;
    document.getElementById('start-screen').style.display = 'none'; document.getElementById('game-ui').style.display = 'flex';
    spawn();
    dropInterval = setInterval(() => { if(!gameOver){ current.pos.y++; if(collide(board, current)){ current.pos.y--; lockPiece(); } sync(); }}, 1000);
    aiInterval = setInterval(updateAI, aiSpeed);
    (function loop() { if(!gameOver) { draw(); requestID = requestAnimationFrame(loop); } })();
}

document.querySelectorAll('.lv-btn').forEach(b => b.onclick = () => init(parseInt(b.dataset.speed), b.innerText));
document.getElementById('restart-button').onclick = () => location.reload();

document.addEventListener('keydown', e => {
    if(gameOver || !current) return;
    if(e.key === 'ArrowLeft') { current.pos.x--; if(collide(board, current)) current.pos.x++; }
    if(e.key === 'ArrowRight') { current.pos.x++; if(collide(board, current)) current.pos.x--; }
    if(e.key === 'ArrowDown') { current.pos.y++; if(collide(board, current)) current.pos.y--; }
    if(e.key === 'ArrowUp') { const p = current.shape; current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse()); if(collide(board, current)) current.shape = p; }
    if(e.key === ' ') { while(!collide(board, {pos:{x:current.pos.x, y:current.pos.y+1}, shape:current.shape})) current.pos.y++; lockPiece(); }
    if(e.key.toLowerCase() === 'c' && canHold) {
        let t = holdPiece; holdPiece = current.type;
        if(t) { current = {pos:{x:3, y:0}, shape:SHAPES[t], type:t}; } else { spawn(); }
        canHold = false; drawHold();
    }
    sync();
});
