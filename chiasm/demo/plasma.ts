/**
 * Plasma Demo - Classic demoscene plasma effect with audio reactivity
 */

import { PlasmaBackground, BeatDetector } from '../src/Effects';

// Audio setup
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 2048;
const frequencyData = new Float32Array(analyser.frequencyBinCount);

let audioBuffer: AudioBuffer | null = null;
let source: AudioBufferSourceNode | null = null;
let isPlaying = false;

// Canvas setup
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const gl = canvas.getContext('webgl2')!;

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// Effects
const plasma = new PlasmaBackground(gl);
const beatDetector = new BeatDetector();

// Controls
const scaleSlider = document.getElementById('scale') as HTMLInputElement;
const speedSlider = document.getElementById('speed') as HTMLInputElement;
const intensitySlider = document.getElementById('intensity') as HTMLInputElement;
const scaleVal = document.getElementById('scaleVal')!;
const speedVal = document.getElementById('speedVal')!;
const intensityVal = document.getElementById('intensityVal')!;

scaleSlider.addEventListener('input', () => {
    plasma.scale = parseFloat(scaleSlider.value);
    scaleVal.textContent = scaleSlider.value;
});

speedSlider.addEventListener('input', () => {
    plasma.speed = parseFloat(speedSlider.value);
    speedVal.textContent = speedSlider.value;
});

intensitySlider.addEventListener('input', () => {
    plasma.intensity = parseFloat(intensitySlider.value);
    intensityVal.textContent = intensitySlider.value;
});

// Stats
const statsEl = document.getElementById('stats')!;
let lastTime = performance.now();
let frameCount = 0;
let fps = 0;

// Animation loop
function loop() {
    requestAnimationFrame(loop);

    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    // FPS counter
    frameCount++;
    if (frameCount >= 30) {
        fps = Math.round(1000 / (deltaTime * 1000 / frameCount * frameCount));
        frameCount = 0;
    }
    statsEl.textContent = `FPS: ${fps}`;

    // Get audio data
    analyser.getFloatFrequencyData(frequencyData);

    // Normalize frequency data
    const normalizedData = new Float32Array(frequencyData.length);
    for (let i = 0; i < frequencyData.length; i++) {
        normalizedData[i] = Math.max(0, (frequencyData[i] + 100) / 100);
    }

    // Beat detection
    beatDetector.update(normalizedData);

    // Clear
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update and draw plasma with frequency band data
    plasma.update(deltaTime, normalizedData);
    plasma.draw();
}

// Audio loading
async function loadAudio(arrayBuffer: ArrayBuffer) {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    play();
    document.getElementById('overlay')?.classList.add('hidden');
}

function play() {
    if (source) source.stop();
    source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    source.start(0);
    isPlaying = true;
    document.getElementById('playPause')!.textContent = 'Pause';
}

function pause() {
    if (source) {
        source.stop();
        source = null;
    }
    isPlaying = false;
    document.getElementById('playPause')!.textContent = 'Play';
}

function togglePlay() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (isPlaying) pause();
    else if (audioBuffer) play();
}

// UI event handlers
document.getElementById('loadDemo')?.addEventListener('click', async () => {
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(2, sr * 5, sr);
    for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < d.length; i++) {
            d[i] = (Math.random() * 2 - 1) * 0.5;
        }
    }
    audioBuffer = buf;
    play();
    document.getElementById('overlay')?.classList.add('hidden');
});

document.getElementById('loadUser')?.addEventListener('click', () => {
    document.getElementById('fileInput')?.click();
});

document.getElementById('fileInput')?.addEventListener('change', (e: any) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev: any) => loadAudio(ev.target.result);
        reader.readAsArrayBuffer(file);
    }
});

document.getElementById('playPause')?.addEventListener('click', togglePlay);

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        togglePlay();
        e.preventDefault();
    }
});

// Start
loop();
