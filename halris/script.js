import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCJ4Ky4vXVR3nC2UPJWcVZ-tphs2oVu1ig",
    authDomain: "tetris-online-f63af.firebaseapp.com",
    databaseURL: "https://tetris-online-f63af-default-rtdb.firebaseio.com",
    projectId: "tetris-online-f63af",
    storageBucket: "tetris-online-f63af.firebasestorage.app",
    messagingSenderId: "16754605296",
    appId: "1:16754605296:web:5ff45fe83820a9eb009635"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// URLの末尾に ?p=p1 または ?p=p2 をつけてプレイヤーを判別
const urlParams = new URLSearchParams(window.location.search);
const myId = urlParams.get('p') || 'p1';
const enemyId = myId === 'p1' ? 'p2' : 'p1';

const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');
const eCanvas = document.getElementById('enemy-tetris');
const eCtx = eCanvas.getContext('2d');

const ROWS = 20; const COLS = 10; const SIZE = 24;
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#aa00ee', s:'#00ee00', z:'#ee0000', j:'#0000ee', l:'#eeaa00' };
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};

let board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let current = null;
let score = 0;
let gameOver = false;

// 自分の状態をFirebaseへ
function sync() {
    if (!current) return;
    set(ref(db, 'games/room1/' + myId), {
        board: board, pos: current.pos, shape: current.shape, type: current.type, score: score
    });
}

// 相手の状態を監視して描画
onValue(ref(db, 'games/room1/' + enemyId), (snap) => {
    const data = snap.val();
    if (!data) return;
    eCtx.fillStyle = '#050505'; eCtx.fillRect(0,0,eCanvas.width,eCanvas.height);
    data.board.forEach((row,y) => row.forEach((c,x) => { if(c){eCtx.fillStyle=c; eCtx.fillRect(x*SIZE,y*SIZE,SIZE-1,SIZE-1);}}));
    eCtx.fillStyle = COLORS[data.type];
    data.shape.forEach((row,y) => row.forEach((v,x) => { if(v) eCtx.fillRect((data.pos.x+x)*SIZE,(data.pos.y+y)*SIZE,SIZE-1,SIZE-1);}));
    document.getElementById('enemy-score').innerText = data.score;
});

function collide(b, p) {
    for (let y=0; y<p.shape.length; y++) {
        for (let x=0; x<p.shape[y].length; x++) {
            if (p.shape[y][x] && (b[p.pos.y+y] === undefined || b[p.pos.y+y][p.pos.x+x] !== null)) return true;
        }
    }
    return false;
}

function spawn() {
    const t = 'itsszjl'[Math.floor(Math.random()*7)];
    current = { pos:{x:3, y:0}, shape:SHAPES[t], type:t };
    if (collide(board, current)) gameOver = true;
    sync();
}

function drop() {
    current.pos.y++;
    if (collide(board, current)) {
        current.pos.y--;
        current.shape.forEach((row,y) => row.forEach((v,x) => {
            if (v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type];
        }));
        board = board.filter(row => !row.every(v => v !== null));
        while (board.length < ROWS) board.unshift(Array(COLS).fill(null));
        score += 100;
        spawn();
    }
    sync();
}

function update(time = 0) {
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((row,y) => row.forEach((c,x) => { if(c){ctx.fillStyle=c; ctx.fillRect(x*SIZE,y*SIZE,SIZE-1,SIZE-1);}}));
    ctx.fillStyle = COLORS[current.type];
    current.shape.forEach((row,y) => row.forEach((v,x) => { if(v) ctx.fillRect((current.pos.x+x)*SIZE,(current.pos.y+y)*SIZE,SIZE-1,SIZE-1);}));
    if (!gameOver) requestAnimationFrame(update);
}

// キー操作
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { current.pos.x--; if(collide(board,current)) current.pos.x++; sync(); }
    if (e.key === 'ArrowRight') { current.pos.x++; if(collide(board,current)) current.pos.x--; sync(); }
    if (e.key === 'ArrowDown') drop();
    if (e.key === 'z') {
        const prev = current.shape;
        current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
        if (collide(board, current)) current.shape = prev;
        sync();
    }
});

setInterval(drop, 1000);
spawn(); update();
