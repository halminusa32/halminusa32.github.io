const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

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

let board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
let current = null, gameOver = true, holdPiece = null, canHold = true, bag = [], nextQueue = [];
let lockTimer = null, gameInterval = null, requestID = null, rotationState = 0, lockResetCount = 0;
const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;
let score = 0, totalLines = 0, level = 1, particles = []; 
let keyStates = {}, moveTimers = {};

function triggerBoardAnim(cls) {
    canvas.classList.remove('anim-harddrop', 'anim-hit-left', 'anim-hit-right');
    void canvas.offsetWidth;
    canvas.classList.add(cls);
    if(!cls.includes('spin')) setTimeout(() => canvas.classList.remove(cls), 200);
}

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
    let nextP = { pos:{x: (t === 'o') ? 4 : 3, y: 18}, shape:SHAPES[t], type:t };
    while (collide(board, nextP) && nextP.pos.y > 0) nextP.pos.y--;
    if (collide(board, nextP)) { showGameOver(); return; }
    current = nextP; drawNext(); drawHold();
}

function lockPiece() {
    if (!current || gameOver) return;
    if (!collide(board, { pos: { x: current.pos.x, y: current.pos.y + 1 }, shape: current.shape })) return;
    
    current.shape.forEach((row, y) => row.forEach((val, x) => {
        if (val) {
            let ny = current.pos.y + y;
            if (ny >= 0 && ny < TOTAL_ROWS) board[ny][current.pos.x + x] = COLORS[current.type];
        }
    }));

    let lines = [];
    board.forEach((row, y) => { if (row.every(cell => cell !== null)) lines.push(y); });
    if (lines.length > 0) {
        playSound('clear');
        lines.forEach(y => {
            for(let x=0; x<COLS; x++) particles.push({x:x*SIZE+12, y:(y-DISPLAY_START_ROW)*SIZE+12, vx:(Math.random()-0.5)*10, vy:(Math.random()-5)*2, life:1, color:'#fff'});
            board.splice(y, 1); board.unshift(Array(COLS).fill(null));
        });
        score += lines.length * 100 * level; totalLines += lines.length;
        document.getElementById('score-display').innerText = score;
        document.getElementById('line-count').innerText = totalLines;
    } else playSound('lock');

    canHold = true; spawn();
}

function drop() {
    if(gameOver || !current) return;
    current.pos.y++;
    if(collide(board, current)) { current.pos.y--; lockPiece(); }
}

function rotate(dir) {
    if(gameOver || !current) return;
    const oldS = current.shape, oldP = {...current.pos}, oldR = rotationState;
    if(dir === 1) current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    else current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[row.length-1-i]));
    rotationState = (rotationState + dir + 4) % 4;
    let kicks = SRS_KICKS[`${oldR}->${rotationState}`] || [[0,0]];
    if(!kicks.some(k => { current.pos.x = oldP.x + k[0]; current.pos.y = oldP.y - k[1]; return !collide(board, current); })) {
        current.shape = oldS; current.pos = oldP; rotationState = oldR;
    } else playSound('rotate');
}

function move(dir) {
    if(gameOver || !current) return;
    current.pos.x += dir;
    if(collide(board, current)) { current.pos.x -= dir; triggerBoardAnim(dir < 0 ? 'anim-hit-left' : 'anim-hit-right'); return false; }
    playSound('move'); return true;
}

function startAutoMove(key, action, interval = 30) {
    if (moveTimers[key]) return;
    action(); moveTimers[key] = { timeout: setTimeout(() => { moveTimers[key].interval = setInterval(action, interval); }, 150) };
}
function stopAutoMove(key) { if (moveTimers[key]) { clearTimeout(moveTimers[key].timeout); clearInterval(moveTimers[key].interval); delete moveTimers[key]; } }

function drawBlock(c, x, y, color, op = 1, sz = SIZE) { c.globalAlpha = op; c.fillStyle = color; c.fillRect(x*sz, y*sz, sz-1, sz-1); c.globalAlpha = 1; }

