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

// 20マスが表示領域、合計40マス。インデックス19が「20マス目(表示最上段)」
const VISIBLE_ROWS = 20, TOTAL_ROWS = 40, COLS = 10, SIZE = 24; 
const DEADLINE_INDEX = 19; // 上から数えて20番目（0-19）が表示領域の最上段

const COLORS = { 
    i:'#00eeee', o:'#eeee00', t:'#6730bf', s:'#00ee00', z:'#ff4d4d', j:'#006eff', l:'#eeaa00',
    i_evolved: '#eeee00', o_huge: '#eeee00'
};
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};
const SHAPE_I_VERTICAL = [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]];
const SHAPE_O_HUGE = [[1,1,1],[1,1,1],[1,1,1]];

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
let rotationTimestamps = [], score = 0, totalLines = 0;
let comboCount = -1, isBackToBack = false;
let clearingLines = []; 
let clearAnimTimer = 0;
let level = 1;
const MAX_LEVEL = 15; 
const DAS_DELAY = 150, ARR_SPEED = 30, SOFT_DROP_SPEED = 15; 
let keyStates = {}, moveTimers = {};   

function sync(forceReset = false) {
    if(gameOver && !forceReset) return;
    const data = forceReset ? { board: Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null)), pos: {x:0,y:0}, type: 'none' } : { board, pos: current ? current.pos : {x:0,y:0}, type: current ? current.type : 'none', shape: current ? current.shape : [] };
    set(ref(db, `games/${roomId}/player`), data);
}

function refillBag() {
    let p = ['i','o','t','s','z','j','l'];
    for(let i=p.length-1; i>0; i--) { let j=Math.floor(Math.random()*(i+1)); [p[i],p[j]]=[p[j],p[i]]; }
    bag = [...p];
}

function updateNextQueue() { while(nextQueue.length < 5) { if(bag.length === 0) refillBag(); nextQueue.push(bag.pop()); } }

function collide(b, p) {
    if (!p || !p.shape) return false;
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

function movePiece(dir) {
    if (gameOver || !current || clearAnimTimer > 0) return;
    current.pos.x += dir;
    if (collide(board, current)) { current.pos.x -= dir; return false; }
    playSound('move'); handleMoveReset(); sync(); return true;
}

function startAutoMove(key, action, interval = ARR_SPEED, useDas = true) {
    if (moveTimers[key]) return;
    action(); 
    if (useDas) moveTimers[key] = { timeout: setTimeout(() => { moveTimers[key].interval = setInterval(action, interval); }, DAS_DELAY) };
    else moveTimers[key] = { interval: setInterval(action, interval) };
}

function stopAutoMove(key) { if (moveTimers[key]) { clearTimeout(moveTimers[key].timeout); clearInterval(moveTimers[key].interval); delete moveTimers[key]; } }

function rotate(dir = 1) {
    if (gameOver || !current || clearAnimTimer > 0) return;
    const now = Date.now();
    let justEvolved = false;
    if (['o', 's', 'z'].includes(current.type)) {
        rotationTimestamps.push(now);
        while(rotationTimestamps.length > 0 && now - rotationTimestamps[0] > 1000) rotationTimestamps.shift();
        if (rotationTimestamps.length >= 10) {
            if (!current.isEvolvedToO && (current.type === 's' || current.type === 'z')) {
                current.shape = JSON.parse(JSON.stringify(SHAPES['o']));
                current.isEvolvedToO = true; justEvolved = true;
            } else if (current.type === 'o' || current.isEvolvedToO) {
                if (Math.random() < 0.05) { current.shape = JSON.parse(JSON.stringify(SHAPE_O_HUGE)); current.type = 'o_huge'; }
                else { current.shape = JSON.parse(JSON.stringify(SHAPE_I_VERTICAL)); current.isEvolvedToI = true; }
                justEvolved = true;
            }
            if (justEvolved) { rotationTimestamps = []; }
        }
    }
    const oldS = JSON.parse(JSON.stringify(current.shape)), oldP = {...current.pos}, oldRS = rotationState;
    if (!justEvolved) {
        if (dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
        else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length - 1 - i]));
        rotationState = (rotationState + dir + 4) % 4;
    }
    let success = false, kickSet = [];
    if (current.type === 'i' || current.isEvolvedToI) kickSet = SRS_KICKS_I[`${oldRS}->${rotationState}`] || [[0,0]];
    else if (current.type === 'o' || current.type === 'o_huge' || current.isEvolvedToO) kickSet = [[0,0], [0,1], [-1,0], [1,0], [0,-1], [-1,1], [1,1], [-2,0], [2,0]];
    else kickSet = SRS_KICKS[`${oldRS}->${rotationState}`] || [[0,0]];
    for (let k of kickSet) {
        current.pos.x = oldP.x + k[0]; current.pos.y = oldP.y - k[1];
        if (!collide(board, current)) { success = true; break; }
    }
    if (!success) { current.shape = oldS; current.pos = oldP; rotationState = oldRS; } 
    else { playSound('rotate'); handleMoveReset(); sync(); }
}

