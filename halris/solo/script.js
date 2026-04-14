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

// HTML要素
const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

// ゲーム定数
const VISIBLE_ROWS = 22, TOTAL_ROWS = 40, COLS = 10, SIZE = 24; 
const DISPLAY_START_ROW = 18; 
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#6730bf', s:'#00ee00', z:'#ff4d4d', j:'#006eff', l:'#eeaa00' };
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

// ゲーム変数
let board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
let current = null, gameOver = false, holdPiece = null, canHold = true, bag = [], nextQueue = [];
let lockTimer = null, gameInterval = null, requestID = null, rotationState = 0, lockResetCount = 0;
const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;
let score = 0, totalLines = 0, level = 1;
let keyStates = {}, moveTimers = {};
let particles = []; 
let isSpinning = false; // Spin系入力中フラグ

// --- ヘルパー: 盤面アニメーションクラスの付け外し ---
function triggerBoardAnim(animClass) {
    canvas.classList.remove('anim-harddrop', 'anim-hit-left', 'anim-hit-right'); // 既存をクリア
    void canvas.offsetWidth; // リフローを起こしてアニメーションを再トリガー
    canvas.classList.add(animClass);
    // アニメーション終了時にクラスを削除（Spin用以外）
    if(!animClass.includes('spin')) {
        setTimeout(() => canvas.classList.remove(animClass), 200);
    }
}

// 基礎機能
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
                if (ny >= TOTAL_ROWS || nx < 0 || nx >= COLS || (ny >= 0 && b[ny][nx] !== null)) return true;
            }
        }
    }
    return false;
}

// ロジック
function spawn(type = null) {
    lockResetCount = 0; rotationState = 0;
    let t = type || nextQueue.shift(); updateNextQueue();
    let startX = (t === 'o') ? 4 : 3;
    let nextP = { pos:{x: startX, y: 18}, shape:SHAPES[t], type:t };
    while (collide(board, nextP) && nextP.pos.y > 0) { nextP.pos.y--; }
    if (collide(board, nextP)) { showGameOver(); return; }
    current = nextP; drawNext(); drawHold();
}

function createParticles(y, color) {
    for (let x = 0; x < COLS; x++) {
        for (let i = 0; i < 2; i++) {
            particles.push({
                x: x * SIZE + Math.random() * SIZE, y: (y - DISPLAY_START_ROW) * SIZE + Math.random() * SIZE,
                vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 5) * 2, life: 1.0, color: color || '#fff'
            });
        }
    }
}

function lockPiece() {
    if (!current || gameOver) return;
    if (!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) { lockTimer = null; return; }
    
    let isAnyInVisible = false;
    for (let y=0; y<current.shape.length; y++) {
        for (let x=0; x<current.shape[y].length; x++) {
            if (current.shape[y][x]) { 
                let ny = current.pos.y + y, nx = current.pos.x + x; 
                if (ny >= 0 && ny < TOTAL_ROWS) { board[ny][nx] = COLORS[current.type]; if (ny >= 19) isAnyInVisible = true; }
            }
        }
    }
    if (!isAnyInVisible) { showGameOver(); return; }

    let linesToClear = [];
    for (let y = 0; y < TOTAL_ROWS; y++) { if (board[y].every(cell => cell !== null)) linesToClear.push(y); }
    if (linesToClear.length > 0) {
        playSound('clear');
        linesToClear.forEach(y => {
            createParticles(y, '#fff');
            board.splice(y, 1); board.unshift(Array(COLS).fill(null));
        });
        score += linesToClear.length * 100 * level; totalLines += linesToClear.length;
        level = Math.floor(totalLines / 10) + 1;
        document.getElementById('line-count').innerText = totalLines;
        document.getElementById('score-display').innerText = score;
        document.getElementById('level').innerText = level;
    } else { playSound('lock'); }
    canHold = true; if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    spawn();
}

function drop() { 
    if(gameOver || !current) return; 
    current.pos.y++; 
    if (collide(board, current)) { current.pos.y--; } 
}

