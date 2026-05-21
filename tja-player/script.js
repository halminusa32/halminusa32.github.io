let notesData = [];
let mainBpm = 120;
let offset = 0;
let combo = 0;
const audio = new Audio();
let isPlaying = false;

// ファイル選択監視
const checkReady = () => {
    document.getElementById('play-btn').disabled = !(notesData.length > 0 && audio.src);
};

document.getElementById('tja-file').onchange = e => {
    const reader = new FileReader();
    reader.onload = ev => {
        parseTJA(ev.target.result);
        checkReady();
    };
    reader.readAsText(e.target.files[0], "Shift-JIS");
};

document.getElementById('audio-file').onchange = e => {
    const file = e.target.files[0];
    if (file.name.match(/\.(ogg|mp3)$/i)) {
        audio.src = URL.createObjectURL(file);
        checkReady();
    } else {
        alert("OggかMp3を選択してください");
    }
};

// TJAパーサー (小節解析対応)
function parseTJA(text) {
    const lines = text.split(/\r?\n/);
    notesData = [];
    let currentBpm = 120;
    let currentScroll = 1.0;
    let currentMeasure = { upper: 4, lower: 4 };
    let currentTime = 0;
    let isCourse = false;

    lines.forEach(line => {
        let l = line.trim();
        if (l.startsWith("TITLE:")) document.getElementById('title-display').innerText = l;
        if (l.startsWith("BPM:")) {
            mainBpm = parseFloat(l.split(":")[1]);
            currentBpm = mainBpm;
            document.getElementById('bpm-display').innerText = "BPM: " + mainBpm;
        }
        if (l.startsWith("OFFSET:")) offset = parseFloat(l.split(":")[1]);

        if (l.startsWith("#START")) { isCourse = true; return; }
        if (l.startsWith("#END")) { isCourse = false; return; }

        if (isCourse) {
            if (l.startsWith("#BPMCHANGE")) currentBpm = parseFloat(l.split(" ")[1]);
            if (l.startsWith("#SCROLL")) currentScroll = parseFloat(l.split(" ")[1]);
            if (l.startsWith("#MEASURE")) {
                const m = l.split(" ")[1].split("/");
                currentMeasure.upper = parseInt(m[0]);
                currentMeasure.lower = parseInt(m[1]);
            }
            
            // 譜面データ（小節末尾のカンマで区切る）
            if (!l.startsWith("#") && l.includes(",")) {
                const measures = l.split(",");
                measures.forEach((m, idx) => {
                    if (idx === measures.length - 1 && m === "") return; // 末尾の空要素
                    const data = m.replace(/[^0-9]/g, "");
                    const noteCount = data.length;
                    
                    // 1小節の長さ(秒) = (60 / BPM) * 4 * (拍子)
                    const measureDuration = (60 / currentBpm) * 4 * (currentMeasure.upper / currentMeasure.lower);
                    
                    for (let i = 0; i < noteCount; i++) {
                        const char = data[i];
                        if (char !== "0") {
                            notesData.push({
                                type: char, // 1:ド, 2:カ, 3:大ド, 4:大カ
                                time: currentTime + (measureDuration * (i / noteCount)),
                                scroll: currentScroll,
                                hit: false
                            });
                        }
                    }
                    currentTime += measureDuration;
                });
            }
        }
    });
}

// キー入力
window.onkeydown = e => {
    if (!isPlaying) return;
    const taiko = document.getElementById('mini-taiko');
    const key = e.key.toLowerCase();
    let type = "";
    if (key === "f" || key === "j") { type = "don"; }
    if (key === "d" || key === "k") { type = "ka"; }

    if (type) {
        const isDon = type === "don";
        taiko.classList.add(isDon ? 'hit-don' : 'hit-ka');
        setTimeout(() => taiko.classList.remove('hit-don', 'hit-ka'), 50);

        const flash = document.getElementById('flash');
        flash.classList.remove('active'); void flash.offsetWidth; flash.classList.add('active');

        const now = audio.currentTime + offset;
        const target = notesData.find(n => !n.hit && Math.abs(n.time - now) < 0.12);
        if (target) {
            const isNoteDon = (target.type === "1" || target.type === "3");
            const isNoteKa = (target.type === "2" || target.type === "4");
            if ((isDon && isNoteDon) || (!isDon && isNoteKa)) {
                target.hit = true;
                combo++;
            } else { combo = 0; }
        }
        document.getElementById('combo-display').innerText = combo;
    }
};

document.getElementById('play-btn').onclick = () => {
    isPlaying = true;
    combo = 0;
    notesData.forEach(n => n.hit = false);
    audio.currentTime = 0;
    audio.play();
    const tick = () => {
        render(audio.currentTime + offset);
        if (!audio.paused) requestAnimationFrame(tick);
    };
    tick();
};

function render(now) {
    const container = document.getElementById('note-container');
    container.innerHTML = "";
    notesData.forEach(n => {
        if (n.hit) return;
        const rel = n.time - now;
        if (rel < -0.15) { n.hit = true; combo = 0; document.getElementById('combo-display').innerText = 0; return; }
        if (rel < -0.1 || rel > 1.5) return;

        const x = 120 + (rel * 500 * n.scroll); // SCROLL値を計算に反映
        const div = document.createElement('div');
        const isLarge = (n.type === "3" || n.type === "4");
        const isDon = (n.type === "1" || n.type === "3");
        div.className = `note ${isDon ? 'don' : 'ka'} ${isLarge ? 'large' : 'small'}`;
        div.style.left = x + "px";
        container.appendChild(div);
    });
}