function handleMoveReset() {
    if (!current) return;
    if (collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) {
        if (lockResetCount < MAX_LOCK_RESETS) { lockResetCount++; resetLockTimer(); }
    } else resetLockTimer();
}

function resetLockTimer() { if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; } }

function lockPiece() {
    if (!current || gameOver) return;
    if (!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) { lockTimer = null; return; }
    
    // 【判定】固定されるミノのうち、1マスでも表示領域(インデックス19以降)にあるか
    let isAnyInVisible = false;
    for (let y=0; y<current.shape.length; y++) {
        for (let x=0; x<current.shape[y].length; x++) {
            if (current.shape[y][x]) { 
                let ny = current.pos.y + y, nx = current.pos.x + x; 
                if (ny >= 0 && ny < TOTAL_ROWS) {
                    board[ny][nx] = COLORS[current.type];
                    if (ny >= DEADLINE_INDEX) isAnyInVisible = true;
                }
            }
        }
    }

    // 【Lock Out判定】表示領域（20マス目以降）に1マスも置けなかったら死亡
    if (!isAnyInVisible) {
        showGameOver();
        return;
    }

    clearingLines = [];
    for (let y = 0; y < TOTAL_ROWS; y++) { if (board[y].every(cell => cell !== null)) clearingLines.push(y); }
    const isSpin = (rotationTimestamps.length > 0);
    const cleared = clearingLines.length;
    if (cleared > 0) {
        if (cleared === 4) playSound('tetris'); else playSound('clear');
        clearAnimTimer = 18; 
        score += Math.floor(cleared * 100 * level);
        totalLines += cleared;
    } else {
        comboCount = -1; playSound('lock'); finishLocking();
    }
}

function finishLocking() {
    let nextB = board.filter((_, i) => !clearingLines.includes(i));
    while (nextB.length < TOTAL_ROWS) nextB.unshift(Array(COLS).fill(null));
    board = nextB;
    canHold = true;
    level = Math.min(15, Math.floor(totalLines / 10) + 1);
    document.getElementById('line-count').innerText = totalLines;
    document.getElementById('score-display').innerText = score;
    document.getElementById('level').innerText = level;
    if (lockTimer) { clearTimeout(lockTimer); lockTimer = null; }
    rotationTimestamps = []; clearingLines = []; 
    spawn();
    // 押しっぱなし入力を再反映
    if (keyStates['arrowleft']) { stopAutoMove('left'); startAutoMove('left', () => movePiece(-1)); }
    if (keyStates['arrowright']) { stopAutoMove('right'); startAutoMove('right', () => movePiece(1)); }
    if (keyStates['arrowdown']) { stopAutoMove('down'); startAutoMove('down', drop, SOFT_DROP_SPEED, false); }
}

function spawn(type = null) {
    lockResetCount = 0; rotationState = 0;
    let t = type || nextQueue.shift(); updateNextQueue();
    let startX = (t === 'o') ? 4 : 3;
    
    // 出現位置：20マス目（19）のすぐ上の隠し領域（17-18あたり）
    let nextP = { pos:{x: startX, y: 17}, shape:SHAPES[t], type:t };

    // 【Block Out判定】表示領域（19行目以降）に、このミノが使える空きマスが1つでもあるか
    let canVisiblePlace = false;
    for (let y = 0; y < nextP.shape.length; y++) {
        for (let x = 0; x < nextP.shape[y].length; x++) {
            if (nextP.shape[y][x]) {
                let ny = nextP.pos.y + y, nx = nextP.pos.x + x;
                if (ny >= DEADLINE_INDEX && ny < TOTAL_ROWS && nx >= 0 && nx < COLS) {
                    if (board[ny][nx] === null) canVisiblePlace = true;
                }
            }
        }
    }

    if (!canVisiblePlace) { showGameOver(); return; }
    current = nextP; drawNext(); drawHold(); sync();
}

