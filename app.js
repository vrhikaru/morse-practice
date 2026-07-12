/* ============================================================
   童軍摩斯密碼練習器
   ------------------------------------------------------------
   修正重點：
   1. 舊版 switchPracticeMode() 抓取不存在的元素 (btnShowAnswer /
      btnReplay / practiceHint / modeKoch) → 直接拋出 TypeError，
      導致「視覺編碼」模式的輸入框長度永遠停在 1，整個模式壞掉。
   2. isQuizRunning 沒有宣告（隱性全域）。
   3. 一開始沒有呼叫 updateConfigs()，Farnsworth 間隔沒生效。
   4. 單字間隔被算成 3+7+3 = 13 單位（正確為 7）。
   5. 振盪器直接接 destination → 每個音都有爆音；改用 gain 包絡。
   6. 切分頁 / 換模式會把統計歸零；現在只有按「歸零」才會清空。
   7. replayQuiz() 與 showAnswer() 寫好了卻沒有按鈕可以呼叫。
   ============================================================ */

'use strict';

const $ = (id) => document.getElementById(id);

/* ---------- 1. 密碼表 ---------- */
const LETTERS = { A:'.-', B:'-...', C:'-.-.', D:'-..', E:'.', F:'..-.', G:'--.', H:'....', I:'..', J:'.---', K:'-.-', L:'.-..', M:'--', N:'-.', O:'---', P:'.--.', Q:'--.-', R:'.-.', S:'...', T:'-', U:'..-', V:'...-', W:'.--', X:'-..-', Y:'-.--', Z:'--..' };
const NUMBERS = { 0:'-----', 1:'.----', 2:'..---', 3:'...--', 4:'....-', 5:'.....', 6:'-....', 7:'--...', 8:'---..', 9:'----.' };
const SYMBOLS = { '.':'.-.-.-', ',':'--..--', '?':'..--..', "'":'.----.', '!':'-.-.--', '/':'-..-.', '(':'-.--.', ')':'-.--.-', '&':'.-...', ':':'---...', ';':'-.-.-.', '=':'-...-', '+':'.-.-.', '-':'-....-', '_':'..--.-', '"':'.-..-.', $:'...-..-', '@':'.--.-.' };

const CODE_TABLES = {
  standard: { ...LETTERS, ...NUMBERS },
  extended: { ...LETTERS, ...NUMBERS, ...SYMBOLS },
};
const KOCH_SEQUENCE = 'KMRSUAPTLOWI.NJEF0Y,VG5/Q9ZH38B?427C1D6X'.split('');

/* ---------- 2. 狀態 ---------- */
const S = {
  dictName: 'standard',
  dict: {},          // 字元 → 密碼
  reverse: {},       // 密碼 → 字元
  letters: [], numbers: [], symbols: [], all: [],

  freq: 600, charWpm: 20, overallWpm: 10,
  dit: 60,           // 字元單位時間 (ms)
  gap: 60,           // Farnsworth 間隔單位時間 (ms)
  sound: true, light: true, vibrate: false,

  quizRunning: false,
  quizChar: '', quizMorse: '', quizScored: false,
  total: 0, correct: 0, streak: 0,
};

let playToken = 0;   // 播放序號：一有新動作就作廢舊的播放
let quizToken = 0;   // 題目序號：避免舊的 setTimeout 蓋掉新題目

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 3. 音訊引擎（含 gain 包絡，不會爆音） ---------- */
let audioCtx = null;
let activeTone = null;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
// iOS 需要在使用者手勢中解鎖音訊
['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
  document.addEventListener(ev, ensureAudio, { once: true, passive: true })
);

function toneOn() {
  if (!S.sound) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  toneOff();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = S.freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.006);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  activeTone = { osc, gain };
}

function toneOff() {
  if (!activeTone || !audioCtx) return;
  const { osc, gain } = activeTone;
  activeTone = null;
  const t = audioCtx.currentTime;
  try {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value || 0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
    osc.stop(t + 0.03);
  } catch (e) { /* 已停止 */ }
  setTimeout(() => { try { osc.disconnect(); gain.disconnect(); } catch (e) {} }, 80);
}

