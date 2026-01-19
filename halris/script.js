import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

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

let roomId = null, myId = null, enemyId = null;
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

let board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let current = null, score = 0, gameOver = false;
let holdPiece = null, canHold = true;

// NEXT管理用のキューと7-bagロジック
let bag = [];
let nextQueue = []; 

function refillBag() {
    let pieces = ['i', 'o', 't', 's', 'z', 'j', 'l'];
    for (let i = pieces.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    bag = [...pieces];
}

// NEXTキューを常に5つ以上に保つ（4つ表示＋予備1つ）
function updateNextQueue() {
    while (nextQueue.length < 5) {
        if (bag.length === 0) refillBag();
        nextQueue.push(bag.pop());
    }
}

document.getElementById('btn-p1').onclick = () => join('p1');
document.getElementById('btn-p2').onclick = () => join('p2');

function join(role) {
    const input = document.getElementById('room-id').value;
    if(!input) return alert("コードを入れて！");
    roomId = input; myId = role; enemyId = role === 'p1' ? 'p2' : 'p1';
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';

    onValue(ref(db, `games/${roomId}/${enemyId}`), (snap) => {
        const d = snap.val();
        if(d) drawEnemy(d);
    });

    updateNextQueue(); // 最初にキューを埋める
    spawn(); 
    update(); 
    setInterval(drop, 1000);
}

function sync() {
    if(!current || !roomId || gameOver) return;
    set(ref(db, `games/${roomId}/${myId}`), { 
        board, pos: { x: current.pos.x, y: current.pos.y }, 
        shape: current.shape, type: current.type, score 
    });
}

function drawBlock(c, x, y, color, op = 1, sz = SIZE) {
    c.globalAlpha = op;
    c.fillStyle = color;
    c.fillRect(x * sz, y * sz, sz - 0.5, sz - 0.5);
    c.globalAlpha = 1;
}

function drawEnemy(d) {
    if (!eCtx) return;
    eCtx.fillStyle = '#000';
    eCtx.fillRect(0, 0, eCanvas.width, eCanvas.height);
    const sz = eCanvas.width / 10;
    if (d.board) {
        d.board.forEach((r, y) => r && r.forEach((c, x) => { if(c) drawBlock(eCtx, x, y, c, 1, sz); }));
    }
    if (d.shape && d.pos) {
        d.shape.forEach((r, y) => r.forEach((v, x) => { if(v) drawBlock(eCtx, d.pos.x + x, d.pos.y + y, COLORS[d.type], 1, sz); }));
    }
    const eScore = document.getElementById('enemy-score');
    if (eScore) eScore.innerText = d.score || 0;
}

// HOLDとNEXTの描画ロジックを分離・強化
function drawHold() {
    hCtx.clearRect(0, 0, 60, 60);
    if (!holdPiece) return;
    const shape = SHAPES[holdPiece];
    shape.forEach((r, y) => r.forEach((v, x) => {
        if (v) drawBlock(hCtx, x + 0.5, y + 0.5, COLORS[holdPiece], 1, 15);
    }));
}

function drawNext() {
    nCtx.clearRect(0, 0, 60, 180);
    // 上から4つ分を表示
    for (let i = 0; i < 4; i++) {
        const type = nextQueue[i];
        if (!type) continue;
        const shape = SHAPES[type];
        shape.forEach((r, y) => r.forEach((v, x) => {
            // y方向に45ピクセルずつずらして配置
            if (v) drawBlock(nCtx, x + 0.5, y + 0.5 + (i * 2.8), COLORS[type], 1, 15);
        }));
    }
}

function drawGhost() {
    if (!current) return;
    let g = { ...current.pos };
    while (!collide(board, { pos: { x: g.x, y: g.y + 1 }, shape: current.shape })) g.y++;
    current.shape.forEach((r, y) => r.forEach((v, x) => {
        if (v) drawBlock(ctx, g.x + x, g.y + y, COLORS[current.type], 0.25);
    }));
}

function collide(b, p) {
    for (let y=0; y<p.shape.length; y++) {
        for (let x=0; x<p.shape[y].length; x++) {
            if (p.shape[y][x]) {
                let ny = p.pos.y + y;
                let nx = p.pos.x + x;
                if (ny < 0 || ny >= ROWS || nx < 0 || nx >= COLS || b[ny][nx] !== null) return true;
            }
        }
    }
    return false;
}

function spawn(type = null) {
    let t;
    if (type) {
        t = type;
    } else {
        t = nextQueue.shift(); // キューの先頭を使う
        updateNextQueue();     // 減った分を補充
    }
    current = { pos:{x:3, y:0}, shape:SHAPES[t], type:t };
    canHold = true;
    drawNext();
    if (collide(board, current)) gameOver = true;
    sync();
}

function hold() {
    if (!canHold || gameOver) return;
    const oldHold = holdPiece;
    holdPiece = current.type;
    if (oldHold) spawn(oldHold);
    else spawn();
    canHold = false;
    drawHold();
    sync();
}

function drop() {
    if(gameOver || !current) return;
    current.pos.y++;
    if (collide(board, current)) {
        current.pos.y--;
        current.shape.forEach((r,y) => r.forEach((v,x) => {
            if (v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type];
        }));
        board = board.filter(r => !r.every(v => v !== null));
        while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
        score += 100; spawn();
    }
    sync();
}

function hardDrop() {
    if(gameOver || !current) return;
    while(!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) current.pos.y++;
    drop();
}

function rotate(dir = 1) {
    if(gameOver || !current) return;
    const prev = current.shape;
    if(dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length-1-i]));
    if (collide(board, current)) current.shape = prev;
    sync();
}

function update() {
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y) => r.forEach((c,x) => { if(c) drawBlock(ctx, x, y, c); }));
    if(current) {
        drawGhost();
        current.shape.forEach((r,y) => r.forEach((v,x) => { if(v) drawBlock(ctx, current.pos.x+x, current.pos.y+y, COLORS[current.type]); }));
    }
    if (!gameOver) requestAnimationFrame(update);
}

document.addEventListener('keydown', e => {
    if(!current || gameOver) return;
    const key = e.key.toLowerCase();
    if (['arrowup','arrowdown','arrowleft','arrowright',' ','x','c','z','shift'].includes(key)) e.preventDefault();
    if (key === 'arrowleft') { current.pos.x--; if(collide(board,current)) current.pos.x++; sync(); }
    if (key === 'arrowright') { current.pos.x++; if(collide(board,current)) current.pos.x--; sync(); }
    if (key === 'arrowdown') drop();
    if (key === 'arrowup' || key === 'x') rotate(1);
    if (key === 'z') rotate(-1);
    if (key === ' ') hardDrop();
    if (key === 'c' || key === 'shift') hold();
});

const touch = (id, fn) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('touchstart', (e) => { e.preventDefault(); if(!gameOver && current) fn(); }, {passive:false});
};
touch('ctrl-left', () => { current.pos.x--; if(collide(board,current)) current.pos.x++; sync(); });
touch('ctrl-right', () => { current.pos.x++; if(collide(board,current)) current.pos.x--; sync(); });
touch('ctrl-down', drop);
touch('ctrl-up', hardDrop);
touch('ctrl-rot-r', () => rotate(1));
touch('ctrl-rot-l', () => rotate(-1));
touch('ctrl-hold', hold);
