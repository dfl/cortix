/**
 * Demoscene-Inspired Effects Module
 *
 * Tier 1 Effects:
 * - Bloom/Glow post-processing
 * - Reflective Floor
 * - Beat Detection + Camera Shake
 * - HSL Color Cycling
 * - Particle System
 */

import { mat4, vec3 } from 'gl-matrix';

//=============================================================================
// Beat Detector
//=============================================================================

export class BeatDetector {
    private energyHistory: number[] = [];
    private historySize: number = 43; // ~1 second at 60fps
    private threshold: number = 1.2; // Lower threshold for more sensitivity
    private cooldown: number = 0;
    private cooldownFrames: number = 6; // Shorter cooldown for faster response

    // Output values
    public beatDetected: boolean = false;
    public beatIntensity: number = 0;
    public smoothedEnergy: number = 0;

    /**
     * Process frequency data and detect beats
     * @param frequencyData Normalized frequency data (0-1)
     * @param bassEndBin End bin for bass detection (default 10 = ~430Hz at 44.1kHz)
     */
    update(frequencyData: Float32Array, bassEndBin: number = 10): void {
        // Calculate bass energy (low frequencies)
        let bassEnergy = 0;
        const endBin = Math.min(bassEndBin, frequencyData.length);
        for (let i = 0; i < endBin; i++) {
            bassEnergy += frequencyData[i] * frequencyData[i];
        }
        bassEnergy = Math.sqrt(bassEnergy / endBin);

        // Update history
        this.energyHistory.push(bassEnergy);
        if (this.energyHistory.length > this.historySize) {
            this.energyHistory.shift();
        }

        // Calculate average energy
        const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
        this.smoothedEnergy = avgEnergy;

        // Beat detection with cooldown
        this.cooldown = Math.max(0, this.cooldown - 1);
        this.beatDetected = false;

        if (this.cooldown === 0 && bassEnergy > avgEnergy * this.threshold && bassEnergy > 0.1) {
            this.beatDetected = true;
            this.beatIntensity = Math.min((bassEnergy / avgEnergy - 1) * 2, 1);
            this.cooldown = this.cooldownFrames;
        }

        // Decay intensity
        this.beatIntensity *= 0.85;
    }

    setThreshold(threshold: number): void {
        this.threshold = threshold;
    }
}

//=============================================================================
// Camera Shake
//=============================================================================

export class CameraShake {
    private shakeIntensity: number = 0;
    private shakeDecay: number = 0.7; // Fast decay for snappy response
    private offsetX: number = 0;
    private offsetY: number = 0;
    private offsetZ: number = 0;
    private zoomPulse: number = 0;

    trigger(intensity: number): void {
        // Strong initial hit
        this.shakeIntensity = Math.max(this.shakeIntensity, intensity * 2.0);
    }

    update(): { offsetX: number; offsetY: number; offsetZ: number; zoomPulse: number } {
        if (this.shakeIntensity > 0.01) {
            // Strong but brief shake
            this.offsetX = (Math.random() - 0.5) * this.shakeIntensity * 0.15;
            this.offsetY = (Math.random() - 0.5) * this.shakeIntensity * 0.1;
            this.offsetZ = (Math.random() - 0.5) * this.shakeIntensity * 0.05;
            this.zoomPulse = this.shakeIntensity * 0.3;
            this.shakeIntensity *= this.shakeDecay;
        } else {
            this.shakeIntensity = 0;
            this.offsetX = 0;
            this.offsetY = 0;
            this.offsetZ = 0;
            this.zoomPulse *= 0.8;
        }

        return {
            offsetX: this.offsetX,
            offsetY: this.offsetY,
            offsetZ: this.offsetZ,
            zoomPulse: this.zoomPulse
        };
    }
}

//=============================================================================
// HSL Color Cycling
//=============================================================================

export class ColorCycler {
    private hue: number = 0;
    private speed: number = 2.0; // Degrees per frame base (faster cycling)
    private energyMultiplier: number = 5.0; // More responsive to energy

    update(energy: number): void {
        const speedBoost = 1 + energy * this.energyMultiplier;
        this.hue = (this.hue + this.speed * speedBoost) % 360;
    }

    /**
     * Get a palette of colors based on current hue
     * @param count Number of colors
     * @param saturation 0-1
     * @param lightness 0-1
     */
    getPalette(count: number, saturation: number = 0.7, lightness: number = 0.5): [number, number, number][] {
        const palette: [number, number, number][] = [];
        for (let i = 0; i < count; i++) {
            const h = (this.hue + i * (360 / count)) % 360;
            palette.push(this.hslToRgb(h, saturation, lightness));
        }
        return palette;
    }

    private hslToRgb(h: number, s: number, l: number): [number, number, number] {
        h /= 360;
        let r: number, g: number, b: number;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [r, g, b];
    }

    setSpeed(speed: number): void {
        this.speed = speed;
    }

    getHue(): number {
        return this.hue;
    }
}

//=============================================================================
// Particle System
//=============================================================================

interface Particle {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    size: number;
    color: [number, number, number];
}

export class ParticleSystem {
    private gl: WebGL2RenderingContext;
    private particles: Particle[] = [];
    private maxParticles: number = 2000;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private positionBuffer!: WebGLBuffer;
    private colorBuffer!: WebGLBuffer;
    private sizeBuffer!: WebGLBuffer;

    // Pre-allocated arrays for GPU upload
    private positions: Float32Array;
    private colors: Float32Array;
    private sizes: Float32Array;

