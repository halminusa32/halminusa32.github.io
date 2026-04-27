const canvas = document.getElementById('tjaCanvas');
const ctx = canvas.getContext('2d');
const editor = document.getElementById('editor');
const playBtn = document.getElementById('playBtn');
const gridSnap = document.getElementById('gridSnap');
const audioInput = document.getElementById('audioFile');
const loadingMsg = document.getElementById('loadingMsg');

canvas.width = 1000; canvas.height = 180;
const bpm = 120;
const baseScroll = 450;
const judgeX = 150;

let scoreNotes = [];
let audioCtx, audioBuffer, sourceNode;
let startTime = 0, pausedAt = 0, isPlaying = false;

// --- キーコンフィグ ---
let keyConfig = JSON.parse(localStorage.getItem('tjaKeyConfig')) || {
    don_l: "d", don_r: "j", ka_l: "f", ka_r: "k"
};
updateKeyUI();

function updateKeyUI() {
    ['don_l', 'don_r', 'ka_l', 'ka_r'].forEach(id => {
        const btn = document.getElementById(`key_${id}`);
        if(btn) btn.innerText = keyConfig[id].toUpperCase();
    });
}

// モーダル処理
const modal = document.getElementById('configModal');
document.getElementById('openConfig').onclick = () => modal.style.display = "block";
document.getElementById('closeConfig').onclick = () => {
    modal.style.display = "none";
    localStorage.setItem('tjaKeyConfig', JSON.stringify(keyConfig));
};

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

// --- オーディオ読み込み (OGG対応強化) ---
audioInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    loadingMsg.style.display = "block";
    playBtn.disabled = true;
    playBtn.innerText = "読み込み中...";

    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const arrayBuffer = await file.arrayBuffer();
        // decodeAudioData はブラウザが対応していれば OGG を自動判別して解凍します
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        playBtn.disabled = false;
        playBtn.innerText = "再生 / 停止";
        pausedAt = 0;
    } catch (err) {
        console.error("Audio Decode Error:", err);
        alert("ファイルの読み込みに失敗しました。対応していない形式か、ファイルが破損している可能性があります。");
        playBtn.innerText = "エラー";
    } finally {
        loadingMsg.style.display = "none";
    }
});

// --- 再生ロジック ---
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
        // ループ終了検知
        sourceNode.onended = () => { if(isPlaying) { isPlaying = false; pausedAt = 0; } };
    }
});

// --- キー入力 & ノーツ配置 ---
window.addEventListener('keydown', (e) => {
    if (modal.style.display === "block" || e.target === editor) return;
    const key = e.key.toLowerCase();
    let type = null;
    if (key === keyConfig.don_l || key === keyConfig.don_r) type = "1";
    if (key === keyConfig.ka_l || key === keyConfig.ka_r) type = "2";

    if (type && audioBuffer) {
        const currentTime = isPlaying ? audioCtx.currentTime - startTime : pausedAt;
        const division = parseInt(gridSnap.value);
        const secPerMeasure = 60 / bpm * 4;
        const secPerDiv = secPerMeasure / division;
        const snappedTime = Math.round(currentTime / secPerDiv) * secPerDiv;

        const existingIdx = scoreNotes.findIndex(n => Math.abs(n.time - snappedTime) < 0.005);
        if (existingIdx !== -1) scoreNotes.splice(existingIdx, 1);
        
        scoreNotes.push({ time: snappedTime, type: type });
        scoreNotes.sort((a, b) => a.time - b.time);
        updateEditorText();
    }
});

function updateEditorText() {
    let text = "// Score Data\n";
    scoreNotes.forEach(n => { text += `${n.time.toFixed(4)}: ${n.type}\n`; });
    editor.value = text;
}

// --- 描画ループ ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 40, canvas.width, 100);
    
    let currentTime = isPlaying ? audioCtx.currentTime - startTime : pausedAt;

    // 判定枠
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(judgeX, 90, 35, 0, Math.PI * 2); ctx.stroke();

    if (audioBuffer) document.getElementById('timeDisplay').innerText = `${currentTime.toFixed(2)} / ${audioBuffer.duration.toFixed(2)}`;

    scoreNotes.forEach(note => {
        const x = judgeX + (note.time - currentTime) * baseScroll;
        if (x > -50 && x < canvas.width + 100) {
            ctx.fillStyle = (note.type === '1') ? '#ff4444' : '#44ccff';
            ctx.beginPath(); ctx.arc(x, 90, 25, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        }
    });
    requestAnimationFrame(draw);
}

// ノーツタイプ切り替えUI
document.querySelectorAll('.note-type').forEach(label => {
    label.addEventListener('click', () => {
        document.querySelectorAll('.note-type').forEach(l => l.classList.remove('active'));
        label.classList.add('active');
        label.querySelector('input').checked = true;
    });
});

document.getElementById('clearNotes').onclick = () => { scoreNotes = []; updateEditorText(); };

draw();
