/**
 * Cortix WASM Module Wrapper
 * Provides TypeScript interface for Gammatone filterbank analysis
 */

// Scale enum matching the C++ enum
export enum Scale {
    Linear = 0,
    Log = 1,
    Bark = 2,
    ERB = 3,
    Mel = 4
}

// Embind-generated module interface
interface CortixModule {
    Scale: {
        Linear: Scale;
        Log: Scale;
        Bark: Scale;
        ERB: Scale;
        Mel: Scale;
    };
    Analyser: new (sampleRate: number, numBands: number, scaleType: number) => CortixAnalyser;
    _malloc(size: number): number;
    _free(ptr: number): void;
    HEAPF32: Float32Array;
}

interface CortixAnalyser {
    configure(sampleRate: number, numBands: number, scaleType: number, smoothingMs: number): void;
    reset(): void;
    processBlock(inputPtr: number, numSamples: number): void;
    processBlockStereo(inputPtr: number, numFrames: number): void;
    getNumBands(): number;
    envelope(band: number): number;
    envelopeDb(band: number): number;
    getCenterHz(band: number): number;
    getEnvelopePtr(): number;
    getEnvelopeDbPtr(): number;
    getCenterFreqsPtr(): number;
}

let modulePromise: Promise<CortixModule> | null = null;
let loadedModule: CortixModule | null = null;

/**
 * Load the Cortix WASM module
 */
export async function loadCortix(): Promise<CortixModule> {
    if (loadedModule) return loadedModule;

    if (!modulePromise) {
        modulePromise = (async () => {
            // Dynamic import of the Emscripten module
            const createModule = (await import('./wasm/cortix.js')).default;
            const module = await createModule({
                locateFile: (path: string) => {
                    if (path.endsWith('.wasm')) {
                        return './wasm/cortix.wasm';
                    }
                    return path;
                }
            });
            loadedModule = module;
            return module;
        })();
    }

    return modulePromise;
}

/**
 * High-level wrapper for Gammatone analysis
 */
export class GammatoneAnalyser {
    private module: CortixModule;
    private analyser: CortixAnalyser;
    private inputBuffer: number = 0;
    private inputBufferSize: number = 0;
    private numBands: number;

    constructor(module: CortixModule, sampleRate: number, numBands: number, scale: Scale) {
        this.module = module;
        this.numBands = numBands;
        this.analyser = new module.Analyser(sampleRate, numBands, scale);
    }

    /**
     * Reconfigure the analyser
     */
    configure(sampleRate: number, numBands: number, scale: Scale, smoothingMs: number = 5.0): void {
        this.numBands = numBands;
        this.analyser.configure(sampleRate, numBands, scale, smoothingMs);
    }

    /**
     * Reset filter state
     */
    reset(): void {
        this.analyser.reset();
    }

    /**
     * Process a block of mono audio samples
     */
    process(samples: Float32Array): void {
        const needed = samples.length * 4;
        if (this.inputBufferSize < needed) {
            if (this.inputBuffer) this.module._free(this.inputBuffer);
            this.inputBuffer = this.module._malloc(needed);
            this.inputBufferSize = needed;
        }

        // Copy samples to WASM heap
        this.module.HEAPF32.set(samples, this.inputBuffer / 4);
        this.analyser.processBlock(this.inputBuffer, samples.length);
    }

    /**
     * Get the envelope (smoothed magnitude per band)
     * Returns Float32Array view into WASM heap - copy if you need to keep it
     */
    getEnvelope(): Float32Array {
        const ptr = this.analyser.getEnvelopePtr();
        return new Float32Array(this.module.HEAPF32.buffer, ptr, this.numBands);
    }

    /**
     * Get envelope in dB
     */
    getEnvelopeDb(): Float32Array {
        const ptr = this.analyser.getEnvelopeDbPtr();
        return new Float32Array(this.module.HEAPF32.buffer, ptr, this.numBands);
    }

    /**
     * Get center frequencies in Hz
     */
    getCenterFrequencies(): Float32Array {
        const ptr = this.analyser.getCenterFreqsPtr();
        return new Float32Array(this.module.HEAPF32.buffer, ptr, this.numBands);
    }

    /**
     * Get number of bands
     */
    getNumBands(): number {
        return this.numBands;
    }

    /**
     * Cleanup WASM memory
     */
    dispose(): void {
        if (this.inputBuffer) {
            this.module._free(this.inputBuffer);
            this.inputBuffer = 0;
            this.inputBufferSize = 0;
        }
    }
}

/**
 * Create a GammatoneAnalyser (loads WASM if needed)
 */
export async function createGammatoneAnalyser(
    sampleRate: number,
    numBands: number,
    scale: Scale
): Promise<GammatoneAnalyser> {
    const module = await loadCortix();
    return new GammatoneAnalyser(module, sampleRate, numBands, scale);
}