    constructor(gl: WebGL2RenderingContext, maxParticles: number = 2000) {
        this.gl = gl;
        this.maxParticles = maxParticles;

        this.positions = new Float32Array(maxParticles * 3);
        this.colors = new Float32Array(maxParticles * 4);
        this.sizes = new Float32Array(maxParticles);

        this.program = this.initShaders();
        this.vao = this.initBuffers();
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec4 aColor;
        layout(location = 2) in float aSize;

        uniform mat4 uViewProjection;
        uniform mat4 uModel;

        out vec4 vColor;

        void main() {
            vColor = aColor;
            vec4 mvPosition = uViewProjection * uModel * vec4(aPosition, 1.0);
            gl_Position = mvPosition;
            // Size attenuation - tiny sparkles
            gl_PointSize = aSize * (25.0 / max(-mvPosition.z, 0.1));
        }
        `;

        const fs = `#version 300 es
        precision mediump float;

        in vec4 vColor;
        out vec4 fragColor;

        void main() {
            // Sharp sparkle particle
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);
            if (dist > 0.5) discard;

            // Brighter center, sharp falloff for sparkle look
            float glow = exp(-dist * 6.0);
            float alpha = vColor.a * glow * 0.6;
            fragColor = vec4(vColor.rgb, alpha);
        }
        `;

        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initBuffers(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // Position buffer
        this.positionBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        // Color buffer
        this.colorBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);

        // Size buffer
        this.sizeBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.sizes, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(2);

        gl.bindVertexArray(null);
        return vao;
    }

    /**
     * Emit particles based on frequency data
     */
    emit(frequencyData: Float32Array, palette: [number, number, number][], threshold: number = 0.5): void {
        const numBands = Math.min(frequencyData.length, 64);
        const bandWidth = 1.0 / numBands;

        for (let i = 0; i < numBands; i++) {
            const magnitude = frequencyData[i];
            if (magnitude > threshold && Math.random() < magnitude * 0.3) {
                if (this.particles.length >= this.maxParticles) {
                    // Remove oldest
                    this.particles.shift();
                }

                const x = (i / numBands - 0.5) * 1.0;
                const colorIdx = i % palette.length;
                const color = palette[colorIdx];

                this.particles.push({
                    x: x + (Math.random() - 0.5) * bandWidth,
                    y: magnitude * 0.5,
                    z: (Math.random() - 0.5) * 0.2,
                    vx: (Math.random() - 0.5) * 0.02,
                    vy: 0.02 + Math.random() * 0.03 * magnitude,
                    vz: (Math.random() - 0.5) * 0.01,
                    life: 1.0,
                    maxLife: 0.5 + Math.random() * 1.0,
                    size: 1 + magnitude * 2, // Small sparkles
                    color: color
                });
            }
        }
    }

    /**
     * Emit burst of particles at a position - fast scattered spray
     */
    burst(x: number, y: number, z: number, count: number, color: [number, number, number]): void {
        for (let i = 0; i < count && this.particles.length < this.maxParticles; i++) {
            const angle = Math.random() * Math.PI * 2;
            const elevation = Math.random() * Math.PI * 0.5; // Upward bias
            const speed = 0.05 + Math.random() * 0.1; // Faster

            this.particles.push({
                x: x + (Math.random() - 0.5) * 0.1,
                y: y,
                z: z + (Math.random() - 0.5) * 0.1,
                vx: Math.cos(angle) * Math.cos(elevation) * speed,
                vy: Math.sin(elevation) * speed + 0.02,
                vz: Math.sin(angle) * Math.cos(elevation) * speed,
                life: 1.0,
                maxLife: 0.4 + Math.random() * 0.6,
                size: 1 + Math.random() * 2, // Tiny
                color
            });
        }
    }

    update(deltaTime: number): void {
        const gravity = -0.05;
        const drag = 0.98;

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];

            // Physics
            p.vy += gravity * deltaTime;
            p.vx *= drag;
            p.vy *= drag;
            p.vz *= drag;

            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;

            // Life decay
            p.life -= deltaTime / p.maxLife;

            // Remove dead particles
            if (p.life <= 0 || p.y < -1) {
                this.particles.splice(i, 1);
            }
        }
    }

    draw(viewProjection: mat4, model: mat4): void {
        const gl = this.gl;
        const count = this.particles.length;
        if (count === 0) return;

        // Update buffers
        for (let i = 0; i < count; i++) {
            const p = this.particles[i];
            this.positions[i * 3] = p.x;
            this.positions[i * 3 + 1] = p.y;
            this.positions[i * 3 + 2] = p.z;

            this.colors[i * 4] = p.color[0];
            this.colors[i * 4 + 1] = p.color[1];
            this.colors[i * 4 + 2] = p.color[2];
            this.colors[i * 4 + 3] = p.life;

            this.sizes[i] = p.size * p.life;
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions.subarray(0, count * 3));

        gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors.subarray(0, count * 4));

        gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sizes.subarray(0, count));

        // Draw
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uViewProjection'), false, viewProjection);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uModel'), false, model);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending
        gl.depthMask(false); // Don't write to depth buffer

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.POINTS, 0, count);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    getParticleCount(): number {
        return this.particles.length;
    }
}

//=============================================================================
// Enhanced Bloom Effect
//=============================================================================

export class BloomEffect {
    private gl: WebGL2RenderingContext;
    private width: number;
    private height: number;

    // Scene capture FBO
    private sceneFbo: WebGLFramebuffer | null = null;
    private sceneTexture: WebGLTexture | null = null;
    private sceneDepth: WebGLRenderbuffer | null = null;

    // Reflection capture FBO
    private reflectionFbo: WebGLFramebuffer | null = null;
    private reflectionTexture: WebGLTexture | null = null;
    private reflectionDepth: WebGLRenderbuffer | null = null;

    // Ping-pong blur buffers
    private blurFbo1: WebGLFramebuffer | null = null;
    private blurTex1: WebGLTexture | null = null;
    private blurFbo2: WebGLFramebuffer | null = null;
    private blurTex2: WebGLTexture | null = null;

    // Shaders
    private blurProgram!: WebGLProgram;
    private compositeProgram!: WebGLProgram;
    private highPassProgram!: WebGLProgram;

    // Quad VAO
    private quadVao!: WebGLVertexArrayObject;

    // Parameters
    public threshold: number = 0.7; // Higher = only bright parts glow
    public intensity: number = 0.8; // Subtle bloom
    public blurPasses: number = 3;  // Fewer passes

    // Float texture support
    private useFloatTextures: boolean = false;

    constructor(gl: WebGL2RenderingContext, width: number, height: number) {
        this.gl = gl;
        this.width = width;
        this.height = height;

        // Check for float texture rendering support
        const floatExt = gl.getExtension('EXT_color_buffer_float');
        this.useFloatTextures = floatExt !== null;

        this.initShaders();
        this.initFramebuffers();
        this.initQuad();
    }

    private initFramebuffers(): void {
        const gl = this.gl;

        // Scene FBO (full resolution with depth)
        this.sceneFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);

        this.sceneTexture = this.createTexture(this.width, this.height);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0);

        this.sceneDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.sceneDepth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.width, this.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.sceneDepth);

        this.checkFramebuffer('Scene FBO');

        // Reflection FBO (half resolution for performance)
        const rw = Math.floor(this.width / 2);
        const rh = Math.floor(this.height / 2);

        this.reflectionFbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflectionFbo);

        this.reflectionTexture = this.createTexture(rw, rh);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.reflectionTexture, 0);

        this.reflectionDepth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.reflectionDepth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, rw, rh);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.reflectionDepth);

        this.checkFramebuffer('Reflection FBO');

        // Blur FBOs (half resolution)
        const w2 = Math.floor(this.width / 2);
        const h2 = Math.floor(this.height / 2);

        this.blurTex1 = this.createTexture(w2, h2);
        this.blurFbo1 = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo1);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTex1, 0);

        this.checkFramebuffer('Blur FBO 1');

        this.blurTex2 = this.createTexture(w2, h2);
        this.blurFbo2 = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo2);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTex2, 0);

        this.checkFramebuffer('Blur FBO 2');

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    private checkFramebuffer(name: string): void {
        const gl = this.gl;
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            const statusName = this.getFramebufferStatusName(status);
            console.warn(`BloomEffect: ${name} incomplete: ${statusName}. Float textures: ${this.useFloatTextures}`);
        }
    }

    private getFramebufferStatusName(status: number): string {
        const gl = this.gl;
        switch (status) {
            case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT: return 'INCOMPLETE_ATTACHMENT';
            case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: return 'MISSING_ATTACHMENT';
            case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS: return 'INCOMPLETE_DIMENSIONS';
            case gl.FRAMEBUFFER_UNSUPPORTED: return 'UNSUPPORTED';
            default: return `UNKNOWN (${status})`;
        }
    }

    private createTexture(w: number, h: number): WebGLTexture {
        const gl = this.gl;
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);

        if (this.useFloatTextures) {
            // HDR texture for better bloom quality
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        } else {
            // Fallback to standard 8-bit texture
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    private initShaders(): void {
        const vs = `#version 300 es
        layout(location = 0) in vec2 aPosition;
        out vec2 vUv;
        void main() {
            vUv = aPosition * 0.5 + 0.5;
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }`;

        const fsHighPass = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        uniform float uThreshold;

        void main() {
            vec4 color = texture(uTexture, vUv);
            float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            float contribution = max(brightness - uThreshold, 0.0) / max(brightness, 0.001);
            fragColor = vec4(color.rgb * contribution, 1.0);
        }`;

