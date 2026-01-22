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
const roomId = "cpu-battle-room";

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

let board, enemyBoard, current, gameOver, holdPiece, canHold, bag, nextQueue;
let lockTimer, lockResetCount, dropInterval, cpuInterval, requestID;
const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;

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
    const prevShape = current.shape, prevPos = { ...current.pos };
    if (dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length - 1 - i]));
    const kicks = [[0,0], [-1,0], [1,0], [0,1], [-1,1], [1,1], [0,2], [-1,2], [1,2], [0,-1]];
    let success = false;
    for (let k of kicks) {
        current.pos.x = prevPos.x + k[0]; current.pos.y = prevPos.y + k[1];
        if (!collide(board, current)) { success = true; break; }
    }
    if (!success) { current.shape = prevShape; current.pos = prevPos; }
    else { handleMoveReset(); sync(); }
}

function handleMoveReset() {
    if (collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) {
        if (lockResetCount < MAX_LOCK_RESETS) { 
            lockResetCount++; 
            if(lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
        }
    }
}

function lockPiece() {
    if (!current || gameOver) return;
    let isTopOut = false;
    current.shape.forEach((r,y) => r.forEach((v,x) => {
        if (v) {
            let ny = current.pos.y + y, nx = current.pos.x + x;
            if (ny >= 0 && ny < ROWS) board[ny][nx] = COLORS[current.type];
            else if (ny < 0 && nx >= 3 && nx <= 6) isTopOut = true;
        }
    }));
    if (isTopOut) { showGameOver(); return; }

    let linesCleared = 0;
    board = board.filter(r => {
        if (r.every(c => c !== null)) { linesCleared++; return false; }
        return true;
    });
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
    
    if (linesCleared > 0) {
        let attack = linesCleared === 4 ? 4 : linesCleared - 1;
        if (attack > 0) sendGarbage(enemyBoard, attack);
    }
    lockTimer = null;
    spawn();
}

// お邪魔攻撃
function sendGarbage(targetBoard, lines) {
    for (let i = 0; i < lines; i++) {
        targetBoard.shift();
        let row = Array(COLS).fill('#555');
        row[Math.floor(Math.random() * COLS)] = null; // 穴
        targetBoard.push(row);
    }
}

function spawn() {
    lockResetCount = 0;
    let t = nextQueue.shift(); updateNextQueue();
    current = { pos:{x: 3, y: 0}, shape:SHAPES[t], type:t };
    canHold = true; drawNext(); drawHold();
    if (collide(board, current)) showGameOver();
    sync();
}

// --- CPU AI ロジック (ミノを形ごと配置するように改良) ---
function updateCpu() {
    if (gameOver) return;

    // CPUが使うミノをランダムに選ぶ
    const types = ['i','o','t','s','z','j','l'];
    const type = types[Math.floor(Math.random() * types.length)];
    const shape = SHAPES[type];
    const color = COLORS[type];

    // CPUがランダムなX位置にミノをテレポートさせて固定する
    let x = Math.floor(Math.random() * (COLS - shape[0].length));
    let y = 0;
    
    // 一番下まで落とす
    while(!collide(enemyBoard, {pos:{x, y:y+1}, shape})) {
        y++;
        if(y > ROWS) break;
    }

    // ミノを盤面に書き込む
    shape.forEach((r, sy) => r.forEach((v, sx) => {
        if (v) {
            let ny = y + sy;
            let nx = x + sx;
            if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
                enemyBoard[ny][nx] = color;
            }
        }
    }));

    // CPUのライン消去判定
    let cpuCleared = 0;
    enemyBoard = enemyBoard.filter(r => {
        if (r.every(c => c !== null)) { cpuCleared++; return false; }
        return true;
    });
    while (enemyBoard.length < ROWS) enemyBoard.unshift(Array(COLS).fill(null));
    
    // CPUがラインを消したらプレイヤーに攻撃
    if (cpuCleared > 0) {
        let attack = cpuCleared === 4 ? 4 : cpuCleared - 1;
        if (attack >= 0) sendGarbage(board, attack || 1); 
    }

    // CPUの敗北判定（上まで埋まったらリセット、またはプレイヤーの勝ち）
    if (enemyBoard[1].some(c => c !== null)) {
        // CPUが死んだらプレイヤーの勝ちだが、ここでは盤面リセットでお茶を濁す
        enemyBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    }
}

