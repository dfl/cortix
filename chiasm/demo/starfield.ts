/**
 * Starfield & Tunnel Demo - Classic demoscene warp effects with audio reactivity
 */

import { Starfield, Tunnel, BeatDetector } from '../src/Effects';

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
let starfield = new Starfield(gl, 1000);
const tunnel = new Tunnel(gl);
const beatDetector = new BeatDetector();

let currentEffect: 'starfield' | 'tunnel' = 'starfield';

// Controls
const effectSelector = document.getElementById('effectType') as HTMLSelectElement;
const speedSlider = document.getElementById('speed') as HTMLInputElement;
const starCountSlider = document.getElementById('starCount') as HTMLInputElement;
const twistSlider = document.getElementById('twist') as HTMLInputElement;
const speedVal = document.getElementById('speedVal')!;
const starCountVal = document.getElementById('starCountVal')!;
const twistVal = document.getElementById('twistVal')!;

effectSelector.addEventListener('change', () => {
    currentEffect = effectSelector.value as 'starfield' | 'tunnel';
});

speedSlider.addEventListener('input', () => {
    const val = parseFloat(speedSlider.value);
    starfield.speed = val;
    tunnel.speed = val;
    speedVal.textContent = speedSlider.value;
});

starCountSlider.addEventListener('input', () => {
    const count = parseInt(starCountSlider.value);
    starfield = new Starfield(gl, count);
    starfield.speed = parseFloat(speedSlider.value);
    starCountVal.textContent = starCountSlider.value;
});

twistSlider.addEventListener('input', () => {
    tunnel.twist = parseFloat(twistSlider.value);
    twistVal.textContent = twistSlider.value;
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
    statsEl.textContent = `FPS: ${fps} | ${currentEffect === 'starfield' ? starfield.starCount + ' stars' : 'tunnel'}`;

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

    const aspect = canvas.width / canvas.height;

    if (currentEffect === 'starfield') {
        // Starfield with Gammatone-style band reactivity
        starfield.update(deltaTime, normalizedData);
        starfield.draw(aspect);
    } else {
        // Tunnel with Gammatone-style band reactivity
        tunnel.update(deltaTime, normalizedData);
        tunnel.draw(aspect);
    }
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
