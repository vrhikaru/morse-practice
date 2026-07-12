// 1. 字典與 Koch 序列
const baseLetters = { 'A':'.-', 'B':'-...', 'C':'-.-.', 'D':'-..', 'E':'.', 'F':'..-.', 'G':'--.', 'H':'....', 'I':'..', 'J':'.---', 'K':'-.-', 'L':'.-..', 'M':'--', 'N':'-.', 'O':'---', 'P':'.--.', 'Q':'--.-', 'R':'.-.', 'S':'...', 'T':'-', 'U':'..-', 'V':'...-', 'W':'.--', 'X':'-..-', 'Y':'-.--', 'Z':'--..' };
const baseNumbers = { '0':'-----', '1':'.----', '2':'..---', '3':'...--', '4':'....-', '5':'.....', '6':'-....', '7':'--...', '8':'---..', '9':'----.' };
const baseSymbols = { '.':'.-.-.-', ',':'--..--', '?':'..--..', "'":'.----.', '!':'-.-.--', '/':'-..-.', '(':'-.--.', ')':'-.--.-', '&':'.-...', ':':'---...', ';':'-.-.-.', '=':'-...-', '+':'.-.-.', '-':'-....-', '_':'..--.-', '"':'.-..-.', '$':'...-..-', '@':'.--.-.' };

const codeTables = { standard: { ...baseLetters, ...baseNumbers }, extended: { ...baseLetters, ...baseNumbers, ...baseSymbols } };
const kochSequence = "KMRSUAPTLOWI.NJEF0Y,VG5/Q9ZH38B?427C1D6X".split('');

let currentDictName = 'standard';
let activeDict = {}; let activeTextDict = {}; 
let keysLetters = []; let keysNumbers = []; let keysSymbols = []; let keysAll = [];

let currentPlaybackId = 0;
let charWpm = 20; let overallWpm = 10; let toneFreq = 600;
let charUnitTime = 1200 / charWpm; let gapUnitTime = 1200 / charWpm; 
let useSound = true; let useLight = true; let useVibrate = false;
let audioCtx; 

window.onload = () => { switchDictionary(); handleQuizModeChange(); switchPracticeMode(); };

function switchDictionary() {
    currentDictName = document.getElementById('dictSelect').value;
    activeDict = codeTables[currentDictName];
    activeTextDict = {};
    for (const [key, value] of Object.entries(activeDict)) { activeTextDict[value] = key; }

    keysLetters = []; keysNumbers = []; keysSymbols = []; keysAll = [];
    for (const key in activeDict) {
        keysAll.push(key);
        if (/[A-Z]/.test(key)) { keysLetters.push(key); }
        else if (/[0-9]/.test(key)) { keysNumbers.push(key); }
        else { keysSymbols.push(key); }
    }
    const optSymbols = document.getElementById('optSymbols');
    if (keysSymbols.length > 0) { optSymbols.style.display = "block"; } 
    else {
        optSymbols.style.display = "none";
        if(document.getElementById('quizMode').value === 'symbols') document.getElementById('quizMode').value = 'all';
    }
    renderLearnGrid();
    document.getElementById('userGuess').value = '';
    document.getElementById('questionDisplay').innerText = '請點擊上方「隨機出題」';
    document.getElementById('answerBox').innerText = '';
    currentQuizChar = ''; currentQuizMorse = '';
    handleInput(); 
}

function renderLearnGrid() {
    const grid = document.getElementById('dictGrid');
    let html = '';
    for (const key of keysAll) {
        html += `<div class="dict-card" onclick="playMorseString('${activeDict[key]}')"><div class="dict-char">${key}</div><div class="dict-morse">${activeDict[key]}</div></div>`;
    }
    grid.innerHTML = html;
}