function beep(from, to, dur, type = 'sine', vol = 0.2) {
  if (!S.sound) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(to, ctx.currentTime + dur);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
}
const successSound = () => beep(740, 1180, 0.22);
const errorSound   = () => beep(240, 140, 0.28, 'sawtooth', 0.15);

/* ---------- 4. 燈光 / 震動 ---------- */
function signalOn(duration) {
  if (S.light) { $('lamp').classList.add('on'); $('lampLabel').textContent = '發送中'; }
  if (S.sound) toneOn();
  if (S.vibrate && navigator.vibrate) navigator.vibrate(duration);
}
function signalOff() {
  $('lamp').classList.remove('on');
  $('lampLabel').textContent = '待命';
  toneOff();
}
function stopEverything() {
  playToken++;
  signalOff();
  if (navigator.vibrate) navigator.vibrate(0);
}

/* ---------- 5. 播放器（正確的 Farnsworth 間隔） ---------- */
// 把密碼字串切成 token；'/' 會吃掉左右空白，避免 3+7+3=13 單位的錯誤
function parseMorse(str) {
  const clean = String(str).replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const ch of clean) {
    if (ch === '.' || ch === '-') out.push({ t: 'el', c: ch });
    else if (ch === ' ') out.push({ t: 'charGap' });
    else if (ch === '/') out.push({ t: 'wordGap' });
  }
  return out;
}

function renderRibbon(tokens, show) {
  const bar = $('ribbon');
  bar.scrollLeft = 0;                      // 換新內容時回到最左邊
  if (!show || tokens.length === 0) {
    bar.innerHTML = '<span class="ribbon-idle">節奏帶：播放時會顯示滴（短）／答（長）</span>';
    return;
  }
  bar.innerHTML = tokens.map((tk) => {
    if (tk.t === 'el') return `<i class="el ${tk.c === '.' ? 'dot' : 'dash'}"></i>`;
    if (tk.t === 'charGap') return '<i class="gap"></i>';
    return '<i class="word"></i>';
  }).join('');
}

// 讓正在播放的那一格永遠留在畫面裡（超出寬度時自動捲動）
function keepInView(node) {
  const bar = $('ribbon');
  if (!node || bar.scrollWidth <= bar.clientWidth) return;
  const barBox = bar.getBoundingClientRect();
  const nodeBox = node.getBoundingClientRect();
  const delta = (nodeBox.left - barBox.left) - (bar.clientWidth / 2) + (nodeBox.width / 2);
  const target = Math.max(0, Math.min(bar.scrollLeft + delta, bar.scrollWidth - bar.clientWidth));
  // 速度快時用瞬間捲動，慢速時才平滑捲動，避免動畫追不上
  const smooth = S.dit >= 80 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  bar.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
}

async function playMorse(morseStr, { showRibbon = true } = {}) {
  const tokens = parseMorse(morseStr);
  stopEverything();
  const me = playToken;

  renderRibbon(tokens, showRibbon);
  const els = [...$('ribbon').querySelectorAll('.el')];
  let idx = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (me !== playToken) return;
    const tk = tokens[i];

    if (tk.t === 'el') {
      const dur = tk.c === '.' ? S.dit : S.dit * 3;
      const node = els[idx++];
      if (node) { node.classList.add('lit'); keepInView(node); }
      signalOn(dur);
      await sleep(dur);
      if (me !== playToken) { signalOff(); return; }
      signalOff();
      if (node) node.classList.replace('lit', 'done');

      const next = tokens[i + 1];
      if (next && next.t === 'el') await sleep(S.dit);      // 字元內間隔 = 1 單位
    } else if (tk.t === 'charGap') {
      await sleep(3 * S.gap);                                // 字元間 = 3 單位
    } else {
      await sleep(7 * S.gap);                                // 單字間 = 7 單位
    }
  }
}

/* ---------- 6. 設定 ---------- */
const STORE_KEY = 'scout-morse-v2';

