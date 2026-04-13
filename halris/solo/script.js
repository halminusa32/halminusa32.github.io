<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>Tetris Online - 40Rows Edition</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div id="game-container">
        <div class="player-section side">
            <div class="label">HOLD</div>
            <canvas id="hold-canvas" width="60" height="60"></canvas>
        </div>

        <div class="player-section main">
            <div id="score-board">
                SCORE: <span id="score-display">0</span> | 
                LINES: <span id="line-count">0</span> | 
                LEVEL: <span id="level">1</span>
            </div>
            <canvas id="tetris" width="240" height="480"></canvas>
            
            <div id="combo-container">COMBO <span id="combo-count">0</span></div>
            <div id="perfect-clear-text">PERFECT CLEAR!</div>
        </div>

        <div class="player-section side">
            <div class="label">NEXT</div>
            <canvas id="next-canvas" width="60" height="220"></canvas>
        </div>
    </div>

    <div id="game-over-screen">
        <div class="message">GAME OVER</div>
        <button id="restart-button">RETRY</button>
    </div>

    <div id="room-setup">
        <button id="play">START GAME</button>
    </div>

    <script type="module" src="script.js"></script>
</body>
</html>
