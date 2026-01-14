/*
 * Cortix - Frequency Scale Conversions
 *
 * Provides conversions between Hz and perceptual scales:
 * - Bark (critical bands)
 * - ERB (equivalent rectangular bandwidth)
 * - Mel (pitch perception)
 */

#pragma once

#include <cmath>
#include <vector>
#include <algorithm>

namespace cortix {

//=============================================================================
// Bark Scale (Critical Bands)
// Based on Traunmüller (1990) formula
//=============================================================================

/// Convert frequency in Hz to Bark scale
inline float hzToBark(float hz) {
    return 26.81f * hz / (1960.0f + hz) - 0.53f;
}

/// Convert Bark scale to frequency in Hz
inline float barkToHz(float bark) {
    // Inverse of Traunmüller formula
    return 1960.0f * (bark + 0.53f) / (26.28f - bark);
}

/// Critical bandwidth at given frequency (Hz)
/// Zwicker & Terhardt (1980)
inline float criticalBandwidth(float hz) {
    return 25.0f + 75.0f * std::pow(1.0f + 1.4f * (hz / 1000.0f) * (hz / 1000.0f), 0.69f);
}

//=============================================================================
// ERB Scale (Equivalent Rectangular Bandwidth)
// Based on Glasberg & Moore (1990)
//=============================================================================

/// ERB bandwidth at given frequency (Hz)
inline float erbBandwidth(float hz) {
    return 24.7f * (4.37f * hz / 1000.0f + 1.0f);
}

/// Convert frequency in Hz to ERB-rate scale
inline float hzToErb(float hz) {
    return 21.4f * std::log10(4.37f * hz / 1000.0f + 1.0f);
}

/// Convert ERB-rate scale to frequency in Hz
inline float erbToHz(float erb) {
    return (std::pow(10.0f, erb / 21.4f) - 1.0f) * 1000.0f / 4.37f;
}

//=============================================================================
// Mel Scale (Pitch Perception)
// Based on O'Shaughnessy (1987)
//=============================================================================

/// Convert frequency in Hz to Mel scale
inline float hzToMel(float hz) {
    return 2595.0f * std::log10(1.0f + hz / 700.0f);
}

/// Convert Mel scale to frequency in Hz
inline float melToHz(float mel) {
    return 700.0f * (std::pow(10.0f, mel / 2595.0f) - 1.0f);
}

//=============================================================================
// Scale Types
//=============================================================================

enum class Scale {
    Linear,     // Linear frequency (Hz)
    Log,        // Logarithmic (octaves)
    Bark,       // Critical bands
    ERB,        // Equivalent rectangular bandwidth
    Mel         // Pitch perception
};

//=============================================================================
// Band Generator
// Creates frequency bands according to different scales
//=============================================================================

struct BandInfo {
    float centerHz;     // Center frequency in Hz
    float bandwidthHz;  // Bandwidth in Hz
    float lowHz;        // Lower edge frequency
    float highHz;       // Upper edge frequency
};

/// Generate frequency bands spaced according to the given scale
inline std::vector<BandInfo> generateBands(
    Scale scale,
    int numBands,
    float minHz = 20.0f,
    float maxHz = 20000.0f
) {
    std::vector<BandInfo> bands;
    bands.reserve(numBands);

    switch (scale) {
        case Scale::Linear: {
            float step = (maxHz - minHz) / numBands;
            for (int i = 0; i < numBands; i++) {
                BandInfo b;
                b.lowHz = minHz + i * step;
                b.highHz = b.lowHz + step;
                b.centerHz = (b.lowHz + b.highHz) / 2.0f;
                b.bandwidthHz = step;
                bands.push_back(b);
            }
            break;
        }

        case Scale::Log: {
            float logMin = std::log2(minHz);
            float logMax = std::log2(maxHz);
            float step = (logMax - logMin) / numBands;
            for (int i = 0; i < numBands; i++) {
                BandInfo b;
                b.lowHz = std::pow(2.0f, logMin + i * step);
                b.highHz = std::pow(2.0f, logMin + (i + 1) * step);
                b.centerHz = std::sqrt(b.lowHz * b.highHz); // Geometric mean
                b.bandwidthHz = b.highHz - b.lowHz;
                bands.push_back(b);
            }
            break;
        }

        case Scale::Bark: {
            float barkMin = hzToBark(minHz);
            float barkMax = hzToBark(maxHz);
            float step = (barkMax - barkMin) / numBands;
            for (int i = 0; i < numBands; i++) {
                BandInfo b;
                float barkLow = barkMin + i * step;
                float barkHigh = barkMin + (i + 1) * step;
                b.lowHz = barkToHz(barkLow);
                b.highHz = barkToHz(barkHigh);
                b.centerHz = barkToHz((barkLow + barkHigh) / 2.0f);
                b.bandwidthHz = b.highHz - b.lowHz;
                bands.push_back(b);
            }
            break;
        }

        case Scale::ERB: {
            float erbMin = hzToErb(minHz);
            float erbMax = hzToErb(maxHz);
            float step = (erbMax - erbMin) / numBands;
            for (int i = 0; i < numBands; i++) {
                BandInfo b;
                float erbLow = erbMin + i * step;
                float erbHigh = erbMin + (i + 1) * step;
                b.lowHz = erbToHz(erbLow);
                b.highHz = erbToHz(erbHigh);
                b.centerHz = erbToHz((erbLow + erbHigh) / 2.0f);
                b.bandwidthHz = b.highHz - b.lowHz;
                bands.push_back(b);
            }
            break;
        }

        case Scale::Mel: {
            float melMin = hzToMel(minHz);
            float melMax = hzToMel(maxHz);
            float step = (melMax - melMin) / numBands;
            for (int i = 0; i < numBands; i++) {
                BandInfo b;
                float melLow = melMin + i * step;
                float melHigh = melMin + (i + 1) * step;
                b.lowHz = melToHz(melLow);
                b.highHz = melToHz(melHigh);
                b.centerHz = melToHz((melLow + melHigh) / 2.0f);
                b.bandwidthHz = b.highHz - b.lowHz;
                bands.push_back(b);
            }
            break;
        }
    }

    return bands;
}

} // namespace cortix
