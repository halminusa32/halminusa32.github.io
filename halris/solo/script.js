import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJ4Ky4vXVR3nC2UPJWcVZ-tphs2oVu1ig",
    authDomain: "tetris-online-f63af.firebaseapp.com",
    databaseURL: "https://tetris-online-f63af-default-rtdb.firebaseio.com",
    projectId: "tetris-online-f63af",
    storageBucket: "tetris-online-f63af.firebasestorage.app",
    appId: "1:16754605296:web:fbf87f61787b4c5c009635"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const roomId = "solo-room-data";

const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

const ROWS = 20, COLS = 10, SIZE = 24;
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#6730bf', s:'#00ee00', z:'#ff4d4d', j:'#006eff', l:'#eeaa00' };
const SHAPES = { i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]], s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]] };

let board, current, holdPiece, canHold, bag, nextQueue, score, totalLines, level, gameOver;
let clearAnimTimer = 0, clearingLines = [], gameInterval, clearAnimDuration = 1;

// UI同期ロジック
document.addEventListener('DOMContentLoaded', () => {
    const slider = document.getElementById('delay-slider');
    const input = document.getElementById('delay-input');
    const sync = (v) => {
        v = Math.max(0, Math.min(60, v));
        clearAnimDuration = v; slider.value = v; input.value = v;
    };
    slider.oninput = (e) => sync(parseInt(e.target.value));
    input.onchange = (e) => sync(parseInt(e.target.value));

    document.getElementById('play').onclick = resetGame;
    document.getElementById('restart-button').onclick = resetGame;
});

function syncFirebase() {
    if (gameOver || !current) return;
    set(ref(db, `games/${roomId}/player`), { board, pos: current.pos, type: current.type, shape: current.shape });
}

function collide(b, p) {
    return p.shape.some((row, y) => row.some((v, x) => {
        let ny = p.pos.y + y, nx = p.pos.x + x;
        return v && (ny >= ROWS || nx < 0 || nx >= COLS || (ny >= 0 && b[ny][nx]));
    }));
}

function spawn(type = null) {
    if (bag.length < 7) bag = Object.keys(SHAPES).sort(() => Math.random() - 0.5);
    while (nextQueue.length < 5) nextQueue.push(bag.pop());
    let t = type || nextQueue.shift();
    current = { pos: { x: 3, y: 0 }, shape: SHAPES[t], type: t };
    if (collide(board, current)) {
        gameOver = true;
        document.getElementById('game-over-screen').style.display = 'flex';
        document.getElementById('final-score').innerText = `SCORE: ${score}`;
    }
    canHold = true; drawNext(); drawHold(); syncFirebase();
}

function drop() {
    if (gameOver || !current || clearAnimTimer > 0) return;
    current.pos.y++;
    if (collide(board, current)) { current.pos.y--; lock(); }
    else syncFirebase();
}

function lock() {
    current.shape.forEach((row, y) => row.forEach((v, x) => {
        if (v && current.pos.y + y >= 0) board[current.pos.y + y][current.pos.x + x] = COLORS[current.type];
    }));
    clearingLines = [];
    for (let y = 0; y < ROWS; y++) if (board[y].every(c => c)) clearingLines.push(y);
    
    if (clearingLines.length > 0) {
        clearAnimTimer = clearAnimDuration;
        if (clearAnimDuration === 0) finishLocking();
    } else {
        finishLocking();
    }
}

function finishLocking() {
    const cleared = clearingLines.length;
    board = board.filter((_, i) => !clearingLines.includes(i));
    while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
    
    if (cleared > 0) {
        score += cleared * 100 * level;
        totalLines += cleared;
        document.getElementById('score-display').innerText = score;
        document.getElementById('line-count').innerText = totalLines;

        let nextL = Math.floor(totalLines / 10) + 1;
        if (nextL > level) {
            level = nextL;
            const lText = document.getElementById('level-up-text');
            const lNum = document.getElementById('level');
            lNum.innerText = level;
            lText.classList.remove('level-up-animate'); lNum.classList.remove('level-flash');
            void lText.offsetWidth; // リフロー強制
            lText.classList.add('level-up-animate'); lNum.classList.add('level-flash');
            updateSpeed();
        }
    }
    clearingLines = [];
    spawn();
}

function resetGame() {
    board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
    score = 0; totalLines = 0; level = 1; gameOver = false; holdPiece = null; nextQueue = []; bag = [];
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    document.getElementById('game-over-screen').style.display = 'none';
    spawn(); requestAnimationFrame(update); updateSpeed();
}

function updateSpeed() {
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(drop, Math.max(100, 1000 - (level - 1) * 100));
}

function update() {
    if (gameOver) return;
    if (clearAnimTimer > 0) {
        clearAnimTimer--;
        if (clearAnimTimer <= 0) finishLocking();
    }
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    board.forEach((row, y) => row.forEach((c, x) => {
        if (c) { ctx.fillStyle = clearingLines.includes(y) ? '#fff' : c; ctx.fillRect(x*SIZE, y*SIZE, SIZE-1, SIZE-1); }
    }));
    if (current && clearAnimTimer === 0) {
        ctx.fillStyle = COLORS[current.type];
        current.shape.forEach((row, y) => row.forEach((v, x) => { if (v) ctx.fillRect((current.pos.x+x)*SIZE, (current.pos.y+y)*SIZE, SIZE-1, SIZE-1); }));
    }
    requestAnimationFrame(update);
}

function drawHold() {
    hCtx.clearRect(0,0,60,60); if(!holdPiece) return;
    hCtx.fillStyle = COLORS[holdPiece];
    SHAPES[holdPiece].forEach((r,y)=>r.forEach((v,x)=>{ if(v) hCtx.fillRect(x*12+10, y*12+10, 11, 11); }));
}

function drawNext() {
    nCtx.clearRect(0,0,60,180);
    nextQueue.slice(0,3).forEach((t, i) => {
        nCtx.fillStyle = COLORS[t];
        SHAPES[t].forEach((r,y)=>r.forEach((v,x)=>{ if(v) nCtx.fillRect(x*10+15, y*10+15+i*50, 9, 9); }));
    });
}

window.onkeydown = e => {
    if (gameOver || !current) return;
    if (e.key === 'ArrowLeft') { current.pos.x--; if(collide(board, current)) current.pos.x++; syncFirebase(); }
    if (e.key === 'ArrowRight') { current.pos.x++; if(collide(board, current)) current.pos.x--; syncFirebase(); }
    if (e.key === 'ArrowDown') drop();
    if (e.key === ' ') { while(!collide(board, current)) current.pos.y++; current.pos.y--; lock(); }
};
