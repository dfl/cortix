/*
 * Cortix - Scale Conversion Tests
 */

#include <cortix/cortix.h>
#include <iostream>
#include <cmath>
#include <cassert>

using namespace cortix;

bool approxEqual(float a, float b, float tolerance = 0.01f) {
    return std::abs(a - b) < tolerance;
}

void testBarkScale() {
    std::cout << "Testing Bark scale conversions...\n";

    // Test round-trip conversion
    float testFreqs[] = {100, 500, 1000, 4000, 10000};
    for (float hz : testFreqs) {
        float bark = hzToBark(hz);
        float backHz = barkToHz(bark);
        assert(approxEqual(hz, backHz, hz * 0.01f));
    }

    // Test known values (approximate)
    assert(approxEqual(hzToBark(100), 1.0f, 0.3f));
    assert(approxEqual(hzToBark(1000), 8.5f, 0.2f));

    std::cout << "  Bark scale: PASSED\n";
}

void testErbScale() {
    std::cout << "Testing ERB scale conversions...\n";

    // Test round-trip
    float testFreqs[] = {100, 500, 1000, 4000, 10000};
    for (float hz : testFreqs) {
        float erb = hzToErb(hz);
        float backHz = erbToHz(erb);
        assert(approxEqual(hz, backHz, hz * 0.01f));
    }

    // Test ERB bandwidth formula
    // At 1kHz, ERB should be about 133 Hz
    assert(approxEqual(erbBandwidth(1000), 133.0f, 5.0f));

    std::cout << "  ERB scale: PASSED\n";
}

void testMelScale() {
    std::cout << "Testing Mel scale conversions...\n";

    // Test round-trip
    float testFreqs[] = {100, 500, 1000, 4000, 10000};
    for (float hz : testFreqs) {
        float mel = hzToMel(hz);
        float backHz = melToHz(mel);
        assert(approxEqual(hz, backHz, hz * 0.01f));
    }

    // Test known value: 1000 Hz = 1000 Mel (approximately)
    assert(approxEqual(hzToMel(1000), 1000.0f, 50.0f));

    std::cout << "  Mel scale: PASSED\n";
}

void testBandGeneration() {
    std::cout << "Testing band generation...\n";

    auto bands = generateBands(Scale::ERB, 40, 20.0f, 20000.0f);
    assert(bands.size() == 40);

    // Check bands are in ascending order
    for (size_t i = 1; i < bands.size(); i++) {
        assert(bands[i].centerHz > bands[i-1].centerHz);
    }

    // Check first band starts near minHz
    assert(bands[0].lowHz >= 19.99f);
    assert(bands[0].lowHz < 50.0f);

    // Check last band ends near maxHz
    assert(bands.back().highHz <= 20001.0f);
    assert(bands.back().highHz > 15000.0f);

    std::cout << "  Band generation: PASSED\n";
}

void testGammatoneFilterbank() {
    std::cout << "Testing Gammatone filterbank...\n";

    GammatoneFilterbank::Config config;
    config.numBands = 40;
    config.sampleRate = 48000.0f;
    config.scale = Scale::ERB;

    GammatoneFilterbank fb(config);
    assert(fb.numBands() == 40);

    // Process a 1kHz sine wave
    const int numSamples = 4800;  // 100ms at 48kHz
    std::vector<float> signal(numSamples);
    for (int i = 0; i < numSamples; i++) {
        float t = i / 48000.0f;
        signal[i] = std::sin(2.0f * M_PI * 1000.0f * t);
    }

    fb.process(signal.data(), numSamples);

    // Find peak band
    int peakBand = 0;
    float peakMag = 0;
    const auto& env = fb.envelope();
    for (int i = 0; i < fb.numBands(); i++) {
        if (env[i] > peakMag) {
            peakMag = env[i];
            peakBand = i;
        }
    }

    // Peak should be near 1kHz
    float peakFreq = fb.centerHz(peakBand);
    assert(peakFreq > 800.0f && peakFreq < 1200.0f);

    std::cout << "  Gammatone filterbank: PASSED (peak at " << peakFreq << " Hz)\n";
}

int main() {
    std::cout << "Cortix Test Suite\n";
    std::cout << "=================\n\n";

    testBarkScale();
    testErbScale();
    testMelScale();
    testBandGeneration();
    testGammatoneFilterbank();

    std::cout << "\nAll tests PASSED!\n";
    return 0;
}
