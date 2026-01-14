/*
 * Cortix - Basic Usage Example
 *
 * Demonstrates how to use the Gammatone filterbank for spectrum analysis.
 */

#include <cortix/cortix.h>
#include <iostream>
#include <cmath>

int main() {
    // Configure analyser: 48kHz sample rate, 40 ERB-spaced bands
    cortix::Analyser::Config config;
    config.sampleRate = 48000.0f;
    config.numBands = 40;
    config.scale = cortix::Scale::ERB;
    config.smoothingMs = 10.0f;

    cortix::Analyser analyser(config);

    // Generate a test signal: 440 Hz sine wave
    const int blockSize = 512;
    float buffer[blockSize];
    const float freq = 440.0f;
    const float amplitude = 0.5f;

    for (int i = 0; i < blockSize; i++) {
        float t = i / config.sampleRate;
        buffer[i] = amplitude * std::sin(2.0f * M_PI * freq * t);
    }

    // Process the block
    analyser.processBlock(buffer, blockSize);

    // Print results
    std::cout << "Cortix Spectrum Analysis\n";
    std::cout << "========================\n";
    std::cout << "Input: " << freq << " Hz sine wave\n\n";
    std::cout << "Band\tCenter Hz\tMagnitude (dB)\n";
    std::cout << "----\t---------\t--------------\n";

    float magnitudesDb[40];
    analyser.getMagnitudesDb(magnitudesDb);

    for (int i = 0; i < analyser.getNumBands(); i++) {
        float centerHz = analyser.getCenterHz(i);
        float magDb = magnitudesDb[i];

        // Only print bands with significant energy
        if (magDb > -60.0f) {
            std::cout << i << "\t" << centerHz << "\t\t" << magDb << "\n";
        }
    }

    std::cout << "\nPeak should be near 440 Hz band.\n";

    return 0;
}
