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

const VISIBLE_ROWS = 20, TOTAL_ROWS = 40, COLS = 10, SIZE = 24; 
// 0-19が隠し領域、20-39が表示領域。DEADLINEは20行目。
const DISPLAY_START_ROW = 20; 

const COLORS = { 
    i:'#00eeee', o:'#eeee00', t:'#6730bf', s:'#00ee00', z:'#ff4d4d', j:'#006eff', l:'#eeaa00'
};
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
const SRS_KICKS_I = {
    "0->1": [[0,0], [-2,0], [ 1,0], [-2,-1], [ 1, 2]], "1->0": [[0,0], [ 2,0], [-1,0], [ 2, 1], [-1,-2]],
    "1->2": [[0,0], [-1,0], [ 2,0], [-1, 2], [ 2,-1]], "2->1": [[0,0], [ 1,0], [-2,0], [ 1,-2], [-2, 1]],
    "2->3": [[0,0], [ 2,0], [-1,0], [ 2, 1], [-1,-2]], "3->2": [[0,0], [-2,0], [ 1,0], [-2,-1], [ 1, 2]],
    "3->0": [[0,0], [ 1,0], [-2,0], [ 1,-2], [-2, 1]], "0->3": [[0,0], [-1,0], [ 2,0], [-1, 2], [ 2,-1]]
};

let board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
let current = null, gameOver = false, holdPiece = null, canHold = true, bag = [], nextQueue = [];
let lockTimer = null, gameInterval = null, requestID = null, rotationState = 0, lockResetCount = 0;
const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;
let rotationTimestamps = [], score = 0, totalLines = 0, comboCount = -1;
let clearingLines = [], clearAnimTimer = 0, level = 1;
const DAS_DELAY = 150, ARR_SPEED = 30, SOFT_DROP_SPEED = 15; 
let keyStates = {}, moveTimers = {};   

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

function spawn(type = null) {
    lockResetCount = 0; rotationState = 0;
    let t = type || nextQueue.shift(); updateNextQueue();
    let startX = (t === 'o') ? 4 : 3;
    
    // 出現位置：20行目(インデックス19)に少し触れる高さ(y=18)から開始
    let nextP = { pos:{x: startX, y: 18}, shape:SHAPES[t], type:t };

    // 埋まっているなら上にずらす
    while (collide(board, nextP) && nextP.pos.y > 20 - nextP.shape.length - 1) {
        nextP.pos.y--;
    }

    // Block Out判定：20行目(インデックス19)以降に1マスも触れていない、または衝突中なら死亡
    let isAnyInVisible = false;
    for (let y = 0; y < nextP.shape.length; y++) {
        for (let x = 0; x < nextP.shape[y].length; x++) {
            if (nextP.shape[y][x] && (nextP.pos.y + y) >= 19) isAnyInVisible = true;
        }
    }

    if (collide(board, nextP) || !isAnyInVisible) {
        showGameOver(); return;
    }

    current = nextP; drawNext(); drawHold();
}

function lockPiece() {
    if (!current || gameOver) return;
    if (!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) { lockTimer = null; return; }
    
    let isAnyInVisible = false;
    for (let y=0; y<current.shape.length; y++) {
        for (let x=0; x<current.shape[y].length; x++) {
            if (current.shape[y][x]) { 
                let ny = current.pos.y + y, nx = current.pos.x + x; 
                if (ny >= 0 && ny < TOTAL_ROWS) {
                    board[ny][nx] = COLORS[current.type];
                    if (ny >= 19) isAnyInVisible = true;
                }
            }
        }
    }

    // Lock Out判定
    if (!isAnyInVisible) { showGameOver(); return; }

    clearingLines = [];
    for (let y = 0; y < TOTAL_ROWS; y++) { if (board[y].every(cell => cell !== null)) clearingLines.push(y); }
    if (clearingLines.length > 0) {
        playSound('clear');
        clearAnimTimer = 18; 
        score += clearingLines.length * 100 * level;
        totalLines += clearingLines.length;
    } else {
        playSound('lock'); finishLocking();
    }
}

function finishLocking() {
    let nextB = board.filter((_, i) => !clearingLines.includes(i));
    while (nextB.length < TOTAL_ROWS) nextB.unshift(Array(COLS).fill(null));
    board = nextB;
    canHold = true;
    level = Math.floor(totalLines / 10) + 1;
    document.getElementById('line-count').innerText = totalLines;
    document.getElementById('score-display').innerText = score;
    document.getElementById('level').innerText = level;
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    clearingLines = []; spawn();
}

