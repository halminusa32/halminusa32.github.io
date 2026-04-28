const canvas = document.getElementById('tjaCanvas');
const ctx = canvas.getContext('2d');
const editor = document.getElementById('editor');
const playBtn = document.getElementById('playBtn');
const courseSelect = document.getElementById('courseSelect');
const gogoLamp = document.getElementById('gogoLamp');
const autoPlayCheck = document.getElementById('autoPlayCheck');

canvas.width = 1000; canvas.height = 180;
let audioCtx, audioBuffer, sourceNode;
let startTime = 0, pausedAt = 0, isPlaying = false;
let scoreNotes = [];
let bpm = 160, offset = 0;

// --- キーコンフィグ管理 ---
let keyConfig = JSON.parse(localStorage.getItem('tjaKeyConfig')) || { don_l: "d", don_r: "j", ka_l: "f", ka_r: "k" };
function updateKeyUI() {
    ['don_l', 'don_r', 'ka_l', 'ka_r'].forEach(k => {
        document.getElementById('key_' + k).innerText = keyConfig[k].toUpperCase();
    });
}
updateKeyUI();

// --- 簡易SE再生 (AudioContext) ---
function playSE(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = (type === 'don') ? 'sine' : 'square';
    osc.frequency.setValueAtTime((type === 'don' ? 160 : 420), audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

// --- TJAデータ解析 ---
function parseTJA() {
    const text = editor.value;
    const lines = text.split('\n');
    const target = courseSelect.value;
    scoreNotes = [];
    
    let inCourse = false, isReading = false;
    let currentBPM = 160, currentScroll = 1.0, currentMeasure = [4, 4], isGogo = false, currentTime = 0;

    // ヘッダー先行読込
    lines.forEach(l => {
        if (l.startsWith('BPM:')) currentBPM = bpm = parseFloat(l.split(':')[1]);
        if (l.startsWith('OFFSET:')) offset = parseFloat(l.split(':')[1]);
    });
    currentTime = -offset;

    for (let line of lines) {
        line = line.trim();
        if (line.startsWith('COURSE:')) { inCourse = line.includes(target); continue; }
        if (!inCourse) continue;
        if (line === '#START') { isReading = true; continue; }
        if (line === '#END') { isReading = false; break; }
        if (!isReading) continue;

        // 命令
        if (line.startsWith('#SCROLL')) currentScroll = parseFloat(line.split(' ')[1]);
        if (line.startsWith('#BPMCHANGE')) currentBPM = parseFloat(line.split(' ')[1]);
        if (line.startsWith('#GOGOSTART')) isGogo = true;
        if (line.startsWith('#GOGOEND')) isGogo = false;
        if (line.startsWith('#MEASURE')) {
            const m = line.split(' ')[1].split('/');
            currentMeasure = [parseInt(m[0]), parseInt(m[1])];
        }

        // ノーツ
        if (!line.startsWith('#') && line.length > 0) {
            const notesStr = line.replace(/,/g, '');
            const measureSeconds = (60 / currentBPM) * 4 * (currentMeasure[0] / currentMeasure[1]);
            const noteSeconds = measureSeconds / notesStr.length;
            
            for (let i = 0; i < notesStr.length; i++) {
                if (notesStr[i] !== '0') {
                    scoreNotes.push({
                        time: currentTime + (i * noteSeconds),
                        type: notesStr[i],
                        scroll: currentScroll,
                        gogo: isGogo,
                        hit: false // オートプレイ用フラグ
                    });
                }
            }
            if (line.includes(',')) {
                scoreNotes.push({ time: currentTime, type: 'barline', scroll: currentScroll });
                currentTime += measureSeconds;
            }
        }
    }
}

// --- オーディオ制御 ---
document.getElementById('audioFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await audioCtx.decodeAudioData(await file.arrayBuffer());
    playBtn.disabled = false;
    parseTJA();
};

playBtn.onclick = () => {
    if (isPlaying) {
        sourceNode.stop();
        pausedAt = audioCtx.currentTime - startTime;
        isPlaying = false;
    } else {
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioCtx.destination);
        startTime = audioCtx.currentTime - pausedAt;
        // 再生前に、現在の時間より先のノーツのヒットフラグをリセット
        scoreNotes.forEach(n => { if (n.time >= pausedAt) n.hit = false; });
        sourceNode.start(0, pausedAt);
        isPlaying = true;
    }
};

// --- キャンバス内シーク ---
canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const now = isPlaying ? audioCtx.currentTime - startTime : pausedAt;
    // 判定枠(150px)からの位置関係で時間を算出
    const seekTime = (x - 150) / 450 + now;
    pausedAt = Math.max(0, seekTime);
    if (isPlaying) { sourceNode.stop(); playBtn.click(); }
};

