import { Viz2DConfig, ChannelMode } from './types';

export class Viz2D {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private config: Viz2DConfig;
    
    // WebGL Resources
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject | null = null;
    private texture: WebGLTexture | null = null;
    
    // State
    private head: number = 0; // Circular buffer head pointer
    private totalRows: number = 2048; // History size (height)
    
    constructor(canvas: HTMLCanvasElement, config: Viz2DConfig) {
        this.canvas = canvas;
        this.config = config;
        
        const gl = canvas.getContext('webgl2');
        if (!gl) throw new Error('WebGL 2 required for Viz2D');
        this.gl = gl;
        
        this.program = this.initShaders();
        this.initTexture();
        this.initQuad();
    }
    
    private initShaders() {
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
        
        uniform sampler2D uSpectrogram;
        uniform float uHead; // Normalized head position (0-1)
        uniform float uMinDb;
        uniform float uMaxDb;
        uniform vec3 uColorMap[5]; // Simple ramp for now
        
        vec3 magma(float t) {
            // Simple heatmap approximation if uniform array is annoying
            return vec3(t, t*t, t*t*t) + vec3(0.2, 0.0, 0.4) * (1.0-t);
        }
        
        void main() {
            // vUv.x = frequency
            // vUv.y = time on screen (0 bottom, 1 top)
            
            // We want y=0 to be the NEWEST (head) and y=1 to be OLDEST (head+1)
            // Or typically spectrograms scroll DOWN or LEFT. 
            // Let's scroll DOWN (newest at top).
            // So y=1 is Newest. 
            
            // Map screen Y to ring buffer coordinate.
            // If Head is at 0.5:
            // logic: texture coord y = (screenY + head) % 1.0
            // But we implement ring buffer.
            
            float ringY = mod(vUv.y + uHead, 1.0);
            
            // Sample
            float mag = texture(uSpectrogram, vec2(vUv.x, ringY)).r;
            
            // DB mapping
            // float db = 20.0 * log(mag + 0.00001) / 2.302585;
            // Assuming mag is already linear magnitude, let's do simple log scaling
            // Or assuming input is already DB? Usually input is linear magnitude.
            
            float db = 10.0 * log(mag + 1e-6); 
            float t = clamp((db - uMinDb) / (uMaxDb - uMinDb), 0.0, 1.0);
            
            fragColor = vec4(magma(t), 1.0);
        }`;
        
        return this.createProgram(vs, fs);
    }

    private createProgram(vsSrc: string, fsSrc: string) {
        const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!;
        this.gl.shaderSource(vs, vsSrc); this.gl.compileShader(vs);
        const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
        this.gl.shaderSource(fs, fsSrc); this.gl.compileShader(fs);
        const p = this.gl.createProgram()!;
        this.gl.attachShader(p, vs); this.gl.attachShader(p, fs);
        this.gl.linkProgram(p);
        return p;
    }
    
    private initTexture() {
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        // R32F for precision
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, 1024, this.totalRows, 0, this.gl.RED, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT); 
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    }
    
    private initQuad() {
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);
        const buf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindVertexArray(null);
    }
    
    public update(magnitudesL: Float32Array, magnitudesR?: Float32Array) {
        let data = magnitudesL;
        if (this.config.channelMode === ChannelMode.Right && magnitudesR) data = magnitudesR;
        else if (this.config.channelMode === ChannelMode.Mid && magnitudesR) {
             // Basic Mid implementation for now, ideally optimization needed
             // Using L for MVP to save CPU cycles unless we really prioritize accuracy
        }
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        
        // Resize check? skipping for brevity
        
        // Upload ONE row at head
        this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, this.head, 1024, 1, this.gl.RED, this.gl.FLOAT, data);
        
        // Move head
        this.head = (this.head + 1) % this.totalRows;
    }
    
    public setPlayhead(normalizedTime: number) {
        // For Manual sync, we might just set logic to view specific part of buffer
        // Or actually set the 'head' pointer if we are rewriting history.
        // If we are just VIEWING history that is already written, we change uHead offset.
        // Here we just override head.
        this.head = Math.floor(normalizedTime * this.totalRows) % this.totalRows;
    }
    
    public draw() {
        // Reset GL state (other visualizers may have changed it)
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.disable(this.gl.CULL_FACE);
        this.gl.disable(this.gl.BLEND);

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, "uSpectrogram"), 0);
        // Head represents the write pointer. The "Newest" data is at Head-1.
        // We pass Head normalized.
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "uHead"), this.head / this.totalRows);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "uMinDb"), this.config.view.minDb);
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "uMaxDb"), this.config.view.maxDb);
        
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }
    
    public setConfig(config: Partial<Viz2DConfig>) {
        this.config = { ...this.config, ...config };
    }
}