        const fsBlur = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        uniform vec2 uDirection;

        void main() {
            vec2 texelSize = 1.0 / vec2(textureSize(uTexture, 0));
            vec3 result = vec3(0.0);

            // 9-tap Gaussian
            float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

            result += texture(uTexture, vUv).rgb * weights[0];
            for (int i = 1; i < 5; i++) {
                vec2 offset = uDirection * texelSize * float(i) * 1.5;
                result += texture(uTexture, vUv + offset).rgb * weights[i];
                result += texture(uTexture, vUv - offset).rgb * weights[i];
            }

            fragColor = vec4(result, 1.0);
        }`;

        const fsComposite = `#version 300 es
        precision highp float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uScene;
        uniform sampler2D uBloom;
        uniform float uIntensity;

        void main() {
            vec3 scene = texture(uScene, vUv).rgb;
            vec3 bloom = texture(uBloom, vUv).rgb;

            // Additive blend with intensity
            vec3 result = scene + bloom * uIntensity;

            // Simple tone mapping
            result = result / (result + vec3(1.0));

            // Gamma correction
            result = pow(result, vec3(1.0 / 2.2));

            fragColor = vec4(result, 1.0);
        }`;

        this.highPassProgram = this.createProgram(vs, fsHighPass);
        this.blurProgram = this.createProgram(vs, fsBlur);
        this.compositeProgram = this.createProgram(vs, fsComposite);
    }

    private createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initQuad(): void {
        const gl = this.gl;
        this.quadVao = gl.createVertexArray()!;
        gl.bindVertexArray(this.quadVao);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindVertexArray(null);
    }

    /**
     * Begin rendering to the scene FBO
     */
    beginScene(): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
        gl.viewport(0, 0, this.width, this.height);
    }

    /**
     * End scene rendering and apply bloom
     */
    endScene(): void {
        const gl = this.gl;
        const w2 = Math.floor(this.width / 2);
        const h2 = Math.floor(this.height / 2);

        // Disable depth testing for post-processing
        gl.disable(gl.DEPTH_TEST);

        // 1. High-pass filter
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo1);
        gl.viewport(0, 0, w2, h2);
        gl.useProgram(this.highPassProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(gl.getUniformLocation(this.highPassProgram, 'uTexture'), 0);
        gl.uniform1f(gl.getUniformLocation(this.highPassProgram, 'uThreshold'), this.threshold);
        this.drawQuad();

        // 2. Blur passes
        gl.useProgram(this.blurProgram);
        for (let i = 0; i < this.blurPasses; i++) {
            // Horizontal
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo2);
            gl.bindTexture(gl.TEXTURE_2D, this.blurTex1);
            gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'uDirection'), 1, 0);
            this.drawQuad();

            // Vertical
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo1);
            gl.bindTexture(gl.TEXTURE_2D, this.blurTex2);
            gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'uDirection'), 0, 1);
            this.drawQuad();
        }

        // 3. Composite to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.compositeProgram);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uScene'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.blurTex1);
        gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uBloom'), 1);

        gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'uIntensity'), this.intensity);
        this.drawQuad();

        gl.enable(gl.DEPTH_TEST);
    }

    /**
     * Begin rendering to reflection FBO (half resolution for performance).
     * Call this before rendering the scene with a flipped camera.
     */
    beginReflection(): void {
        const gl = this.gl;
        const rw = Math.floor(this.width / 2);
        const rh = Math.floor(this.height / 2);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.reflectionFbo);
        gl.viewport(0, 0, rw, rh);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    /**
     * End reflection capture and restore main framebuffer.
     */
    endReflection(): void {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.width, this.height);
    }

    /**
     * Get the reflection texture for use by ReflectiveFloor.
     */
    getReflectionTexture(): WebGLTexture | null {
        return this.reflectionTexture;
    }

    /**
     * Get the scene texture (useful for screen-space effects).
     */
    getSceneTexture(): WebGLTexture | null {
        return this.sceneTexture;
    }

    private drawQuad(): void {
        this.gl.bindVertexArray(this.quadVao);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }

    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        // Recreate framebuffers
        this.initFramebuffers();
    }
}

//=============================================================================
// Reflective Floor
//=============================================================================

export class ReflectiveFloor {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;

    public opacity: number = 0.5;
    public fadeStart: number = 0.0;
    public fadeEnd: number = 0.9;

    // Ripple system - up to 8 concurrent ripples
    private ripples: { x: number; z: number; time: number; intensity: number }[] = [];
    private maxRipples: number = 8;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = this.initShaders();
        this.vao = this.initBuffers();
    }

    /**
     * Trigger a ripple at a position (normalized -1 to 1)
     */
    triggerRipple(x: number = 0, z: number = 0, intensity: number = 1.0): void {
        // Add some randomness to position
        x += (Math.random() - 0.5) * 0.3;
        z += (Math.random() - 0.5) * 0.3;

        this.ripples.push({ x, z, time: 0, intensity });

        // Remove oldest if too many
        if (this.ripples.length > this.maxRipples) {
            this.ripples.shift();
        }
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in vec2 aUv;

        uniform mat4 uViewProjection;
        uniform mat4 uModel;

        out vec2 vUv;
        out vec3 vWorldPos;

        void main() {
            vUv = aUv;
            vec4 worldPos = uModel * vec4(aPosition, 1.0);
            vWorldPos = worldPos.xyz;
            gl_Position = uViewProjection * worldPos;
        }
        `;

        // Water ripple floor effect
        const fs = `#version 300 es
        precision highp float;

        in vec2 vUv;
        in vec3 vWorldPos;
        out vec4 fragColor;

        uniform sampler2D uReflection;
        uniform float uOpacity;
        uniform float uFadeStart;
        uniform float uFadeEnd;
        uniform float uTime;

        // Ripple data: vec4(x, z, time, intensity) for up to 8 ripples
        uniform vec4 uRipples[8];
        uniform int uRippleCount;

        float rippleWave(vec2 pos, vec2 center, float time, float intensity) {
            float dist = length(pos - center);
            float rippleRadius = time * 1.5; // Expansion speed
            float rippleWidth = 0.15;

            // Ring wave
            float ring = exp(-pow((dist - rippleRadius) / rippleWidth, 2.0));

            // Fade out over time and distance
            float timeFade = exp(-time * 2.0);
            float distFade = exp(-dist * 0.5);

            return ring * timeFade * distFade * intensity;
        }

        void main() {
            vec2 floorPos = vWorldPos.xz;

            // Calculate total ripple displacement
            float rippleHeight = 0.0;
            vec2 rippleNormal = vec2(0.0);

            for (int i = 0; i < 8; i++) {
                if (i >= uRippleCount) break;
                vec4 r = uRipples[i];
                vec2 center = r.xy;
                float time = r.z;
                float intensity = r.w;

                float wave = rippleWave(floorPos, center, time, intensity);
                rippleHeight += wave;

                // Calculate normal offset for refraction effect
                vec2 toCenter = normalize(floorPos - center + 0.001);
                rippleNormal += toCenter * wave * 0.1;
            }

            // Sample scene with ripple distortion
            vec2 sampleUv = vec2(vUv.x, 0.3 + vUv.y * 0.4);
            sampleUv += rippleNormal;

            vec3 sceneColor = texture(uReflection, clamp(sampleUv, 0.0, 1.0)).rgb;

            // Distance-based fade
            float dist = length(vUv - vec2(0.5, 0.0));
            float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, dist);
            fade = pow(fade, 1.5);

            // Base water color (dark blue-ish)
            vec3 waterColor = vec3(0.02, 0.04, 0.08);

            // Ripple highlights
            float rippleHighlight = rippleHeight * 0.8;

            // Mix scene reflection with water
            vec3 floorColor = mix(waterColor, sceneColor * 0.4, 0.5 + rippleHeight * 0.3);
            floorColor += vec3(0.3, 0.5, 0.7) * rippleHighlight; // Blue-ish ripple highlight

            // Specular-like highlight in center
            float centerHighlight = exp(-dist * 4.0) * 0.1;
            floorColor += vec3(centerHighlight);

            fragColor = vec4(floorColor, uOpacity * fade);
        }
        `;

        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initBuffers(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // Floor quad (below Y=0)
        const vertices = new Float32Array([
            // Position (x, y, z), UV (u, v)
            -1, 0, -1,  0, 0,
             1, 0, -1,  1, 0,
            -1, 0,  1,  0, 1,
            -1, 0,  1,  0, 1,
             1, 0, -1,  1, 0,
             1, 0,  1,  1, 1,
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * 4, 0);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * 4, 3 * 4);
        gl.enableVertexAttribArray(1);

        gl.bindVertexArray(null);
        return vao;
    }

