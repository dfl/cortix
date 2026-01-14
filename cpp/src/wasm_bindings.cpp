/*
 * Cortix - Emscripten/WASM Bindings
 *
 * Exposes Cortix analyser to JavaScript via embind.
 */

#include <emscripten/bind.h>
#include <cortix/cortix.h>
#include <cstdint>
#include <vector>

using namespace emscripten;

namespace cortix {

//=============================================================================
// WASM-friendly wrapper for Analyser
// Uses uintptr_t for buffer pointers (embind-compatible)
//=============================================================================

class AnalyserWasm {
public:
    AnalyserWasm(float sampleRate, int numBands, int scaleType) {
        Analyser::Config config;
        config.sampleRate = sampleRate;
        config.numBands = numBands;
        config.scale = static_cast<Scale>(scaleType);
        config.mode = AnalysisMode::Gammatone;
        config.smoothingMs = 5.0f;
        analyser_.configure(config);

        // Allocate output buffers
        magnitudesLinear_.resize(numBands);
        magnitudesDb_.resize(numBands);
        centerFreqs_.resize(numBands);

        // Cache center frequencies
        for (int i = 0; i < numBands; i++) {
            centerFreqs_[i] = analyser_.getCenterHz(i);
        }
    }

    void configure(float sampleRate, int numBands, int scaleType, float smoothingMs) {
        Analyser::Config config;
        config.sampleRate = sampleRate;
        config.numBands = numBands;
        config.scale = static_cast<Scale>(scaleType);
        config.mode = AnalysisMode::Gammatone;
        config.smoothingMs = smoothingMs;
        analyser_.configure(config);

        magnitudesLinear_.resize(numBands);
        magnitudesDb_.resize(numBands);
        centerFreqs_.resize(numBands);

        for (int i = 0; i < numBands; i++) {
            centerFreqs_[i] = analyser_.getCenterHz(i);
        }
    }

    void reset() {
        analyser_.reset();
    }

    /// Process a mono block of samples
    /// inputPtr should be obtained from HEAPF32
    void processBlock(std::uintptr_t inputPtr, int numSamples) {
        const float* input = reinterpret_cast<const float*>(inputPtr);
        analyser_.processBlock(input, numSamples);

        // Update cached magnitudes
        analyser_.getMagnitudes(magnitudesLinear_.data());
        analyser_.getMagnitudesDb(magnitudesDb_.data(), -100.0f);
    }

    /// Process interleaved stereo (converts to mono internally)
    void processBlockStereo(std::uintptr_t inputPtr, int numFrames) {
        const float* input = reinterpret_cast<const float*>(inputPtr);

        // De-interleave and mix to mono
        monoBuffer_.resize(numFrames);
        for (int i = 0; i < numFrames; i++) {
            monoBuffer_[i] = (input[i * 2] + input[i * 2 + 1]) * 0.5f;
        }

        analyser_.processBlock(monoBuffer_.data(), numFrames);
        analyser_.getMagnitudes(magnitudesLinear_.data());
        analyser_.getMagnitudesDb(magnitudesDb_.data(), -100.0f);
    }

    int getNumBands() const {
        return analyser_.getNumBands();
    }

    float getMagnitude(int band) const {
        if (band >= 0 && band < (int)magnitudesLinear_.size()) {
            return magnitudesLinear_[band];
        }
        return 0.0f;
    }

    float getMagnitudeDb(int band) const {
        if (band >= 0 && band < (int)magnitudesDb_.size()) {
            return magnitudesDb_[band];
        }
        return -100.0f;
    }

    float getCenterHz(int band) const {
        if (band >= 0 && band < (int)centerFreqs_.size()) {
            return centerFreqs_[band];
        }
        return 0.0f;
    }

    /// Get pointer to linear magnitudes buffer (for efficient bulk access)
    std::uintptr_t getMagnitudesPtr() const {
        return reinterpret_cast<std::uintptr_t>(magnitudesLinear_.data());
    }

    /// Get pointer to dB magnitudes buffer
    std::uintptr_t getMagnitudesDbPtr() const {
        return reinterpret_cast<std::uintptr_t>(magnitudesDb_.data());
    }

    /// Get pointer to center frequencies buffer
    std::uintptr_t getCenterFreqsPtr() const {
        return reinterpret_cast<std::uintptr_t>(centerFreqs_.data());
    }

private:
    Analyser analyser_;
    std::vector<float> magnitudesLinear_;
    std::vector<float> magnitudesDb_;
    std::vector<float> centerFreqs_;
    std::vector<float> monoBuffer_;
};

//=============================================================================
// Scale conversion utilities exposed to JS
//=============================================================================

float wasm_hzToBark(float hz) { return hzToBark(hz); }
float wasm_barkToHz(float bark) { return barkToHz(bark); }
float wasm_hzToErb(float hz) { return hzToErb(hz); }
float wasm_erbToHz(float erb) { return erbToHz(erb); }
float wasm_hzToMel(float hz) { return hzToMel(hz); }
float wasm_melToHz(float mel) { return melToHz(mel); }
float wasm_criticalBandwidth(float hz) { return criticalBandwidth(hz); }
float wasm_erbBandwidth(float hz) { return erbBandwidth(hz); }

} // namespace cortix

//=============================================================================
// Embind bindings
//=============================================================================

EMSCRIPTEN_BINDINGS(cortix) {
    using namespace cortix;

    // Scale enum
    enum_<Scale>("Scale")
        .value("Linear", Scale::Linear)
        .value("Log", Scale::Log)
        .value("Bark", Scale::Bark)
        .value("ERB", Scale::ERB)
        .value("Mel", Scale::Mel);

    // Main analyser class
    class_<AnalyserWasm>("Analyser")
        .constructor<float, int, int>()  // sampleRate, numBands, scaleType
        .function("configure", &AnalyserWasm::configure)
        .function("reset", &AnalyserWasm::reset)
        .function("processBlock", &AnalyserWasm::processBlock)
        .function("processBlockStereo", &AnalyserWasm::processBlockStereo)
        .function("getNumBands", &AnalyserWasm::getNumBands)
        .function("getMagnitude", &AnalyserWasm::getMagnitude)
        .function("getMagnitudeDb", &AnalyserWasm::getMagnitudeDb)
        .function("getCenterHz", &AnalyserWasm::getCenterHz)
        .function("getMagnitudesPtr", &AnalyserWasm::getMagnitudesPtr)
        .function("getMagnitudesDbPtr", &AnalyserWasm::getMagnitudesDbPtr)
        .function("getCenterFreqsPtr", &AnalyserWasm::getCenterFreqsPtr);

    // Scale conversion functions
    function("hzToBark", &wasm_hzToBark);
    function("barkToHz", &wasm_barkToHz);
    function("hzToErb", &wasm_hzToErb);
    function("erbToHz", &wasm_erbToHz);
    function("hzToMel", &wasm_hzToMel);
    function("melToHz", &wasm_melToHz);
    function("criticalBandwidth", &wasm_criticalBandwidth);
    function("erbBandwidth", &wasm_erbBandwidth);
}
