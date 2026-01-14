/*
 * Cortix - Gammatone Filterbank
 *
 * Efficient IIR implementation of gammatone filters for real-time
 * auditory spectrum analysis. Based on the all-pole gammatone
 * approximation by Slaney (1993) and Lyon (1997).
 *
 * The gammatone filter models the impulse response of the basilar membrane:
 *   g(t) = t^(n-1) * exp(-2*pi*b*t) * cos(2*pi*f*t)
 *
 * Where n=4 (filter order), b=bandwidth, f=center frequency.
 */

#pragma once

#include "scales.h"
#include <vector>
#include <cmath>
#include <algorithm>

namespace cortix {

//=============================================================================
// Gammatone Filter (Single Band)
// 4th-order IIR approximation using cascaded complex resonators
//=============================================================================

class GammatoneFilter {
public:
    GammatoneFilter() = default;

    void configure(float centerHz, float bandwidthHz, float sampleRate) {
        centerHz_ = centerHz;

        // Angular frequency
        const float omega = 2.0f * M_PI * centerHz / sampleRate;

        // Bandwidth coefficient (controls decay rate)
        const float bw = 2.0f * M_PI * bandwidthHz / sampleRate;

        // Pole radius and angle for complex resonator
        r_ = std::exp(-bw);
        cosOmega_ = std::cos(omega);
        sinOmega_ = std::sin(omega);

        // Input gain normalization (approximate)
        gain_ = std::pow(1.0f - r_, 4) * 2.0f;

        reset();
    }

    void reset() {
        for (int i = 0; i < 4; i++) {
            stateReal_[i] = 0.0f;
            stateImag_[i] = 0.0f;
        }
    }

    /// Process a single sample, returns instantaneous magnitude
    float tick(float input) {
        float real = input * gain_;
        float imag = 0.0f;

        // Cascade of 4 complex resonators
        for (int i = 0; i < 4; i++) {
            float newReal = real + r_ * (cosOmega_ * stateReal_[i] - sinOmega_ * stateImag_[i]);
            float newImag = imag + r_ * (sinOmega_ * stateReal_[i] + cosOmega_ * stateImag_[i]);

            stateReal_[i] = newReal;
            stateImag_[i] = newImag;

            real = newReal;
            imag = newImag;
        }

        return std::sqrt(real * real + imag * imag);
    }

    float centerHz() const { return centerHz_; }

private:
    float centerHz_ = 1000.0f;
    float r_ = 0.0f;
    float cosOmega_ = 0.0f;
    float sinOmega_ = 0.0f;
    float gain_ = 1.0f;

    float stateReal_[4] = {0};
    float stateImag_[4] = {0};
};

//=============================================================================
// Gammatone Filterbank
// Bank of gammatone filters with configurable spacing
//=============================================================================

class GammatoneFilterbank {
public:
    struct Config {
        int numBands = 40;
        float minHz = 20.0f;
        float maxHz = 20000.0f;
        float sampleRate = 48000.0f;
        Scale scale = Scale::ERB;
        float smoothingMs = 5.0f;
    };

    GammatoneFilterbank() = default;

    explicit GammatoneFilterbank(const Config& config) {
        configure(config);
    }

    void configure(const Config& config) {
        config_ = config;

        // Generate band frequencies according to scale
        bands_ = generateBands(config.scale, config.numBands, config.minHz, config.maxHz);

        // Create filters
        filters_.resize(config.numBands);
        for (int i = 0; i < config.numBands; i++) {
            float bw = erbBandwidth(bands_[i].centerHz);
            filters_[i].configure(bands_[i].centerHz, bw, config.sampleRate);
        }

        // Envelope smoothing coefficient
        if (config.smoothingMs > 0) {
            float tau = config.smoothingMs / 1000.0f;
            smoothCoeff_ = std::exp(-1.0f / (tau * config.sampleRate));
        } else {
            smoothCoeff_ = 0.0f;
        }

        // Allocate output buffers
        magnitudes_.resize(config.numBands, 0.0f);
        envelope_.resize(config.numBands, 0.0f);
    }

    void reset() {
        for (auto& f : filters_) {
            f.reset();
        }
        std::fill(magnitudes_.begin(), magnitudes_.end(), 0.0f);
        std::fill(envelope_.begin(), envelope_.end(), 0.0f);
    }

    /// Process a block of samples
    void process(const float* input, int numSamples) {
        for (int i = 0; i < numSamples; i++) {
            tick(input[i]);
        }
    }

    /// Get the number of bands
    int numBands() const { return config_.numBands; }

    /// Get the smoothed envelope (magnitude per band)
    const std::vector<float>& envelope() const { return envelope_; }

    /// Get raw (unsmoothed) magnitudes
    const std::vector<float>& magnitudes() const { return magnitudes_; }

    /// Get band information
    const std::vector<BandInfo>& bands() const { return bands_; }

    /// Get center frequency for a band in Hz
    float centerHz(int band) const { return bands_[band].centerHz; }

    /// Get the envelope in decibels
    void envelopeDb(float* output, float minDb = -100.0f) const {
        for (size_t i = 0; i < envelope_.size(); i++) {
            float mag = envelope_[i];
            output[i] = (mag > 0) ? 20.0f * std::log10(mag) : minDb;
        }
    }

private:
    void tick(float input) {
        for (size_t i = 0; i < filters_.size(); i++) {
            float mag = filters_[i].tick(input);
            magnitudes_[i] = mag;

            if (smoothCoeff_ > 0) {
                envelope_[i] = smoothCoeff_ * envelope_[i] + (1.0f - smoothCoeff_) * mag;
            } else {
                envelope_[i] = mag;
            }
        }
    }

    Config config_;
    std::vector<BandInfo> bands_;
    std::vector<GammatoneFilter> filters_;
    std::vector<float> magnitudes_;
    std::vector<float> envelope_;
    float smoothCoeff_ = 0.0f;
};

} // namespace cortix