    draw(viewProjection: mat4, model: mat4, reflectionTexture: WebGLTexture, time: number = 0, deltaTime: number = 0.016): void {
        const gl = this.gl;

        // Update ripples
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            this.ripples[i].time += deltaTime;
            // Remove ripples that have faded out (after ~2 seconds)
            if (this.ripples[i].time > 2.0) {
                this.ripples.splice(i, 1);
            }
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false); // Don't write to depth for transparent floor

        gl.useProgram(this.program);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uViewProjection'), false, viewProjection);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'uModel'), false, model);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, reflectionTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uReflection'), 0);

        gl.uniform1f(gl.getUniformLocation(this.program, 'uOpacity'), this.opacity);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uFadeStart'), this.fadeStart);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uFadeEnd'), this.fadeEnd);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uTime'), time);

        // Pass ripple data
        gl.uniform1i(gl.getUniformLocation(this.program, 'uRippleCount'), this.ripples.length);
        const rippleData = new Float32Array(32); // 8 ripples * 4 floats
        for (let i = 0; i < this.ripples.length && i < 8; i++) {
            const r = this.ripples[i];
            rippleData[i * 4 + 0] = r.x;
            rippleData[i * 4 + 1] = r.z;
            rippleData[i * 4 + 2] = r.time;
            rippleData[i * 4 + 3] = r.intensity;
        }
        gl.uniform4fv(gl.getUniformLocation(this.program, 'uRipples'), rippleData);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}

//=============================================================================
// Performance Monitor
//=============================================================================

export class PerformanceMonitor {
    private frameTimesMs: number[] = [];
    private maxSamples: number = 60;
    private lastFrameTime: number = 0;
    private gpuTimerExt: any = null;
    private gl: WebGL2RenderingContext | null = null;

    // Double-buffered GPU queries for async readback
    private gpuQueries: [WebGLQuery | null, WebGLQuery | null] = [null, null];
    private currentQueryIndex: number = 0;
    private queryActive: boolean = false;
    private queryUsed: [boolean, boolean] = [false, false]; // Track if query has been used

    // Public stats
    public fps: number = 0;
    public frameMsAvg: number = 0;
    public frameMsMax: number = 0;
    public gpuMs: number = 0;

    constructor(gl?: WebGL2RenderingContext) {
        if (gl) {
            this.gl = gl;
            // Try to get GPU timer extension
            this.gpuTimerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
            if (this.gpuTimerExt) {
                this.gpuQueries[0] = gl.createQuery();
                this.gpuQueries[1] = gl.createQuery();
            }
        }
        this.lastFrameTime = performance.now();
    }

    beginFrame(): void {
        if (this.gl && this.gpuTimerExt && this.gpuQueries[this.currentQueryIndex]) {
            // Read result from previous frame's query (the other buffer)
            const readIndex = 1 - this.currentQueryIndex;
            const readQuery = this.gpuQueries[readIndex];

            // Only read if the query has been used before
            if (readQuery && this.queryUsed[readIndex]) {
                const available = this.gl.getQueryParameter(readQuery, this.gl.QUERY_RESULT_AVAILABLE);
                const disjoint = this.gl.getParameter(this.gpuTimerExt.GPU_DISJOINT_EXT);

                if (available && !disjoint) {
                    const timeElapsed = this.gl.getQueryParameter(readQuery, this.gl.QUERY_RESULT);
                    this.gpuMs = timeElapsed / 1000000; // Convert ns to ms
                }
            }

            // Begin new query
            this.gl.beginQuery(this.gpuTimerExt.TIME_ELAPSED_EXT, this.gpuQueries[this.currentQueryIndex]!);
            this.queryActive = true;
        }
    }

    endFrame(): void {
        const now = performance.now();
        const frameMs = now - this.lastFrameTime;
        this.lastFrameTime = now;

        // Track frame times
        this.frameTimesMs.push(frameMs);
        if (this.frameTimesMs.length > this.maxSamples) {
            this.frameTimesMs.shift();
        }

        // Calculate stats
        this.frameMsAvg = this.frameTimesMs.reduce((a, b) => a + b, 0) / this.frameTimesMs.length;
        this.frameMsMax = Math.max(...this.frameTimesMs);
        this.fps = 1000 / this.frameMsAvg;

        // End GPU query and swap buffers
        if (this.gl && this.gpuTimerExt && this.queryActive) {
            this.gl.endQuery(this.gpuTimerExt.TIME_ELAPSED_EXT);
            this.queryUsed[this.currentQueryIndex] = true; // Mark as used
            this.queryActive = false;
            // Swap to the other query buffer for next frame
            this.currentQueryIndex = 1 - this.currentQueryIndex;
        }
    }

    getStats(): { fps: number; cpuMs: number; gpuMs: number; maxMs: number } {
        return {
            fps: Math.round(this.fps),
            cpuMs: this.frameMsAvg,
            gpuMs: this.gpuMs,
            maxMs: this.frameMsMax
        };
    }

    /**
     * Render stats overlay (call from 2D canvas context)
     */
    drawOverlay(ctx: CanvasRenderingContext2D, x: number, y: number): void {
        const stats = this.getStats();

        ctx.save();
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, 95, 52);

        // FPS bar
        const fpsRatio = Math.min(stats.fps / 60, 1);
        const fpsColor = stats.fps >= 55 ? '#0f0' : stats.fps >= 30 ? '#ff0' : '#f00';

        ctx.fillStyle = '#333';
        ctx.fillRect(x + 4, y + 4, 87, 8);
        ctx.fillStyle = fpsColor;
        ctx.fillRect(x + 4, y + 4, 87 * fpsRatio, 8);

        // Text
        ctx.fillStyle = '#fff';
        ctx.fillText(`FPS: ${stats.fps}`, x + 4, y + 24);
        ctx.fillText(`CPU: ${stats.cpuMs.toFixed(1)}ms`, x + 4, y + 36);
        if (this.gpuTimerExt) {
            ctx.fillText(`GPU: ${stats.gpuMs.toFixed(1)}ms`, x + 4, y + 48);
        }

