const root = document.getElementById('game-root');
root.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
        <div class="ui-text">HOLD</div>
        <canvas id="hold-canvas" width="72" height="72"></canvas>
    </div>
    <div style="position:relative;">
        <div class="ui-layer">
            <div class="ui-text">SCORE</div><div id="score-display" class="ui-val">0</div>
            <div style="margin-top:10px;" class="ui-text">LINES</div><div id="line-count" class="ui-val">0</div>
        </div>
        <canvas id="tetris" width="240" height="520"></canvas>
    </div>
    <div style="display:flex; flex-direction:column; align-items:center; gap:10px;">
        <div class="ui-text">NEXT</div>
        <canvas id="next-canvas" width="72" height="200"></canvas>
    </div>
    <div id="game-over-screen">
        <h1 style="color:#f33; font-size:48px;">GAME OVER</h1>
        <button id="restart-button" style="padding:10px 20px; cursor:pointer;">RETRY</button>
    </div>
`;

const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');

const SIZE = 24, COLS = 10, TOTAL_ROWS = 40, DISPLAY_START = 18;
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#6730bf', s:'#00ee00', z:'#ff4d4d', j:'#006eff', l:'#eeaa00' };
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};
const SRS = {
    "0->1": [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]], "1->0": [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]],
    "1->2": [[0,0], [ 1,0], [ 1,-1], [0, 2], [ 1, 2]], "2->1": [[0,0], [-1,0], [-1, 1], [0,-2], [-1,-2]],
    "2->3": [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]], "3->2": [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]],
    "3->0": [[0,0], [-1,0], [-1,-1], [0, 2], [-1, 2]], "0->3": [[0,0], [ 1,0], [ 1, 1], [0,-2], [ 1,-2]]
};

let board, current, gameOver = true, holdPiece, canHold, bag, nextQueue, score, totalLines;
let lockDelayTimer = null, lockResetCount = 0, rotationState = 0, lastMoveWasRotate = false;

function collide(b, p, ox=0, oy=0) {
    for(let y=0; y<p.shape.length; y++) {
        for(let x=0; x<p.shape[y].length; x++) {
            if(p.shape[y][x]) {
                let ny = p.pos.y + y + oy, nx = p.pos.x + x + ox;
                if(ny >= TOTAL_ROWS || nx < 0 || nx >= COLS || (ny >= 0 && b[ny][nx])) return true;
            }
        }
    }
    return false;
}

function spawn(type = null) {
    if(lockDelayTimer) { clearTimeout(lockDelayTimer); lockDelayTimer = null; }
    lockResetCount = 0; rotationState = 0; lastMoveWasRotate = false;
    if(nextQueue.length < 5) {
        let b = ['i','o','t','s','z','j','l'].sort(() => Math.random()-0.5);
        nextQueue.push(...b);
    }
    let t = type || nextQueue.shift();
    current = { pos: {x: 3, y: 17}, shape: SHAPES[t], type: t };
    if(collide(board, current)) gameOver = true;
    canHold = true;
    drawSide();
}

function rotate(dir) {
    if(gameOver || !current) return;
    const oldShape = current.shape;
    const oldRS = rotationState;
    current.shape = dir === 1 
        ? current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse())
        : current.shape[0].map((_, i) => current.shape.map(row => row[row.length-1-i]));
    rotationState = (rotationState + dir + 4) % 4;

    const kicks = SRS[`${oldRS}->${rotationState}`] || [[0,0]];
    let success = false;
    for(let k of kicks) {
        if(!collide(board, current, k[0], -k[1])) {
            current.pos.x += k[0]; current.pos.y -= k[1];
            success = true; break;
        }
    }

    if(!success) {
        current.shape = oldShape; rotationState = oldRS;
    } else {
        lastMoveWasRotate = true;
        if(lockDelayTimer && lockResetCount < 15) { clearTimeout(lockDelayTimer); lockDelayTimer = null; lockResetCount++; }
        if(checkSpin()) {
            canvas.classList.remove('anim-special-spin-l', 'anim-special-spin-r');
            void canvas.offsetWidth;
            canvas.classList.add(dir === 1 ? 'anim-special-spin-r' : 'anim-special-spin-l');
        }
    }
}

function checkSpin() {
    if(!lastMoveWasRotate) return false;
    let corners = 0;
    [{x:0,y:0},{x:2,y:0},{x:0,y:2},{x:2,y:2}].forEach(p => {
        let nx = current.pos.x + p.x, ny = current.pos.y + p.y;
        if(nx < 0 || nx >= COLS || ny >= TOTAL_ROWS || (ny >= 0 && board[ny][nx])) corners++;
    });
    return corners >= 3;
}

function drop() {
    if(gameOver || !current) return;
    if(!collide(board, current, 0, 1)) {
        current.pos.y++;
        if(lockDelayTimer) { clearTimeout(lockDelayTimer); lockDelayTimer = null; }
    } else {
        if(!lockDelayTimer) lockDelayTimer = setTimeout(lockPiece, 500);
    }
}

function lockPiece() {
    current.shape.forEach((row, y) => row.forEach((v, x) => {
        if(v) { let ny = current.pos.y + y; if(ny >= 0) board[ny][current.pos.x + x] = COLORS[current.type]; }
    }));
    let lines = 0;
    board = board.filter(row => { if(row.every(c => c !== null)) { lines++; return false; } return true; });
    while(board.length < TOTAL_ROWS) board.unshift(Array(COLS).fill(null));
    score += lines * 100; totalLines += lines;
    document.getElementById('score-display').innerText = score;
    document.getElementById('line-count').innerText = totalLines;
    spawn();
}

function drawSide() {
    hCtx.clearRect(0,0,72,72); if(holdPiece) {
        SHAPES[holdPiece].forEach((row, y) => row.forEach((v, x) => {
            if(v) { hCtx.fillStyle = COLORS[holdPiece]; hCtx.fillRect(x*15+10, y*15+10, 14, 14); }
        }));
    }
    nCtx.clearRect(0,0,72,200); nextQueue.slice(0, 4).forEach((t, i) => {
        SHAPES[t].forEach((row, y) => row.forEach((v, x) => {
            if(v) { nCtx.fillStyle = COLORS[t]; nCtx.fillRect(x*12+10, y*12 + i*45 + 10, 11, 11); }
        }));
    });
}

function update() {
    if(gameOver) { document.getElementById('game-over-screen').style.display = 'flex'; return; }
    ctx.fillStyle = '#050505'; ctx.fillRect(0,0,canvas.width,canvas.height);
    board.forEach((row, y) => row.forEach((c, x) => {
        if(c && y >= DISPLAY_START) {
            ctx.globalAlpha = y < 20 ? 0.3 : 1; ctx.fillStyle = c;
            ctx.fillRect(x*SIZE, (y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1);
        }
    }));
    if(current) {
        let op = lockDelayTimer ? 0.4 : 1.0;
        ctx.fillStyle = COLORS[current.type];
        current.shape.forEach((row, y) => row.forEach((v, x) => {
            if(v) {
                let cy = current.pos.y + y;
                if(cy >= DISPLAY_START) {
                    ctx.globalAlpha = (cy < 20 ? 0.4 : 1.0) * op;
                    ctx.fillRect((current.pos.x+x)*SIZE, (cy-DISPLAY_START)*SIZE, SIZE-1, SIZE-1);
                }
            }
        }));
    }
    requestAnimationFrame(update);
}

function initGame() {
    board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
    nextQueue = []; holdPiece = null; score = 0; totalLines = 0;
    gameOver = false; document.getElementById('game-root').style.visibility = 'visible';
    document.getElementById('room-setup').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';
    spawn(); update();
    setInterval(() => { if(!gameOver) drop(); }, 1000);
}

document.getElementById('play').onclick = initGame;
document.getElementById('restart-button').onclick = initGame;

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); if(gameOver) return;
    if(k === 'arrowleft' && !collide(board, current, -1, 0)) { current.pos.x--; lastMoveWasRotate=false; if(lockDelayTimer && lockResetCount < 15) { clearTimeout(lockDelayTimer); lockDelayTimer=null; lockResetCount++; } }
    if(k === 'arrowright' && !collide(board, current, 1, 0)) { current.pos.x++; lastMoveWasRotate=false; if(lockDelayTimer && lockResetCount < 15) { clearTimeout(lockDelayTimer); lockDelayTimer=null; lockResetCount++; } }
    if(k === 'arrowdown') drop();
    if(k === 'arrowup' || k === 'x') rotate(1);
    if(k === 'z') rotate(-1);
    if(k === 'c' || k === 'shift') {
        if(canHold) {
            let old = holdPiece; holdPiece = current.type; spawn(old); canHold = false;
        }
    }
    if(k === ' ') {
        while(!collide(board, current, 0, 1)) current.pos.y++;
        canvas.classList.remove('anim-harddrop'); void canvas.offsetWidth; canvas.classList.add('anim-harddrop');
        lockPiece();
    }
});
