import { mat4 } from 'gl-matrix';
import { Viz3D } from '../src/Viz3D';
import { Viz2D } from '../src/Viz2D';
import { VizWaveform } from '../src/VizWaveform';
import { Goniometer, CorrelationMeter } from '../src/Meters';
import { ChannelMode } from '../src/types';
import { GammatoneAnalyser, createGammatoneAnalyser, Scale } from './cortix-wasm';
import {
    BloomEffect,
    BeatDetector,
    CameraShake,
    ColorCycler,
    ParticleSystem,
    ReflectiveFloor,
    PerformanceMonitor,
    EffectsConfig,
    defaultEffectsConfig,
    // Tier 2 effects
    PlasmaBackground,
    Starfield,
    Tunnel,
    CopperBars,
    LensDistortion
} from '../src/Effects';

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
// Resize canvas - account for devicePixelRatio for sharp rendering
function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
}
window.addEventListener('resize', () => {
    resize();
    // Update bloom effect if it exists (checked at runtime)
    if (typeof bloomEffect !== 'undefined' && bloomEffect) {
        bloomEffect.resize(canvas.width, canvas.height);
    }
});
resize();

// Instances
let viz3d: Viz3D | null = null;
let viz2d: Viz2D | null = null;
let vizWave: VizWaveform | null = null;

// Effects
let bloomEffect: BloomEffect | null = null;
let beatDetector: BeatDetector | null = null;
let cameraShake: CameraShake | null = null;
let colorCycler: ColorCycler | null = null;
let particleSystem: ParticleSystem | null = null;
let reflectiveFloor: ReflectiveFloor | null = null;
let perfMonitor: PerformanceMonitor | null = null;

// Tier 2 Effects
let plasma: PlasmaBackground | null = null;
let starfield: Starfield | null = null;
let tunnel: Tunnel | null = null;
let copperBars: CopperBars | null = null;
let lensDistortion: LensDistortion | null = null;

// Stats canvas
const statsCanvas = document.getElementById('statsCanvas') as HTMLCanvasElement;
const statsCtx = statsCanvas.getContext('2d')!;

// Effects config
const effectsConfig: EffectsConfig = { ...defaultEffectsConfig };

// Meters
const meterCorrCanvas = document.getElementById('meter-corr') as HTMLCanvasElement;
const meterGonioCanvas = document.getElementById('meter-gonio') as HTMLCanvasElement;
const corrMeter = new CorrelationMeter(meterCorrCanvas, { decayTime: 0.1, colors: { active: '#00ff00', hold: '#ff0000', grid: '#444', background: '#111' } });
const gonioMeter = new Goniometer(meterGonioCanvas, { decayTime: 0.1, colors: { active: '#00ffaa', hold: '#fff', grid: '#333', background: '#000' } });

// State
let currentMode = 'viz3d_cubes';
let currentAnalysis = 'fft';

// Gammatone analyser (loaded on demand)
let gammatoneAnalyser: GammatoneAnalyser | null = null;
let gammatoneLoading = false;
const GAMMATONE_BANDS = 128; // Match viz3d xAmount

// Buffers
const dataL = new Float32Array(analyserL.frequencyBinCount);
const dataR = new Float32Array(analyserR.frequencyBinCount);
const timeL = new Float32Array(analyserL.fftSize);
const timeR = new Float32Array(analyserR.fftSize);