function rotate(dir = 1) {
    if (gameOver || !current) return;
    const oldS = JSON.parse(JSON.stringify(current.shape)), oldP = {...current.pos}, oldRS = rotationState;
    if (dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length - 1 - i]));
    rotationState = (rotationState + dir + 4) % 4;

    let kickSet = SRS_KICKS[`${oldRS}->${rotationState}`] || [[0,0]];
    let success = false;
    for (let k of kickSet) {
        current.pos.x = oldP.x + k[0]; current.pos.y = oldP.y - k[1];
        if (!collide(board, current)) { success = true; break; }
    }
    if (!success) { current.shape = oldS; current.pos = oldP; rotationState = oldRS; } 
    else { playSound('rotate'); handleMoveReset(); }
}

// 【修正】移動関数: 壁衝突時にアニメーションをトリガー
function movePiece(dir) {
    if (gameOver || !current) return;
    current.pos.x += dir;
    if (collide(board, current)) { 
        current.pos.x -= dir; 
        // 壁にぶつかった方向に応じてアニメーション
        triggerBoardAnim(dir === -1 ? 'anim-hit-left' : 'anim-hit-right');
        return false; 
    }
    playSound('move'); handleMoveReset(); return true;
}

function startAutoMove(key, action, interval = 30, useDas = true) {
    if (moveTimers[key]) return;
    action(); 
    if (useDas) moveTimers[key] = { timeout: setTimeout(() => { moveTimers[key].interval = setInterval(action, interval); }, 150) };
    else moveTimers[key] = { interval: setInterval(action, interval) };
}
function stopAutoMove(key) { if (moveTimers[key]) { clearTimeout(moveTimers[key].timeout); clearInterval(moveTimers[key].interval); delete moveTimers[key]; } }
function handleMoveReset() { if (current && collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) { if (lockResetCount < MAX_LOCK_RESETS) { lockResetCount++; resetLockTimer(); } } }
function resetLockTimer() { if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } }
function hold() { if (!canHold || gameOver) return; playSound('hold'); let tempType = current.type; if (holdPiece) { let t = holdPiece; holdPiece = tempType; spawn(t); } else { holdPiece = tempType; spawn(); } canHold = false; drawHold(); }

// 描画系
function drawBlock(c, x, y, color, op = 1, sz = SIZE) { c.globalAlpha = op; c.fillStyle = color; c.fillRect(x * sz, y * sz, sz - 1, sz - 1); c.globalAlpha = 1; }
function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.life -= 0.02;
        if (p.life <= 0) particles.splice(i, 1);
        else { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); }
    }
    ctx.globalAlpha = 1;
}

function update() {
    if (gameOver) return;
    const grounded = current && collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape });
    if (grounded && !lockTimer) lockTimer = setTimeout(lockPiece, LOCK_DELAY);
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = '#111';
    for(let x=0; x<=COLS; x++) { ctx.beginPath(); ctx.moveTo(x*SIZE, 0); ctx.lineTo(x*SIZE, canvas.height); ctx.stroke(); }
    for(let y=0; y<=VISIBLE_ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y*SIZE); ctx.lineTo(canvas.width, y*SIZE); ctx.stroke(); }
    for (let y = DISPLAY_START_ROW; y < TOTAL_ROWS; y++) { 
        for (let x = 0; x < COLS; x++) { if (board[y][x]) { let alpha = (y < 20) ? 0.3 : 1; drawBlock(ctx, x, y - DISPLAY_START_ROW, board[y][x], alpha); } } 
    }
    if(current) {
        let g = { ...current.pos };
        while (!collide(board, { pos: { x: g.x, y: g.y + 1 }, shape: current.shape })) g.y++;
        for (let y=0; y<current.shape.length; y++) { for (let x=0; x<current.shape[y].length; x++) { let drawY = g.y + y - DISPLAY_START_ROW; if (current.shape[y][x] && drawY >= 0 && drawY < VISIBLE_ROWS) drawBlock(ctx, g.x+x, drawY, COLORS[current.type], 0.15); } }
        for (let y=0; y<current.shape.length; y++) { for (let x=0; x<current.shape[y].length; x++) { let drawY = current.pos.y + y - DISPLAY_START_ROW; if (current.shape[y][x] && drawY >= 0 && drawY < VISIBLE_ROWS) { let alpha = (current.pos.y + y < 20) ? 0.5 : 1; drawBlock(ctx, current.pos.x+x, drawY, COLORS[current.type], alpha); } } }
    }
    updateParticles();
    requestID = requestAnimationFrame(update);
}

