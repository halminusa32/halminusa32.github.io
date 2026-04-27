const canvas = document.getElementById('tjaCanvas');
const ctx = canvas.getContext('2d');
const editor = document.getElementById('editor');
const playBtn = document.getElementById('playBtn');
const gridSnap = document.getElementById('gridSnap');
const audioInput = document.getElementById('audioFile');

canvas.width = 1000; canvas.height = 180;
const bpm = 120;
const baseScroll = 450;
const judgeX = 150;

let scoreNotes = [];
let audioCtx, audioBuffer, sourceNode;
let startTime = 0, pausedAt = 0, isPlaying = false;

// --- キーコンフィグ関連 ---
let keyConfig = {
    don_l: "d", don_r: "j",
    ka_l: "f", ka_r: "k"
};

// LocalStorageから読み込み
const savedConfig = localStorage.getItem('tjaKeyConfig');
if (savedConfig) {
    keyConfig = JSON.parse(savedConfig);
    updateKeyUI();
}

function updateKeyUI() {
    document.getElementById('key_don_l').innerText = keyConfig.don_l.toUpperCase();
    document.getElementById('key_don_r').innerText = keyConfig.don_r.toUpperCase();
    document.getElementById('key_ka_l').innerText = keyConfig.ka_l.toUpperCase();
    document.getElementById('key_ka_r').innerText = keyConfig.ka_r.toUpperCase();
}

// キー設定モーダル開閉
const modal = document.getElementById('configModal');
document.getElementById('openConfig').onclick = () => modal.style.display = "block";
document.getElementById('closeConfig').onclick = () => {
    modal.style.display = "none";
    localStorage.setItem('tjaKeyConfig', JSON.stringify(keyConfig));
};

// キー設定ロジック
document.querySelectorAll('.key-setter').forEach(btn => {
    btn.onclick = () => {
        btn.innerText = "...";
        const targetId = btn.id.replace('key_', '');
        const listener = (e) => {
            keyConfig[targetId] = e.key.toLowerCase();
            btn.innerText = e.key.toUpperCase();
            window.removeEventListener('keydown', listener);
        };
        window.addEventListener('keydown', listener);
    };
});

// --- キー入力検知 (テストプレイ & 録音) ---
window.addEventListener('keydown', (e) => {
    if (modal.style.display === "block") return; // 設定中は無視
    if (e.target === editor) return; // エディタ入力中は無視

    const key = e.key.toLowerCase();
    let type = null;

    if (key === keyConfig.don_l || key === keyConfig.don_r) type = "1";
    if (key === keyConfig.ka_l || key === keyConfig.ka_r) type = "2";

    if (type && audioBuffer) {
        // 現在の再生時間にノーツを置く
        const currentTime = isPlaying ? audioCtx.currentTime - startTime : pausedAt;
        addNoteAtTime(currentTime, type);
    }
});

function addNoteAtTime(time, type) {
    const division = parseInt(gridSnap.value);
    const secPerMeasure = 60 / bpm * 4;
    const secPerDiv = secPerMeasure / division;
    const snappedTime = Math.round(time / secPerDiv) * secPerDiv;

    // 重複確認
    const existingIndex = scoreNotes.findIndex(n => Math.abs(n.time - snappedTime) < 0.005);
    if (existingIndex !== -1) scoreNotes.splice(existingIndex, 1);
    
    scoreNotes.push({ time: snappedTime, type: type });
    scoreNotes.sort((a, b) => a.time - b.time);
    updateEditorText();
}

// --- 描画とデータ更新 (前回分を継承) ---
audioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    playBtn.disabled = false;
});

playBtn.addEventListener('click', () => {
    if (isPlaying) {
        sourceNode.stop();
        pausedAt = audioCtx.currentTime - startTime;
        isPlaying = false;
    } else {
        sourceNode = audioCtx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(audioCtx.destination);
        startTime = audioCtx.currentTime - pausedAt;
        sourceNode.start(0, pausedAt);
        isPlaying = true;
    }
});

function updateEditorText() {
    let text = "// Score Data\n";
    scoreNotes.forEach(n => { text += `${n.time.toFixed(4)}: ${n.type}\n`; });
    editor.value = text;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#222'; ctx.fillRect(0, 40, canvas.width, 100);
    let currentTime = isPlaying ? audioCtx.currentTime - startTime : pausedAt;
    
    // 判定枠
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(judgeX, 90, 35, 0, Math.PI * 2); ctx.stroke();

    scoreNotes.forEach(note => {
        const x = judgeX + (note.time - currentTime) * baseScroll;
        if (x > -50 && x < canvas.width + 100) {
            ctx.fillStyle = (note.type === '1') ? '#ff4444' : '#44ccff';
            ctx.beginPath(); ctx.arc(x, 90, 25, 0, Math.PI * 2); ctx.fill();
        }
    });
    requestAnimationFrame(draw);
}
draw();