function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      dict: S.dictName, freq: S.freq, charWpm: S.charWpm, overallWpm: S.overallWpm,
      sound: S.sound, light: S.light, vibrate: S.vibrate,
      koch: +$('kochLevelSlider').value, quizMode: $('quizMode').value,
    }));
  } catch (e) { /* 無痕模式或不支援，略過 */ }
}

function loadSettings() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) {}
  if (!d) return;
  if (d.dict && CODE_TABLES[d.dict]) $('dictSelect').value = d.dict;
  if (d.freq) $('freqSlider').value = d.freq;
  if (d.charWpm) $('charWpmSlider').value = d.charWpm;
  if (d.overallWpm) $('overallWpmSlider').value = d.overallWpm;
  $('cfgSound').checked = d.sound !== false;
  $('cfgLight').checked = d.light !== false;
  $('cfgVibrate').checked = !!d.vibrate;
  if (d.quizMode) $('quizMode').value = d.quizMode;
  if (d.koch) $('kochLevelSlider').value = d.koch;
}

function updateConfigs() {
  S.freq = +$('freqSlider').value;
  S.charWpm = +$('charWpmSlider').value;
  S.overallWpm = +$('overallWpmSlider').value;

  // 整體速度不可超過字元速度
  if (S.overallWpm > S.charWpm) {
    S.overallWpm = S.charWpm;
    $('overallWpmSlider').value = S.charWpm;
  }

  $('freqValue').textContent = S.freq;
  $('charWpmValue').textContent = S.charWpm;
  $('overallWpmValue').textContent = S.overallWpm;

  S.dit = 1200 / S.charWpm;
  S.gap = S.overallWpm < S.charWpm
    ? ((50 * 1200 / S.overallWpm) - (31 * 1200 / S.charWpm)) / 19
    : S.dit;

  S.sound = $('cfgSound').checked;
  S.light = $('cfgLight').checked;
  S.vibrate = $('cfgVibrate').checked;

  stopEverything();
  saveSettings();
}

function switchDictionary() {
  S.dictName = $('dictSelect').value;
  S.dict = CODE_TABLES[S.dictName];
  S.reverse = {};
  S.letters = []; S.numbers = []; S.symbols = []; S.all = [];

  for (const [char, code] of Object.entries(S.dict)) {
    S.reverse[code] = char;
    S.all.push(char);
    if (/[A-Z]/.test(char)) S.letters.push(char);
    else if (/[0-9]/.test(char)) S.numbers.push(char);
    else S.symbols.push(char);
  }

  const optSymbols = $('quizMode').querySelector('option[value="symbols"]');
  optSymbols.hidden = S.symbols.length === 0;
  if (optSymbols.hidden && $('quizMode').value === 'symbols') $('quizMode').value = 'all';

  // Koch 序列只保留目前密碼表有的字元，滑桿上限跟著調整
  const pool = kochPool();
  const slider = $('kochLevelSlider');
  slider.max = Math.max(1, pool.length - 1);
  if (+slider.value > +slider.max) slider.value = slider.max;

  renderLearnGrid();
  updateKochLevel();
  saveSettings();
}

const kochPool = () => KOCH_SEQUENCE.filter((c) => S.dict[c]);

/* ---------- 7. 分頁 ---------- */
function openTab(tabName) {
  stopEverything();   // 只停聲光，不會把測驗和成績清掉
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === tabName));
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === tabName;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  renderRibbon([], false);
}

/* ---------- 8. 翻譯 ---------- */
const isDecodeDir = () => $('dirDecode').checked;

function textToMorse(text) {
  return text.toUpperCase().split(/[\s\n]+/).filter(Boolean).map((word) => {
    const codes = [];
    for (const ch of word) if (S.dict[ch]) codes.push(S.dict[ch]);
    return codes.join(' ');
  }).filter(Boolean).join(' / ');
}

function morseToText(morse) {
  return morse.trim().split(/\s*\/\s*/).map((word) =>
    word.split(/\s+/).filter(Boolean).map((code) => S.reverse[code] || '?').join('')
  ).join(' ');
}

function handleInput() {
  stopEverything();
  const raw = $('inputText').value;
  $('outputText').value = isDecodeDir() ? morseToText(raw) : textToMorse(raw);
}

