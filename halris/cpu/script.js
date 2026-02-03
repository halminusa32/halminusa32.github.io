import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";

// --- Firebase設定 (あなたのプロジェクト用) ---
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
const roomId = "gemini-battle-" + Math.random().toString(36).substring(7);

// --- 定数と変数 ---
const canvas = document.getElementById('tetris'), ctx = canvas.getContext('2d');
const eCanvas = document.getElementById('enemy-tetris'), eCtx = eCanvas.getContext('2d');
const ROWS = 20, COLS = 10, SIZE = 24;
const COLORS = { i:'#00eeee', o:'#eeee00', t:'#aa00ee', s:'#00ee00', z:'#ee0000', j:'#0000ee', l:'#eeaa00' };
const SHAPES = {
    i:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], o:[[1,1],[1,1]], t:[[0,1,0],[1,1,1],[0,0,0]],
    s:[[0,1,1],[1,1,0],[0,0,0]], z:[[1,1,0],[0,1,1],[0,0,0]], j:[[1,0,0],[1,1,1],[0,0,0]], l:[[0,0,1],[1,1,1],[0,0,0]]
};

let board = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let enemyBoard = Array.from({length: ROWS}, () => Array(COLS).fill(null));
let current, gameOver = false, GEMINI_API_KEY = "";

// --- Gemini API 思考ロジック ---
async function askGemini(targetBoard, pieceType) {
    if (!GEMINI_API_KEY) return null;

    // 盤面を0/1の文字列に変換
    const boardStr = targetBoard.map(row => row.map(c => c ? "1" : "0").join("")).join("\n");
    
    const prompt = `テトリスの達人として、中開けRENを構築してください。
【条件】
・7種1巡の法則
・積みすぎるとあなたがゲームオーバーになってしまうため15マス積んだら連鎖へ
・出力はJSONのみ: {"x": 設置X座標, "rotation": 回転回数0-3}
【盤面】
${boardStr}
【ミノ】: ${pieceType}`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        const text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text.replace(/```json|```/g, ""));
    } catch (e) {
        console.error("Gemini Error:", e);
        return null;
    }
}

// --- AI（Gemini）の行動実行 ---
async function updateAI() {
    if (gameOver) return;
    const types = ['i','o','t','s','z','j','l'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    // Geminiに相談
    const decision = await askGemini(enemyBoard, type);
    
    if (decision) {
        let shape = SHAPES[type];
        // 回転適用
        for (let i = 0; i < (decision.rotation % 4); i++) {
            shape = shape[0].map((_, idx) => shape.map(row => row[idx]).reverse());
        }
        
        // 落下地点確定
        let x = Math.max(0, Math.min(decision.x, COLS - shape[0].length));
        let y = 0;
        while (!collide(enemyBoard, { pos: { x, y: y + 1 }, shape })) y++;

        // 設置
        shape.forEach((row, sy) => row.forEach((v, sx) => {
            if (v && y + sy < ROWS) enemyBoard[y + sy][x + sx] = COLORS[type];
        }));
        
        checkClear(enemyBoard);
    }
}

// --- 共通ロジック (衝突・消去・描画) ---
function collide(b, p) {
    for (let y = 0; y < p.shape.length; y++) {
        for (let x = 0; x < p.shape[y].length; x++) {
            if (p.shape[y][x]) {
                let ny = p.pos.y + y, nx = p.pos.x + x;
                if (ny >= ROWS || nx < 0 || nx >= COLS || (ny >= 0 && b[ny][nx])) return true;
            }
        }
    }
    return false;
}

function checkClear(b) {
    for (let y = ROWS - 1; y >= 0; y--) {
        if (b[y].every(cell => cell !== null)) {
            b.splice(y, 1);
            b.unshift(Array(COLS).fill(null));
            y++;
        }
    }
}

function draw() {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    eCtx.fillStyle = '#111'; eCtx.fillRect(0, 0, eCanvas.width, eCanvas.height);
    
    board.forEach((r, y) => r.forEach((c, x) => { if (c) drawBlock(ctx, x, y, c); }));
    enemyBoard.forEach((r, y) => r.forEach((c, x) => { if (c) drawBlock(eCtx, x, y, c); }));
    
    if (current) {
        current.shape.forEach((r, y) => r.forEach((v, x) => {
            if (v) drawBlock(ctx, current.pos.x + x, current.pos.y + y, COLORS[current.type]);
        }));
    }
    requestAnimationFrame(draw);
}

function drawBlock(c, x, y, color) {
    c.fillStyle = color;
    c.fillRect(x * SIZE, y * SIZE, SIZE - 1, SIZE - 1);
}

// --- プレイヤー操作 (O-Spin用) ---
function playerRotate() {
    const prev = current.shape;
    current.shape = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    // O-Spin用キックロジック (簡易版)
    const kicks = [0, -1, 1, -2, 2];
    for (let k of kicks) {
        current.pos.x += k;
        if (!collide(board, current)) return;
        current.pos.x -= k;
    }
    current.shape = prev;
}

// --- スタート処理 ---
document.getElementById('start-game-btn').onclick = () => {
    const key = document.getElementById('api-key-input').value;
    if (!key) return alert("APIキーが必要です");
    GEMINI_API_KEY = key;
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-ui').style.display = 'flex';
    
    current = { pos: { x: 3, y: 0 }, shape: SHAPES['t'], type: 't' };
    setInterval(() => {
        current.pos.y++;
        if (collide(board, current)) {
            current.pos.y--;
            current.shape.forEach((r, y) => r.forEach((v, x) => {
                if (v) board[current.pos.y + y][current.pos.x + x] = COLORS[current.type];
            }));
            checkClear(board);
            const types = ['i','o','t','s','z','j','l'];
            const t = types[Math.floor(Math.random() * types.length)];
            current = { pos: { x: 3, y: 0 }, shape: SHAPES[t], type: t };
        }
    }, 1000);
    
    setInterval(updateAI, 3000); // Geminiは思考に時間がかかるため3秒毎
    draw();
};

document.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { current.pos.x--; if(collide(board, current)) current.pos.x++; }
    if (e.key === 'ArrowRight') { current.pos.x++; if(collide(board, current)) current.pos.x--; }
    if (e.key === 'ArrowDown') { current.pos.y++; if(collide(board, current)) current.pos.y--; }
    if (e.key === 'ArrowUp') playerRotate();
});
