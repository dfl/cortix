# Demoscene-Inspired Effects Plan

## Current State
- 3D Cubes with Phong lighting
- 3D Lines (ridgeline)
- 3D Filled Ridgeline (Joy Division style)
- 2D Spectrogram
- Waveform
- Temporal smoothing
- Gammatone filterbank analysis (ERB/Bark/Mel/Log scales)

---

## Effect Ideas - Prioritized

### Tier 1: High Impact, Low-Medium Effort (Do First)

| Effect | Description | Audio Reactivity | Effort |
|--------|-------------|------------------|--------|
| **Bloom/Glow** | Post-processing HDR bloom on bright areas | Peaks glow brighter | Low |
| **Reflective Floor** | Mirror reflection below visualization | Same as viz | Low |
| **Beat Detection + Camera Shake** | Pulse camera on bass hits | Bass triggers zoom/shake | Medium |
| **Color Cycling** | HSL hue rotation through palette | Speed tied to energy | Low |
| **Particle Fountain** | Emit particles from peaks | Spawn rate = magnitude | Medium |

### Tier 2: Medium Impact, Medium Effort

| Effect | Description | Audio Reactivity | Effort |
|--------|-------------|------------------|--------|
| **Plasma Background** | Classic demoscene plasma effect | Color/speed from audio | Medium |
| **Tunnel/Starfield** | Infinite zoom tunnel or starfield | Speed from bass | Medium |
| **Water Ripples** | Ripple distortion on surface | Ripples from beats | Medium |
| **Copper Bars** | Horizontal gradient bands (Amiga style) | Band heights from freq | Low |
| **Lens Distortion** | Barrel/fisheye on peaks | Distortion from bass | Low |

### Tier 3: High Impact, High Effort (Impressive but Complex)

| Effect | Description | Audio Reactivity | Effort |
|--------|-------------|------------------|--------|
| **Liquid Metal** | Metaball/isosurface rendering | Blob sizes from bands | High |
| **Volumetric Clouds** | Ray-marched clouds | Density from spectrum | High |
| **Fire/Flames** | Procedural fire simulation | Intensity from energy | High |
| **Raymarched SDF Shapes** | Shadertoy-style distance fields | Morph with audio | High |
| **Fluid Simulation** | 2D fluid dynamics | Forces from spectrum | High |

### Tier 4: Niche/Experimental

| Effect | Description | Audio Reactivity | Effort |
|--------|-------------|------------------|--------|
| **ASCII Art Mode** | Render to ASCII characters | Brightness mapping | Medium |
| **CRT Scanlines** | Retro CRT effect | Distortion on bass | Low |
| **Glitch Effects** | RGB split, pixel sorting | Triggered by transients | Medium |
| **Kaleidoscope** | Mirror/rotate fragments | Rotation from audio | Low |
| **Feedback Loop** | Previous frame blended | Decay rate from energy | Low |

---

## Recommended Implementation Order

### Phase 1: Polish Current Viz (1-2 days)
1. **Bloom post-processing** - Makes everything look more professional
2. **Reflective floor** - Doubles visual density cheaply
3. **Beat detection** - Adds reactivity and life

### Phase 2: Classic Demoscene (2-3 days)
4. **Plasma background** - Iconic, hypnotic
5. **Copper bars** - Simple but effective
6. **Starfield/tunnel** - Depth and motion

### Phase 3: Modern Shader Effects (3-5 days)
7. **Particle system** - Versatile, impressive
8. **Water ripples** - Liquid feel
9. **Volumetric elements** - Clouds or fog

### Phase 4: Advanced (1-2 weeks)
10. **Liquid metal / metaballs**
11. **Raymarched SDFs**
12. **Fluid simulation**

---

## Technical Notes

### Bloom Implementation
```
1. Render scene to FBO
2. Extract bright pixels (threshold)
3. Blur horizontally
4. Blur vertically
5. Composite with original
```

### Beat Detection
```
1. Track bass band energy (20-200Hz)
2. Compare to running average
3. Trigger on threshold crossing
4. Decay envelope for smooth response
```

### Reflective Floor
```
1. Render scene normally
2. Render again with Y-flipped and Y-translated
3. Blend with gradient fade
```

### Plasma (Classic)
```glsl
float plasma(vec2 uv, float time) {
    float v = sin(uv.x * 10.0 + time);
    v += sin((uv.y * 10.0 + time) * 0.5);
    v += sin((uv.x + uv.y) * 10.0 + time);
    v += sin(length(uv) * 10.0 - time);
    return v * 0.25 + 0.5;
}
```

### Particle System Structure
```typescript
interface Particle {
    position: vec3;
    velocity: vec3;
    life: number;
    size: number;
    color: vec3;
}
```

---

## Questions to Consider

1. **Compositing order** - How do effects layer? Background → Main Viz → Particles → Post-process?
2. **Performance budget** - Target 60fps on mid-range GPU?
3. **Mobile support** - WebGL 1 fallback needed?
4. **User controls** - Expose effect parameters in UI?

---

## Shadertoy Inspiration Links

- Plasma: https://www.shadertoy.com/view/XsXXDn
- Metaballs: https://www.shadertoy.com/view/ld2GRz
- Clouds: https://www.shadertoy.com/view/4tdSWr
- Fire: https://www.shadertoy.com/view/MdX3zr
- Fluid: https://www.shadertoy.com/view/4tGfDW
