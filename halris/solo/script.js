(function() {
    /**
     * 1. 仮想CSSファイルの生成と注入
     * 外部CSSファイルを用意する手間を省き、JSから直接ヘッドへ送り込みます。
     */
    const css = `
        body { 
            margin: 0; 
            background: #000; 
            color: #fff; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            overflow: hidden; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
        }
        canvas { 
            background: #050505; 
            border: 2px solid #222; 
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
            transform-origin: center center;
            transition: transform 0.1s cubic-bezier(0.1, 0.9, 0.2, 1.2); 
        }
        /* 特殊スピン時の画面傾斜演出 */
        .spin-l { transform: rotateZ(-6deg) scale(1.03) !important; }
        .spin-r { transform: rotateZ(6deg) scale(1.03) !important; }
        /* ハードドロップ時の衝撃 */
        .drop-anim { animation: bump 0.08s ease-out; }
        @keyframes bump { 
            0%, 100% { transform: translateY(0); } 
            50% { transform: translateY(10px); } 
        }
        #start-btn { 
            position: absolute; 
            padding: 15px 40px; 
            font-size: 18px; 
            background: #111; 
            color: #eee; 
            border: 1px solid #444; 
            cursor: pointer; 
            letter-spacing: 2px;
            transition: 0.2s;
        }
        #start-btn:hover { background: #222; border-color: #666; }
    `;
    const styleTag = document.createElement('style');
    styleTag.textContent = css;
    document.head.appendChild(styleTag);

    // 2. DOM構築
    const root = document.getElementById('halris-root');
    root.style.position = 'relative';
    root.innerHTML = `
        <canvas id="t"></canvas>
        <button id="start-btn">INITIALIZE HALRIS</button>
    `;

    const canvas = document.getElementById('t'), ctx = canvas.getContext('2d');
    const btn = document.getElementById('start-btn');

    // 3. ゲーム設定
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

    let board, current, hold=null, next=[], bag=[], score=0, lines=0, gameOver=true;
    let lockTimer=null, resets=0, rot=0, wasRot=false, canHold=true;

    // 4. ロジック
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

    // 5. 描画
    function drawBlock(x, y, color, alpha = 1, size = SIZE) {
        ctx.globalAlpha = alpha; ctx.fillStyle = color;
        ctx.fillRect(UI_W + x * size, y * size, size - 1, size - 1);
    }

    function render() {
        if(gameOver) { btn.style.display = 'block'; return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // サイドUI描画
        ctx.globalAlpha = 1; ctx.fillStyle = '#555'; ctx.font = 'bold 13px monospace';
        ctx.fillText('HOLD', 45, 30); ctx.fillText('NEXT', BOARD_W + UI_W + 45, 30);
        ctx.fillStyle = '#aaa';
        ctx.fillText(`SCORE`, 20, canvas.height - 60);
        ctx.fillText(score.toString().padStart(7, '0'), 20, canvas.height - 45);
        ctx.fillText(`LINES`, 20, canvas.height - 25);
        ctx.fillText(lines.toString().padStart(4, '0'), 20, canvas.height - 10);

        if(hold) SHAPES[hold].forEach((row, y) => row.forEach((v, x) => { if(v) { ctx.fillStyle = COLORS[hold]; ctx.fillRect(x*14 + 40, y*14 + 45, 13, 13); } }));
        next.slice(0, 3).forEach((t, i) => SHAPES[t].forEach((row, y) => row.forEach((v, x) => { if(v) { ctx.fillStyle = COLORS[t]; ctx.fillRect(BOARD_W + UI_W + 40 + x*12, y*12 + 45 + i*50, 11, 11); } })));

        // 盤面描画 (隠し領域透過)
        board.forEach((row, y) => row.forEach((c, x) => { if(c && y >= DISPLAY_START) drawBlock(x, y-DISPLAY_START, c, y < 20 ? 0.25 : 1); }));

        if(current) {
            let ghostY = current.pos.y; while(!collide(board, current, 0, ghostY - current.pos.y + 1)) ghostY++;
            current.shape.forEach((row, y) => row.forEach((v, x) => {
                if(!v) return;
                if(ghostY+y >= DISPLAY_START) drawBlock(current.pos.x+x, ghostY+y-DISPLAY_START, COLORS[current.type], 0.1); // ゴースト
                if(current.pos.y+y >= DISPLAY_START) {
                    let op = (current.pos.y+y < 20 ? 0.35 : 1) * (lockTimer ? 0.4 : 1); 
                    drawBlock(current.pos.x+x, current.pos.y+y-DISPLAY_START, COLORS[current.type], op);
                }
            }));
        }
        requestAnimationFrame(render);
    }

    // 6. エントリ
    btn.onclick = () => {
        board = Array.from({length: TOTAL_ROWS}, () => Array(COLS).fill(null));
        score = 0; lines = 0; next = []; bag = []; hold = null; gameOver = false;
        btn.style.display = 'none'; spawn(); render();
        const tick = setInterval(() => { if(gameOver) clearInterval(tick); else drop(); }, 800);
    };

    window.onkeydown = e => {
        if(gameOver) return;
        const k = e.key.toLowerCase();
        if(k === 'arrowleft' && !collide(board, current, -1, 0)) { current.pos.x--; wasRot = false; if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; } }
        if(k === 'arrowright' && !collide(board, current, 1, 0)) { current.pos.x++; wasRot = false; if(lockTimer && resets < 15) { clearTimeout(lockTimer); lockTimer = null; resets++; } }
        if(k === 'arrowdown') drop();
        if(k === 'arrowup' || k === 'x') rotate(1);
        if(k === 'z') rotate(-1);
        if(k === ' ') { 
            while(!collide(board, current, 0, 1)) current.pos.y++; 
            canvas.classList.remove('drop-anim'); void canvas.offsetWidth; canvas.classList.add('drop-anim'); lock(); 
        }
        if(k === 'c' || k === 'shift') { if(canHold) { let t = hold; hold = current.type; spawn(t); canHold = false; } }
    };
    window.onkeyup = e => { if(['arrowup', 'x', 'z'].includes(e.key.toLowerCase())) canvas.className = ''; };
})();