// --- エディタ同期 ---
editor.oninput = parseTJA;
courseSelect.onchange = parseTJA;

// --- キー入力記録 ---
window.onkeydown = (e) => {
    if (document.activeElement === editor || document.getElementById('configModal').style.display === "block") return;
    const k = e.key.toLowerCase();
    let type = null;
    if (k === keyConfig.don_l || k === keyConfig.don_r) type = '1';
    if (k === keyConfig.ka_l || k === keyConfig.ka_r) type = '2';

    if (type && audioBuffer) {
        const now = isPlaying ? audioCtx.currentTime - startTime : pausedAt;
        const gridValue = parseInt(document.getElementById('gridSnap').value);
        const div = (60 / bpm * 4) / gridValue;
        const snapped = Math.round(now / div) * div;
        scoreNotes.push({ time: snapped, type: type, scroll: 1.0, gogo: false, hit: false });
        scoreNotes.sort((a, b) => a.time - b.time);
        // 必要に応じてエディタに追記するロジックをここに入れられます
    }
};

// --- メイン描画・オートプレイ実行 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = isPlaying ? audioCtx.currentTime - startTime : pausedAt;
    
    // 背景レーン
    ctx.fillStyle = '#111'; ctx.fillRect(0, 40, canvas.width, 100);
    // 判定枠
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(150, 90, 40, 0, Math.PI * 2); ctx.stroke();
    
    let isCurrentlyGogo = false;

    scoreNotes.forEach(n => {
        if (n.type === 'barline') {
            const x = 150 + (n.time - now) * 450 * n.scroll;
            if (x > -50 && x < 1050) {
                ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 140); ctx.stroke();
            }
        } else {
            // オートプレイ判定
            if (autoPlayCheck.checked && isPlaying && !n.hit && now >= n.time) {
                n.hit = true;
                playSE((n.type === '1' || n.type === '3') ? 'don' : 'ka');
            }

            // 非表示条件（オートプレイでヒット済み）
            if (autoPlayCheck.checked && n.hit) return;

            const x = 150 + (n.time - now) * 450 * n.scroll;
            if (x < -50 || x > 1050) return;

            ctx.fillStyle = (n.type === '1' || n.type === '3') ? '#ff4444' : '#44ccff';
            ctx.beginPath(); ctx.arc(x, 90, (n.type > '2' ? 35 : 25), 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

            if (Math.abs(n.time - now) < 0.05) isCurrentlyGogo = n.gogo;
        }
    });

    gogoLamp.className = isCurrentlyGogo ? 'active' : '';
    if (audioBuffer) document.getElementById('timeDisplay').innerText = `${now.toFixed(2)} / ${audioBuffer.duration.toFixed(2)}`;
    
    requestAnimationFrame(draw);
}

// --- モーダル・キーコンフィグ処理 ---
const modal = document.getElementById('configModal');
document.getElementById('openConfig').onclick = () => modal.style.display = "block";
document.getElementById('closeConfig').onclick = () => {
    modal.style.display = "none";
    localStorage.setItem('tjaKeyConfig', JSON.stringify(keyConfig));
};

document.querySelectorAll('.key-setter').forEach(btn => {
    btn.onclick = () => {
        btn.innerText = "...";
        const id = btn.id.replace('key_', '');
        const listener = (e) => {
            keyConfig[id] = e.key.toLowerCase();
            btn.innerText = e.key.toUpperCase();
            window.removeEventListener('keydown', listener);
        };
        window.addEventListener('keydown', listener);
    };
});

// 初期パースとループ開始
parseTJA();
draw();