function switchTranslateDir() {
  const dec = isDecodeDir();
  $('inputLabel').textContent = dec ? '輸入密碼（用空白隔開字元，/ 隔開單字）' : '輸入文字';
  $('outputLabel').textContent = dec ? '翻譯結果（文字）' : '翻譯結果（密碼）';
  $('inputText').placeholder = dec ? '例如：-... .   .--. .-. . .--. .- .-. . -..' : '例如：BE PREPARED';
  $('inputText').classList.toggle('mono', dec);
  $('outputText').classList.toggle('mono', !dec);
  $('inputText').value = '';
  $('outputText').value = '';
}

/* ---------- 9. 學習字卡 ---------- */
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderLearnGrid() {
  const q = ($('dictSearch').value || '').trim().toUpperCase();
  const groups = [
    ['英文字母', S.letters],
    ['數字', S.numbers],
    ['標點符號', S.symbols],
  ];
  let html = '';
  let count = 0;

  for (const [title, keys] of groups) {
    const hits = keys.filter((k) => !q || k.includes(q) || S.dict[k].includes(q));
    if (!hits.length) continue;
    count += hits.length;
    html += `<div class="group-title">${title}</div><div class="grid">`;
    html += hits.map((k) =>
      `<button class="card" data-char="${escapeHtml(k)}">
         <div class="card-char">${escapeHtml(k)}</div>
         <div class="card-morse">${S.dict[k]}</div>
       </button>`).join('');
    html += '</div>';
  }
  $('dictGrid').innerHTML = count ? html : '<p class="empty">找不到「' + escapeHtml(q) + '」，換個關鍵字試試。</p>';
}

/* ---------- 10. 測驗 ---------- */
const isEncodeMode = () => $('modeEncode').checked;

function switchPracticeMode() {
  stopQuiz();
  const enc = isEncodeMode();
  const guess = $('userGuess');

  $('morseKeypad').hidden = !enc;
  $('btnReplay').hidden = enc;          // ← 這些元素現在真的存在了
  $('btnShowAnswer').hidden = false;
  $('practiceHint').textContent = enc
    ? '看畫面上的字元，用下方按鍵打出對應的密碼。'
    : '聆聽密碼聲音，輸入對應的字元。';

  guess.value = '';
  guess.maxLength = enc ? 8 : 1;        // 最長的密碼是 $ = ...-..- (7)
  guess.placeholder = enc ? '.-' : '?';
  guess.inputMode = enc ? 'none' : 'text';   // 編碼模式不叫出手機鍵盤，但仍可用實體鍵盤

  $('questionDisplay').className = 'question';
  $('questionDisplay').textContent = '按「開始測驗」出題';
  $('answerBox').textContent = '';
}

function handleQuizModeChange() {
  $('kochPanel').style.display = $('quizMode').value === 'koch' ? 'block' : 'none';
  updateKochLevel();
  saveSettings();
}

function updateKochLevel() {
  const level = +$('kochLevelSlider').value;
  const pool = kochPool().slice(0, level + 1);
  $('kochLevelVal').textContent = level;
  $('kochChars').textContent = pool.join(' ');
  $('kochProgress').style.width = Math.min(100, (S.streak / 5) * 100) + '%';
  saveSettings();
}

function startQuiz() {
  S.quizRunning = true;
  $('btnStartQuiz').hidden = true;
  $('btnStopQuiz').hidden = false;
  nextQuestion();
}

function stopQuiz() {
  S.quizRunning = false;
  quizToken++;
  stopEverything();
  $('btnStartQuiz').hidden = false;
  $('btnStopQuiz').hidden = true;
  S.quizChar = ''; S.quizMorse = '';
  $('userGuess').value = '';
  $('questionDisplay').className = 'question';
  $('questionDisplay').textContent = '測驗已停止（成績保留）';
  $('answerBox').textContent = '';
}

function pickPool() {
  const mode = $('quizMode').value;
  if (mode === 'koch') return kochPool().slice(0, +$('kochLevelSlider').value + 1);
  if (mode === 'letters') return S.letters;
  if (mode === 'numbers') return S.numbers;
  if (mode === 'symbols' && S.symbols.length) return S.symbols;
  return S.all;
}

