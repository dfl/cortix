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
        sampleRate_ = sampleRate;

        // Angular frequency
        const float omega = 2.0f * M_PI * centerHz / sampleRate;

        // Bandwidth coefficient (controls decay rate)
        // ERB-based bandwidth scaled for 4th-order filter
        const float bw = 2.0f * M_PI * bandwidthHz / sampleRate;

        // Pole radius and angle for complex resonator
        // For 4th order gammatone, we cascade 4 identical 1st-order sections
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
        envelope_ = 0.0f;
    }

    /// Process a single sample, returns instantaneous envelope
    float process(float input) {
        // Apply input gain
        float real = input * gain_;
        float imag = 0.0f;

        // Cascade of 4 complex resonators
        for (int i = 0; i < 4; i++) {
            // Complex multiply by pole: z * e^(j*omega) * r
            float newReal = r_ * (real * cosOmega_ - imag * sinOmega_) + stateReal_[i] * r_ * cosOmega_ - stateImag_[i] * r_ * sinOmega_;
            float newImag = r_ * (real * sinOmega_ + imag * cosOmega_) + stateReal_[i] * r_ * sinOmega_ + stateImag_[i] * r_ * cosOmega_;

            // Actually, simpler formulation:
            // output = input + pole * state
            // For complex pole p = r * e^(j*omega):
            newReal = real + r_ * (cosOmega_ * stateReal_[i] - sinOmega_ * stateImag_[i]);
            newImag = imag + r_ * (sinOmega_ * stateReal_[i] + cosOmega_ * stateImag_[i]);

            stateReal_[i] = newReal;
            stateImag_[i] = newImag;

            real = newReal;
            imag = newImag;
        }

        // Envelope = magnitude of complex output
        float mag = std::sqrt(real * real + imag * imag);
        return mag;
    }

    /// Process a block of samples
    void processBlock(const float* input, float* output, int numSamples) {
        for (int i = 0; i < numSamples; i++) {
            output[i] = process(input[i]);
        }
    }

    float getCenterHz() const { return centerHz_; }

private:
    float centerHz_ = 1000.0f;
    float sampleRate_ = 48000.0f;
    float r_ = 0.0f;           // Pole radius
    float cosOmega_ = 0.0f;    // cos(center frequency)
    float sinOmega_ = 0.0f;    // sin(center frequency)
    float gain_ = 1.0f;        // Input normalization

    // State for 4 cascaded complex resonators
    float stateReal_[4] = {0};
    float stateImag_[4] = {0};

    float envelope_ = 0.0f;
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
        Scale spacing = Scale::ERB;     // ERB spacing is standard for gammatone
        float smoothingMs = 5.0f;       // Envelope smoothing time constant
    };

    GammatoneFilterbank() = default;

    explicit GammatoneFilterbank(const Config& config) {
        configure(config);
    }

    void configure(const Config& config) {
        config_ = config;

        // Generate band frequencies according to scale
        bands_ = generateBands(config.spacing, config.numBands, config.minHz, config.maxHz);

        // Create filters
        filters_.resize(config.numBands);
        for (int i = 0; i < config.numBands; i++) {
            // Use ERB bandwidth for each filter (standard for gammatone)
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
        smoothedMagnitudes_.resize(config.numBands, 0.0f);
    }

    void reset() {
        for (auto& f : filters_) {
            f.reset();
        }
        std::fill(magnitudes_.begin(), magnitudes_.end(), 0.0f);
        std::fill(smoothedMagnitudes_.begin(), smoothedMagnitudes_.end(), 0.0f);
    }

    /// Process a single sample through all filters
    void process(float input) {
        for (size_t i = 0; i < filters_.size(); i++) {
            float mag = filters_[i].process(input);
            magnitudes_[i] = mag;

            // Exponential smoothing
            if (smoothCoeff_ > 0) {
                smoothedMagnitudes_[i] = smoothCoeff_ * smoothedMagnitudes_[i] +
                                         (1.0f - smoothCoeff_) * mag;
            } else {
                smoothedMagnitudes_[i] = mag;
            }
        }
    }

    /// Process a block of samples
    void processBlock(const float* input, int numSamples) {
        for (int i = 0; i < numSamples; i++) {
            process(input[i]);
        }
    }

    // Accessors
    int getNumBands() const { return config_.numBands; }
    const std::vector<float>& getMagnitudes() const { return magnitudes_; }
    const std::vector<float>& getSmoothedMagnitudes() const { return smoothedMagnitudes_; }
    const std::vector<BandInfo>& getBandInfo() const { return bands_; }

    float getMagnitude(int band) const { return magnitudes_[band]; }
    float getSmoothedMagnitude(int band) const { return smoothedMagnitudes_[band]; }
    float getCenterHz(int band) const { return bands_[band].centerHz; }

    /// Get magnitudes as dB values
    void getMagnitudesDb(float* output, float minDb = -100.0f) const {
        for (size_t i = 0; i < smoothedMagnitudes_.size(); i++) {
            float mag = smoothedMagnitudes_[i];
            if (mag > 0) {
                output[i] = 20.0f * std::log10(mag);
            } else {
                output[i] = minDb;
            }
        }
    }

private:
    Config config_;
    std::vector<BandInfo> bands_;
    std::vector<GammatoneFilter> filters_;
    std::vector<float> magnitudes_;
    std::vector<float> smoothedMagnitudes_;
    float smoothCoeff_ = 0.0f;
};

} // namespace cortix
