// HTMLの要素を取得
const canvas = document.getElementById('remoteScreen');
const ctx = canvas.getContext('2d');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

let ws = null;

// 1. 接続ボタンが押されたときの処理
connectBtn.addEventListener('click', () => {
    // 画面にダイアログを表示して接続先URLを入力させる
    const url = prompt("接続先のURLを入力してください:", "ws://localhost:8080");
    
    // キャンセルされた場合、または空欄の場合は接続処理を中止
    if (!url) {
        return; 
    }

    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer'; // 画像データをバイナリで受け取る設定

    // 接続成功時
    ws.onopen = () => {
        alert('サーバーに接続しました。');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
    };

    // サーバーから画面データ（画像）を受信したとき
    ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            const img = new Image();
            
            img.onload = () => {
                // Canvasのサイズを送信されてきた画像のサイズに自動調整
                canvas.width = img.width;
                canvas.height = img.height;
                // 画面を描画
                ctx.drawImage(img, 0, 0);
            };
            img.src = URL.createObjectURL(blob);
        }
    };

    // 切断時
    ws.onclose = () => {
        alert('接続が切断されました。');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
    };
});

// 2. 切断ボタンが押されたときの処理
disconnectBtn.addEventListener('click', () => {
    if (ws) ws.close();
});

// 3. マウス操作をサーバーに送信する処理
canvas.addEventListener('mousemove', (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ws.send(JSON.stringify({ type: 'mousemove', x: x, y: y }));
});

canvas.addEventListener('mousedown', (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'mousedown', button: e.button }));
});

canvas.addEventListener('mouseup', (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'mouseup', button: e.button }));
});

// 4. キーボード入力をサーバーに送信する処理
window.addEventListener('keydown', (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    e.preventDefault(); // ブラウザ標準のショートカット（F5やCtrl+Sなど）を無効化
    ws.send(JSON.stringify({ type: 'keydown', key: e.key }));
});
