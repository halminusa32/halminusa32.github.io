import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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
let dropInterval, requestID, roomId, myId;
let myGarbageBuffer = 0, enemyGarbageBuffer = 0;

// --- 初期化 & 同期設定 ---
function joinGame() {
    roomId = document.getElementById('room-id-input').value || "default-room";
    myId = Math.random().toString(36).substring(7);
    
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'flex';

    initGame();

    // 相手の情報を監視
    onValue(ref(db, `multi/${roomId}`), (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        
        Object.keys(data).forEach(id => {
            if (id !== myId) {
                const enemyData = data[id];
                if (enemyData.board) enemyBoard = enemyData.board;
                if (enemyData.garbage) myGarbageBuffer += enemyData.garbage; // 相手からの攻撃を受信
                if (enemyData.gameOver) showGameOver("YOU WIN!");
                document.getElementById('enemy-label').innerText = "OPPONENT";
            }
        });
    });

    onDisconnect(ref(db, `multi/${roomId}/${myId}`)).remove();
}

function syncData(attackLines = 0) {
    const data = { board, gameOver };
    if (attackLines > 0) data.garbage = attackLines;
    set(ref(db, `multi/${roomId}/${myId}`), data);
}

// --- ゲームロジック ---
async function clearLines() {
    let lines = [];
    board.forEach((row, y) => { if (row.every(cell => cell !== null && cell !== '#ffffff')) lines.push(y); });
    if (lines.length === 0) return 0;

    lines.forEach(y => board[y] = Array(COLS).fill('#ffffff'));
    draw(); 
    await new Promise(r => setTimeout(r, 300));

    lines.forEach(y => { board.splice(y, 1); board.unshift(Array(COLS).fill(null)); });
    return lines.length;
}

function applyGarbage() {
    if (myGarbageBuffer <= 0) return;
    for (let i = 0; i < myGarbageBuffer; i++) {
        board.shift();
        let row = Array(COLS).fill('#555');
        row[Math.floor(Math.random() * COLS)] = null;
        board.push(row);
    }
    myGarbageBuffer = 0;
    // 自分のお邪魔をリセットしたことをFirebaseに通知（攻撃の重複防止）
    set(ref(db, `multi/${roomId}/${myId}/garbage`), 0);
}

async function lockPiece() {
    if (!current || gameOver) return;
    current.shape.forEach((r,y) => r.forEach((v,x) => {
        if (v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type];
    }));

    const cleared = await clearLines();
    const attack = (cleared === 4 ? 4 : cleared - 1 > 0 ? cleared - 1 : 0);
    
    // 設置完了後：保留攻撃を適用してから同期
    applyGarbage();
    syncData(attack);
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
    if (collide(board, current)) showGameOver("YOU LOSE");
}

function draw() {
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=> { if(c) drawBlock(ctx, x, y, c); }));
    if(current) current.shape.forEach((r,y)=>r.forEach((v,x)=> { if(v) drawBlock(ctx, current.pos.x+x, current.pos.y+y, COLORS[current.type]); }));
    
    eCtx.fillStyle = '#000'; eCtx.fillRect(0,0,eCanvas.width,eCanvas.height);
    enemyBoard.forEach((r,y)=>r.forEach((c,x)=> { if(c) drawBlock(eCtx, x, y, c, 24); }));

    document.getElementById('player-meter').style.height = `${(myGarbageBuffer / ROWS) * 100}%`;
}

function drawBlock(c, x, y, color, sz = SIZE) { c.fillStyle = color; c.fillRect(x*sz, y*sz, sz-1, sz-1); }
function drawHold() { hCtx.clearRect(0,0,60,60); if(holdPiece) SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=> { if(v) drawBlock(hCtx, x+0.5, y+0.5, COLORS[holdPiece], 15); })); }
function drawNext() { nCtx.clearRect(0,0,60,180); nextQueue.slice(0,4).forEach((t, i) => { SHAPES[t].forEach((r,y)=>r.forEach((v,x)=> { if(v) drawBlock(nCtx, x+0.5, y+0.5+i*3, COLORS[t], 15); })); }); }

function showGameOver(txt) { 
    gameOver = true; 
    clearInterval(dropInterval); 
    document.getElementById('result-text').innerText = txt; 
    document.getElementById('game-over-screen').style.display = 'flex'; 
    syncData();
}

function initGame() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    enemyBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    nextQueue = []; holdPiece = null; gameOver = false; myGarbageBuffer = 0;
    spawn();
    dropInterval = setInterval(() => { if(!gameOver){ current.pos.y++; if(collide(board, current)){ current.pos.y--; lockPiece(); } }}, 1000);
    (function loop() { if(!gameOver) { draw(); requestAnimationFrame(loop); } })();
}

document.getElementById('join-btn').onclick = joinGame;
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
});
