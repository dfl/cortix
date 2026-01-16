import { Viz3D } from '../src/Viz3D';
import { Viz2D } from '../src/Viz2D';
import { VizWaveform } from '../src/VizWaveform';
import { Goniometer, CorrelationMeter } from '../src/Meters';
import { ChannelMode } from '../src/types';

// Audio Context
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
let source: AudioBufferSourceNode | null = null;
let analyser: AnalyserNode = audioCtx.createAnalyser();
analyser.fftSize = 2048; // For visualization
// We need stereo data.
// Standard AnalyserNode mixes to mono for FFT? 
// Actually standard Web Audio Analyser is usually mono or splits channels.
// We need a Splitter to get L and R if we want stereo viz.
const splitter = audioCtx.createChannelSplitter(2);
const analyserL = audioCtx.createAnalyser();
const analyserR = audioCtx.createAnalyser();
analyserL.fftSize = 2048; // 1024 bins (Matches Viz2D texture width)
analyserR.fftSize = 2048;

let audioBuffer: AudioBuffer | null = null;
let isPlaying = false;
let startTime = 0;
let pauseOffset = 0;

// Visualizers
const canvas = document.getElementById('mainCanvas') as HTMLCanvasElement;
// Resize canvas
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Instances
let viz3d: Viz3D | null = null;
let viz2d: Viz2D | null = null;
let vizWave: VizWaveform | null = null;

// Meters
const meterCorrCanvas = document.getElementById('meter-corr') as HTMLCanvasElement;
const meterGonioCanvas = document.getElementById('meter-gonio') as HTMLCanvasElement;
const corrMeter = new CorrelationMeter(meterCorrCanvas, { decayTime: 0.1, colors: { active: '#00ff00', hold: '#ff0000', grid: '#444', background: '#111' } });
const gonioMeter = new Goniometer(meterGonioCanvas, { decayTime: 0.1, colors: { active: '#00ffaa', hold: '#fff', grid: '#333', background: '#000' } });

// State
let currentMode = 'viz3d_cubes';

// Buffers
const dataL = new Float32Array(analyserL.frequencyBinCount);
const dataR = new Float32Array(analyserR.frequencyBinCount);
const timeL = new Float32Array(analyserL.fftSize);
const timeR = new Float32Array(analyserR.fftSize);

function initViz() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    // Cleanup if needed (WebGL context loss handling omitted)
    
    viz3d = new Viz3D(canvas, {
        xAmount: 128,
        zAmount: 64,
        baseHeight: 0.05,
        heightScale: 1.5,
        spacing: 0.1,
        colors: {
            background: [0.02, 0.02, 0.04],
            // Darker, more saturated palette
            palette: [
                [0.55, 0.25, 0.50],  // Dark magenta
                [0.25, 0.35, 0.60],  // Dark blue
                [0.20, 0.50, 0.30],  // Dark green
                [0.70, 0.50, 0.15],  // Dark orange
                [0.60, 0.20, 0.20]   // Dark red
            ]
        },
        camera: { angle: 55, yaw: 0, zoom: -2.5, yDisplacement: -0.3 },
        visualMode: 'Cubes'
    });
    
    viz2d = new Viz2D(canvas, {
        colorRamp: [],
        scrollSpeed: 2,
        view: { minFrequency: 20, maxFrequency: 20000, minDb: -100, maxDb: 0 },
        channelMode: ChannelMode.Left
    });

    vizWave = new VizWaveform(canvas, {
        color: [0, 1, 1],
        lineWidth: 2.0,
        channelMode: ChannelMode.StereoOverlay,
        sampleCount: 2048
    });
}

let lastFrameTime = performance.now();

function loop() {
    requestAnimationFrame(loop);

    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Auto-rotate when not dragging (only in 3D mode)
    if (autoRotate && !isDragging && currentMode.startsWith('viz3d') && viz3d) {
        camYaw += autoRotateSpeed * deltaTime;
        viz3d.setConfig({
            camera: {
                angle: camAngle,
                yaw: camYaw,
                zoom: camZoom,
                yDisplacement: -0.3
            }
        });
    }

    if (!isPlaying) return;
    
    // Get Data
    if (analyserL && analyserR) {
        analyserL.getFloatFrequencyData(dataL);
        analyserR.getFloatFrequencyData(dataR);
        
        analyserL.getFloatTimeDomainData(timeL);
        analyserR.getFloatTimeDomainData(timeR);
        
        // Normalize Frequency Data (dB to 0-1)
        // Web Audio returns dB typically -100 to 0.
        // We map to 0-1.
        for(let i=0; i<dataL.length; i++) {
            let vL = (dataL[i] + 100) / 100;
            let vR = (dataR[i] + 100) / 100;
            if (!isFinite(vL) || vL < 0) vL = 0;
            if (!isFinite(vR) || vR < 0) vR = 0;
            dataL[i] = vL;
            dataR[i] = vR;
        }
    }
    
    // Render Meters Always
    corrMeter.draw(timeL, timeR);
    gonioMeter.draw(timeL, timeR);

    // Main Viz
    if (currentMode.startsWith('viz3d')) {
        // Mode switch check
        const targetMode = currentMode === 'viz3d_cubes' ? 'Cubes' : 'Lines';
        viz3d?.setConfig({ visualMode: targetMode as any });
        
        // Slight camera anim
        // const t = performance.now() * 0.001;
        // viz3d?.setConfig({ camera: { angle: 45 + Math.sin(t*0.5)*5 } });
        
        viz3d?.update(dataL, dataR);
        viz3d?.draw();
    } else if (currentMode === 'viz2d') {
        viz2d?.update(dataL, dataR);
        viz2d?.draw();
    } else if (currentMode === 'waveform') {
        vizWave?.update(timeL, timeR);
        vizWave?.draw();
    }
    
    // Verify Data
    if (Math.random() < 0.01) { // Log occasionally
        let maxL = -999;
        for(let i=0; i<dataL.length; i++) if (dataL[i] > maxL) maxL = dataL[i];
        console.log("Audio Data Max L:", maxL, "Viz Mode:", currentMode);
        
        if (currentMode.startsWith('viz3d') && viz3d) {
             // console.log("Viz3D Config:", viz3d.getConfig()); 
        }
    }

    // Update Time Display
    if (audioCtx.state === 'running') {
        const time = audioCtx.currentTime;
        document.getElementById('timeDisplay')!.innerText = time.toFixed(2);
    }
}

