// --- app.js：程式邏輯 ---

// 1. 字典與系統核心狀態
const baseLetters = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.', 'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.', 'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..'
};
const baseNumbers = {
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.'
};
const baseSymbols = {
    '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--', '/': '-..-.', 
    '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-', 
    '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.', '$': '...-..-', '@': '.--.-.'
};

const codeTables = {
    standard: { ...baseLetters, ...baseNumbers },
    extended: { ...baseLetters, ...baseNumbers, ...baseSymbols }
};

let currentDictName = 'standard';
let activeDict = {};     
let activeTextDict = {}; 
let keysLetters = []; let keysNumbers = []; let keysSymbols = []; let keysAll = [];

let currentPlaybackId = 0;
let wpm = 10;
let unitTime = 1200 / wpm; 
let useSound = true; let useLight = true; let useVibrate = false;

// 2. 初始化與動態更新邏輯
window.onload = () => { switchDictionary(); };

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
    if (keysSymbols.length > 0) {
        optSymbols.style.display = "block";
    } else {
        optSymbols.style.display = "none";
        if(document.getElementById('quizMode').value === 'symbols') {
            document.getElementById('quizMode').value = 'all';
        }
    }

    renderLearnGrid();
    document.getElementById('userGuess').value = '';
    document.getElementById('answerBox').innerText = '密碼表已更新，請重新出題';
    document.getElementById('answerBox').style.color = "#333";
    currentQuizChar = ''; currentQuizMorse = '';
    handleInput(); 
}

function renderLearnGrid() {
    const grid = document.getElementById('dictGrid');
    let html = '';
    for (const key of keysAll) {
        html += `<div class="dict-card" onclick="playMorseString('${activeDict[key]}')">
                    <div class="dict-char">${key}</div>
                    <div class="dict-morse">${activeDict[key]}</div>
                 </div>`;
    }
    grid.innerHTML = html;
}

function updateConfigs() {
    wpm = document.getElementById('wpmSlider').value;
    unitTime = 1200 / wpm;
    document.getElementById('wpmValue').innerText = wpm;
    
    useSound = document.getElementById('cfgSound').checked;
    useLight = document.getElementById('cfgLight').checked;
    useVibrate = document.getElementById('cfgVibrate').checked;

    currentPlaybackId++; 
    stopContinuousTone();
    document.getElementById('lightBox').classList.remove('glow');
    if (navigator.vibrate) navigator.vibrate(0);
}

function openTab(evt, tabName) {
    currentPlaybackId++; 
    stopContinuousTone(); 
    document.getElementById('lightBox').classList.remove('glow'); 
    if (navigator.vibrate) navigator.vibrate(0);

    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) { tabContents[i].style.display = "none"; }
    const tabButtons = document.getElementsByClassName("tab-button");
    for (let i = 0; i < tabButtons.length; i++) { tabButtons[i].classList.remove("active"); }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active");
}

// 3. 音效引擎與多感官播放
let audioUnlocked = false; 

function initAudioEngine() {
    if (audioUnlocked) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0; 
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.001);
    audioUnlocked = true; 
    document.removeEventListener('touchstart', initAudioEngine);
    document.removeEventListener('pointerdown', initAudioEngine);
}
document.addEventListener('touchstart', initAudioEngine);
document.addEventListener('pointerdown', initAudioEngine);

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
    continuousOscillator.frequency.value = 600; continuousOscillator.connect(audioCtx.destination); 
    continuousOscillator.start();
}

