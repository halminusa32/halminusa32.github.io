(function() {
    // 1. HTML構造とCSSをJSから一気に注入
    const container = document.createElement('div');
    container.id = 'halris-app';
    document.body.appendChild(container);

    const style = document.createElement('style');
    style.textContent = `
        body { margin: 0; background: #000; color: #eee; font-family: 'Consolas', monospace; overflow: hidden; }
        #halris-app { display: flex; justify-content: center; align-items: center; height: 100vh; gap: 20px; }
        .panel { display: flex; flex-direction: column; align-items: center; width: 120px; }
        .label { color: #555; font-size: 14px; margin-bottom: 5px; font-weight: bold; }
        .value { color: #0f0; font-size: 20px; margin-bottom: 20px; text-shadow: 0 0 5px #0f0; }
        
        #game-core { position: relative; border: 2px solid #333; line-height: 0; }
        canvas { background: #050505; transition: transform 0.1s cubic-bezier(0.1, 0.9, 0.2, 1.2); }
        
        #start-screen { 
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.85); display: flex; flex-direction: column; 
            justify-content: center; align-items: center; z-index: 10; 
        }
        button { 
            padding: 15px 30px; font-size: 18px; background: #000; color: #0f0; 
            border: 1px solid #0f0; cursor: pointer; box-shadow: 0 0 10px #0f0; 
        }
        button:hover { background: #0f0; color: #000; }

        /* 特殊スピンの演出 */
        .spin-l { transform: rotateZ(-6deg) scale(1.05) !important; }
        .spin-r { transform: rotateZ(6deg) scale(1.05) !important; }
        .hard-drop { animation: bump 0.08s ease-out; }
        @keyframes bump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(10px); } }
    `;
    document.head.appendChild(style);

    container.innerHTML = `
        <div class="panel">
            <div class="label">HOLD</div>
            <canvas id="hold-canvas" width="80" height="80"></canvas>
        </div>
        <div id="game-core">
            <canvas id="main-canvas"></canvas>
            <div id="start-screen">
                <h2 style="color:#0f0; letter-spacing:4px;">HALRIS</h2>
                <button id="play-btn">START</button>
            </div>
        </div>
        <div class="panel">
            <div class="label">NEXT</div>
            <canvas id="next-canvas" width="80" height="240"></canvas>
            <div class="label">SCORE</div>
            <div id="score" class="value">000000</div>
            <div class="label">LINES</div>
            <div id="lines" class="value">0</div>
        </div>
    `;

    // 2. ゲーム変数と定数
    const canvas = document.getElementById('main-canvas'), ctx = canvas.getContext('2d');
    const hCanvas = document.getElementById('hold-canvas'), hCtx = hCanvas.getContext('2d');
    const nCanvas = document.getElementById('next-canvas'), nCtx = nCanvas.getContext('2d');
    const scoreEl = document.getElementById('score'), lineEl = document.getElementById('lines');

    const SIZE = 24, COLS = 10, TOTAL_ROWS = 40, DISPLAY_START = 18;
    canvas.width = COLS * SIZE; canvas.height = (TOTAL_ROWS - DISPLAY_START) * SIZE;

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

    let board, current, hold=null, nextQueue=[], bag=[], score=0, lines=0, gameOver=true, tick;
    let lockTimer=null, lockResets=0, rot=0, wasRot=false, canHold=true;

    // 3. ロジック関数
    function collide(b, p, ox=0, oy=0) {
        return p.shape.some((row, y) => row.some((v, x) => {
            if (!v) return false;
            let nx = p.pos.x + x + ox, ny = p.pos.y + y + oy;
            return nx < 0 || nx >= COLS || ny >= TOTAL_ROWS || (ny >= 0 && b[ny][nx]);
        }));
    }

    function spawn(t = null) {
        if(lockTimer) clearTimeout(lockTimer); lockTimer = null;
        lockResets = 0; wasRot = false; rot = 0; canHold = true;
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
            wasRot = true; resetLock();
            if(checkSpin()) { canvas.className = ''; void canvas.offsetWidth; canvas.className = dir === 1 ? 'spin-r' : 'spin-l'; }
        }
    }

    function checkSpin() {
        if(!wasRot || current.type !== 't') return false;
        let c = 0; [{x:0,y:0},{x:2,y:0},{x:0,y:2},{x:2,y:2}].forEach(p => {
            let nx = current.pos.x+p.x, ny = current.pos.y+p.y;
            if(nx < 0 || nx >= COLS || ny >= TOTAL_ROWS || (ny >= 0 && board[ny][nx])) c++;
        });
        return c >= 3;
    }

    function resetLock() { if(lockTimer && lockResets < 15) { clearTimeout(lockTimer); lockTimer = null; lockResets++; } }

    function drop() {
        if(gameOver) return;
        if(!collide(board, current, 0, 1)) {
            current.pos.y++; wasRot = false; resetLock();
        } else if(!lockTimer) lockTimer = setTimeout(lock, 500);
    }

    function lock() {
        current.shape.forEach((row, y) => row.forEach((v, x) => { if(v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type]; }));
        let clr = 0; board = board.filter(r => { if(r.every(c => c)) { clr++; return false; } return true; });
        while(board.length < TOTAL_ROWS) board.unshift(Array(COLS).fill(null));
        score += clr * 100; lines += clr;
        scoreEl.innerText = score.toString().padStart(6, '0');
        lineEl.innerText = lines;
        spawn();
    }

    // 4. 描画
    function drawSide() {
        hCtx.clearRect(0,0,80,80); if(hold) { SHAPES[hold].forEach((r,y)=>r.forEach((v,x)=>{if(v){hCtx.fillStyle=COLORS[hold];hCtx.fillRect(x*15+10,y*15+10,14,14);}})); }
        nCtx.clearRect(0,0,80,240); nextQueue.slice(0,3).forEach((t,i)=>SHAPES[t].forEach((r,y)=>r.forEach((v,x)=>{if(v){nCtx.fillStyle=COLORS[t];nCtx.fillRect(x*12+10,y*12+10+i*60,11,11);}})));
    }

    function render() {
        if(gameOver) { document.getElementById('start-screen').style.display='flex'; return; }
        ctx.clearRect(0,0,canvas.width,canvas.height);
        
        // 盤面ブロック (18-20行目は薄く描画)
        board.forEach((row, y) => row.forEach((c, x) => { 
            if(c && y >= DISPLAY_START) { 
                ctx.globalAlpha = y < 20 ? 0.25 : 1; ctx.fillStyle = c;
                ctx.fillRect(x*SIZE, (y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1);
            }
        }));

        if(current) {
            let gy = current.pos.y; while(!collide(board, current, 0, gy - current.pos.y + 1)) gy++;
            current.shape.forEach((row, y) => row.forEach((v, x) => {
                if(!v) return;
                // ゴースト
                if(gy+y >= DISPLAY_START) { ctx.globalAlpha = 0.1; ctx.fillStyle = COLORS[current.type]; ctx.fillRect((current.pos.x+x)*SIZE, (gy+y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1); }
                // 本体
                if(current.pos.y+y >= DISPLAY_START) {
                    ctx.globalAlpha = (current.pos.y+y < 20 ? 0.35 : 1) * (lockTimer ? 0.5 : 1);
                    ctx.fillStyle = COLORS[current.type]; ctx.fillRect((current.pos.x+x)*SIZE, (current.pos.y+y-DISPLAY_START)*SIZE, SIZE-1, SIZE-1);
                }
            }));
        }
        requestAnimationFrame(render);
    }

    // 5. 起動
    document.getElementById('play-btn').onclick = () => {
        board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
        score = 0; lines = 0; hold = null; nextQueue = []; bag = [];
        scoreEl.innerText = "000000"; lineEl.innerText = "0";
        gameOver = false; document.getElementById('start-screen').style.display='none';
        spawn(); render();
        if(tick) clearInterval(tick); tick = setInterval(drop, 800);
    };

    window.onkeydown = e => {
        if(gameOver) return;
        const k = e.key.toLowerCase();
        if(k === 'arrowleft' && !collide(board, current, -1, 0)) { current.pos.x--; wasRot = false; resetLock(); }
        if(k === 'arrowright' && !collide(board, current, 1, 0)) { current.pos.x++; wasRot = false; resetLock(); }
        if(k === 'arrowdown') drop();
        if(k === 'arrowup' || k === 'x') rotate(1);
        if(k === 'z') rotate(-1);
        if(k === 'c' || k === 'shift') { if(canHold) { let t = hold; hold = current.type; spawn(t); canHold = false; } }
        if(k === ' ') { 
            while(!collide(board, current, 0, 1)) current.pos.y++; 
            canvas.classList.remove('hard-drop'); void canvas.offsetWidth; canvas.classList.add('hard-drop'); lock(); 
        }
    };
    window.onkeyup = e => { if(['arrowup', 'x', 'z'].includes(e.key.toLowerCase())) canvas.className = ''; };
})();