function drop() { 
    if(gameOver || !current || clearAnimTimer > 0) return; 
    current.pos.y++; 
    if (collide(board, current)) { current.pos.y--; } 
    else { if (keyStates['arrowdown']) { score += 1; document.getElementById('score-display').innerText = score; } resetLockTimer(); sync(); } 
}

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
            let drawY = g.y + y - DEADLINE_INDEX; // 表示領域へのオフセット
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
        if (isFirst) { nCtx.strokeStyle = '#333'; nCtx.beginPath(); nCtx.moveTo(5, 58); nCtx.lineTo(55, 58); nCtx.stroke(); }
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
    
    // 盤面描画（DEADLINE_INDEXから表示）
    for (let y = DEADLINE_INDEX; y < TOTAL_ROWS; y++) { 
        for (let x = 0; x < COLS; x++) { 
            if (board[y][x]) { 
                let color = board[y][x];
                let opacity = 1;
                if (clearingLines.includes(y)) color = "#ffffff";
                drawBlock(ctx, x, y - DEADLINE_INDEX, color, opacity); 
            } 
        } 
    }
    
    // 操作ミノ描画（重なってる部分は非表示）
    if(current && clearAnimTimer === 0) {
        drawGhost();
        for (let y=0; y<current.shape.length; y++) { 
            for (let x=0; x<current.shape[y].length; x++) { 
                let drawY = current.pos.y + y - DEADLINE_INDEX;
                if (current.shape[y][x] && drawY >= 0 && drawY < VISIBLE_ROWS) {
                    // 盤面と重なっていない部分だけ描画
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

function resetGame() {
    initAudio(); 
    document.getElementById('game-over-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    if (gameInterval) clearInterval(gameInterval); if (requestID) cancelAnimationFrame(requestID);
    board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
    gameOver = false; current = null; holdPiece = null; canHold = true; bag = []; nextQueue = []; 
    score = 0; totalLines = 0; level = 1; clearAnimTimer = 0;
    refillBag(); updateNextQueue(); spawn(); update(); updateDropSpeed();
}

document.addEventListener('DOMContentLoaded', () => { 
    document.getElementById('play').onclick = resetGame; 
    document.getElementById('restart-button').onclick = resetGame; 
});

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if (keyStates[k]) return; keyStates[k] = true;
    if(gameOver || !current || clearAnimTimer > 0) return;
    if (k === 'arrowleft') startAutoMove('left', () => movePiece(-1));
    if (k === 'arrowright') startAutoMove('right', () => movePiece(1));
    if (k === 'arrowdown') startAutoMove('down', drop, SOFT_DROP_SPEED, false);
    if (k === 'arrowup' || k === 'x') rotate(1);
    if (k === 'z') rotate(-1);
    if (k === ' ') { 
        while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) { current.pos.y++; }
        lockPiece(); 
    }
    if (k === 'c' || k === 'shift') hold();
});

window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); keyStates[k] = false; if (k === 'arrowleft') stopAutoMove('left'); if (k === 'arrowright') stopAutoMove('right'); if (k === 'arrowdown') stopAutoMove('down'); });

const bindT = (id, k, act, int = ARR_SPEED, das = true) => {
    const el = document.getElementById(id); if(!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); keyStates[k] = true; if(!gameOver && current && clearAnimTimer === 0) startAutoMove(k, act, int, das); }, {passive:false});
    el.addEventListener('touchend', (e) => { e.preventDefault(); keyStates[k] = false; stopAutoMove(k); }, {passive:false});
};
bindT('ctrl-left', 'arrowleft', () => movePiece(-1));
bindT('ctrl-right', 'arrowright', () => movePiece(1));
bindT('ctrl-down', 'arrowdown', drop, SOFT_DROP_SPEED, false);
const tap = (id, fn) => { const el = document.getElementById(id); if(el) el.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); if(!gameOver && current && clearAnimTimer === 0) fn(); }, {passive:false}); };
tap('ctrl-up', () => { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) { current.pos.y++; } lockPiece(); });
tap('ctrl-rot-r', () => rotate(1)); tap('ctrl-rot-l', () => rotate(-1)); tap('ctrl-hold', hold);

const SOUND_FILES = { move: 'https://halminusa32.github.io/halris/solo/move.mp3', rotate: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', clear: 'https://halminusa32.github.io/halris/solo/solian-te-n1.mp3', lock: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', harddrop: 'https://actions.google.com/sounds/v1/foley/wooden_door_slam.ogg', hold: 'https://actions.google.com/sounds/v1/foley/camera_shutter.ogg', gameover: 'https://actions.google.com/sounds/v1/human_voices/female_voice_goodbye.ogg' };
let audioCtx = null; const audioBuffers = {};
function initAudio() { if (audioCtx) return; audioCtx = new (window.AudioContext || window.webkitAudioContext)(); Object.keys(SOUND_FILES).forEach(name => { fetch(SOUND_FILES[name]).then(res => res.arrayBuffer()).then(data => audioCtx.decodeAudioData(data)).then(buffer => { audioBuffers[name] = buffer; }); }); }
function playSound(name) { if (!audioCtx || !audioBuffers[name]) return; const source = audioCtx.createBufferSource(); source.buffer = audioBuffers[name]; const gainNode = audioCtx.createGain(); gainNode.gain.value = (name === 'move') ? 0.15 : 0.4; source.connect(gainNode); gainNode.connect(audioCtx.destination); source.start(0); }
