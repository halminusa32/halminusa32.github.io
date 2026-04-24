(function() {
    const root = document.createElement('div');
    root.id = 'halris-app';
    document.body.appendChild(root);

    // 1. 低画質用のスタイル注入
    const style = document.createElement('style');
    style.textContent = `
        body { margin: 0; background: #000; color: #0f0; font-family: monospace; overflow: hidden; }
        #halris-app { display: flex; justify-content: center; align-items: center; height: 100vh; gap: 10px; }
        .panel { display: flex; flex-direction: column; align-items: center; width: 60px; }
        .label { color: #444; font-size: 10px; }
        .value { color: #0f0; font-size: 14px; margin-bottom: 10px; }
        
        #game-core { position: relative; border: 1px solid #222; }
        
        /* ここが重要：低解像度キャンバスをピクセル感を保ったまま拡大 */
        canvas { 
            background: #000; 
            image-rendering: pixelated; 
            image-rendering: crisp-edges;
            width: 240px; /* 表示サイズ */
            height: 528px; 
            transition: transform 0.1s;
        }
        #hold-canvas, #next-canvas { width: 60px; height: auto; }

        #start-screen { 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.9); display: flex; flex-direction: column; 
            justify-content: center; align-items: center; z-index: 10; 
        }
        button { background: #000; color: #0f0; border: 1px solid #0f0; padding: 10px; cursor: pointer; }
        
        .spin-l { transform: rotate(-5deg); }
        .spin-r { transform: rotate(5deg); }
    `;
    document.head.appendChild(style);

    root.innerHTML = `
        <div class="panel">
            <div class="label">HOLD</div>
            <canvas id="hold-canvas" width="40" height="40"></canvas>
        </div>
        <div id="game-core">
            <canvas id="main-canvas" width="120" height="264"></canvas>
            <div id="start-screen">
                <button id="play-btn">START</button>
            </div>
        </div>
        <div class="panel">
            <div class="label">NEXT</div>
            <canvas id="next-canvas" width="40" height="120"></canvas>
            <div class="label">PTS</div>
            <div id="score" class="value">0</div>
        </div>
    `;

    const canvas = document.getElementById('main-canvas'), ctx = canvas.getContext('2d');
    const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
    const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');
    const scoreEl = document.getElementById('score');

    // 内部サイズを半分にする (SIZE 24 -> 12)
    const SIZE = 12, COLS = 10, TOTAL_ROWS = 40, DISPLAY_START = 18;

    const COLORS = { i:'#0ee', o:'#ee0', t:'#93f', s:'#0e0', z:'#f00', j:'#05f', l:'#f70' };
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

    let board, current, hold=null, nextQueue=[], bag=[], score=0, gameOver=true, tick;
    let lockTimer=null, resets=0, rot=0, wasRot=false, canHold=true;

    function collide(b, p, ox=0, oy=0) {
        return p.shape.some((row, y) => row.some((v, x) => {
            if (!v) return false;
            let nx = p.pos.x + x + ox, ny = p.pos.y + y + oy;
            return nx < 0 || nx >= COLS || ny >= TOTAL_ROWS || (ny >= 0 && b[ny][nx]);
        }));
    }

    function spawn(t = null) {
        if(lockTimer) clearTimeout(lockTimer); lockTimer = null;
        resets = 0; wasRot = false; rot = 0; canHold = true;
        if(bag.length < 7) bag = ['i','o','t','s','z','j','l'].sort(() => Math.random()-0.5);
        if(nextQueue.length < 5) nextQueue.push(...bag);
        let type = t || nextQueue.shift();
        current = { pos: {x: 3, y: 17}, shape: SHAPES[type], type };
        if(collide(board, current)) gameOver = true;
        drawSide();
    }

    function rotate(dir) {
        if(gameOver || !current) return;
        const oldS = current.shape, oldR = rot;
        current.shape = dir === 1 ? current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse()) : current.shape[0].map((_, i) => current.shape.map(row => row[row.length-1-i]));
        rot = (rot + dir + 4) % 4;
        const kicks = SRS[`${oldR}->${rot}`] || [[0,0]];
        if(!kicks.some(k => { if(!collide(board, current, k[0], -k[1])) { current.pos.x += k[0]; current.pos.y -= k[1]; return true; } })) {
            current.shape = oldS; rot = oldR;
        } else {
            wasRot = true; if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; }
            if(current.type === 't') {
                canvas.className = ''; void canvas.offsetWidth;
                canvas.className = dir === 1 ? 'spin-r' : 'spin-l';
            }
        }
    }

    function drop() {
        if(gameOver) return;
        if(!collide(board, current, 0, 1)) {
            current.pos.y++; wasRot = false; if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; }
        } else if(!lockTimer) lockTimer = setTimeout(lock, 500);
    }

    function lock() {
        current.shape.forEach((row, y) => row.forEach((v, x) => { if(v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type]; }));
        let lines = 0; board = board.filter(r => { if(r.every(c => c)) { lines++; return false; } return true; });
        while(board.length < TOTAL_ROWS) board.unshift(Array(COLS).fill(null));
        score += lines * 100; scoreEl.innerText = score; spawn();
    }

    function drawSide() {
        hCtx.clearRect(0,0,40,40); if(hold) { SHAPES[hold].forEach((r,y)=>r.forEach((v,x)=>{if(v){hCtx.fillStyle=COLORS[hold];hCtx.fillRect(x*8+5,y*8+5,7,7);}})); }
        nCtx.clearRect(0,0,40,120); nextQueue.slice(0,3).forEach((t,i)=>SHAPES[t].forEach((r,y)=>r.forEach((v,x)=>{if(v){nCtx.fillStyle=COLORS[t];nCtx.fillRect(x*7+5,y*7+5+i*35,6,6);}})));
    }

    function render() {
        if(gameOver) { document.getElementById('start-screen').style.display='flex'; return; }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        
        board.forEach((row, y) => row.forEach((c, x) => { 
            if(c && y >= DISPLAY_START) { 
                ctx.globalAlpha = y < 20 ? 0.3 : 1; ctx.fillStyle = c;
                ctx.fillRect(x*SIZE, (y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1);
            }
        }));

        if(current) {
            let gy = current.pos.y; while(!collide(board, current, 0, gy - current.pos.y + 1)) gy++;
            current.shape.forEach((row, y) => row.forEach((v, x) => {
                if(!v) return;
                ctx.fillStyle = COLORS[current.type];
                if(gy+y >= DISPLAY_START) { ctx.globalAlpha = 0.15; ctx.fillRect((current.pos.x+x)*SIZE, (gy+y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1); }
                if(current.pos.y+y >= DISPLAY_START) {
                    ctx.globalAlpha = (current.pos.y+y < 20 ? 0.3 : 1) * (lockTimer ? 0.5 : 1);
                    ctx.fillRect((current.pos.x+x)*SIZE, (current.pos.y+y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1);
                }
            }));
        }
        requestAnimationFrame(render);
    }

    document.getElementById('play-btn').onclick = () => {
        board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
        score = 0; hold = null; nextQueue = []; bag = [];
        scoreEl.innerText = "0"; gameOver = false;
        document.getElementById('start-screen').style.display='none';
        spawn(); render();
        if(tick) clearInterval(tick); tick = setInterval(drop, 800);
    };

    window.onkeydown = e => {
        if(gameOver) return;
        const k = e.key.toLowerCase();
        if(k === 'arrowleft' && !collide(board, current, -1, 0)) { current.pos.x--; wasRot = false; }
        if(k === 'arrowright' && !collide(board, current, 1, 0)) { current.pos.x++; wasRot = false; }
        if(k === 'arrowdown') drop();
        if(k === 'arrowup' || k === 'x') rotate(1);
        if(k === 'z') rotate(-1);
        if(k === 'c' || k === 'shift') { if(canHold) { let t = hold; hold = current.type; spawn(t); canHold = false; } }
        if(k === ' ') { while(!collide(board, current, 0, 1)) current.pos.y++; lock(); }
    };
    window.onkeyup = e => { if(['arrowup', 'x', 'z'].includes(e.key.toLowerCase())) canvas.className = ''; };
})();