async function nextQuestion() {
  const me = ++quizToken;
  const guess = $('userGuess');
  const q = $('questionDisplay');

  $('answerBox').textContent = '';
  $('answerBox').className = 'answer';
  guess.value = '';
  guess.classList.remove('err', 'ok');
  S.quizScored = false;

  const pool = pickPool();
  S.quizChar = pool[Math.floor(Math.random() * pool.length)];
  S.quizMorse = S.dict[S.quizChar];

  if (isEncodeMode()) {
    q.className = 'question big';
    q.textContent = S.quizChar;
  } else {
    q.className = 'question listen';
    q.textContent = '🎧 仔細聽…';
    await playMorse(S.quizMorse, { showRibbon: false });   // 解碼題不能劇透節奏帶
    if (me !== quizToken) return;
    q.textContent = '🎧 這是哪個字元？';
    guess.focus({ preventScroll: true });
  }
}

async function replayQuiz() {
  if (!S.quizMorse || isEncodeMode()) return;
  const q = $('questionDisplay');
  q.textContent = '🎧 重播中…';
  await playMorse(S.quizMorse, { showRibbon: false });
  q.textContent = '🎧 這是哪個字元？';
}

function say(msg, kind) {
  const box = $('answerBox');
  box.textContent = msg;
  box.className = 'answer ' + (kind || '');
}

function checkAnswer() {
  const guess = $('userGuess');
  guess.classList.remove('err', 'ok');

  if (!S.quizRunning || !S.quizChar) { say('請先按「開始測驗」。', 'err'); return; }

  const val = guess.value.trim().toUpperCase();
  if (!val) { say('還沒輸入答案喔。', 'err'); return; }

  const correct = isEncodeMode() ? val === S.quizMorse : val === S.quizChar;

  if (!S.quizScored) {
    S.total++;
    if (correct) { S.correct++; S.streak++; } else { S.streak = 0; }
    S.quizScored = true;
    updateStats();
  }

  if (correct) {
    guess.classList.add('ok');
    successSound();
    say(`🎉 答對了！${S.quizChar} ＝ ${S.quizMorse}`, 'ok');

    const koch = $('quizMode').value === 'koch';
    const auto = $('autoLevelKoch').checked;
    const slider = $('kochLevelSlider');
    let delay = 900;

    if (koch && auto && S.streak >= 5 && +slider.value < +slider.max) {
      slider.value = +slider.value + 1;
      S.streak = 0;
      updateKochLevel();
      updateStats();
      $('questionDisplay').className = 'question win';
      $('questionDisplay').textContent = `🏆 晉升 Koch 等級 ${slider.value}！`;
      say('連對 5 題，難度自動提高。', 'info');
      delay = 1800;   // 先讓恭喜訊息顯示完，再出下一題
    }

    const me = quizToken;
    setTimeout(() => { if (S.quizRunning && me === quizToken) nextQuestion(); }, delay);
  } else {
    guess.classList.add('err');
    errorSound();
    say('❌ 不對，再想想（可按「再聽一次」）。', 'err');

    const me = quizToken;
    setTimeout(() => {
      if (me !== quizToken) return;
      guess.value = '';
      guess.classList.remove('err');
      S.quizScored = false;   // 同一題可以再挑戰，但不會重複計分
      guess.focus({ preventScroll: true });
    }, 700);
  }
}

function showAnswer() {
  if (!S.quizChar) { say('請先按「開始測驗」。', 'err'); return; }
  if (!S.quizScored) { S.total++; S.quizScored = true; }
  S.streak = 0;
  updateStats();
  updateKochLevel();
  say(`💡 答案是 ${S.quizChar} ＝ ${S.quizMorse}（本題算答錯）`, 'info');

  const me = quizToken;
  setTimeout(() => { if (S.quizRunning && me === quizToken) nextQuestion(); }, 1800);
}

