# Chiasm
**Perceptual Audio Visualization Library**

Chiasm is a high-performance, configurable visualization library designed for [Cortix](../README.md). It bridges the gap between raw auditory data and visual perception, inspired by the "Optic Chiasm".

## Features

- **3D Spectrum Waterfall (`Viz3D`)**: A GPU-accelerated historical view of the spectrum, rendered using WebGL 2 Instanced Rendering.
- **2D Interactive Spectrogram (`Viz2D`)**: A high-resolution scrolling heatmap with pan and zoom capabilities.
- **Psychoacoustic Metering**: Goniometers and Correlation meters for analyzing stereo image and phase.
- **Post-Processing**: Built-in Bloom effects for glowing visuals.
- **Smooth Animation**: Visage-inspired easing functions for fluid interactions.

## Installation

```bash
npm install chiasm
```

## Usage

```typescript
import { Viz3D, Viz3DConfig } from 'chiasm';

const canvas = document.getElementById('viz') as HTMLCanvasElement;
const config: Viz3DConfig = {
    xAmount: 128,
    zAmount: 64,
    baseHeight: 0.1,
    heightScale: 2.0,
    spacing: 0.1,
    colors: {
        background: [0.1, 0.1, 0.1],
        palette: [[0,0,1], [0,1,1], [1,1,0], [1,0,0]] 
    },
    camera: {
        angle: 45,
        zoom: -5,
        yDisplacement: -1
    }
};

const viz = new Viz3D(canvas, config);

// In your audio loop:
viz.update(magnitudes); // Float32Array
viz.draw();
```

## Credits

This library is heavily inspired by and credits the following open-source projects:
- **[SpectrexSDK](https://github.com/KoalaDSP/SpectrexSDK)** by KoalaDSP (3D Visualization concepts).
- **[Visage](https://github.com/mtytel/visage)** by Matt Tytel (Animation and Post-Processing techniques).

## License

MIT