function draw() {
    ctx.fillStyle = '#151515'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=>{ if(c) drawBlock(ctx, x, y, c); }));
    if(current) {
        current.shape.forEach((r,y)=>r.forEach((v,x)=>{ 
            if(v && current.pos.y+y>=0) drawBlock(ctx, current.pos.x+x, current.pos.y+y, COLORS[current.type]); 
        }));
    }
    // CPU描画
    eCtx.fillStyle = '#111'; eCtx.fillRect(0,0,eCanvas.width,eCanvas.height);
    enemyBoard.forEach((r,y)=>r.forEach((c,x)=>{ if(c) drawBlock(eCtx, x, y, c, 24); }));
}

function drawBlock(c, x, y, color, sz = SIZE) {
    c.fillStyle = color; c.fillRect(x * sz, y * sz, sz - 1, sz - 1);
}

function drawHold() {
    hCtx.clearRect(0,0,60,60);
    if (holdPiece) SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(hCtx, x+0.5, y+0.5, COLORS[holdPiece], 15); }));
}

function drawNext() {
    nCtx.clearRect(0,0,60,180);
    nextQueue.slice(0, 4).forEach((t, i) => {
        SHAPES[t].forEach((r,y)=>r.forEach((v,x)=>{ if(v) drawBlock(nCtx, x+0.5, y+0.5+(i*3), COLORS[t], 15); }));
    });
}

function mainLoop() {
    if (gameOver) return;
    const isGrounded = collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape });
    if (isGrounded && !lockTimer) lockTimer = setTimeout(lockPiece, LOCK_DELAY);
    else if (!isGrounded) { clearTimeout(lockTimer); lockTimer = null; }
    draw();
    requestID = requestAnimationFrame(mainLoop);
}

function showGameOver() {
    gameOver = true;
    clearInterval(dropInterval); clearInterval(cpuInterval);
    cancelAnimationFrame(requestID);
    board = board.map(row => row.map(() => '#ffffff'));
    draw();
    document.getElementById('game-over-screen').style.display = 'flex';
}

function initGame() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    enemyBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    gameOver = false; holdPiece = null; canHold = true; bag = []; nextQueue = [];
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'flex';
    
    refillBag(); updateNextQueue(); spawn();
    if (dropInterval) clearInterval(dropInterval);
    if (cpuInterval) clearInterval(cpuInterval);
    
    dropInterval = setInterval(() => { 
        if(!gameOver){ 
            current.pos.y++; 
            if(collide(board,current)) {current.pos.y--; lockPiece();} 
            sync();
        } 
    }, 1000);
    
    // CPUの動作間隔 (1500ms = 1.5秒に1回ミノを置く)
    cpuInterval = setInterval(updateCpu, 1500); 
    mainLoop();
}

document.getElementById('start-button').onclick = initGame;
document.getElementById('restart-button').onclick = initGame;

document.addEventListener('keydown', e => {
    if(gameOver || !current) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') { current.pos.x--; if(collide(board,current)) current.pos.x++; else {handleMoveReset(); sync();} }
    if (k === 'arrowright') { current.pos.x++; if(collide(board,current)) current.pos.x--; else {handleMoveReset(); sync();} }
    if (k === 'arrowdown') { current.pos.y++; if(collide(board,current)) current.pos.y--; sync(); }
    if (k === 'arrowup' || k === 'x') rotate(1);
    if (k === 'z') rotate(-1);
    if (k === ' ') { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) current.pos.y++; lockPiece(); }
    if (k === 'c') {
        if(!canHold) return;
        let t = holdPiece; holdPiece = current.type;
        if(t) spawn(t); else spawn();
        canHold = false; drawHold();
    }
});
