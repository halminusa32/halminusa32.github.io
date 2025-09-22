// ----- PC/タブレット以外は利用不可 -----
function isAllowedDevice() {
  // ユーザーエージェント判定
  const ua = navigator.userAgent;
  // スマートフォン・キーボード無し端末を弾く（必要に応じて調整）
  const isMobile = /iPhone|Android.*Mobile|Windows Phone|webOS|BlackBerry|Opera Mini/i.test(ua);
  // iPadやAndroidタブレットは許可
  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua);
  // Mac/Win/Linuxは許可
  const isPC = /Win|Macintosh|Linux/.test(ua);

  // 画面幅で強制除外も
  if(window.innerWidth < 500) return false;

  return (isPC || isTablet) && !isMobile;
}

// ----- データ -----
const QUESTIONS = [
  'Hello, world!',
  'タイピング練習をしよう',
  'GitHub Pagesは便利です',
  'JavaScriptで作成',
  'プログラミングは楽しい',
  'サンプル文章です',
  'エンジニアになろう',
  'コーヒーが好き',
  'キーボードで入力',
  '速く正確に打とう',
  'OpenAIとAI時代',
  'ゆっくり落ち着いて'
];

// ----- 状態 -----
let currentUser = null;
let currentQuestion = '';
let startTime = 0;
let timerInterval = null;
let isAnswered = false;

// ----- DOM -----
const deviceBlock = document.getElementById('device-block');
const app = document.getElementById('app');
const loginArea = document.getElementById('login-area');
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('login-btn');
const mainArea = document.getElementById('main-area');
const userLabel = document.getElementById('user-label');
const logoutBtn = document.getElementById('logout-btn');
const questionBox = document.getElementById('question');
const answerInput = document.getElementById('answer');
const timerLabel = document.getElementById('timer');
const scoreLabel = document.getElementById('score');
const nextBtn = document.getElementById('next-btn');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// ----- ローカルストレージ -----
function loadHistory(user) {
  const data = localStorage.getItem('typing_history_' + user);
  return data ? JSON.parse(data) : [];
}
function saveHistory(user, history) {
  localStorage.setItem('typing_history_' + user, JSON.stringify(history));
}
function clearHistory(user) {
  localStorage.removeItem('typing_history_' + user);
}

// ----- ログイン -----
function showLogin() {
  loginArea.classList.remove('hidden');
  mainArea.classList.add('hidden');
  usernameInput.value = '';
  usernameInput.focus();
}
function showMain() {
  loginArea.classList.add('hidden');
  mainArea.classList.remove('hidden');
  userLabel.textContent = `ユーザー: ${currentUser}`;
  answerInput.value = '';
  showHistory();
  nextQuestion();
}

loginBtn.onclick = () => {
  const name = usernameInput.value.trim().slice(0, 16);
  if (!name) {
    alert('ユーザー名を入力してください');
    usernameInput.focus();
    return;
  }
  currentUser = name;
  localStorage.setItem('typing_user', name);
  showMain();
};

logoutBtn.onclick = () => {
  currentUser = null;
  localStorage.removeItem('typing_user');
  showLogin();
};

// ----- タイピング機能 -----
function nextQuestion() {
  isAnswered = false;
  scoreLabel.textContent = '';
  answerInput.value = '';
  answerInput.disabled = false;
  nextBtn.classList.add('hidden');
  // ランダム出題
  currentQuestion = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  questionBox.textContent = currentQuestion;
  answerInput.focus();
  // タイマー
  timerLabel.textContent = '00.00s';
  if (timerInterval) clearInterval(timerInterval);
  startTime = Date.now();
  timerInterval = setInterval(() => {
    if (!isAnswered) {
      const diff = (Date.now() - startTime) / 1000;
      timerLabel.textContent = diff.toFixed(2) + 's';
    }
  }, 60);
}

answerInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !isAnswered) {
    checkAnswer();
  }
});

function checkAnswer() {
  if (isAnswered) return;
  const userAnswer = answerInput.value;
  if (userAnswer === currentQuestion) {
    isAnswered = true;
    const time = ((Date.now() - startTime) / 1000);
    timerLabel.textContent = time.toFixed(2) + 's';
    scoreLabel.textContent = '正解！ (' + time.toFixed(2) + ' 秒)';
    answerInput.disabled = true;
    saveResult(currentQuestion, time);
    nextBtn.classList.remove('hidden');
  } else {
    scoreLabel.textContent = '間違いです';
  }
}

nextBtn.onclick = () => {
  nextQuestion();
};

function saveResult(q, time) {
  if (!currentUser) return;
  const hist = loadHistory(currentUser);
  hist.unshift({
    question: q,
    time: time,
    date: new Date().toLocaleString()
  });
  // 30件まで
  saveHistory(currentUser, hist.slice(0, 30));
  showHistory();
}

function showHistory() {
  if (!currentUser) return;
  const hist = loadHistory(currentUser);
  historyList.innerHTML = '';
  if (hist.length === 0) {
    historyList.innerHTML = '<li>履歴はありません</li>';
    return;
  }
  for (const h of hist) {
    const li = document.createElement('li');
    li.textContent = `[${h.date}] ${h.question} ... ${h.time.toFixed(2)}秒`;
    historyList.appendChild(li);
  }
}

clearHistoryBtn.onclick = () => {
  if (currentUser && confirm('本当に履歴を削除しますか？')) {
    clearHistory(currentUser);
    showHistory();
  }
};

// ----- 起動時処理 -----
window.onload = function() {
  if (!isAllowedDevice()) {
    deviceBlock.classList.remove('hidden');
    app.classList.add('hidden');
    return;
  }
  deviceBlock.classList.add('hidden');
  app.classList.remove('hidden');
  // ユーザー自動ログイン
  const savedUser = localStorage.getItem('typing_user');
  if (savedUser) {
    currentUser = savedUser;
    showMain();
  } else {
    showLogin();
  }
};