function updateConfigs() {
    toneFreq = parseInt(document.getElementById('freqSlider').value);
    charWpm = parseInt(document.getElementById('charWpmSlider').value);
    overallWpm = parseInt(document.getElementById('overallWpmSlider').value);
    
    if (overallWpm > charWpm) {
        overallWpm = charWpm;
        document.getElementById('overallWpmSlider').value = charWpm;
    }

    document.getElementById('freqValue').innerText = toneFreq;
    document.getElementById('charWpmValue').innerText = charWpm;
    document.getElementById('overallWpmValue').innerText = overallWpm;

    charUnitTime = 1200 / charWpm;
    if (overallWpm < charWpm) { gapUnitTime = ((50 * 1200 / overallWpm) - (31 * 1200 / charWpm)) / 19; } 
    else { gapUnitTime = charUnitTime; }

    useSound = document.getElementById('cfgSound').checked;
    useLight = document.getElementById('cfgLight').checked;
    useVibrate = document.getElementById('cfgVibrate').checked;

    currentPlaybackId++; stopContinuousTone();
    document.getElementById('lightBox').classList.remove('glow');
    if (navigator.vibrate) navigator.vibrate(0);
}

function openTab(evt, tabName) {
    currentPlaybackId++; stopContinuousTone(); document.getElementById('lightBox').classList.remove('glow'); 
    if (navigator.vibrate) navigator.vibrate(0);
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) { tabContents[i].style.display = "none"; }
    const tabButtons = document.getElementsByClassName("tab-button");
    for (let i = 0; i < tabButtons.length; i++) { tabButtons[i].classList.remove("active"); }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

// 2. 音效引擎
let audioUnlocked = false; 
function initAudioEngine() {
    if (audioUnlocked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    gain.gain.value = 0; osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.001);
    audioUnlocked = true; 
    document.removeEventListener('touchstart', initAudioEngine); document.removeEventListener('pointerdown', initAudioEngine);
}
document.addEventListener('touchstart', initAudioEngine); document.addEventListener('pointerdown', initAudioEngine);

