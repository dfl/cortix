/**
 * Cortix - TypeScript Declarations
 *
 * Type definitions for the Cortix WASM module.
 */

export interface CortixModule {
    // Scale enum values
    Scale: {
        Linear: number;  // 0
        Log: number;     // 1
        Bark: number;    // 2
        ERB: number;     // 3
        Mel: number;     // 4
    };

    // Analyser class
    Analyser: {
        new(sampleRate: number, numBands: number, scaleType: number): Analyser;
    };

    // Scale conversion functions
    hzToBark(hz: number): number;
    barkToHz(bark: number): number;
    hzToErb(hz: number): number;
    erbToHz(erb: number): number;
    hzToMel(hz: number): number;
    melToHz(mel: number): number;
    criticalBandwidth(hz: number): number;
    erbBandwidth(hz: number): number;

    // WASM memory access
    HEAPF32: Float32Array;
    _malloc(size: number): number;
    _free(ptr: number): void;
}

export interface Analyser {
    configure(sampleRate: number, numBands: number, scaleType: number, smoothingMs: number): void;
    reset(): void;
    processBlock(inputPtr: number, numSamples: number): void;
    processBlockStereo(inputPtr: number, numFrames: number): void;
    getNumBands(): number;
    getMagnitude(band: number): number;
    getMagnitudeDb(band: number): number;
    getCenterHz(band: number): number;
    getMagnitudesPtr(): number;
    getMagnitudesDbPtr(): number;
    getCenterFreqsPtr(): number;
    delete(): void;
}

declare function createCortixModule(): Promise<CortixModule>;
export default createCortixModule;