function drop() { 
    if(gameOver || !current || clearAnimTimer > 0) return; 
    current.pos.y++; 
    if (collide(board, current)) { current.pos.y--; } 
}

function rotate(dir = 1) {
    if (gameOver || !current || clearAnimTimer > 0) return;
    const oldS = JSON.parse(JSON.stringify(current.shape)), oldP = {...current.pos}, oldRS = rotationState;
    if (dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length - 1 - i]));
    rotationState = (rotationState + dir + 4) % 4;

    let kickSet = (current.type === 'i') ? SRS_KICKS_I[`${oldRS}->${rotationState}`] : SRS_KICKS[`${oldRS}->${rotationState}`];
    kickSet = kickSet || [[0,0]];
    let success = false;
    for (let k of kickSet) {
        current.pos.x = oldP.x + k[0]; current.pos.y = oldP.y - k[1];
        if (!collide(board, current)) { success = true; break; }
    }
    if (!success) { current.shape = oldS; current.pos = oldP; rotationState = oldRS; } 
    else { playSound('rotate'); handleMoveReset(); }
}

function movePiece(dir) {
    if (gameOver || !current || clearAnimTimer > 0) return;
    current.pos.x += dir;
    if (collide(board, current)) { current.pos.x -= dir; return false; }
    playSound('move'); handleMoveReset(); return true;
}

function startAutoMove(key, action, interval = ARR_SPEED, useDas = true) {
    if (moveTimers[key]) return;
    action(); 
    if (useDas) moveTimers[key] = { timeout: setTimeout(() => { moveTimers[key].interval = setInterval(action, interval); }, DAS_DELAY) };
    else moveTimers[key] = { interval: setInterval(action, interval) };
}

function stopAutoMove(key) { if (moveTimers[key]) { clearTimeout(moveTimers[key].timeout); clearInterval(moveTimers[key].interval); delete moveTimers[key]; } }

function handleMoveReset() {
    if (current && collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) {
        if (lockResetCount < MAX_LOCK_RESETS) { lockResetCount++; resetLockTimer(); }
    }
}

function resetLockTimer() { if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } }

function hold() {
    if (!canHold || gameOver || clearAnimTimer > 0) return;
    playSound('hold');
    let tempType = current.type;
    if (holdPiece) { let t = holdPiece; holdPiece = tempType; spawn(t); } 
    else { holdPiece = tempType; spawn(); }
    canHold = false; drawHold();
}

function drawBlock(c, x, y, color, op = 1, sz = SIZE) { c.globalAlpha = op; c.fillStyle = color; c.fillRect(x * sz, y * sz, sz - 0.5, sz - 0.5); c.globalAlpha = 1; }

function drawGhost() {
    if (!current || clearAnimTimer > 0) return;
    let g = { ...current.pos };
    while (!collide(board, { pos: { x: g.x, y: g.y + 1 }, shape: current.shape })) g.y++;
    for (let y=0; y<current.shape.length; y++) {
        for (let x=0; x<current.shape[y].length; x++) { 
            let drawY = g.y + y - DISPLAY_START_ROW;
            if (current.shape[y][x] && drawY >= 0 && drawY < VISIBLE_ROWS) drawBlock(ctx, g.x+x, drawY, COLORS[current.type], 0.2); 
        }
    }
}

function drawHold() {
    hCtx.clearRect(0,0,hCanvas.width,hCanvas.height); if (!holdPiece) return;
    const offX = (holdPiece === 'i' || holdPiece === 'o') ? 0.5 : 1;
    for (let y=0; y<SHAPES[holdPiece].length; y++) {
        for (let x=0; x<SHAPES[holdPiece][y].length; x++) { if (SHAPES[holdPiece][y][x]) drawBlock(hCtx, x+offX, y+1, COLORS[holdPiece], 1, 15); }
    }
}

function drawNext() {
    nCtx.clearRect(0, 0, nCanvas.width, nCanvas.height);
    for (let i = 0; i < 5; i++) {
        let t = nextQueue[i]; if (!t) continue;
        const isFirst = (i === 0);
        const blockSize = isFirst ? 15 : 11;
        const offX = (t === 'i' || t === 'o') ? 0.5 : 1;
        let yPos = isFirst ? 1 : 4.8 + (i - 1) * 3.2;
        for (let y = 0; y < SHAPES[t].length; y++) {
            for (let x = 0; x < SHAPES[t][y].length; x++) {
                if (SHAPES[t][y][x]) drawBlock(nCtx, x + offX, y + yPos, COLORS[t], 1, blockSize);
            }
        }
    }
}

