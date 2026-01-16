import { BaseVizConfig, ChannelMode } from './types';

export interface WaveformConfig extends BaseVizConfig {
    lineWidth: number;
    color: [number, number, number];
    sampleCount: number; // Number of samples to visualize
}

export class VizWaveform {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private program: WebGLProgram;
    private vao: WebGLVertexArrayObject | null = null;
    private texture: WebGLTexture | null = null;
    
    private config: WaveformConfig;
    
    constructor(canvas: HTMLCanvasElement, config: WaveformConfig) {
        this.canvas = canvas;
        this.config = config;
        
        const gl = canvas.getContext('webgl2');
        if (!gl) throw new Error('WebGL 2 required');
        this.gl = gl;
        
        this.program = this.initShaders();
        this.initTexture();
        this.initBuffer(); // We need a strip buffer
        
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE); // Additive for "beam" look
    }
    
    private initTexture() {
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        // We use a 1D texture (2D with height 1) to store samples
        // R32F is perfect for audio ranges
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.config.sampleCount, 1, 0, this.gl.RED, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    }
    
    private initShaders() {
        // Vertex Shader: Expand curve
        // We render a Triangle Strip
        // For each point i, we emit 2 vertices (up/down).
        // To compute normal, we need p[i-1] and p[i+1].
        
        const vs = `#version 300 es
        layout(location = 0) in float aSide; // -1 (bottom) or 1 (top)
        
        uniform sampler2D uAudio;
        uniform float uLineWidth; // in pixels
        uniform vec2 uResolution;
        uniform int uCount;
        
        out float vEdge; // For AA in frag (0 at center, 1 at edge)
        
        void main() {
            // Instance ID determines sample index? 
            // Better: We draw Arrays (Triangle Strip) of length uCount * 2
            // vertexID / 2 is sample index.
            
            int id = gl_VertexID / 2;
            int nextId = min(id + 1, uCount - 1);
            int prevId = max(id - 1, 0);
            
            // Fetch samples
            // Texture coord center of pixel 
            float fId = float(id);
            float fNext = float(nextId);
            float fPrev = float(prevId);
            float width = float(uCount);
            
            float samp = texture(uAudio, vec2((fId + 0.5) / width, 0.5)).r;
            float tm1 = texture(uAudio, vec2((fPrev + 0.5) / width, 0.5)).r;
            float tp1 = texture(uAudio, vec2((fNext + 0.5) / width, 0.5)).r;
            
            // Map to Screen Space (-1 to 1)
            float x = (fId / (width - 1.0)) * 2.0 - 1.0;
            float xPrev = (fPrev / (width - 1.0)) * 2.0 - 1.0;
            float xNext = (fNext / (width - 1.0)) * 2.0 - 1.0;
            
            // Aspect correction for normals
            float aspect = uResolution.x / uResolution.y;
            
            vec2 p = vec2(x, samp);
            vec2 pPrev = vec2(xPrev, tm1);
            vec2 pNext = vec2(xNext, tp1);
            
            // Tangent
            vec2 t = normalize(vec2(pNext.x - pPrev.x, pNext.y - pPrev.y));
            // Adjust tangent for aspect ratio so thickness is uniform visually?
            // Actually normal should be computed in screen pixels ideally.
            // Let's just do simple perpendicular in UV space for now.
            
            vec2 n = vec2(-t.y, t.x);
            // Fix aspect stretch on normal
            n.x /= aspect; 
            n = normalize(n);
            
            // Expand
            // Pixel size in UV scale
            vec2 pixelSize = 2.0 / uResolution;
            float thickness = uLineWidth * 0.5;
            
            vec2 offset = n * thickness * pixelSize.y * aSide; 
            // Using pixelSize.y assumes width defined in height-pixels (standard)
            
            gl_Position = vec4(p + offset, 0.0, 1.0);
            
            vEdge = aSide; // -1 to 1
        }`;
        
        const fs = `#version 300 es
        precision mediump float;
        in float vEdge;
        out vec4 fragColor;
        uniform vec3 uColor;
        
        void main() {
            // Anti-aliasing using the edge distance
            // vEdge goes from -1 to 1.
            // We want soft falloff near 1.0
            
            float d = abs(vEdge);
            // Smoothstep for AA
            // Make core solid, edges fade.
            float alpha = 1.0 - smoothstep(0.8, 1.0, d);
            
            fragColor = vec4(uColor * alpha, 1.0); // Pre-multiplied? 
            // In additive blend, alpha affects brightness.
            fragColor = vec4(uColor * alpha, alpha);
        }`;
        
        return this.createProgram(vs, fs);
    }
    
    private createProgram(vsSrc: string, fsSrc: string) {
        // ... (reuse implementation or standard) ...
        // Assuming boilerplate helper
        const vs = this.gl.createShader(this.gl.VERTEX_SHADER)!;
        this.gl.shaderSource(vs, vsSrc); this.gl.compileShader(vs);
        const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER)!;
        this.gl.shaderSource(fs, fsSrc); this.gl.compileShader(fs);
        const p = this.gl.createProgram()!;
        this.gl.attachShader(p, vs); this.gl.attachShader(p, fs);
        this.gl.linkProgram(p);
        return p;
    }
    
    private initBuffer() {
        this.vao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.vao);
        
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.gl.createBuffer());
        // We need 2 vertices per sample.
        // We can just use gl_VertexID in shader to generate +/- 1 for aSide.
        // aSide = (gl_VertexID % 2 == 0) ? 1.0 : -1.0;
        // But to be safe/compatible, let's upload a side buffer.
        
        const sides = new Float32Array(this.config.sampleCount * 2);
        for(let i=0; i<this.config.sampleCount; ++i) {
            sides[i*2] = 1.0;
            sides[i*2+1] = -1.0;
        }
        
        this.gl.bufferData(this.gl.ARRAY_BUFFER, sides, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 1, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindVertexArray(null);
    }
    
    public update(magnitudesL: Float32Array, magnitudesR?: Float32Array) {
        // Select channel or Mix based on ChannelMode
        let data = magnitudesL;
        if (this.config.channelMode === ChannelMode.Right && magnitudesR) data = magnitudesR;
        // ... Mix logic ...
        
        if (data.length !== this.config.sampleCount) {
             // Handle resize? Just clamping for now.
        }
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, Math.min(data.length, this.config.sampleCount), 1, this.gl.RED, this.gl.FLOAT, data);
    }
    
    public draw() {
        // Reset GL state (other visualizers may have changed it)
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.disable(this.gl.CULL_FACE);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        this.gl.useProgram(this.program);
        this.gl.bindVertexArray(this.vao);
        
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, "uAudio"), 0);
        
        this.gl.uniform1f(this.gl.getUniformLocation(this.program, "uLineWidth"), this.config.lineWidth);
        this.gl.uniform1i(this.gl.getUniformLocation(this.program, "uCount"), this.config.sampleCount);
        this.gl.uniform2f(this.gl.getUniformLocation(this.program, "uResolution"), this.canvas.width, this.canvas.height);
        this.gl.uniform3fv(this.gl.getUniformLocation(this.program, "uColor"), this.config.color);
        
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, this.config.sampleCount * 2);
    }

    public setConfig(config: Partial<WaveformConfig>) {
        this.config = { ...this.config, ...config };
        // If sampleCount changes, re-init buffer/texture...
    }
}
