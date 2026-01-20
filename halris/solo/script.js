// 冒頭に生存確認用のアラート（動いたら消してOK）
console.log("Solo script loaded");

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

let roomId = "default-room", myId = null, enemyId = null;
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
let current = null, score = 0, gameOver = false, holdPiece = null, canHold = true, bag = [], nextQueue = [];
let lockTimer = null;
const LOCK_DELAY = 500;

function refillBag() {
    let p = ['i','o','t','s','z','j','l'];
    for(let i=p.length-1; i>0; i--) { let j=Math.floor(Math.random()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
    bag = [...p];
}

function updateNextQueue() {
    while(nextQueue.length < 5) { if(bag.length === 0) refillBag(); nextQueue.push(bag.pop()); }
}

function sync() {
    if(!current || !roomId || gameOver) return;
    set(ref(db, `games/${roomId}/${myId}`), { 
        board: board, pos: current.pos, shape: current.shape, type: current.type, score: score 
    });
}

function drawEnemy(d) {
    if(!eCtx || !d.board) return;
    eCtx.clearRect(0,0,eCanvas.width,eCanvas.height);
    const sz = eCanvas.width / 10;
    d.board.forEach((r,y)=>r.forEach((c,x)=>{ if(c) { eCtx.fillStyle=c; eCtx.fillRect(x*sz,y*sz,sz-0.5,sz-0.5); } }));
    if(d.shape && d.pos) {
        d.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v) { eCtx.fillStyle=COLORS[d.type]; eCtx.fillRect((d.pos.x+x)*sz,(d.pos.y+y)*sz,sz-0.5,sz-0.5); } }));
    }
    document.getElementById('enemy-score').innerText = d.score || 0;
}

function spawn(type = null) {
    clearTimeout(lockTimer); lockTimer = null;
    let t = type || nextQueue.shift(); updateNextQueue();
    current = { pos:{x:3, y:0}, shape:SHAPES[t], type:t };
    canHold = true; drawNext();
    if (collide(board, current)) gameOver = true;
}

function collide(b, p) {
    for (let y=0; y<p.shape.length; y++) {
        for (let x=0; x<p.shape[y].length; x++) {
            if (p.shape[y][x]) {
                let ny=p.pos.y+y, nx=p.pos.x+x;
                if (ny<0 || ny>=ROWS || nx<0 || nx>=COLS || b[ny][nx]!==null) return true;
            }
        }
    }
    return false;
}

function lockPiece() {
    if(!current || gameOver) return;
    current.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v && current.pos.y+y>=0) board[current.pos.y+y][current.pos.x+x]=COLORS[current.type]; }));
    let nb = board.filter(r => r.some(c => c === null));
    while(nb.length < ROWS) nb.unshift(Array(COLS).fill(null));
    board = nb; spawn(); sync();
}

function drop() {
    if(gameOver || !current) return;
    current.pos.y++;
    if(collide(board,current)) { current.pos.y--; if(!lockTimer) lockTimer=setTimeout(lockPiece, LOCK_DELAY); return; }
    sync();
}

function rotate(dir=1) {
    const prev = current.shape;
    if(dir===1) current.shape = current.shape[0].map((_,i)=>current.shape.map(row=>row[i]).reverse());
    else current.shape = current.shape[0].map((_,i)=>current.shape.map(row=>row[row.length-1-i]));
    if(collide(board,current)) current.shape = prev; else sync();
}

function drawNext() {
    nCtx.clearRect(0,0,60,180);
    for(let i=0; i<4; i++) SHAPES[nextQueue[i]].forEach((r,y)=>r.forEach((v,x)=>{ if(v){ nCtx.fillStyle=COLORS[nextQueue[i]]; nCtx.fillRect((x+0.5)*15,(y+0.5+(i*2.8))*15,14.5,14.5); } }));
}

function update() {
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((r,y)=>r.forEach((c,x)=>{ if(c){ ctx.fillStyle=c; ctx.fillRect(x*SIZE,y*SIZE,SIZE-0.5,SIZE-0.5); } }));
    if(current) current.shape.forEach((r,y)=>r.forEach((v,x)=>{ if(v){ ctx.fillStyle=COLORS[current.type]; ctx.fillRect((current.pos.x+x)*SIZE,(current.pos.y+y)*SIZE,SIZE-0.5,SIZE-0.5); } }));
    if(!gameOver) requestAnimationFrame(update);
}

function join(role) {
    myId = role; enemyId = role === 'p1' ? 'p2' : 'p1';
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    onValue(ref(db, `games/${roomId}/${enemyId}`), (snap) => { if(snap.val()) drawEnemy(snap.val()); });
    updateNextQueue(); spawn(); update(); setInterval(drop, 1000);
}

document.getElementById('btn-p1').onclick = () => join('p1');
document.getElementById('btn-p2').onclick = () => join('p2');

// 以下、キーボードとタッチのリスナー（省略せず維持）
document.addEventListener('keydown', e => {
    if(!current || gameOver) return;
    const k = e.key.toLowerCase();
    if(k==='arrowleft'){ current.pos.x--; if(collide(board,current)) current.pos.x++; else sync(); }
    if(k==='arrowright'){ current.pos.x++; if(collide(board,current)) current.pos.x--; else sync(); }
    if(k==='arrowdown') drop();
    if(k==='arrowup' || k==='x') rotate(1);
    if(k==='z') rotate(-1);
    if(k===' ') { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) current.pos.y++; lockPiece(); }
    if(k==='c' || k==='shift') { if(!canHold) return; let t=holdPiece; holdPiece=current.type; if(t) spawn(t); else spawn(); canHold=false; sync(); }
});
