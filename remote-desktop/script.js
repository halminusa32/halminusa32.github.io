let client = null;

const loginForm = document.getElementById('loginForm');
const loginPanel = document.getElementById('login-panel');
const desktopPanel = document.getElementById('desktop-panel');
const rdpContainer = document.getElementById('rdp-container');
const disconnectBtn = document.getElementById('disconnectBtn');
const loginStatus = document.getElementById('loginStatus');
const connectionStatus = document.getElementById('connectionStatus');

// フォーム送信時の処理
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const hostname = document.getElementById('hostname').value.trim();
    const port = document.getElementById('port').value;
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const domain = document.getElementById('domain').value.trim();
    
    if (!hostname || !username || !password) {
        showLoginStatus('すべての必須フィールドを入力してください', 'error');
        return;
    }
    
    showLoginStatus('接続中...', 'info');
    
    try {
        // バックエンドサーバーに接続情報を送信
        const response = await fetch('/api/rdp-connect', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hostname: hostname,
                port: parseInt(port),
                username: username,
                password: password,
                domain: domain || undefined
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '接続に失敗しました');
        }
        
        const data = await response.json();
        
        // 接続成功後、Guacamoleで表示
        connectGuacamole(data.token);
        
    } catch (error) {
        console.error('接続エラー:', error);
        showLoginStatus('エラー: ' + error.message, 'error');
    }
});

function showLoginStatus(message, type) {
    loginStatus.textContent = message;
    loginStatus.className = 'status-message ' + type;
}

function connectGuacamole(token) {
    // Guacamoleクライアントの初期化
    const guac = new Guacamole.Client(
        new Guacamole.WebSocketTunnel('/guacamole/websocket-tunnel?token=' + token)
    );
    
    // RDP画面をコンテナに追加
    rdpContainer.innerHTML = '';
    rdpContainer.appendChild(guac.getDisplay().getElement());
    
    // 接続成功
    guac.connect();
    
    guac.onconnect = () => {
        console.log('Guacamoleに接続しました');
        loginPanel.classList.remove('active');
        desktopPanel.classList.add('active');
        connectionStatus.textContent = '接続済み';
        client = guac;
    };
    
    guac.onerror = (error) => {
        console.error('Guacamoleエラー:', error);
        connectionStatus.textContent = 'エラー';
        showLoginStatus('接続エラー: ' + error.message, 'error');
        setTimeout(() => {
            disconnectSession();
        }, 2000);
    };
    
    guac.ondisconnect = () => {
        console.log('切断されました');
        disconnectSession();
    };
    
    // マウスとキーボード入力をサポート
    const display = guac.getDisplay();
    
    // マウス入力
    display.getElement().addEventListener('mousemove', (e) => {
        const rect = display.getElement().getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        guac.sendMouseMove(x, y);
    });
    
    display.getElement().addEventListener('mousedown', (e) => {
        guac.sendMouseDown(e.button);
        e.preventDefault();
    });
    
    display.getElement().addEventListener('mouseup', (e) => {
        guac.sendMouseUp(e.button);
        e.preventDefault();
    });
    
    // キーボード入力
    document.addEventListener('keydown', (e) => {
        if (client && client.isConnected && desktopPanel.classList.contains('active')) {
            guac.sendKeyDown(e.keyCode);
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (client && client.isConnected && desktopPanel.classList.contains('active')) {
            guac.sendKeyUp(e.keyCode);
        }
    });
}

// 切断ボタン
disconnectBtn.addEventListener('click', () => {
    if (client) {
        client.disconnect();
    }
    disconnectSession();
});

function disconnectSession() {
    if (client) {
        client.disconnect();
        client = null;
    }
    loginPanel.classList.add('active');
    desktopPanel.classList.remove('active');
    rdpContainer.innerHTML = '';
    loginForm.reset();
    loginStatus.textContent = '';
    connectionStatus.textContent = '';
}

// ページを離れる時に接続を切断
window.addEventListener('beforeunload', () => {
    if (client && client.isConnected) {
        client.disconnect();
    }
});