function updateStats() {
  const rate = S.total ? Math.round((S.correct / S.total) * 100) : 0;
  $('stCorrect').textContent = S.correct;
  $('stTotal').textContent = S.total;
  $('stRate').textContent = rate + '%';
  $('stStreak').textContent = S.streak;
  $('kochProgress').style.width = Math.min(100, (S.streak / 5) * 100) + '%';
}

function resetStats() {
  S.total = 0; S.correct = 0; S.streak = 0;
  updateStats();
  say('成績已歸零。', 'info');
}

function appendMorse(ch) {
  const guess = $('userGuess');
  if (guess.value.length >= 8) return;
  guess.value += ch;
  // 按鍵回饋音
  if (S.sound) {
    const ctx = ensureAudio();
    if (ctx) {
      const dur = (ch === '.' ? S.dit : S.dit * 3) / 1000;
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.value = S.freq;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
    }
  }
  if (S.vibrate && navigator.vibrate) navigator.vibrate(ch === '.' ? 25 : 70);
}

/* ---------- 11. 發報練習 ---------- */
let pressing = false;
let pressStart = 0, letterStart = 0, releaseAt = 0;
let signal = '';
let letterTimer = null, wordTimer = null;

function keyDown() {
  if (pressing) return;
  pressing = true;
  pressStart = Date.now();
  if (!signal) letterStart = pressStart;
  clearTimeout(letterTimer); clearTimeout(wordTimer);

  playToken++;                        // 中斷其他播放
  if (S.light) $('lamp').classList.add('on');
  if (S.sound) toneOn();
  if (S.vibrate && navigator.vibrate) navigator.vibrate(10000);
  $('telegraphKey').classList.add('down');
}

function keyUp() {
  if (!pressing) return;
  pressing = false;
  releaseAt = Date.now();

  signalOff();
  if (navigator.vibrate) navigator.vibrate(0);
  $('telegraphKey').classList.remove('down');

  const held = releaseAt - pressStart;
  signal += held < S.dit * 2 ? '.' : '-';
  $('currentSignalDisplay').textContent = signal;

  letterTimer = setTimeout(commitLetter, S.dit * 3);       // 3 單位沒動作 → 斷字
  wordTimer = setTimeout(() => {                            // 7 單位沒動作 → 斷詞
    const out = $('manualOutputText');
    if (out.value && !out.value.endsWith(' ')) out.value += ' ';
  }, S.dit * 7);
}

function commitLetter() {
  if (!signal) return;
  const char = S.reverse[signal] || '?';
  const out = $('manualOutputText');
  out.value += char;
  out.scrollTop = out.scrollHeight;

  // 估算實際發送速率
  if (char !== '?' && releaseAt > letterStart) {
    let units = 0;
    for (const c of signal) units += c === '.' ? 1 : 3;
    units += signal.length - 1;
    const per = (releaseAt - letterStart) / units;
    if (per > 0) {
      const wpm = Math.min(99, Math.round(1200 / per));
      $('currentWpmDisplay').textContent = wpm + ' WPM';
    }
  }
  signal = '';
  $('currentSignalDisplay').textContent = '—';
}