// UI Interaction
document.getElementById('vizSelector')?.addEventListener('change', (e) => {
    currentMode = (e.target as HTMLSelectElement).value;
    // Reset canvas or clear?
    // Viz classes handle their own clear.
});

// Audio Loading
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
    
    // Routing
    source.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    splitter.connect(audioCtx.destination, 0); // L -> Out L
    splitter.connect(audioCtx.destination, 1); // R -> Out R 
    // Wait, splitter outputs mono channels. destination expects stereo.
    // We should connect source to destination directly for hearing it, 
    // AND to splitters for analysis.
    source.connect(audioCtx.destination);
    
    source.start(0, pauseOffset);
    startTime = audioCtx.currentTime - pauseOffset;
    isPlaying = true;
    updatePlayButton();
}

function pause() {
    if (source) {
        source.stop();
        // Calculate offset
        pauseOffset += audioCtx.currentTime - startTime;
        source = null;
    }
    isPlaying = false;
    audioCtx.suspend();
    updatePlayButton();
}

function togglePlay() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    if (isPlaying) pause();
    else play();
}

function updatePlayButton() {
    const btn = document.getElementById('playPause');
    if (btn) btn.innerText = isPlaying ? '⏸' : '▶';
}

// Inputs
document.getElementById('loadDemo')?.addEventListener('click', async () => {
    // Generate noise or load file?
    // Let's generate white noise buffer
    const sr = audioCtx.sampleRate;
    const buf = audioCtx.createBuffer(2, sr * 5, sr); // 5 sec
    for (let c=0; c<2; c++) {
        const d = buf.getChannelData(c);
        for(let i=0; i<d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
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

// Spacebar
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        togglePlay();
        e.preventDefault();
    }
});

document.getElementById('playPause')?.addEventListener('click', togglePlay);

// Mouse Interaction
let isDragging = false;
let lastX = 0;
let lastY = 0;
let camAngle = 55;   // Pitch (X rotation)
let camYaw = 0;      // Yaw (Y rotation)
let camZoom = -2.5;
let autoRotate = true;
const autoRotateSpeed = 8; // degrees per second

let resumeAutoRotateTimeout: number | null = null;

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    // Stop auto-rotate while dragging
    if (resumeAutoRotateTimeout) clearTimeout(resumeAutoRotateTimeout);
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    // Resume auto-rotate after 3 seconds of no interaction
    if (resumeAutoRotateTimeout) clearTimeout(resumeAutoRotateTimeout);
    resumeAutoRotateTimeout = window.setTimeout(() => {
        autoRotate = true;
    }, 3000);
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging || !viz3d) return;

    // Stop auto-rotate when user interacts
    autoRotate = false;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    // Horizontal drag = yaw (rotate around scene)
    camYaw += dx * 0.5;

    // Vertical drag = pitch (look up/down)
    camAngle += dy * 0.3;
    camAngle = Math.max(10, Math.min(85, camAngle)); // Clamp pitch

    viz3d.setConfig({
        camera: {
            angle: camAngle,
            yaw: camYaw,
            zoom: camZoom,
            yDisplacement: -0.3
        }
    });

    lastX = e.clientX;
    lastY = e.clientY;
});

// Mouse wheel for zoom
canvas.addEventListener('wheel', (e) => {
    if (!viz3d) return;
    e.preventDefault();

    camZoom += e.deltaY * 0.005;
    camZoom = Math.max(-5, Math.min(-1, camZoom)); // Clamp zoom

    viz3d.setConfig({
        camera: {
            angle: camAngle,
            yaw: camYaw,
            zoom: camZoom,
            yDisplacement: -0.3
        }
    });
}, { passive: false });

// Init
initViz();
loop();
