let notesData = [];
let bpm = 120;
let offset = 0;
let combo = 0;
const audio = new Audio();
let isPlaying = false;

// ファイル読み込み
document.getElementById('tja-file').onchange = e => {
    const reader = new FileReader();
    reader.onload = ev => parseTJA(ev.target.result);
    reader.readAsText(e.target.files[0], "Shift-JIS");
};

document.getElementById('audio-file').onchange = e => {
    audio.src = URL.createObjectURL(e.target.files[0]);
    document.getElementById('play-btn').disabled = false;
};

// TJA解析
function parseTJA(text) {
    const lines = text.split(/\r?\n/);
    let rawNotes = "";
    let isCourse = false;
    notesData = [];

    lines.forEach(line => {
        const l = line.trim();
        if (l.startsWith("BPM:")) bpm = parseFloat(l.split(":")[1]);
        if (l.startsWith("OFFSET:")) offset = parseFloat(l.split(":")[1]);
        if (l.startsWith("#START")) isCourse = true;
        if (l.startsWith("#END")) isCourse = false;
        if (isCourse && !l.startsWith("#")) {
            rawNotes += l.split(',')[0].replace(/[^0-9]/g, '');
        }
    });

    for (let i = 0; i < rawNotes.length; i++) {
        const char = rawNotes[i];
        if (char === "1" || char === "2") {
            notesData.push({ type: char, time: (60 / bpm) * i, hit: false });
        }
    }
}

// 入力と判定
window.onkeydown = e => {
    if (!isPlaying) return;
    
    const taiko = document.getElementById('mini-taiko');
    let type = "";
    
    // ドン（面）の判定
    if (e.key === "f" || e.key === "j") {
        type = "1";
        taiko.classList.add('hit-don');
        setTimeout(() => taiko.classList.remove('hit-don'), 50);
    }
    // カッ（フチ）の判定
    if (e.key === "d" || e.key === "k") {
        type = "2";
        taiko.classList.add('hit-ka');
        setTimeout(() => taiko.classList.remove('hit-ka'), 50);
    }
    
    if (type !== "") {
        // 判定枠のエフェクト
        const flash = document.getElementById('flash');
        flash.classList.remove('active'); // アニメーションをリセット
        void flash.offsetWidth; // 強制再描画
        flash.classList.add('active');

        const currentTime = audio.currentTime + offset;
        // 判定幅：良（±0.05秒）、可（±0.1秒）、不可（±0.15秒以上）
        const target = notesData.find(n => !n.hit && Math.abs(n.time - currentTime) < 0.12);
        
        if (target) {
            if (target.type === type) {
                target.hit = true;
                combo++;
            } else {
                // 不可（逆の手で叩いた）
                combo = 0;
            }
        } else if (Math.abs(notesData.find(n => !n.hit)?.time - currentTime) < 0.2) {
             // 近くにノーツがあるのにタイミングが外れた、または未打鍵
             combo = 0;
        }
        
        document.getElementById('combo-display').innerText = combo + " コンボ";
    }
};

// 再生開始
document.getElementById('play-btn').onclick = () => {
    isPlaying = true;
    audio.play();
    function update() {
        render(audio.currentTime + offset);
        if (!audio.paused) requestAnimationFrame(update);
        else isPlaying = false;
    }
    update();
};

// 描画
function render(currentTime) {
    const container = document.getElementById('note-container');
    container.innerHTML = "";
    notesData.forEach(note => {
        if (note.hit) return;
        const relativeTime = note.time - currentTime;
        
        // 不可（スルー）の判定
        if (relativeTime < -0.15 && !note.hit) {
            note.hit = true; // 二度と判定しない
            combo = 0;
            document.getElementById('combo-display').innerText = "0 コンボ";
        }
        
        if (relativeTime < -0.1 || relativeTime > 2.0) return;
        const x = 100 + (relativeTime * 500);
        const div = document.createElement('div');
        div.className = `note ${note.type === "1" ? "don" : "ka"}`;
        div.style.left = `${x}px`;
        container.appendChild(div);
    });
}