        ctx.restore();
    }

    /**
     * Get formatted string for console/simple display
     */
    toString(): string {
        const stats = this.getStats();
        return `${stats.fps} FPS | ${stats.cpuMs.toFixed(1)}ms`;
    }
}

//=============================================================================
// Export all effects
//=============================================================================

export interface EffectsConfig {
    bloom: boolean;
    bloomThreshold: number;
    bloomIntensity: number;
    reflection: boolean;
    reflectionOpacity: number;
    beatDetection: boolean;
    cameraShake: boolean;
    colorCycling: boolean;
    particles: boolean;
}

export const defaultEffectsConfig: EffectsConfig = {
    bloom: true,
    bloomThreshold: 0.5,
    bloomIntensity: 1.2,
    reflection: true,
    reflectionOpacity: 0.25,
    beatDetection: true,
    cameraShake: true,
    colorCycling: true,
    particles: true
};

//=============================================================================
// TIER 2 EFFECTS
//=============================================================================

//=============================================================================
// Plasma Background - Gammatone ERB Reactive Demoscene Effect
//=============================================================================

export class PlasmaBackground {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private time: number = 0;

    // Audio-reactive parameters
    public speed: number = 1.0;
    public scale: number = 3.0;
    public colorShift: number = 0.0;
    public intensity: number = 1.0;

    // Smoothed band values for interpolation
    private smoothedBands: Float32Array = new Float32Array(16);
    private bass: number = 0;
    private mids: number = 0;
    private highs: number = 0;
    private energy: number = 0;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = this.initShaders();
        this.vao = this.initQuad();
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec2 aPosition;
        out vec2 vUv;
        void main() {
            vUv = aPosition * 0.5 + 0.5;
            gl_Position = vec4(aPosition, 0.999, 1.0);
        }`;

        // Gammatone ERB reactive plasma shader
        const fs = `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform float uTime;
        uniform float uScale;
        uniform float uColorShift;
        uniform float uIntensity;

        // Gammatone frequency bands (16 bands from sub-bass to brilliance)
        uniform float uBands[16];

        // Derived values from bands
        uniform float uBass;      // Sub-bass + bass energy
        uniform float uMids;      // Mid frequencies
        uniform float uHighs;     // High frequencies
        uniform float uEnergy;    // Overall energy

        // Gammatone-reactive plasma with per-band layers
        float plasma(vec2 uv, float time) {
            float v = 0.0;

            // Layer 1: Bass-driven horizontal waves (pumping effect)
            float bassScale = uScale * (1.0 + uBass * 2.0);
            v += sin(uv.x * bassScale * 8.0 + time * (1.0 + uBass)) * (0.8 + uBass * 0.5);

            // Layer 2: Mid-driven vertical waves
            float midSpeed = 0.7 + uMids * 1.5;
            v += sin((uv.y * uScale * 10.0 + time * midSpeed) * 0.7) * (0.7 + uMids * 0.4);

            // Layer 3: High-frequency shimmer on diagonal
            float highFreq = 10.0 + uHighs * 15.0;
            v += sin((uv.x + uv.y) * highFreq + time * 2.0) * uHighs * 0.8;

            // Layer 4: Bass-pulsing radial (breathing effect)
            float cx = uv.x - 0.5 + 0.3 * sin(time * 0.3) * (1.0 + uBass);
            float cy = uv.y - 0.5 + 0.3 * cos(time * 0.4) * (1.0 + uBass);
            float radialScale = uScale * (1.0 + uBass * 0.5);
            v += sin(sqrt(cx * cx + cy * cy + 0.01) * radialScale * 12.0 - time * 1.5);

            // Layer 5: Per-band concentric rings (frequency-reactive ripples)
            // Each ERB band creates its own ripple layer
            float dist = length(uv - 0.5);
            for (int i = 0; i < 8; i++) {
                float bandVal = uBands[i * 2] + uBands[i * 2 + 1];
                float ringFreq = 5.0 + float(i) * 3.0;
                float ringPhase = time * (0.5 + float(i) * 0.2);
                v += sin(dist * ringFreq - ringPhase) * bandVal * 0.4;
            }

            return v * 0.15;
        }

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
            vec2 uv = vUv;

            // Bass-reactive UV distortion (warping on bass hits)
            float dist = length(uv - 0.5);
            float distortAngle = atan(uv.y - 0.5, uv.x - 0.5);
            float distortAmount = uBass * 0.08 * sin(dist * 15.0 - uTime * 3.0);
            uv.x += cos(distortAngle) * distortAmount;
            uv.y += sin(distortAngle) * distortAmount;

            // Calculate plasma value
            float v = plasma(uv, uTime);

            // Hue: base from plasma + color shift + high frequency sparkle
            float hue = fract(v * 0.5 + 0.5 + uColorShift + uHighs * 0.15 * sin(uTime * 5.0));

            // Saturation: boosted by mids
            float sat = 0.7 + 0.25 * sin(v * 3.14159) + uMids * 0.2;
            sat = clamp(sat, 0.0, 1.0);

            // Value: bass pulses brightness
            float val = 0.3 + 0.25 * cos(v * 3.14159 * 2.0);
            val += uBass * 0.5;  // Bass brightness boost
            val += uEnergy * 0.2;  // Overall energy boost
            val = clamp(val, 0.0, 1.0);

            vec3 color = hsv2rgb(vec3(hue, sat, val));

            // High-frequency white sparkle overlay
            float sparkle = sin(uv.x * 50.0 + uTime * 10.0) * sin(uv.y * 50.0 - uTime * 8.0);
            sparkle = max(0.0, sparkle) * uHighs * 0.6;
            color += vec3(sparkle);

            // Apply intensity
            color *= uIntensity;

            // Vignette
            float vignette = 1.0 - dist * 0.5;
            color *= vignette;

