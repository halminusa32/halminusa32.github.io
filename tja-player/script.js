/**
 * TJA Web Player Logic
 */
let notesData = [];
let bpm = 120;
let offset = 0;
const audio = new Audio();
let isTjaLoaded = false;
let isAudioLoaded = false;

const tjaInput = document.getElementById('tja-file');
const audioInput = document.getElementById('audio-file');
const playBtn = document.getElementById('play-btn');
const noteContainer = document.getElementById('note-container');

// TJAファイルの読み取り
tjaInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        parseTJA(event.target.result);
        isTjaLoaded = true;
        checkReady();
    };
    reader.readAsText(file, "Shift-JIS");
});

// 音源ファイルの読み取り
audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.load();
    isAudioLoaded = true;
    checkReady();
});

// 両方のファイルが揃ったらボタンを有効化
function checkReady() {
    if (isTjaLoaded && isAudioLoaded) {
        playBtn.disabled = false;
    }
}

// TJA解析ロジック
function parseTJA(text) {
    const lines = text.split(/\r?\n/);
    let rawNotes = "";
    let isCourse = false;
    notesData = []; 

    lines.forEach(line => {
        const l = line.trim();
        // ヘッダー解析
        if (l.startsWith("BPM:")) bpm = parseFloat(l.split(":")[1]);
        if (l.startsWith("OFFSET:")) offset = parseFloat(l.split(":")[1]);
        
        // 譜面開始・終了
        if (l.startsWith("#START")) {
            isCourse = true;
            return;
        }
        if (l.startsWith("#END")) {
            isCourse = false;
            return;
        }
        
        // 譜面データ蓄積（簡易的にカンマ区切りを無視して連結）
        if (isCourse && !l.startsWith("#")) {
            const data = l.split(',')[0].replace(/[^0-9]/g, '');
            rawNotes += data;
        }
    });

    // 1音符あたりの秒数を計算してノーツ配列を作成
    // ※このロジックは4分音符が連続している前提の超簡易版です
    for (let i = 0; i < rawNotes.length; i++) {
        const char = rawNotes[i];
        if (char === "1" || char === "2") {
            notesData.push({
                type: char,
                time: (60 / bpm) * i
            });
        }
    }
}

// 再生ループ
playBtn.addEventListener('click', () => {
    audio.play();
    playBtn.disabled = true; // 再生中は無効化
    
    function update() {
        // 音源の現在時間にOFFSETを適用（TJAのOFFSETは通常マイナス値）
        // offsetがマイナスの場合、譜面開始を遅らせるために加算
        const currentTime = audio.currentTime + offset;
        
        render(currentTime);
        
        if (!audio.paused && !audio.ended) {
            requestAnimationFrame(update);
        } else {
            playBtn.disabled = false;
        }
    }
    update();
});

// 描画処理
function render(currentTime) {
    noteContainer.innerHTML = ""; // 描画をクリア

    notesData.forEach(note => {
        const relativeTime = note.time - currentTime;
        
        // 画面外のノーツは無視（少し余裕を持たせる）
        if (relativeTime < -0.2 || relativeTime > 2.5) return;

        // X座標の計算 (100px地点を判定枠とし、1秒間に500px進む)
        const scrollSpeed = 500;
        const x = 100 + (relativeTime * scrollSpeed);
        
        const div = document.createElement('div');
        div.className = `note ${note.type === "1" ? "don" : "ka"}`;
        div.style.left = `${x}px`;
        noteContainer.appendChild(div);
    });
}
