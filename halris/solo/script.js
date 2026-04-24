(function() {
    // 1. スタイルの注入（ボタンを最前面に、Canvasを中央に固定）
    const css = `
        body { margin: 0; background: #000; color: #fff; font-family: monospace; overflow: hidden; }
        #halris-root { 
            position: relative; 
            width: 100vw; 
            height: 100vh; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
        }
        canvas { 
            background: #050505; 
            border: 2px solid #333; 
            box-shadow: 0 0 30px rgba(0,0,0,0.8);
            transform-origin: center center;
            transition: transform 0.1s cubic-bezier(0.1, 0.9, 0.2, 1.2);
            z-index: 1;
        }
        #start-btn { 
            position: absolute; 
            z-index: 100; /* 確実に手前に持ってくる */
            padding: 20px 40px; 
            font-size: 20px; 
            background: #111; 
            color: #0f0; 
            border: 2px solid #0f0; 
            cursor: pointer; 
            font-family: inherit;
            text-shadow: 0 0 5px #0f0;
            box-shadow: 0 0 10px #0f0;
        }
        #start-btn:hover { background: #0f0; color: #000; }
        .spin-l { transform: rotateZ(-6deg) scale(1.05) !important; }
        .spin-r { transform: rotateZ(6deg) scale(1.05) !important; }
        .drop-anim { animation: bump 0.08s ease-out; }
        @keyframes bump { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(10px); } }
    `;
    const styleTag = document.createElement('style');
    styleTag.textContent = css;
    document.head.appendChild(styleTag);

    // 2. 構造の作成
    const root = document.getElementById('halris-root') || document.body;
    root.innerHTML = `<canvas id="t"></canvas><button id="start-btn">INITIALIZE HALRIS</button>`;

    const canvas = document.getElementById('t'), ctx = canvas.getContext('2d');
    const btn = document.getElementById('start-btn');

    // ゲーム定数
    const SIZE = 24, COLS = 10, TOTAL_ROWS = 40, DISPLAY_START = 18;
    const BOARD_W = COLS * SIZE, UI_W = 120;
    canvas.width = BOARD_W + UI_W * 2; 
    canvas.height = (TOTAL_ROWS - DISPLAY_START) * SIZE;

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

    let board, current, hold=null, next=[], bag=[], score=0, lines=0, gameOver=true, tickInterval;
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
        if(bag.length < 7) bag = [...bag, ...['i','o','t','s','z','j','l'].sort(() => Math.random()-0.5)];
        if(next.length < 5) next.push(...bag.splice(0, 7));
        let type = t || next.shift();
        current = { pos: {x: 3, y: 17}, shape: SHAPES[type], type };
        if(collide(board, current)) gameOver = true;
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
            canvas.className = ''; void canvas.offsetWidth; canvas.className = dir === 1 ? 'spin-r' : 'spin-l';
        }
    }

    function drop() {
        if(gameOver) return;
        if(!collide(board, current, 0, 1)) {
            current.pos.y++; wasRot = false;
            if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; }
        } else if(!lockTimer) lockTimer = setTimeout(lock, 500);
    }

    function lock() {
        current.shape.forEach((row, y) => row.forEach((v, x) => { if(v && current.pos.y+y >= 0) board[current.pos.y+y][current.pos.x+x] = COLORS[current.type]; }));
        let clr = 0; board = board.filter(r => { if(r.every(c => c)) { clr++; return false; } return true; });
        while(board.length < TOTAL_ROWS) board.unshift(Array(COLS).fill(null));
        score += clr * 100; lines += clr; spawn();
    }

    function render() {
        if(gameOver) { btn.style.display = 'block'; return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalAlpha = 1; ctx.fillStyle = '#555'; ctx.font = 'bold 12px monospace';
        ctx.fillText('HOLD', 45, 30); ctx.fillText('NEXT', BOARD_W + UI_W + 45, 30);
        ctx.fillStyle = '#aaa';
        ctx.fillText(`SCORE: ${score.toString().padStart(6, '0')}`, 15, canvas.height - 40);
        ctx.fillText(`LINES: ${lines.toString().padStart(4, '0')}`, 15, canvas.height - 20);

        if(hold) SHAPES[hold].forEach((row, y) => row.forEach((v, x) => { if(v) { ctx.fillStyle = COLORS[hold]; ctx.fillRect(x*14 + 40, y*14 + 45, 13, 13); } }));
        next.slice(0, 3).forEach((t, i) => SHAPES[t].forEach((row, y) => row.forEach((v, x) => { if(v) { ctx.fillStyle = COLORS[t]; ctx.fillRect(BOARD_W + UI_W + 40 + x*12, y*12 + 45 + i*50, 11, 11); } })));

        board.forEach((row, y) => row.forEach((c, x) => { if(c && y >= DISPLAY_START) { ctx.globalAlpha = y < 20 ? 0.25 : 1; ctx.fillStyle = c; ctx.fillRect(UI_W + x * SIZE, (y-DISPLAY_START) * SIZE, SIZE - 1, SIZE - 1); } }));

        if(current) {
            let gy = current.pos.y; while(!collide(board, current, 0, gy - current.pos.y + 1)) gy++;
            current.shape.forEach((row, y) => row.forEach((v, x) => {
                if(!v) return;
                if(gy+y >= DISPLAY_START) { ctx.globalAlpha = 0.1; ctx.fillStyle = COLORS[current.type]; ctx.fillRect(UI_W + (current.pos.x+x) * SIZE, (gy+y-DISPLAY_START) * SIZE, SIZE - 1, SIZE - 1); }
                if(current.pos.y+y >= DISPLAY_START) {
                    ctx.globalAlpha = (current.pos.y+y < 20 ? 0.35 : 1) * (lockTimer ? 0.5 : 1);
                    ctx.fillStyle = COLORS[current.type]; ctx.fillRect(UI_W + (current.pos.x+x) * SIZE, (current.pos.y+y-DISPLAY_START) * SIZE, SIZE - 1, SIZE - 1);
                }
            }));
        }
        requestAnimationFrame(render);
    }

    btn.onclick = () => {
        board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
        score = 0; lines = 0; next = []; bag = []; hold = null; gameOver = false;
        btn.style.display = 'none'; spawn(); render();
        if(tickInterval) clearInterval(tickInterval);
        tickInterval = setInterval(() => { if(!gameOver) drop(); }, 800);
    };

    window.onkeydown = e => {
        if(gameOver) return;
        const k = e.key.toLowerCase();
        if(k === 'arrowleft' && !collide(board, current, -1, 0)) { current.pos.x--; wasRot = false; if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; } }
        if(k === 'arrowright' && !collide(board, current, 1, 0)) { current.pos.x++; wasRot = false; if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; } }
        if(k === 'arrowdown') drop();
        if(k === 'arrowup' || k === 'x') rotate(1);
        if(k === 'z') rotate(-1);
        if(k === ' ') { while(!collide(board, current, 0, 1)) current.pos.y++; canvas.classList.remove('drop-anim'); void canvas.offsetWidth; canvas.classList.add('drop-anim'); lock(); }
        if(k === 'c' || k === 'shift') { if(canHold) { let t = hold; hold = current.type; spawn(t); canHold = false; } }
    };
    window.onkeyup = e => { if(['arrowup', 'x', 'z'].includes(e.key.toLowerCase())) canvas.className = ''; };
})();