            fragColor = vec4(color, 1.0);
        }`;

        return this.createProgram(vs, fs);
    }

    private createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initQuad(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindVertexArray(null);
        return vao;
    }

    /**
     * Update plasma with Gammatone ERB frequency band data
     * @param deltaTime Frame delta time in seconds
     * @param bands Frequency band data from Gammatone ERB analysis, normalized 0-1
     */
    update(deltaTime: number, bands?: Float32Array): void {
        if (bands && bands.length > 0) {
            // Resample input bands to 16 buckets with smoothing
            const step = bands.length / 16;
            for (let i = 0; i < 16; i++) {
                const idx = Math.floor(i * step);
                const target = bands[idx] || 0;
                // Smooth with fast attack, slower release
                if (target > this.smoothedBands[i]) {
                    this.smoothedBands[i] += (target - this.smoothedBands[i]) * 0.7; // Fast attack
                } else {
                    this.smoothedBands[i] += (target - this.smoothedBands[i]) * 0.1; // Slow release
                }
            }

            // Calculate band ranges (based on ERB distribution)
            // Bands 0-3: Sub-bass to bass (~20-200Hz)
            // Bands 4-9: Mids (~200-2000Hz)
            // Bands 10-15: Highs (~2000-20000Hz)
            this.bass = 0;
            this.mids = 0;
            this.highs = 0;
            for (let i = 0; i < 4; i++) this.bass += this.smoothedBands[i];
            for (let i = 4; i < 10; i++) this.mids += this.smoothedBands[i];
            for (let i = 10; i < 16; i++) this.highs += this.smoothedBands[i];

            this.bass /= 4;
            this.mids /= 6;
            this.highs /= 6;
            this.energy = (this.bass + this.mids + this.highs) / 3;
        }

        // Speed up plasma based on energy and bass
        const speedBoost = 1.0 + this.energy * 2.0 + this.bass * 1.5;
        this.time += deltaTime * this.speed * speedBoost;

        // Shift colors based on mids
        this.colorShift += deltaTime * (0.1 + this.mids * 0.5);
    }

    /**
     * Draw plasma with current band state
     */
    draw(): void {
        const gl = this.gl;

        gl.useProgram(this.program);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uTime'), this.time);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uScale'), this.scale);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uColorShift'), this.colorShift);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uIntensity'), this.intensity);

        // Pass band data and derived values
        gl.uniform1fv(gl.getUniformLocation(this.program, 'uBands'), this.smoothedBands);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uBass'), this.bass);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uMids'), this.mids);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uHighs'), this.highs);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uEnergy'), this.energy);

        // Draw behind everything (depth = 0.999)
        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.depthMask(true);
    }
}

//=============================================================================
// Starfield - Infinite Zoom Tunnel Effect
//=============================================================================

interface Star {
    x: number;
    y: number;
    z: number;
    size: number;
}

export class Starfield {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private positionBuffer: WebGLBuffer;
    private sizeBuffer: WebGLBuffer;

    private stars: Star[] = [];
    private positions: Float32Array;
    private sizes: Float32Array;

    public starCount: number = 1000;
    public speed: number = 1.0;
    public spread: number = 2.0;
    public depth: number = 10.0;
    public starColor: [number, number, number] = [1.0, 1.0, 1.0];
    public trailLength: number = 0.0;

    // Smoothed band values
    private bass: number = 0;
    private mids: number = 0;
    private highs: number = 0;
    private hue: number = 0;

    constructor(gl: WebGL2RenderingContext, starCount: number = 1000) {
        this.gl = gl;
        this.starCount = starCount;
        this.positions = new Float32Array(starCount * 3);
        this.sizes = new Float32Array(starCount);

        this.initStars();
        this.program = this.initShaders();
        const buffers = this.initBuffers();
        this.vao = buffers.vao;
        this.positionBuffer = buffers.positionBuffer;
        this.sizeBuffer = buffers.sizeBuffer;
    }

    private initStars(): void {
        this.stars = [];
        for (let i = 0; i < this.starCount; i++) {
            this.stars.push({
                x: (Math.random() - 0.5) * this.spread * 2,
                y: (Math.random() - 0.5) * this.spread * 2,
                z: Math.random() * this.depth,
                size: 1 + Math.random() * 2
            });
        }
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec3 aPosition;
        layout(location = 1) in float aSize;

        uniform float uAspect;
        uniform float uTrailLength;

        out float vAlpha;
        out float vTrail;

        void main() {
            // Project from 3D to 2D with perspective
            float z = max(aPosition.z, 0.1);
            float scale = 1.0 / z;

            vec2 screenPos = aPosition.xy * scale;
            screenPos.x /= uAspect;

            gl_Position = vec4(screenPos, 0.5, 1.0);

            // Size based on distance (closer = bigger)
            gl_PointSize = aSize * scale * 50.0;

            // Alpha based on depth (far = dimmer)
            vAlpha = 1.0 - (z / 10.0);
            vAlpha = clamp(vAlpha * vAlpha, 0.0, 1.0);

            // Trail effect
            vTrail = uTrailLength;
        }`;

        const fs = `#version 300 es
        precision highp float;

        in float vAlpha;
        in float vTrail;
        out vec4 fragColor;

        uniform vec3 uColor;

        void main() {
            vec2 coord = gl_PointCoord - vec2(0.5);
            float dist = length(coord);

            // Star shape with glow
            float core = exp(-dist * 8.0);
            float glow = exp(-dist * 3.0) * 0.3;
            float brightness = core + glow;

            // Streak/trail effect (elongate when moving fast)
            if (vTrail > 0.0) {
                // Elongate in Y direction (direction of travel)
                float streak = exp(-abs(coord.x) * 20.0) * exp(-coord.y * 5.0);
                brightness += streak * vTrail * 0.5;
            }

            float alpha = brightness * vAlpha;
            if (alpha < 0.01) discard;

            fragColor = vec4(uColor * brightness, alpha);
        }`;

        return this.createProgram(vs, fs);
    }

    private createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initBuffers(): { vao: WebGLVertexArrayObject; positionBuffer: WebGLBuffer; sizeBuffer: WebGLBuffer } {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const positionBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        const sizeBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.sizes, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);

        gl.bindVertexArray(null);
        return { vao, positionBuffer, sizeBuffer };
    }

    /**
     * Update starfield with Gammatone ERB frequency band data
     * @param deltaTime Frame delta time in seconds
     * @param bands Frequency band data from Gammatone ERB analysis, normalized 0-1
     */
    update(deltaTime: number, bands?: Float32Array): void {
        // Extract bass/mids/highs from band data
        if (bands && bands.length > 0) {
            const step = bands.length / 16;
            let bass = 0, mids = 0, highs = 0;
            for (let i = 0; i < 4; i++) bass += bands[Math.floor(i * step)] || 0;
            for (let i = 4; i < 10; i++) mids += bands[Math.floor(i * step)] || 0;
            for (let i = 10; i < 16; i++) highs += bands[Math.floor(i * step)] || 0;
            bass /= 4; mids /= 6; highs /= 6;

            // Smooth values (fast attack, slow release)
            this.bass += ((bass > this.bass ? 0.7 : 0.1) * (bass - this.bass));
            this.mids += ((mids > this.mids ? 0.7 : 0.1) * (mids - this.mids));
            this.highs += ((highs > this.highs ? 0.7 : 0.1) * (highs - this.highs));
        }

        // Bass drives speed (warp effect)
        const speedMultiplier = this.speed * (1.0 + this.bass * 4.0);

        // Bass creates trails
        this.trailLength = Math.min(this.bass * 2.5, 1.0);

        // Mids shift hue over time
        this.hue += deltaTime * (0.1 + this.mids * 0.5);

        // Update star color based on mids/highs (HSV to RGB)
        const h = this.hue % 1;
        const s = 0.5 + this.highs * 0.5;
        const v = 0.8 + this.bass * 0.2;
        // Simple HSV to RGB
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: this.starColor = [v, t, p]; break;
            case 1: this.starColor = [q, v, p]; break;
            case 2: this.starColor = [p, v, t]; break;
            case 3: this.starColor = [p, q, v]; break;
            case 4: this.starColor = [t, p, v]; break;
            case 5: this.starColor = [v, p, q]; break;
        }

        for (let i = 0; i < this.stars.length; i++) {
            const star = this.stars[i];

            // Move star toward camera
            star.z -= deltaTime * speedMultiplier;

            // Respawn at back when passing camera
            if (star.z <= 0.1) {
                star.z = this.depth;
                star.x = (Math.random() - 0.5) * this.spread * 2;
                star.y = (Math.random() - 0.5) * this.spread * 2;
                star.size = 1 + Math.random() * 2;
            }

            // Highs make stars twinkle (size variation)
            const twinkle = 1.0 + this.highs * 0.5 * Math.sin(i * 0.1 + this.hue * 20);

            // Update buffer data
            this.positions[i * 3] = star.x;
            this.positions[i * 3 + 1] = star.y;
            this.positions[i * 3 + 2] = star.z;
            this.sizes[i] = star.size * twinkle;
        }
    }

    draw(aspect: number): void {
        const gl = this.gl;

        // Update GPU buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sizes);

        // Draw
        gl.useProgram(this.program);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uAspect'), aspect);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uTrailLength'), this.trailLength);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'uColor'), this.starColor);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive blending for glow
        gl.depthMask(false);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.POINTS, 0, this.starCount);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}

