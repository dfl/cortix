# Cortix

**Perceptual Audio Spectrum Analyser**

A high-performance, header-only C++ library for real-time perceptual spectrum analysis. Features Gammatone filterbanks, multiple frequency scales (Bark, ERB, Mel), and WebAssembly support.

Named after the **Organ of Corti** - the biological spectrum analyser in the cochlea where sound is converted to neural signals.

## Features

- **Gammatone Filterbank** - Auditory model with true frequency resolution at all frequencies
- **Multiple Scales** - Bark, ERB, Mel, Log, and Linear frequency spacing
- **Real-time Performance** - Sub-millisecond latency, efficient per-sample processing
- **Header-only** - Just include and use, no linking required
- **WASM Support** - Full Emscripten bindings for browser-based audio visualization
- **Perceptually Accurate** - Based on auditory neuroscience research

## Quick Start

### C++ Usage

```cpp
#include <cortix/cortix.h>

// Create analyser: 48kHz, 40 ERB-spaced bands
cortix::Analyser::Config config;
config.sampleRate = 48000.0f;
config.numBands = 40;
config.scale = cortix::Scale::ERB;

cortix::Analyser analyser(config);

// Process audio
analyser.processBlock(audioBuffer, numSamples);

// Get results
float magnitudesDb[40];
analyser.getMagnitudesDb(magnitudesDb);
```

### JavaScript/WASM Usage

```javascript
import createCortixModule from './cortix.js';

const cortix = await createCortixModule();

// Create analyser: sampleRate, numBands, scale (4 = ERB)
const analyser = new cortix.Analyser(48000, 40, 4);

// In audio callback:
const inputPtr = ...; // pointer to HEAPF32 audio data
analyser.processBlock(inputPtr, frameSize);

// Read magnitudes
for (let i = 0; i < analyser.getNumBands(); i++) {
    const db = analyser.getMagnitudeDb(i);
    const hz = analyser.getCenterHz(i);
    // ... visualize
}
```

## Building

### Native (C++)

```bash
mkdir build && cd build
cmake ..
cmake --build .

# Run tests
ctest

# Run example
./cortix_example
```

### WebAssembly

Requires [Emscripten](https://emscripten.org/):

```bash
source /path/to/emsdk/emsdk_env.sh
./build-wasm.sh
```

Output: `dist/cortix.js` and `dist/cortix.wasm`

## Frequency Scales

| Scale | Description | Use Case |
|-------|-------------|----------|
| `Linear` | Uniform Hz spacing | Scientific analysis |
| `Log` | Logarithmic (octaves) | Music, harmonics |
| `Bark` | Critical bands | Masking, loudness |
| `ERB` | Equivalent rectangular bandwidth | Auditory models |
| `Mel` | Pitch perception | Speech recognition |

## API Reference

### Analyser

```cpp
namespace cortix {

class Analyser {
    void configure(const Config& config);
    void reset();
    void processBlock(const float* input, int numSamples);
    void processBlockStereo(const float* L, const float* R, int numSamples);

    int getNumBands() const;
    const float* getMagnitudes() const;          // Linear scale
    void getMagnitudesDb(float* output) const;   // dB scale
    float getCenterHz(int band) const;
};

}
```

### Scale Conversions

```cpp
float hzToBark(float hz);
float barkToHz(float bark);
float hzToErb(float hz);
float erbToHz(float erb);
float hzToMel(float hz);
float melToHz(float mel);
float criticalBandwidth(float hz);
float erbBandwidth(float hz);
```

## Technical Details

### Gammatone Filter

The gammatone filter models the basilar membrane impulse response:

```
g(t) = t^(n-1) × exp(-2πbt) × cos(2πft)
```

Where:
- n = 4 (filter order)
- b = ERB bandwidth
- f = center frequency

Implemented as a cascade of 4 complex resonators (IIR) for efficiency.

### Performance

| Operation | Time (48kHz) | Notes |
|-----------|--------------|-------|
| 40-band analysis | ~2μs/sample | Per-sample processing |
| 512-sample block | ~1ms | Typical audio callback |

## License

MIT License - see [LICENSE](LICENSE)

## References

- Glasberg & Moore (1990) - ERB scale
- Patterson et al. (1992) - Gammatone filters
- Slaney (1993) - Auditory toolbox
- Zwicker & Terhardt (1980) - Critical bands