/* ---------- 12. 綁定事件 ---------- */
function bind() {
  // 分頁
  document.querySelectorAll('.tab').forEach((b) =>
    b.addEventListener('click', () => openTab(b.dataset.tab)));

  // 設定
  ['freqSlider', 'charWpmSlider', 'overallWpmSlider'].forEach((id) =>
    $(id).addEventListener('input', updateConfigs));
  ['cfgSound', 'cfgLight', 'cfgVibrate'].forEach((id) =>
    $(id).addEventListener('change', updateConfigs));
  $('dictSelect').addEventListener('change', switchDictionary);
  $('btnTestSignal').addEventListener('click', () => playMorse('... --- ...'));

  // 翻譯
  $('inputText').addEventListener('input', handleInput);
  $('dirEncode').addEventListener('change', () => { switchTranslateDir(); handleInput(); });
  $('dirDecode').addEventListener('change', () => { switchTranslateDir(); handleInput(); });
  $('btnPlayMorse').addEventListener('click', () => {
    const morse = isDecodeDir() ? $('inputText').value : $('outputText').value;
    if (morse.trim()) playMorse(morse);
  });
  $('btnStopMorse').addEventListener('click', () => { stopEverything(); renderRibbon([], false); });
  $('btnClearText').addEventListener('click', () => {
    $('inputText').value = ''; $('outputText').value = '';
    stopEverything(); renderRibbon([], false);
  });
  $('btnCopy').addEventListener('click', async () => {
    const txt = $('outputText').value;
    if (!txt) return;
    try { await navigator.clipboard.writeText(txt); $('btnCopy').textContent = '✅ 已複製'; }
    catch (e) { $('outputText').select(); }
    setTimeout(() => { $('btnCopy').textContent = '📋 複製'; }, 1500);
  });

  // 學習
  $('dictSearch').addEventListener('input', renderLearnGrid);
  $('dictGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    document.querySelectorAll('.card.playing').forEach((c) => c.classList.remove('playing'));
    card.classList.add('playing');
    playMorse(S.dict[card.dataset.char]);
    setTimeout(() => card.classList.remove('playing'), 1500);
  });

  // 測驗
  $('modeDecode').addEventListener('change', switchPracticeMode);
  $('modeEncode').addEventListener('change', switchPracticeMode);
  $('quizMode').addEventListener('change', handleQuizModeChange);
  $('kochLevelSlider').addEventListener('input', updateKochLevel);
  $('autoLevelKoch').addEventListener('change', saveSettings);
  $('btnStartQuiz').addEventListener('click', startQuiz);
  $('btnStopQuiz').addEventListener('click', stopQuiz);
  $('btnReplay').addEventListener('click', replayQuiz);
  $('btnShowAnswer').addEventListener('click', showAnswer);
  $('btnCheck').addEventListener('click', checkAnswer);
  $('btnReset').addEventListener('click', resetStats);
  $('btnBackspace').addEventListener('click', () => {
    const g = $('userGuess');
    g.value = g.value.slice(0, -1);
    if (S.vibrate && navigator.vibrate) navigator.vibrate(20);
  });
  document.querySelectorAll('.key[data-morse]').forEach((k) =>
    k.addEventListener('click', () => appendMorse(k.dataset.morse)));

  // 編碼模式只允許 . 和 -，Enter 送出
  $('userGuess').addEventListener('input', () => {
    if (isEncodeMode()) $('userGuess').value = $('userGuess').value.replace(/[^.-]/g, '');
  });
  $('userGuess').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); checkAnswer(); }
  });

  // 發報鍵：滑鼠 / 觸控 / 空白鍵都可以
  const tk = $('telegraphKey');
  tk.addEventListener('pointerdown', (e) => { e.preventDefault(); tk.setPointerCapture(e.pointerId); keyDown(); });
  tk.addEventListener('pointerup', keyUp);
  tk.addEventListener('pointercancel', keyUp);
  tk.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (!$('ManualTab').classList.contains('is-active')) return;
    e.preventDefault(); keyDown();
  });
  document.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    if (!$('ManualTab').classList.contains('is-active')) return;
    e.preventDefault(); keyUp();
  });

  $('btnSpace').addEventListener('click', () => { $('manualOutputText').value += ' '; });
  $('btnManualBack').addEventListener('click', () => {
    const o = $('manualOutputText');
    o.value = o.value.slice(0, -1);
  });
  $('btnClearManual').addEventListener('click', () => {
    $('manualOutputText').value = '';
    signal = '';
    $('currentSignalDisplay').textContent = '—';
    $('currentWpmDisplay').textContent = '-- WPM';
  });

  // 切到背景就停止發聲，避免手機一直嗡嗡叫
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopEverything(); });
}

/* ---------- 13. 啟動 ---------- */
function init() {
  loadSettings();
  bind();
  updateConfigs();          // ← 舊版漏掉這行，Farnsworth 間隔一開始不會生效
  switchDictionary();
  switchTranslateDir();
  handleQuizModeChange();
  switchPracticeMode();
  updateStats();
  renderRibbon([], false);
}

document.addEventListener('DOMContentLoaded', init);