//=============================================================================
// Copper Bars - Amiga-style Horizontal Gradient Bands
//=============================================================================

export class CopperBars {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private time: number = 0;

    public barCount: number = 8;
    public barHeight: number = 0.08;
    public waveAmplitude: number = 0.3;
    public waveFrequency: number = 2.0;
    public baseHue: number = 0.0;
    public saturation: number = 0.8;

    // Smoothed band values
    private bass: number = 0;
    private mids: number = 0;
    private highs: number = 0;
    private smoothedBands: Float32Array = new Float32Array(32);

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = this.initShaders();
        this.vao = this.initQuad();
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec2 aPosition;
        out vec2 vUv;
        void main() {
            vUv = aPosition * 0.5 + 0.5;
            gl_Position = vec4(aPosition, 0.998, 1.0);
        }`;

        const fs = `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform float uTime;
        uniform int uBarCount;
        uniform float uBarHeight;
        uniform float uWaveAmplitude;
        uniform float uWaveFrequency;
        uniform float uBaseHue;
        uniform float uSaturation;
        uniform float uBands[32]; // Frequency band magnitudes

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
            float y = vUv.y;
            vec3 color = vec3(0.0);
            float alpha = 0.0;

            for (int i = 0; i < 32; i++) {
                if (i >= uBarCount) break;

                // Band magnitude affects bar size and brightness
                float bandMag = uBands[i];

                // Calculate bar center with sine wave motion
                float barIndex = float(i) / float(uBarCount);
                float baseY = barIndex;
                float waveOffset = sin(uTime * uWaveFrequency + barIndex * 6.28) * uWaveAmplitude * 0.5;
                waveOffset += sin(uTime * uWaveFrequency * 0.7 + barIndex * 4.0) * uWaveAmplitude * 0.3;

                // Audio-reactive bounce
                waveOffset += bandMag * 0.1;

                float barCenter = baseY + waveOffset;

                // Bar thickness scales with band magnitude
                float thickness = uBarHeight * (0.5 + bandMag * 1.5);

                // Distance from bar center
                float dist = abs(y - barCenter);

                // Smooth bar with gradient edges
                float barMask = 1.0 - smoothstep(0.0, thickness, dist);

                if (barMask > 0.0) {
                    // Color based on bar index and time
                    float hue = fract(uBaseHue + barIndex + uTime * 0.1);
                    float sat = uSaturation;
                    float val = 0.5 + bandMag * 0.5;

                    // Horizontal gradient within bar
                    float horizGrad = vUv.x;
                    hue = fract(hue + horizGrad * 0.2);
                    val *= 0.7 + horizGrad * 0.3;

                    // Metallic highlight in center of bar
                    float centerHighlight = exp(-pow(dist / thickness, 2.0) * 4.0);
                    val += centerHighlight * 0.3;

                    vec3 barColor = hsv2rgb(vec3(hue, sat, val));

                    // Additive blend bars
                    color = max(color, barColor * barMask);
                    alpha = max(alpha, barMask);
                }
            }

            fragColor = vec4(color, alpha * 0.9);
        }`;

        return this.createProgram(vs, fs);
    }

    private createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initQuad(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindVertexArray(null);
        return vao;
    }

    /**
     * Update copper bars with Gammatone ERB frequency band data
     * @param deltaTime Frame delta time in seconds
     * @param bands Frequency band data from Gammatone ERB analysis, normalized 0-1
     */
    update(deltaTime: number, bands?: Float32Array): void {
        if (bands && bands.length > 0) {
            // Resample to bar count with smoothing
            const step = bands.length / this.barCount;
            for (let i = 0; i < this.barCount && i < 32; i++) {
                const idx = Math.floor(i * step);
                const target = bands[idx] || 0;
                // Fast attack, slower release for punchy response
                if (target > this.smoothedBands[i]) {
                    this.smoothedBands[i] += (target - this.smoothedBands[i]) * 0.8;
                } else {
                    this.smoothedBands[i] += (target - this.smoothedBands[i]) * 0.15;
                }
            }

            // Calculate bass/mids/highs
            const bandStep = bands.length / 16;
            let bass = 0, mids = 0, highs = 0;
            for (let i = 0; i < 4; i++) bass += bands[Math.floor(i * bandStep)] || 0;
            for (let i = 4; i < 10; i++) mids += bands[Math.floor(i * bandStep)] || 0;
            for (let i = 10; i < 16; i++) highs += bands[Math.floor(i * bandStep)] || 0;
            bass /= 4; mids /= 6; highs /= 6;

            this.bass += ((bass > this.bass ? 0.7 : 0.1) * (bass - this.bass));
            this.mids += ((mids > this.mids ? 0.7 : 0.1) * (mids - this.mids));
            this.highs += ((highs > this.highs ? 0.7 : 0.1) * (highs - this.highs));
        }

        // Bass drives wave speed
        this.time += deltaTime * (1.0 + this.bass * 3.0);

        // Mids shift hue
        this.baseHue += deltaTime * (0.05 + this.mids * 0.4);
    }

    draw(): void {
        const gl = this.gl;

        // Dynamic wave amplitude based on bass
        const dynamicAmplitude = this.waveAmplitude * (1.0 + this.bass * 1.5);

        // Dynamic wave frequency based on highs
        const dynamicFreq = this.waveFrequency * (1.0 + this.highs * 0.5);

        // Dynamic saturation based on mids
        const dynamicSat = Math.min(1.0, this.saturation + this.mids * 0.2);

        gl.useProgram(this.program);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uTime'), this.time);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uBarCount'), this.barCount);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uBarHeight'), this.barHeight);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uWaveAmplitude'), dynamicAmplitude);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uWaveFrequency'), dynamicFreq);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uBaseHue'), this.baseHue);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uSaturation'), dynamicSat);

        // Pass smoothed frequency bands
        gl.uniform1fv(gl.getUniformLocation(this.program, 'uBands'), this.smoothedBands);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}

//=============================================================================
// Lens Distortion - Barrel/Fisheye Post-Process Effect
//=============================================================================

export class LensDistortion {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;

    public strength: number = 0.0; // 0 = no distortion, 1 = max barrel
    public chromaticAberration: number = 0.0; // RGB split amount

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = this.initShaders();
        this.vao = this.initQuad();
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec2 aPosition;
        out vec2 vUv;
        void main() {
            vUv = aPosition * 0.5 + 0.5;
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }`;

        const fs = `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D uTexture;
        uniform float uStrength;
        uniform float uChromatic;

        vec2 barrelDistort(vec2 uv, float strength) {
            vec2 centered = uv - 0.5;
            float dist = length(centered);
            float distPow = dist * dist;

            // Barrel distortion formula
            float factor = 1.0 + strength * distPow;

            return centered * factor + 0.5;
        }

        void main() {
            vec2 uv = vUv;

            if (uStrength < 0.001 && uChromatic < 0.001) {
                // No effect, passthrough
                fragColor = texture(uTexture, uv);
                return;
            }

            // Chromatic aberration - sample RGB at different distortion levels
            float rStrength = uStrength * (1.0 + uChromatic);
            float gStrength = uStrength;
            float bStrength = uStrength * (1.0 - uChromatic);

            vec2 uvR = barrelDistort(uv, rStrength);
            vec2 uvG = barrelDistort(uv, gStrength);
            vec2 uvB = barrelDistort(uv, bStrength);

            // Sample with bounds check
            float r = (uvR.x >= 0.0 && uvR.x <= 1.0 && uvR.y >= 0.0 && uvR.y <= 1.0)
                      ? texture(uTexture, uvR).r : 0.0;
            float g = (uvG.x >= 0.0 && uvG.x <= 1.0 && uvG.y >= 0.0 && uvG.y <= 1.0)
                      ? texture(uTexture, uvG).g : 0.0;
            float b = (uvB.x >= 0.0 && uvB.x <= 1.0 && uvB.y >= 0.0 && uvB.y <= 1.0)
                      ? texture(uTexture, uvB).b : 0.0;

            // Vignette to hide edge artifacts
            float vignette = 1.0 - smoothstep(0.4, 0.7, length(vUv - 0.5));

            fragColor = vec4(r, g, b, 1.0) * vignette + vec4(0.0, 0.0, 0.0, 1.0) * (1.0 - vignette);
        }`;

        return this.createProgram(vs, fs);
    }

    private createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initQuad(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindVertexArray(null);
        return vao;
    }

    /**
     * Update distortion based on bass energy
     */
    update(bassEnergy: number): void {
        // Distortion pulses on bass hits
        this.strength = bassEnergy * 0.3;
        this.chromaticAberration = bassEnergy * 0.5;
    }

    /**
     * Apply distortion to a texture and render to screen
     */
    draw(texture: WebGLTexture): void {
        const gl = this.gl;

        gl.useProgram(this.program);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uStrength'), this.strength);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uChromatic'), this.chromaticAberration);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'uTexture'), 0);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

