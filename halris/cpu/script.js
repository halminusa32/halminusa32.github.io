:root {
    --bg-color: #0a0a0a;
    --text-color: #ffffff;
    --cpu-accent: #9b59b6;
}

body {
    background-color: var(--bg-color);
    color: var(--text-color);
    font-family: 'Segoe UI', sans-serif;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
}

.game-layout {
    display: flex;
    gap: 50px;
    align-items: center;
}

/* プレイヤー・CPU共通のコンテナ */
#game-container, .enemy-container {
    display: flex;
    align-items: flex-start;
    gap: 10px;
}

/* CPU側の見た目を少し小さく・薄くする */
.enemy-container {
    opacity: 0.7;
    transform: scale(0.85);
}

.enemy-label {
    color: var(--cpu-accent);
    text-align: center;
    font-weight: bold;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 2px;
}

canvas {
    border: 2px solid #333;
    background-color: #000;
}

.side-panel {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.label {
    font-size: 0.7rem;
    color: #888;
    text-align: center;
}

/* ゲームオーバー画面 */
#game-over-screen {
    position: fixed;
    top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8);
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100;
}

button, .btn-link {
    margin-top: 20px;
    padding: 10px 30px;
    font-size: 1rem;
    cursor: pointer;
    background: var(--cpu-accent);
    color: white;
    border: none;
    border-radius: 5px;
    text-decoration: none;
}