function update() {
    if (gameOver) return;
    if (clearAnimTimer > 0) { clearAnimTimer--; if (clearAnimTimer === 0) finishLocking(); } 
    else {
        const grounded = current && collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape });
        if (grounded && !lockTimer) lockTimer = setTimeout(lockPiece, LOCK_DELAY);
    }
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0,0,canvas.width,canvas.height);
    
    // 描画範囲：20行目(インデックス20)から39行目まで
    for (let y = DISPLAY_START_ROW; y < TOTAL_ROWS; y++) { 
        for (let x = 0; x < COLS; x++) { 
            if (board[y][x]) { 
                let color = board[y][x];
                if (clearingLines.includes(y)) color = "#ffffff";
                drawBlock(ctx, x, y - DISPLAY_START_ROW, color); 
            } 
        } 
    }
    
    if(current && clearAnimTimer === 0) {
        drawGhost();
        for (let y=0; y<current.shape.length; y++) { 
            for (let x=0; x<current.shape[y].length; x++) { 
                let drawY = current.pos.y + y - DISPLAY_START_ROW;
                if (current.shape[y][x] && drawY >= 0 && drawY < VISIBLE_ROWS) {
                    if (board[current.pos.y + y][current.pos.x + x] === null) {
                        drawBlock(ctx, current.pos.x+x, drawY, COLORS[current.type]); 
                    }
                } 
            } 
        }
    }
    requestID = requestAnimationFrame(update);
}

function showGameOver() { gameOver = true; document.getElementById('game-over-screen').style.display = 'flex'; }

function updateDropSpeed() {
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(drop, Math.max(50, 1000 * Math.pow(0.85, level - 1)));
}

function resetGame() {
    initAudio(); 
    document.getElementById('game-over-screen').style.display = 'none';
    board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
    gameOver = false; current = null; holdPiece = null; canHold = true; bag = []; nextQueue = []; 
    score = 0; totalLines = 0; level = 1; clearAnimTimer = 0;
    refillBag(); updateNextQueue(); spawn(); update(); updateDropSpeed();
}

const SOUND_FILES = { move: 'https://halminusa32.github.io/halris/solo/move.mp3', rotate: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', clear: 'https://halminusa32.github.io/halris/solo/solian-te-n1.mp3', lock: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', hold: 'https://actions.google.com/sounds/v1/foley/camera_shutter.ogg', gameover: 'https://actions.google.com/sounds/v1/human_voices/female_voice_goodbye.ogg' };
let audioCtx = null; const audioBuffers = {};
function initAudio() { if (audioCtx) return; audioCtx = new (window.AudioContext || window.webkitAudioContext)(); Object.keys(SOUND_FILES).forEach(name => { fetch(SOUND_FILES[name]).then(res => res.arrayBuffer()).then(data => audioCtx.decodeAudioData(data)).then(buffer => { audioBuffers[name] = buffer; }); }); }
function playSound(name) { if (!audioCtx || !audioBuffers[name]) return; const source = audioCtx.createBufferSource(); source.buffer = audioBuffers[name]; const gainNode = audioCtx.createGain(); gainNode.gain.value = 0.3; source.connect(gainNode); gainNode.connect(audioCtx.destination); source.start(0); }

document.getElementById('play').onclick = resetGame; 
document.getElementById('restart-button').onclick = resetGame;

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if (keyStates[k]) return; keyStates[k] = true;
    if(gameOver || !current || clearAnimTimer > 0) return;
    if (k === 'arrowleft') startAutoMove('left', () => movePiece(-1));
    if (k === 'arrowright') startAutoMove('right', () => movePiece(1));
    if (k === 'arrowdown') startAutoMove('down', drop, SOFT_DROP_SPEED, false);
    if (k === 'arrowup' || k === 'x') rotate(1);
    if (k === 'z') rotate(-1);
    if (k === ' ') { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) { current.pos.y++; } lockPiece(); }
    if (k === 'c' || k === 'shift') hold();
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keyStates[k] = false; if (k === 'arrowleft') stopAutoMove('left'); if (k === 'arrowright') stopAutoMove('right'); if (k === 'arrowdown') stopAutoMove('down'); });