function showGameOver() { gameOver = true; document.getElementById('game-over-screen').style.display = 'flex'; }
function resetGame() {
    initAudio(); document.getElementById('game-over-screen').style.display = 'none';
    board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
    gameOver = false; current = null; holdPiece = null; canHold = true; bag = []; nextQueue = []; score = 0; totalLines = 0; level = 1; particles = [];
    canvas.classList.remove('anim-harddrop', 'anim-hit-left', 'anim-hit-right', 'anim-spin-l', 'anim-spin-r');
    refillBag(); updateNextQueue(); spawn(); update();
    if(gameInterval) clearInterval(gameInterval); gameInterval = setInterval(drop, 1000);
}

// 音響系
const SOUND_FILES = { move: 'https://halminusa32.github.io/halris/solo/move.mp3', rotate: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', clear: 'https://halminusa32.github.io/halris/solo/solian-te-n1.mp3', lock: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', hold: 'https://actions.google.com/sounds/v1/foley/camera_shutter.ogg' };
let audioCtx = null; const audioBuffers = {};
function initAudio() { if (audioCtx) return; audioCtx = new (window.AudioContext || window.webkitAudioContext)(); Object.keys(SOUND_FILES).forEach(name => { fetch(SOUND_FILES[name]).then(res => res.arrayBuffer()).then(data => audioCtx.decodeAudioData(data)).then(buffer => { audioBuffers[name] = buffer; }); }); }
function playSound(name) { if (!audioCtx || !audioBuffers[name]) return; const source = audioCtx.createBufferSource(); source.buffer = audioBuffers[name]; const gainNode = audioCtx.createGain(); gainNode.gain.value = 0.3; source.connect(gainNode); gainNode.connect(audioCtx.destination); source.start(0); }

// 入力系
document.getElementById('play').onclick = resetGame; 
document.getElementById('restart-button').onclick = resetGame;

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if (keyStates[k]) return; keyStates[k] = true;
    if(gameOver || !current) return;
    if (k === 'arrowleft') startAutoMove('left', () => movePiece(-1));
    if (k === 'arrowright') startAutoMove('right', () => movePiece(1));
    if (k === 'arrowdown') startAutoMove('down', drop, 20, false);
    
    // 【修正】Spin系入力開始: クラスを付与
    if (k === 'arrowup' || k === 'x') { rotate(1); canvas.classList.add('anim-spin-r'); isSpinning = true; }
    if (k === 'z') { rotate(-1); canvas.classList.add('anim-spin-l'); isSpinning = true; }
    
    // 【修正】ハードドロップ: アニメーションをトリガー
    if (k === ' ') { 
        while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) { current.pos.y++; } 
        triggerBoardAnim('anim-harddrop');
        lockPiece(); 
    }
    if (k === 'c' || k === 'shift') hold();
});

// 【修正】keyup: Spinクラスを解除
window.addEventListener('keyup', e => { 
    const k = e.key.toLowerCase(); keyStates[k] = false; 
    if (k === 'arrowleft') stopAutoMove('left'); 
    if (k === 'arrowright') stopAutoMove('right'); 
    if (k === 'arrowdown') stopAutoMove('down'); 
    if (k === 'arrowup' || k === 'x' || k === 'z') {
        canvas.classList.remove('anim-spin-l', 'anim-spin-r');
        isSpinning = false;
    }
});
