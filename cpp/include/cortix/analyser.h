/*
 * Cortix - Spectrum Analyser
 *
 * Unified interface for multiple analysis methods:
 * - Gammatone filterbank (auditory model)
 *
 * Designed for real-time audio visualization with perceptual accuracy.
 */

#pragma once

#include "scales.h"
#include "gammatone.h"
#include <vector>
#include <cmath>

namespace cortix {

//=============================================================================
// Analysis Mode
//=============================================================================

enum class AnalysisMode {
    Gammatone,      // Gammatone filterbank (auditory model, lowest latency)
    // Future modes:
    // BarkCQT,     // Bark-spaced constant-Q transform
    // MultiResFFT, // Multi-resolution STFT
    // Reassigned   // Reassigned spectrogram
};

//=============================================================================
// Spectrum Analyser
// Main interface for perceptual spectrum analysis
//=============================================================================

class Analyser {
public:
    struct Config {
        AnalysisMode mode = AnalysisMode::Gammatone;
        Scale scale = Scale::ERB;
        int numBands = 40;
        float minHz = 20.0f;
        float maxHz = 20000.0f;
        float sampleRate = 48000.0f;
        float smoothingMs = 5.0f;
    };

    Analyser() {
        configure(Config{});
    }

    explicit Analyser(const Config& config) {
        configure(config);
    }

    void configure(const Config& config) {
        config_ = config;

        switch (config.mode) {
            case AnalysisMode::Gammatone: {
                GammatoneFilterbank::Config gtConfig;
                gtConfig.numBands = config.numBands;
                gtConfig.minHz = config.minHz;
                gtConfig.maxHz = config.maxHz;
                gtConfig.sampleRate = config.sampleRate;
                gtConfig.scale = config.scale;
                gtConfig.smoothingMs = config.smoothingMs;
                gammatone_.configure(gtConfig);
                break;
            }
        }
    }

    void reset() {
        gammatone_.reset();
    }

    /// Process a block of samples (mono)
    const std::vector<float>& process(const float* input, int numSamples) {
        switch (config_.mode) {
            case AnalysisMode::Gammatone:
                gammatone_.process(input, numSamples);
                break;
        }
        return envelope();
    }

    /// Process a stereo block (averages L+R)
    const std::vector<float>& processStereo(const float* inputL, const float* inputR, int numSamples) {
        monoBuffer_.resize(numSamples);
        for (int i = 0; i < numSamples; i++) {
            monoBuffer_[i] = (inputL[i] + inputR[i]) * 0.5f;
        }
        return process(monoBuffer_.data(), numSamples);
    }

    /// Get the number of bands
    int numBands() const { return config_.numBands; }

    /// Get the sample rate
    float sampleRate() const { return config_.sampleRate; }

    /// Get the smoothed envelope (magnitude per band)
    const std::vector<float>& envelope() const {
        return gammatone_.envelope();
    }

    /// Get the envelope in decibels
    void envelopeDb(float* output, float minDb = -100.0f) const {
        gammatone_.envelopeDb(output, minDb);
    }

    /// Get center frequency for a band (Hz)
    float centerHz(int band) const {
        return gammatone_.centerHz(band);
    }

    /// Get all band info
    const std::vector<BandInfo>& bands() const {
        return gammatone_.bands();
    }

private:
    Config config_;
    GammatoneFilterbank gammatone_;
    std::vector<float> monoBuffer_;
};

} // namespace cortix