function playSuccessSound() {
    if (!useSound || !audioCtx) return; 
    initAudioEngine(); if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); osc.connect(audioCtx.destination);
    osc.type = 'sine'; osc.frequency.setValueAtTime(880, audioCtx.currentTime); 
    osc.frequency.setValueAtTime(1318, audioCtx.currentTime + 0.1); 
    osc.start(); osc.stop(audioCtx.currentTime + 0.25);
}
function playErrorSound() {
    if (!useSound || !audioCtx) return; 
    initAudioEngine(); if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); osc.connect(audioCtx.destination);
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(250, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(150, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}

let continuousOscillator = null;
function startContinuousTone() {
    if (!useSound) return; 
    initAudioEngine(); if (!audioCtx || audioCtx.state === 'suspended') audioCtx?.resume();
    stopContinuousTone();
    continuousOscillator = audioCtx.createOscillator(); continuousOscillator.type = 'sine'; 
    continuousOscillator.frequency.value = toneFreq; 
    continuousOscillator.connect(audioCtx.destination); continuousOscillator.start();
}
function stopContinuousTone() {
    if (continuousOscillator) { continuousOscillator.stop(); continuousOscillator.disconnect(); continuousOscillator = null; }
}
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function playMorseString(morseStr) {
    currentPlaybackId++; const myPlaybackId = currentPlaybackId;
    const lightBox = document.getElementById('lightBox');
    stopContinuousTone(); lightBox.classList.remove('glow');
    if (navigator.vibrate) navigator.vibrate(0);

    for (let i = 0; i < morseStr.length; i++) {
        if (myPlaybackId !== currentPlaybackId) return;
        const char = morseStr[i];

        if (char === '.' || char === '-') {
            const duration = (char === '.') ? charUnitTime : charUnitTime * 3;
            if (useLight) lightBox.classList.add('glow'); 
            if (useSound) startContinuousTone(); 
            if (useVibrate && navigator.vibrate) navigator.vibrate(duration); 
            
            await sleep(duration); 
            if (myPlaybackId !== currentPlaybackId) { stopContinuousTone(); lightBox.classList.remove('glow'); if (navigator.vibrate) navigator.vibrate(0); return; }
            if (useLight) lightBox.classList.remove('glow'); stopContinuousTone(); 
            
            if (i + 1 < morseStr.length && (morseStr[i+1] === '.' || morseStr[i+1] === '-')) { await sleep(charUnitTime); }
        } else if (char === ' ') { await sleep(3 * gapUnitTime); } 
        else if (char === '/') { await sleep(7 * gapUnitTime); }
    }
}

function handleInput() {
    currentPlaybackId++; stopContinuousTone(); document.getElementById('lightBox').classList.remove('glow');
    if (navigator.vibrate) navigator.vibrate(0);
    const input = document.getElementById('inputText').value.toUpperCase();
    let resultArr = [];
    let words = input.split(/[ \n]+/); 
    for (let word of words) {
        let morseWord = [];
        for (let char of word) { if (activeDict[char]) morseWord.push(activeDict[char]); }
        if (morseWord.length > 0) resultArr.push(morseWord.join(' '));
    }
    document.getElementById('outputText').value = resultArr.join(' / ');
}
async function translateAndPlay() {
    const morseStr = document.getElementById('outputText').value; 
    if (morseStr !== "") { await playMorseString(morseStr.trim()); }
}

// --- 測驗與 Koch 自動晉級邏輯 ---
let currentQuizChar = ''; let currentQuizMorse = '';
let totalAttempts = 0; let correctAnswers = 0; let isQuestionScored = false; 
let currentStreak = 0; // 新增：紀錄連對次數

function switchPracticeMode() {
    const isEncode = document.getElementById('modeEncode').checked; 
    const guessInput = document.getElementById('userGuess');
    
    document.getElementById('morseKeypad').style.display = isEncode ? 'flex' : 'none'; 
    document.getElementById('btnShowAnswer').style.display = isEncode ? 'none' : 'inline-block'; 
    document.getElementById('btnReplay').style.display = isEncode ? 'none' : 'inline-block'; 
    document.getElementById('practiceHint').innerText = isEncode ? "看畫面上的字母，打出對應的摩斯密碼！" : "聆聽密碼聲音，並輸入對應的字母！";
    
    guessInput.value = '';
    guessInput.maxLength = isEncode ? 7 : 1; 
    guessInput.placeholder = isEncode ? ".-" : "?";
    if (isEncode) { guessInput.setAttribute('readonly', true); } else { guessInput.removeAttribute('readonly'); }

    if (document.getElementById('modeKoch').checked) updateKochLevel();
    resetStats();
    document.getElementById('questionDisplay').innerText = '請點擊上方「隨機出題」';
    document.getElementById('answerBox').innerText = '';
}

function handleQuizModeChange() {
    const mode = document.getElementById('quizMode').value;
    const kochPanel = document.getElementById('kochPanel');
    if (mode === 'koch') {
        kochPanel.style.display = "block";
        updateKochLevel();
    } else {
        kochPanel.style.display = "none";
    }
    resetStats();
}

function updateKochLevel() {
    const level = parseInt(document.getElementById('kochLevelSlider').value);
    document.getElementById('kochLevelVal').innerText = level;
    // (已從畫面上移除題庫明細，這裡保留數值更新即可)
}

function playKeypadFeedback(char) {
    const duration = (char === '.') ? charUnitTime : charUnitTime * 3;
    if (useSound && audioCtx) {
        initAudioEngine();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = toneFreq;
        osc.connect(audioCtx.destination); osc.start();
        osc.stop(audioCtx.currentTime + (duration / 1000));
    }
    if (useVibrate && navigator.vibrate) navigator.vibrate(duration);
}

function appendMorse(char) {
    const guessInput = document.getElementById('userGuess');
    if (guessInput.value.length < 7) { 
        guessInput.value += char; 
        playKeypadFeedback(char); 
    }
}
function backspaceMorse() {
    const guessInput = document.getElementById('userGuess');
    guessInput.value = guessInput.value.slice(0, -1);
    if (useVibrate && navigator.vibrate) navigator.vibrate(30);
}

async function generateRandomQuiz() {
    const qDisplay = document.getElementById('questionDisplay');
    const ansBox = document.getElementById('answerBox');
    
    ansBox.innerText = '';
    const guessInput = document.getElementById('userGuess');
    guessInput.value = ''; guessInput.classList.remove('shake-error', 'success-glow');
    isQuestionScored = false; 

    const mode = document.getElementById('quizMode').value;
    let availableKeys = [];

    if (mode === 'koch') {
        const level = parseInt(document.getElementById('kochLevelSlider').value);
        availableKeys = kochSequence.slice(0, level + 1);
    } else {
        if (mode === 'letters') availableKeys = keysLetters;
        else if (mode === 'numbers') availableKeys = keysNumbers;
        else if (mode === 'symbols') availableKeys = keysSymbols;
        else availableKeys = keysAll;
        if (availableKeys.length === 0) availableKeys = keysAll;
    }

    currentQuizChar = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    currentQuizMorse = activeDict[currentQuizChar] || codeTables['extended'][currentQuizChar]; 
    
    const isEncode = document.getElementById('modeEncode').checked;
    
    if (isEncode) {
        // 視覺編碼：把題目大字顯示
        qDisplay.innerText = currentQuizChar;
    } else {
        // 聽讀解碼：顯示耳機圖示並播放聲音
        qDisplay.innerText = "🎧 (請聽聲音)";
        await playMorseString(currentQuizMorse);
        guessInput.focus(); 
    }
}

async function replayQuiz() {
    if (currentQuizMorse !== '') { 
        document.getElementById('questionDisplay').innerText = "🎧 (重播聲音中...)";
        await playMorseString(currentQuizMorse); 
        document.getElementById('questionDisplay').innerText = "🎧 (請聽聲音)";
    }
}

function checkUserAnswer() {
    const guessInput = document.getElementById('userGuess');
    guessInput.classList.remove('shake-error', 'success-glow'); void guessInput.offsetWidth; 

    if (currentQuizChar === '') { document.getElementById('answerBox').innerText = '請先點擊「隨機出題」！'; document.getElementById('answerBox').style.color = "#d32f2f"; return; }
    const userGuess = guessInput.value.toUpperCase();
    if (userGuess === '') { document.getElementById('answerBox').innerText = '你還沒輸入答案喔！'; document.getElementById('answerBox').style.color = "#d32f2f"; return; }

    const isEncode = document.getElementById('modeEncode').checked;
    const isKoch = document.getElementById('quizMode').value === 'koch';
    const isAutoLevel = document.getElementById('autoLevelKoch') ? document.getElementById('autoLevelKoch').checked : false;

    const isCorrect = isEncode ? (userGuess === currentQuizMorse) : (userGuess === currentQuizChar);

    if (!isQuestionScored) {
        totalAttempts++; 
        if (isCorrect) {
            correctAnswers++;
            currentStreak++; // 連對加 1
        } else {
            currentStreak = 0; // 答錯歸零
        }
        isQuestionScored = true; 
        updateStatsDisplay();    
    }

    if (isCorrect) {
        document.getElementById('answerBox').innerText = `🎉 答對了！答案正是 ${currentQuizChar} ( ${currentQuizMorse} )`; 
        document.getElementById('answerBox').style.color = "#2e7d32"; 
        guessInput.classList.add('success-glow'); playSuccessSound(); 

        // 自動晉級判定！
        if (isKoch && isAutoLevel && currentStreak >= 5) {
            let slider = document.getElementById('kochLevelSlider');
            let lvl = parseInt(slider.value);
            if (lvl < 39) {
                slider.value = lvl + 1;
                updateKochLevel();
                currentStreak = 0; // 升級後連對重新計算
                updateStatsDisplay();
                // 延遲一點點顯示升級祝賀，讓原本的成功音效先播
                setTimeout(() => {
                    document.getElementById('questionDisplay').innerText = `🏆 晉升 Koch 等級 ${lvl + 1} 🏆`;
                    document.getElementById('answerBox').innerText = `太神了！連續答對5題，系統已自動為你提高難度！`;
                    document.getElementById('answerBox').style.color = "#d84315";
                }, 800);
            }
        }

    } else {
        document.getElementById('answerBox').innerText = `❌ 哎呀，猜錯了！請重新作答。`; 
        document.getElementById('answerBox').style.color = "#d32f2f"; 
        guessInput.classList.add('shake-error'); playErrorSound(); 
    }
}

function showAnswer() {
    if (currentQuizChar !== '') { document.getElementById('answerBox').innerText = `答案是： ${currentQuizChar} ( ${currentQuizMorse} )`; document.getElementById('answerBox').style.color = "#f57c00"; } 
    else { document.getElementById('answerBox').innerText = '請先點擊「隨機出題」！'; }
}

function updateStatsDisplay() {
    const accuracy = totalAttempts === 0 ? 0 : Math.round((correctAnswers / totalAttempts) * 100);
    document.getElementById('statsBox').innerText = `📊 答對: ${correctAnswers} / 總數: ${totalAttempts} (正確率: ${accuracy}%) | 🔥 連對: ${currentStreak}`;
}

function resetStats() {
    totalAttempts = 0; correctAnswers = 0; currentStreak = 0; updateStatsDisplay(); 
    document.getElementById('answerBox').innerText = ''; 
    document.getElementById('questionDisplay').innerText = '請點擊上方「隨機出題」';
}

// 發報練習區
let pressStartTime = 0; let lastReleaseTime = 0; let letterStartTime = 0; 
let isPressing = false; let currentSignal = ""; let signalTimeout = null; 

function startPress(e) {
    e.preventDefault(); if (isPressing) return;
    isPressing = true; pressStartTime = Date.now(); 
    if (currentSignal === "") letterStartTime = pressStartTime;
    clearTimeout(signalTimeout); currentPlaybackId++; 
    
    if (useSound) startContinuousTone(); 
    if (useLight) document.getElementById('lightBox').classList.add('glow'); 
    if (useVibrate && navigator.vibrate) navigator.vibrate(10000); 
    document.getElementById('telegraphKey').classList.add('pressed');
}

function endPress(e) {
    e.preventDefault(); if (!isPressing) return;
    isPressing = false; lastReleaseTime = Date.now(); 
    
    stopContinuousTone(); document.getElementById('lightBox').classList.remove('glow'); 
    if (navigator.vibrate) navigator.vibrate(0); 
    document.getElementById('telegraphKey').classList.remove('pressed');
    
    const duration = lastReleaseTime - pressStartTime;
    if (duration < charUnitTime * 2) { currentSignal += "."; } else { currentSignal += "-"; }
    document.getElementById('currentSignalDisplay').innerText = currentSignal;
    signalTimeout = setTimeout(() => { processSignal(); }, charUnitTime * 3.5);
}

function processSignal() {
    if (currentSignal === "") return;
    const translatedChar = activeTextDict[currentSignal] || "?";
    let actualWpm = 0;

    if (translatedChar !== "?" && lastReleaseTime > letterStartTime) {
        const letterDuration = lastReleaseTime - letterStartTime;
        let units = 0;
        for (let i = 0; i < currentSignal.length; i++) { units += (currentSignal[i] === '.') ? 1 : 3; }
        units += (currentSignal.length - 1); 

        if (units > 0 && letterDuration > 0) {
            const measuredUnitTime = letterDuration / units; 
            actualWpm = Math.round(1200 / measuredUnitTime);
            if (actualWpm > 99) actualWpm = 99; 
        }
    }
    document.getElementById('manualOutputText').value += translatedChar;
    if (actualWpm > 0) { document.getElementById('currentWpmDisplay').innerText = `發送速率：約 ${actualWpm} WPM`; }
    currentSignal = ""; document.getElementById('currentSignalDisplay').innerText = "...";
}
function addSpace() { document.getElementById('manualOutputText').value += " / "; }
function clearManualOutput() {
    document.getElementById('manualOutputText').value = ""; currentSignal = ""; 
    document.getElementById('currentSignalDisplay').innerText = "...";
    document.getElementById('currentWpmDisplay').innerText = "發送速率：-- WPM";
}