// Gammatone output buffers (resized based on band count)
let gammatoneDataL = new Float32Array(GAMMATONE_BANDS);
let gammatoneDataR = new Float32Array(GAMMATONE_BANDS);

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

    // Initialize effects
    const gl = canvas.getContext('webgl2')!;

    bloomEffect = new BloomEffect(gl, canvas.width, canvas.height);
    beatDetector = new BeatDetector();
    cameraShake = new CameraShake();
    colorCycler = new ColorCycler();
    particleSystem = new ParticleSystem(gl, 3000);
    reflectiveFloor = new ReflectiveFloor(gl);
    perfMonitor = new PerformanceMonitor(gl);

    // Tier 2 Effects
    plasma = new PlasmaBackground(gl);
    starfield = new Starfield(gl, 1500);
    tunnel = new Tunnel(gl);
    copperBars = new CopperBars(gl);
    lensDistortion = new LensDistortion(gl);

    // Wire up effect checkboxes
    document.getElementById('fx-bloom')?.addEventListener('change', (e) => {
        effectsConfig.bloom = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('fx-reflect')?.addEventListener('change', (e) => {
        effectsConfig.reflection = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('fx-shake')?.addEventListener('change', (e) => {
        effectsConfig.cameraShake = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('fx-colors')?.addEventListener('change', (e) => {
        effectsConfig.colorCycling = (e.target as HTMLInputElement).checked;
    });
    document.getElementById('fx-particles')?.addEventListener('change', (e) => {
        effectsConfig.particles = (e.target as HTMLInputElement).checked;
    });
}

let lastFrameTime = performance.now();

function loop() {
    requestAnimationFrame(loop);

    // Performance monitoring
    perfMonitor?.endFrame();
    perfMonitor?.beginFrame();

    const now = performance.now();
    const deltaTime = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Get time-domain data (always needed for meters and gammatone)
    analyserL.getFloatTimeDomainData(timeL);
    analyserR.getFloatTimeDomainData(timeR);

    // Choose analysis method
    let vizDataL: Float32Array;
    let vizDataR: Float32Array;

    if (currentAnalysis === 'fft') {
        // Standard FFT analysis
        analyserL.getFloatFrequencyData(dataL);
        analyserR.getFloatFrequencyData(dataR);

        // Normalize Frequency Data (dB to 0-1)
        for (let i = 0; i < dataL.length; i++) {
            let vL = (dataL[i] + 100) / 100;
            let vR = (dataR[i] + 100) / 100;
            if (!isFinite(vL) || vL < 0) vL = 0;
            if (!isFinite(vR) || vR < 0) vR = 0;
            dataL[i] = vL;
            dataR[i] = vR;
        }
        vizDataL = dataL;
        vizDataR = dataR;
    } else if (gammatoneAnalyser) {
        // Gammatone filterbank analysis
        const monoBuffer = new Float32Array(timeL.length);
        for (let i = 0; i < timeL.length; i++) {
            monoBuffer[i] = (timeL[i] + timeR[i]) * 0.5;
        }

        gammatoneAnalyser.process(monoBuffer);
        const envelope = gammatoneAnalyser.getEnvelope();

        for (let i = 0; i < envelope.length && i < gammatoneDataL.length; i++) {
            const v = Math.min(envelope[i] * 3.0, 1.0);
            gammatoneDataL[i] = v;
            gammatoneDataR[i] = v;
        }
        vizDataL = gammatoneDataL;
        vizDataR = gammatoneDataR;
    } else {
        // Fallback to FFT
        analyserL.getFloatFrequencyData(dataL);
        analyserR.getFloatFrequencyData(dataR);
        for (let i = 0; i < dataL.length; i++) {
            let vL = (dataL[i] + 100) / 100;
            let vR = (dataR[i] + 100) / 100;
            if (!isFinite(vL) || vL < 0) vL = 0;
            if (!isFinite(vR) || vR < 0) vR = 0;
            dataL[i] = vL;
            dataR[i] = vR;
        }
        vizDataL = dataL;
        vizDataR = dataR;
    }

    // === EFFECTS PROCESSING ===

    // Beat detection
    if (beatDetector && effectsConfig.beatDetection) {
        beatDetector.update(vizDataL);

        if (beatDetector.beatDetected) {
            // Camera shake on beat
            if (effectsConfig.cameraShake && cameraShake) {
                cameraShake.trigger(beatDetector.beatIntensity);
            }

            // Floor ripple on beat
            if (effectsConfig.reflection && reflectiveFloor) {
                reflectiveFloor.triggerRipple(
                    (Math.random() - 0.5) * 0.5,
                    (Math.random() - 0.5) * 0.5,
                    beatDetector.beatIntensity
                );
            }
        }
    }

    // Color cycling
    let currentPalette: [number, number, number][] | null = null;
    if (colorCycler && effectsConfig.colorCycling && isPlaying) {
        const energy = beatDetector?.smoothedEnergy || 0;
        colorCycler.update(energy);
        currentPalette = colorCycler.getPalette(5, 0.8, 0.55);

        // Update viz3d palette if color cycling is active
        if (viz3d && currentMode.startsWith('viz3d')) {
            viz3d.setConfig({
                colors: {
                    background: [0.02, 0.02, 0.04],
                    palette: currentPalette
                }
            });
        }
    }

    // Camera shake offset
    let shakeOffset = { offsetX: 0, offsetY: 0, offsetZ: 0, zoomPulse: 0 };
    if (cameraShake && effectsConfig.cameraShake) {
        shakeOffset = cameraShake.update();
    }

    // Auto-rotate when not dragging (only in 3D mode)
    if (autoRotate && !isDragging && currentMode.startsWith('viz3d') && viz3d) {
        camYaw += autoRotateSpeed * deltaTime;
    }

    // Apply camera with shake
    if (viz3d && currentMode.startsWith('viz3d')) {
        viz3d.setConfig({
            camera: {
                angle: camAngle + shakeOffset.offsetY * 100,
                yaw: camYaw + shakeOffset.offsetX * 100,
                zoom: camZoom + shakeOffset.zoomPulse,
                yDisplacement: -0.3 + shakeOffset.offsetZ
            }
        });
    }

    // Render Meters Always
    corrMeter.draw(timeL, timeR);
    gonioMeter.draw(timeL, timeR);

    // === MAIN RENDERING ===

    // Check if this is a bloomable mode (3D or Tier 2 demoscene effects)
    const bloomableModes = ['viz3d', 'plasma', 'starfield', 'tunnel', 'copper'];
    const isBloomable = bloomableModes.some(m => currentMode.startsWith(m));

    // Begin bloom pass if enabled
    if (effectsConfig.bloom && bloomEffect && isBloomable) {
        bloomEffect.beginScene();
    }

    // Main Viz
    if (currentMode.startsWith('viz3d')) {
        let targetMode: 'Cubes' | 'Lines' | 'FilledRidge' = 'Cubes';
        if (currentMode === 'viz3d_lines') targetMode = 'Lines';
        else if (currentMode === 'viz3d_filled') targetMode = 'FilledRidge';
        viz3d?.setConfig({ visualMode: targetMode });

        viz3d?.update(vizDataL, vizDataR);
        viz3d?.draw();

        // Particles
        if (effectsConfig.particles && particleSystem && isPlaying) {
            const palette = currentPalette || [
                [1.0, 0.3, 0.5],
                [0.3, 0.5, 1.0],
                [0.3, 1.0, 0.5],
                [1.0, 0.8, 0.3],
                [1.0, 0.3, 0.3]
            ];

            // Emit particles from peaks (high threshold = only loud peaks)
            particleSystem.emit(vizDataL, palette, 0.7);

            // Burst on beat - spray of tiny sparkles
            if (beatDetector?.beatDetected) {
                const burstColor = palette[Math.floor(Math.random() * palette.length)];
                particleSystem.burst(0, 0.2, 0, 25, burstColor);
            }

            particleSystem.update(deltaTime);

            // Compute view/projection matrices for particles
            const vp = mat4.create();
            const model = mat4.create();
            const view = mat4.create();
            const proj = mat4.create();

            const aspect = canvas.width / canvas.height;
            mat4.perspective(proj, 45 * Math.PI / 180, aspect, 0.1, 100);
            mat4.translate(view, view, [0, -0.3, camZoom + shakeOffset.zoomPulse]);
            mat4.rotateX(view, view, (camAngle + shakeOffset.offsetY * 100) * Math.PI / 180);
            mat4.multiply(vp, proj, view);
            mat4.rotateY(model, model, (camYaw + shakeOffset.offsetX * 100) * Math.PI / 180);

            particleSystem.draw(vp, model);
        }

        // End bloom pass
        if (effectsConfig.bloom && bloomEffect) {
            bloomEffect.endScene();
        }

        // Draw reflective floor after bloom composite (to screen)
        // Reflection only works with bloom enabled (needs scene texture)
        const sceneTexture = bloomEffect?.getSceneTexture();
        if (effectsConfig.reflection && effectsConfig.bloom && reflectiveFloor && sceneTexture) {
            const floorVP = mat4.create();
            const floorModel = mat4.create();
            const floorView = mat4.create();
            const floorProj = mat4.create();

            const aspect = canvas.width / canvas.height;
            mat4.perspective(floorProj, 45 * Math.PI / 180, aspect, 0.1, 100);
            mat4.translate(floorView, floorView, [0, -0.3, camZoom + shakeOffset.zoomPulse]);
            mat4.rotateX(floorView, floorView, (camAngle + shakeOffset.offsetY * 100) * Math.PI / 180);
            mat4.multiply(floorVP, floorProj, floorView);
            mat4.rotateY(floorModel, floorModel, (camYaw + shakeOffset.offsetX * 100) * Math.PI / 180);

            // Position floor below the visualization
            mat4.translate(floorModel, floorModel, [0, -0.08, 0]);
            mat4.scale(floorModel, floorModel, [3.0, 1, 2.0]); // Wider floor

            const elapsedTime = performance.now() / 1000;
            reflectiveFloor.draw(floorVP, floorModel, sceneTexture, elapsedTime, deltaTime);
        }
    } else if (currentMode === 'viz2d') {
        viz2d?.update(vizDataL, vizDataR);
        viz2d?.draw();
    } else if (currentMode === 'waveform') {
        vizWave?.update(timeL, timeR);
        vizWave?.draw();
    } else if (currentMode === 'plasma') {
        // Plasma background - Gammatone ERB reactive
        // Pass the frequency band data (works with both FFT and Gammatone)
        plasma?.update(deltaTime, vizDataL);
        plasma?.draw();
    } else if (currentMode === 'starfield') {
        // Starfield - Gammatone ERB reactive
        const aspect = canvas.width / canvas.height;
        starfield?.update(deltaTime, vizDataL);
        starfield?.draw(aspect);
    } else if (currentMode === 'tunnel') {
        // Tunnel - Gammatone ERB reactive
        const aspect = canvas.width / canvas.height;
        tunnel?.update(deltaTime, vizDataL);
        tunnel?.draw(aspect);
    } else if (currentMode === 'copper') {
        // Copper bars - Gammatone ERB reactive
        copperBars?.update(deltaTime, vizDataL);
        copperBars?.draw();
    }

    // End bloom pass for Tier 2 effects and composite
    if (effectsConfig.bloom && bloomEffect && isBloomable && !currentMode.startsWith('viz3d')) {
        bloomEffect.endScene();
    }

    // Particles overlay for Tier 2 effects
    if (effectsConfig.particles && particleSystem && isPlaying && isBloomable && !currentMode.startsWith('viz3d')) {
        const palette = currentPalette || [
            [1.0, 0.3, 0.5],
            [0.3, 0.5, 1.0],
            [0.3, 1.0, 0.5],
            [1.0, 0.8, 0.3],
            [1.0, 0.3, 0.3]
        ];

        // Emit particles based on audio
        particleSystem.emit(vizDataL, palette, 0.6);

        // Burst on beat
        if (beatDetector?.beatDetected) {
            const burstColor = palette[Math.floor(Math.random() * palette.length)];
            particleSystem.burst(0, 0.3, 0, 30, burstColor);
        }

        particleSystem.update(deltaTime);

        // Simple orthographic projection for 2D overlay
        const vp = mat4.create();
        const model = mat4.create();
        mat4.ortho(vp, -1, 1, -1, 1, -1, 1);

        particleSystem.draw(vp, model);
    }
    // Update Time Display
    if (audioCtx.state === 'running') {
        const time = audioCtx.currentTime;
        document.getElementById('timeDisplay')!.innerText = time.toFixed(2);
    }

    // Draw performance stats
    if (perfMonitor && statsCtx) {
        statsCtx.clearRect(0, 0, statsCanvas.width, statsCanvas.height);
        perfMonitor.drawOverlay(statsCtx, 0, 0);
    }
}

// UI Interaction
document.getElementById('vizSelector')?.addEventListener('change', (e) => {
    currentMode = (e.target as HTMLSelectElement).value;
});

document.getElementById('analysisSelector')?.addEventListener('change', async (e) => {
    const newAnalysis = (e.target as HTMLSelectElement).value;
    currentAnalysis = newAnalysis;

    // Clear visualization history to avoid glitches when switching analysis modes
    viz3d?.clearHistory();

    if (newAnalysis !== 'fft' && !gammatoneAnalyser && !gammatoneLoading) {
        gammatoneLoading = true;
        console.log('Loading Cortix WASM module...');

        try {
            // Determine scale from selection
            let scale: Scale;
            switch (newAnalysis) {
                case 'gammatone_bark': scale = Scale.Bark; break;
                case 'gammatone_mel': scale = Scale.Mel; break;
                case 'gammatone_log': scale = Scale.Log; break;
                case 'gammatone_erb':
                default: scale = Scale.ERB; break;
            }

            gammatoneAnalyser = await createGammatoneAnalyser(
                audioCtx.sampleRate,
                GAMMATONE_BANDS,
                scale
            );

            // Resize output buffers to match band count
            gammatoneDataL = new Float32Array(GAMMATONE_BANDS);
            gammatoneDataR = new Float32Array(GAMMATONE_BANDS);

            console.log(`Gammatone analyser ready: ${GAMMATONE_BANDS} bands, scale=${Scale[scale]}`);
        } catch (err) {
            console.error('Failed to load Cortix WASM:', err);
            currentAnalysis = 'fft'; // Fallback
            (document.getElementById('analysisSelector') as HTMLSelectElement).value = 'fft';
        } finally {
            gammatoneLoading = false;
        }
    } else if (newAnalysis !== 'fft' && gammatoneAnalyser) {
        // Reconfigure existing analyser with new scale
        let scale: Scale;
        switch (newAnalysis) {
            case 'gammatone_bark': scale = Scale.Bark; break;
            case 'gammatone_mel': scale = Scale.Mel; break;
            case 'gammatone_log': scale = Scale.Log; break;
            case 'gammatone_erb':
            default: scale = Scale.ERB; break;
        }
        gammatoneAnalyser.configure(audioCtx.sampleRate, GAMMATONE_BANDS, scale);
        gammatoneAnalyser.reset();
        console.log(`Switched to Gammatone scale: ${Scale[scale]}`);
    }
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