function update() {
    if (gameOver) return;
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle = '#111';
    for(let i=0; i<=COLS; i++) { ctx.beginPath(); ctx.moveTo(i*SIZE,0); ctx.lineTo(i*SIZE,canvas.height); ctx.stroke(); }
    board.forEach((row, y) => row.forEach((color, x) => {
        if(color && y >= DISPLAY_START_ROW) drawBlock(ctx, x, y-DISPLAY_START_ROW, color, y<20 ? 0.3 : 1);
    }));
    if(current) {
        let g = {...current.pos}; while(!collide(board, {pos:{x:g.x, y:g.y+1}, shape:current.shape})) g.y++;
        current.shape.forEach((row, y) => row.forEach((v, x) => {
            if(v) {
                let dy = g.y+y-DISPLAY_START_ROW; if(dy>=0) drawBlock(ctx, g.x+x, dy, COLORS[current.type], 0.15);
                let cy = current.pos.y+y-DISPLAY_START_ROW; if(cy>=0) drawBlock(ctx, current.pos.x+x, cy, COLORS[current.type], current.pos.y+y<20 ? 0.5 : 1);
            }
        }));
    }
    particles.forEach((p, i) => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.5; p.life -= 0.02;
        if(p.life <= 0) particles.splice(i, 1);
        else { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 4, 4); }
    });
    requestAnimationFrame(update);
}

function drawHold() {
    hCtx.clearRect(0,0,60,60); if(!holdPiece) return;
    SHAPES[holdPiece].forEach((row, y) => row.forEach((v, x) => { if(v) drawBlock(hCtx, x+1, y+1, COLORS[holdPiece], 1, 12); }));
}
function drawNext() {
    nCtx.clearRect(0,0,60,220);
    nextQueue.forEach((t, i) => {
        SHAPES[t].forEach((row, y) => row.forEach((v, x) => { if(v) drawBlock(nCtx, x+1, y + 1 + i*4, COLORS[t], 1, 10); }));
    });
}

const SOUND_FILES = { move: 'https://halminusa32.github.io/halris/solo/move.mp3', rotate: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', clear: 'https://halminusa32.github.io/halris/solo/solian-te-n1.mp3', lock: 'https://actions.google.com/sounds/v1/foley/button_click.ogg', hold: 'https://actions.google.com/sounds/v1/foley/camera_shutter.ogg' };
let audioCtx = null, audioBuffers = {};
function initAudio() { if(audioCtx) return; audioCtx = new AudioContext(); Object.keys(SOUND_FILES).forEach(n => fetch(SOUND_FILES[n]).then(r => r.arrayBuffer()).then(d => audioCtx.decodeAudioData(d)).then(b => audioBuffers[n] = b)); }
function playSound(n) { if(audioBuffers[n]) { let s = audioCtx.createBufferSource(); s.buffer = audioBuffers[n]; s.connect(audioCtx.destination); s.start(0); } }

function showGameOver() { gameOver = true; document.getElementById('game-over-screen').style.display = 'flex'; clearInterval(gameInterval); }

function resetGame() {
    initAudio();
    board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
    score = 0; totalLines = 0; level = 1; gameOver = false; holdPiece = null; bag = []; nextQueue = []; particles = [];
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    refillBag(); updateNextQueue(); spawn(); update();
    if(gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(drop, 1000);
}

document.getElementById('play').onclick = resetGame;
document.getElementById('restart-button').onclick = resetGame;

window.addEventListener('keydown', e => {
    let k = e.key.toLowerCase(); if(keyStates[k] || gameOver) return; keyStates[k] = true;
    if(k === 'arrowleft') startAutoMove('l', () => move(-1));
    if(k === 'arrowright') startAutoMove('r', () => move(1));
    if(k === 'arrowdown') startAutoMove('d', drop, 50);
    if(k === 'arrowup' || k === 'x') { rotate(1); canvas.classList.add('anim-spin-r'); }
    if(k === 'z') { rotate(-1); canvas.classList.add('anim-spin-l'); }
    if(k === ' ') { while(!collide(board,{pos:{x:current.pos.x,y:current.pos.y+1},shape:current.shape})) current.pos.y++; triggerBoardAnim('anim-harddrop'); lockPiece(); }
    if(k === 'c' || k === 'shift') { if(canHold) { let t = holdPiece; holdPiece = current.type; canHold = false; spawn(t); playSound('hold'); } }
});
window.addEventListener('keyup', e => {
    let k = e.key.toLowerCase(); keyStates[k] = false;
    if(k === 'arrowleft') stopAutoMove('l'); if(k === 'arrowright') stopAutoMove('r'); if(k === 'arrowdown') stopAutoMove('d');
    if(k === 'arrowup' || k === 'x' || k === 'z') canvas.classList.remove('anim-spin-l', 'anim-spin-r');
});