function stopContinuousTone() {
    if (continuousOscillator) {
        continuousOscillator.stop(); continuousOscillator.disconnect(); continuousOscillator = null;
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function playMorseString(morseStr) {
    currentPlaybackId++;
    const myPlaybackId = currentPlaybackId;
    const lightBox = document.getElementById('lightBox');
    
    stopContinuousTone();
    lightBox.classList.remove('glow');
    if (navigator.vibrate) navigator.vibrate(0);

    for (let i = 0; i < morseStr.length; i++) {
        if (myPlaybackId !== currentPlaybackId) return;

        const char = morseStr[i];
        if (char === '.' || char === '-') {
            const duration = (char === '.') ? unitTime : unitTime * 3;
            
            if (useLight) lightBox.classList.add('glow'); 
            if (useSound) startContinuousTone(); 
            if (useVibrate && navigator.vibrate) navigator.vibrate(duration); 
            
            await sleep(duration); 
            
            if (myPlaybackId !== currentPlaybackId) {
                stopContinuousTone(); lightBox.classList.remove('glow'); 
                if (navigator.vibrate) navigator.vibrate(0);
                return;
            }

            if (useLight) lightBox.classList.remove('glow'); 
            stopContinuousTone(); 

            await sleep(unitTime);
        } else if (char === ' ') { 
            await sleep(unitTime * 3); 
        }
    }
}

// 4. 各分頁邏輯功能
function handleInput() {
    currentPlaybackId++; stopContinuousTone(); document.getElementById('lightBox').classList.remove('glow');
    if (navigator.vibrate) navigator.vibrate(0);
    
    const input = document.getElementById('inputText').value.toUpperCase();
    let result = '';
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (activeDict[char]) { result += activeDict[char] + ' '; } 
        else if (char === ' ' || char === '\n') { result += char; }
    }
    document.getElementById('outputText').value = result.trim();
}

async function translateAndPlay() {
    const morseStr = document.getElementById('outputText').value.replace(/\n/g, ' '); 
    if (morseStr !== "") { await playMorseString(morseStr.trim()); }
}

let currentQuizChar = ''; let currentQuizMorse = '';
async function generateRandomQuiz() {
    document.getElementById('answerBox').innerText = '訊號發送中...';
    document.getElementById('answerBox').style.color = "#333";
    const guessInput = document.getElementById('userGuess');
    guessInput.value = ''; guessInput.classList.remove('shake-error', 'success-glow');
    
    const mode = document.getElementById('quizMode').value;
    let availableKeys = [];
    if (mode === 'letters') availableKeys = keysLetters;
    else if (mode === 'numbers') availableKeys = keysNumbers;
    else if (mode === 'symbols') availableKeys = keysSymbols;
    else availableKeys = keysAll;

    if (availableKeys.length === 0) availableKeys = keysAll;

    currentQuizChar = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    currentQuizMorse = activeDict[currentQuizChar];
    
    await playMorseString(currentQuizMorse);
    if (currentQuizMorse !== '') {
        document.getElementById('answerBox').innerText = '發送完畢，請輸入答案並檢查！';
        guessInput.focus();
    }
}

async function replayQuiz() {
    if (currentQuizMorse !== '') { 
        document.getElementById('answerBox').innerText = '重播信號中...';
        await playMorseString(currentQuizMorse); 
        document.getElementById('answerBox').innerText = '發送完畢，請輸入答案並檢查！';
    }
}

function checkUserAnswer() {
    const guessInput = document.getElementById('userGuess');
    guessInput.classList.remove('shake-error', 'success-glow');
    void guessInput.offsetWidth; 

    if (currentQuizChar === '') {
        document.getElementById('answerBox').innerText = '請先點擊「隨機出題」！'; document.getElementById('answerBox').style.color = "#d32f2f"; return;
    }
    const userGuess = guessInput.value.toUpperCase();
    if (userGuess === '') {
        document.getElementById('answerBox').innerText = '你還沒輸入答案喔！'; document.getElementById('answerBox').style.color = "#d32f2f"; return;
    }
    if (userGuess === currentQuizChar) {
        document.getElementById('answerBox').innerText = `🎉 答對了！答案正是 ${currentQuizChar} ( ${currentQuizMorse} )`; document.getElementById('answerBox').style.color = "#2e7d32"; 
        guessInput.classList.add('success-glow'); playSuccessSound(); 
    } else {
        document.getElementById('answerBox').innerText = `❌ 哎呀，猜錯了！請重新作答。`; document.getElementById('answerBox').style.color = "#d32f2f"; 
        guessInput.classList.add('shake-error'); playErrorSound(); 
    }
}

function showAnswer() {
    if (currentQuizChar !== '') {
        document.getElementById('answerBox').innerText = `答案是： ${currentQuizChar} ( ${currentQuizMorse} )`; document.getElementById('answerBox').style.color = "#f57c00"; 
    } else { document.getElementById('answerBox').innerText = '請先點擊「隨機出題」！'; }
}

let pressStartTime = 0; let lastReleaseTime = 0; let letterStartTime = 0; 
let isPressing = false; let currentSignal = ""; let signalTimeout = null; 

function startPress(e) {
    e.preventDefault(); if (isPressing) return;
    isPressing = true; pressStartTime = Date.now(); 
    if (currentSignal === "") letterStartTime = pressStartTime;
    
    clearTimeout(signalTimeout);
    currentPlaybackId++; 
    
    if (useSound) startContinuousTone(); 
    if (useLight) document.getElementById('lightBox').classList.add('glow'); 
    if (useVibrate && navigator.vibrate) navigator.vibrate(10000); 
    
    document.getElementById('telegraphKey').classList.add('pressed');
}

function endPress(e) {
    e.preventDefault(); if (!isPressing) return;
    isPressing = false; lastReleaseTime = Date.now(); 
    
    stopContinuousTone(); 
    document.getElementById('lightBox').classList.remove('glow'); 
    if (navigator.vibrate) navigator.vibrate(0); 
    
    document.getElementById('telegraphKey').classList.remove('pressed');
    
    const duration = lastReleaseTime - pressStartTime;
    if (duration < unitTime * 2) { currentSignal += "."; } else { currentSignal += "-"; }
    document.getElementById('currentSignalDisplay').innerText = currentSignal;
    
    signalTimeout = setTimeout(() => { processSignal(); }, unitTime * 3.5);
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
function addSpace() { document.getElementById('manualOutputText').value += " "; }
function clearManualOutput() {
    document.getElementById('manualOutputText').value = ""; currentSignal = ""; 
    document.getElementById('currentSignalDisplay').innerText = "...";
    document.getElementById('currentWpmDisplay').innerText = "發送速率：-- WPM";
}