//=============================================================================
// Tunnel Effect - Classic Infinite Zoom Tunnel
//=============================================================================

export class Tunnel {
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject;
    private time: number = 0;

    public speed: number = 1.0;
    public rotation: number = 0.0;
    public colorShift: number = 0.0;
    public ringCount: number = 20.0;
    public twist: number = 0.3;

    // Smoothed band values
    private bass: number = 0;
    private mids: number = 0;
    private highs: number = 0;
    private energy: number = 0;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        this.program = this.initShaders();
        this.vao = this.initQuad();
    }

    private initShaders(): WebGLProgram {
        const vs = `#version 300 es
        layout(location = 0) in vec2 aPosition;
        out vec2 vUv;
        void main() {
            vUv = aPosition;
            gl_Position = vec4(aPosition, 0.999, 1.0);
        }`;

        const fs = `#version 300 es
        precision highp float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform float uTime;
        uniform float uSpeed;
        uniform float uRotation;
        uniform float uColorShift;
        uniform float uRingCount;
        uniform float uTwist;
        uniform float uEnergy;
        uniform float uAspect;

        vec3 hsv2rgb(vec3 c) {
            vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
            vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
            return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
        }

        void main() {
            // Center and aspect-correct coordinates
            vec2 uv = vUv;
            uv.x *= uAspect;

            // Convert to polar coordinates
            float dist = length(uv);
            float angle = atan(uv.y, uv.x);

            // Infinite zoom effect - distance becomes depth
            float depth = 1.0 / max(dist, 0.001);

            // Moving through tunnel
            depth += uTime * uSpeed;

            // Twist increases with depth (scaled up for visible effect)
            angle += depth * uTwist * 3.0 + uRotation;

            // Create ring pattern
            float rings = fract(depth * 0.1 * uRingCount);

            // Create segment pattern
            float segments = fract(angle / 6.28318 * 8.0 + depth * 0.02);

            // Checker pattern
            float checker = step(0.5, rings) * step(0.5, segments) +
                           step(rings, 0.5) * step(segments, 0.5);

            // Color based on depth and angle
            float hue = fract(depth * 0.05 + angle / 6.28318 + uColorShift);
            float sat = 0.7 + 0.3 * checker;
            float val = 0.3 + 0.4 * checker + uEnergy * 0.3;

            // Ring highlight
            float ringHighlight = abs(fract(depth * 0.1 * uRingCount) - 0.5) * 2.0;
            ringHighlight = pow(ringHighlight, 4.0);
            val += ringHighlight * 0.2;

            // Fade at edges (tunnel walls)
            float fade = smoothstep(0.0, 0.3, dist);

            // Fade at center (vanishing point)
            float centerFade = smoothstep(0.0, 0.1, dist);

            vec3 color = hsv2rgb(vec3(hue, sat, val));
            color *= fade * centerFade;

            // Add glow at center
            float centerGlow = exp(-dist * 8.0) * uEnergy;
            color += vec3(0.5, 0.3, 1.0) * centerGlow;

            fragColor = vec4(color, 1.0);
        }`;

        return this.createProgram(vs, fs);
    }

    private createProgram(vs: string, fs: string): WebGLProgram {
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);

        const program = gl.createProgram()!;
        gl.attachShader(program, vShader);
        gl.attachShader(program, fShader);
        gl.linkProgram(program);

        return program;
    }

    private initQuad(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        gl.bindVertexArray(null);
        return vao;
    }

    /**
     * Update tunnel with Gammatone ERB frequency band data
     * @param deltaTime Frame delta time in seconds
     * @param bands Frequency band data from Gammatone ERB analysis, normalized 0-1
     */
    update(deltaTime: number, bands?: Float32Array): void {
        // Extract bass/mids/highs from band data
        if (bands && bands.length > 0) {
            const step = bands.length / 16;
            let bass = 0, mids = 0, highs = 0;
            for (let i = 0; i < 4; i++) bass += bands[Math.floor(i * step)] || 0;
            for (let i = 4; i < 10; i++) mids += bands[Math.floor(i * step)] || 0;
            for (let i = 10; i < 16; i++) highs += bands[Math.floor(i * step)] || 0;
            bass /= 4; mids /= 6; highs /= 6;

            // Smooth values
            this.bass += ((bass > this.bass ? 0.7 : 0.1) * (bass - this.bass));
            this.mids += ((mids > this.mids ? 0.7 : 0.1) * (mids - this.mids));
            this.highs += ((highs > this.highs ? 0.7 : 0.1) * (highs - this.highs));
            this.energy = (this.bass + this.mids + this.highs) / 3;
        }

        // Bass drives forward speed
        const speedBoost = 1.0 + this.bass * 4.0;
        this.time += deltaTime * this.speed * speedBoost;

        // Mids drive rotation
        this.rotation += deltaTime * (0.2 + this.mids * 1.5);

        // Highs shift colors
        this.colorShift += deltaTime * (0.1 + this.highs * 0.8);
    }

    draw(aspect: number): void {
        const gl = this.gl;

        // Dynamic twist based on mids
        const dynamicTwist = this.twist * (1.0 + this.mids * 2.0);

        // Dynamic ring count based on highs
        const dynamicRings = this.ringCount * (1.0 + this.highs * 0.5);

        gl.useProgram(this.program);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uTime'), this.time);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uSpeed'), this.speed);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uRotation'), this.rotation);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uColorShift'), this.colorShift);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uRingCount'), dynamicRings);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uTwist'), dynamicTwist);
        gl.uniform1f(gl.getUniformLocation(this.program, 'uEnergy'), this.bass); // Bass for center glow
        gl.uniform1f(gl.getUniformLocation(this.program, 'uAspect'), aspect);

        gl.depthMask(false);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.depthMask(true);
    }
}
