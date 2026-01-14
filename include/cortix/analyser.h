/*
 * Cortix - Spectrum Analyser
 *
 * Unified interface for multiple analysis methods:
 * - Gammatone filterbank (auditory model)
 * - Bark-spaced analysis
 * - Multi-resolution FFT
 *
 * Designed for real-time audio visualization with perceptual accuracy.
 */

#pragma once

#include "scales.h"
#include "gammatone.h"
#include <vector>
#include <cmath>
#include <memory>
#include <cstring>

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
                gtConfig.spacing = config.scale;
                gtConfig.smoothingMs = config.smoothingMs;
                gammatone_.configure(gtConfig);
                break;
            }
            // Future modes here
        }
    }

    void reset() {
        gammatone_.reset();
    }

    /// Process a single sample
    void process(float input) {
        switch (config_.mode) {
            case AnalysisMode::Gammatone:
                gammatone_.process(input);
                break;
        }
    }

    /// Process a block of samples (mono)
    void processBlock(const float* input, int numSamples) {
        switch (config_.mode) {
            case AnalysisMode::Gammatone:
                gammatone_.processBlock(input, numSamples);
                break;
        }
    }

    /// Process a stereo block (averages L+R)
    void processBlockStereo(const float* inputL, const float* inputR, int numSamples) {
        // Mix to mono for analysis
        monoBuffer_.resize(numSamples);
        for (int i = 0; i < numSamples; i++) {
            monoBuffer_[i] = (inputL[i] + inputR[i]) * 0.5f;
        }
        processBlock(monoBuffer_.data(), numSamples);
    }

    // Accessors
    int getNumBands() const { return config_.numBands; }
    float getSampleRate() const { return config_.sampleRate; }

    /// Get raw magnitudes (linear scale)
    const float* getMagnitudes() const {
        switch (config_.mode) {
            case AnalysisMode::Gammatone:
                return gammatone_.getSmoothedMagnitudes().data();
        }
        return nullptr;
    }

    /// Get magnitude for a specific band
    float getMagnitude(int band) const {
        return gammatone_.getSmoothedMagnitude(band);
    }

    /// Get center frequency for a band (Hz)
    float getCenterHz(int band) const {
        return gammatone_.getCenterHz(band);
    }

    /// Get all band info
    const std::vector<BandInfo>& getBandInfo() const {
        return gammatone_.getBandInfo();
    }

    /// Copy magnitudes to output buffer
    void getMagnitudes(float* output) const {
        const auto& mags = gammatone_.getSmoothedMagnitudes();
        std::memcpy(output, mags.data(), mags.size() * sizeof(float));
    }

    /// Get magnitudes in dB
    void getMagnitudesDb(float* output, float minDb = -100.0f) const {
        gammatone_.getMagnitudesDb(output, minDb);
    }

private:
    Config config_;
    GammatoneFilterbank gammatone_;
    std::vector<float> monoBuffer_;
};

} // namespace cortix
