import { mat4, vec3 } from 'gl-matrix';
import { Viz3DConfig } from './types';
import { Animation, AnimatedValue, EasingFunction } from './Animation';

// WebGL 2 Vertex Shader (Instanced Cubes)
const vsSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

out float vSpectrogramValue;
out float vHistoryNormalized;
out float vFreqNormalized;
out vec3 vNormal;
out vec3 vWorldPos;
flat out int vRowIndex;

uniform int uXAmount;
uniform int uZAmount;
uniform sampler2D uSpectrogram;
uniform int uLatestRow;
uniform int uTotalRows;

uniform mat4 uViewProjection;
uniform mat4 uModel;

uniform float uBaseHeight;
uniform float uHeightScale;

// 1 / log(10) for dB conversion
#define I_LOG10 0.43429448190325182765

// Logarithmic frequency mapping (like SpectrexSDK)
float log_freq(float linearPos, float minFreq, float maxFreq, float nyquist) {
    // Map linear position [0,1] to logarithmic frequency
    float minLog = I_LOG10 * log(minFreq / nyquist);
    float maxLog = I_LOG10 * log(maxFreq / nyquist);
    return pow(10.0, mix(minLog, maxLog, linearPos));
}

// Convert linear magnitude to normalized dB value
float toDbNormalized(float mag, float minDb, float maxDb) {
    float db = 20.0 * I_LOG10 * log(max(mag, 0.0001));
    float clamped = clamp(db, minDb, maxDb);
    return (clamped - minDb) / (maxDb - minDb);
}

void main() {
    int instanceId = gl_InstanceID;

    // Grid Coordinates
    int xNr = instanceId % uXAmount;
    int zNr = instanceId / uXAmount;

    // Texture row (circular buffer)
    int texRow = (uLatestRow - zNr + uTotalRows) % uTotalRows;

    // Logarithmic Frequency Mapping
    float xNorm = float(xNr) / float(uXAmount - 1);

    float minHz = 20.0;
    float maxHz = 20000.0;
    float nyquist = 22050.0;

    float u = log_freq(xNorm, minHz, maxHz, nyquist);
    u = clamp(u, 0.0, 1.0);

    float v = (float(texRow) + 0.5) / float(uTotalRows);

    // Sample magnitude from spectrogram texture
    float magnitude = texture(uSpectrogram, vec2(u, v)).r;
    float value = pow(clamp(magnitude, 0.0, 1.0), 1.5);

    vSpectrogramValue = value;
    vHistoryNormalized = float(zNr) / float(uZAmount - 1);
    vFreqNormalized = xNorm;
    vRowIndex = zNr;

    // Position Logic
    float shapeWidth = 1.0 / float(uXAmount);
    float shapeLength = 1.0 / float(uZAmount);

    // Center grid
    float xPos = (float(xNr) * shapeWidth) - 0.5 + (shapeWidth * 0.5);
    float zPos = -0.5 + (float(zNr) * shapeLength) + (shapeLength * 0.5);

    // Height based on value
    float h = uBaseHeight + (value * uHeightScale);

    vec3 localPos = aPosition;

    // Scale cube with gap for cleaner look
    localPos.x *= shapeWidth * 0.85;
    localPos.z *= shapeLength * 0.85;
    localPos.y *= h;

    // Offset so bottom is at y=0
    localPos.y += h * 0.5;

    // Translate to grid position
    vec3 worldPos = localPos + vec3(xPos, 0.0, zPos);

    // Transform normal by model matrix (rotation only)
    vNormal = mat3(uModel) * aNormal;
    vWorldPos = (uModel * vec4(worldPos, 1.0)).xyz;

    gl_Position = uViewProjection * uModel * vec4(worldPos, 1.0);
}
`;

const fsSource = `#version 300 es
precision highp float;

in float vSpectrogramValue;
in float vHistoryNormalized;
in float vFreqNormalized;
in vec3 vNormal;
in vec3 vWorldPos;
flat in int vRowIndex;

out vec4 fragColor;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;

void main() {
    // Row-based coloring - group every 3 rows
    int colorIndex = (vRowIndex / 3) % 5;
    vec3 c;
    if (colorIndex == 0) c = uColor1;
    else if (colorIndex == 1) c = uColor2;
    else if (colorIndex == 2) c = uColor3;
    else if (colorIndex == 3) c = uColor4;
    else c = uColor5;

    fragColor = vec4(c, 1.0);
}
`;

// RIDGELINE SHADERS
const vsLines = `#version 300 es
layout(location = 0) in vec3 aPosition;

out float vValue;
out float vHistoryNorm;

uniform int uXAmount;
uniform int uZAmount;
uniform sampler2D uSpectrogram;
uniform int uLatestRow;
uniform int uTotalRows;

uniform mat4 uViewProjection;
uniform mat4 uModel;

uniform float uHeightScale;

#define I_LOG10 0.43429448190325182765

float log_freq(float linearPos, float minFreq, float maxFreq, float nyquist) {
    float minLog = I_LOG10 * log(minFreq / nyquist);
    float maxLog = I_LOG10 * log(maxFreq / nyquist);
    return pow(10.0, mix(minLog, maxLog, linearPos));
}

// Tapering at edges for cleaner look
float taper(float t) {
    float c = 15.0;
    float x = (t < 0.5) ? t : 1.0 - t;
    float y = clamp(1.0 - (x * c), 0.0, 1.0);
    return clamp(1.0 - (y * y), 0.0, 1.0);
}

void main() {
    int zNr = gl_InstanceID;

    // Logarithmic X mapping
    float xNorm = aPosition.x * 0.5 + 0.5; // 0 to 1

    float minHz = 20.0;
    float maxHz = 20000.0;
    float nyquist = 22050.0;

    float u = log_freq(xNorm, minHz, maxHz, nyquist);
    u = clamp(u, 0.0, 1.0);

    int texRow = (uLatestRow - zNr + uTotalRows) % uTotalRows;
    float v = (float(texRow) + 0.5) / float(uTotalRows);

    float magnitude = texture(uSpectrogram, vec2(u, v)).r;

    // Apply power curve and taper
    float value = pow(clamp(magnitude, 0.0, 1.0), 1.8) * taper(xNorm);
    vValue = value;
    vHistoryNorm = float(zNr) / float(uZAmount - 1);

    // Position
    float xPos = aPosition.x * 0.5;
    float shapeLength = 1.0 / float(uZAmount);
    float zPos = -0.5 + (float(zNr) * shapeLength) + (shapeLength * 0.5);
    float yPos = value * uHeightScale;

    vec3 worldPos = vec3(xPos, yPos, zPos);

    gl_Position = uViewProjection * uModel * vec4(worldPos, 1.0);
}
`;

const fsLines = `#version 300 es
precision highp float;

in float vValue;
in float vHistoryNorm;

out vec4 fragColor;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;

vec3 colorGradient(float t) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.25) {
        return mix(uColor1, uColor2, t * 4.0);
    } else if (t < 0.5) {
        return mix(uColor2, uColor3, (t - 0.25) * 4.0);
    } else if (t < 0.75) {
        return mix(uColor3, uColor4, (t - 0.5) * 4.0);
    } else {
        return mix(uColor4, uColor5, (t - 0.75) * 4.0);
    }
}

void main() {
    float alpha = smoothstep(0.0, 0.1, vValue);

    vec3 c = colorGradient(vValue);

    // Depth fade for back rows
    float depthFade = mix(0.6, 1.0, 1.0 - vHistoryNorm);
    c *= depthFade;

    fragColor = vec4(c, alpha);
}
`;


export class Viz3D {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    private config: Viz3DConfig;
    
    // Programs
    private cubeProgram: WebGLProgram;
    private lineProgram: WebGLProgram;
    
    // Buffers
    private cubeVao: WebGLVertexArrayObject | null = null;
    private lineVao: WebGLVertexArrayObject | null = null;
    private lineBuffer: WebGLBuffer | null = null;
    
    private texture: WebGLTexture | null = null;
    
    // State
    private latestRow: number = 0;
    private totalRows: number = 512;
    
    // Animated Values for Camera
    private camAngle: AnimatedValue;
    private camYaw: AnimatedValue;
    private camZoom: AnimatedValue;
    private camY: AnimatedValue;
    
    private viewMatrix: mat4 = mat4.create();
    private projectionMatrix: mat4 = mat4.create();
    private modelMatrix: mat4 = mat4.create();
    
    constructor(canvas: HTMLCanvasElement, config: Viz3DConfig) {
        this.canvas = canvas;
        this.config = config;
        
        const gl = canvas.getContext('webgl2'); // No alphablend needed usually, but for ridges maybe?
        if (!gl) throw new Error('WebGL 2 not supported');
        this.gl = gl;
        
        this.cubeProgram = this.initShaderProgram(vsSource, fsSource);
        this.lineProgram = this.initShaderProgram(vsLines, fsLines);
        
        this.initBuffers();
        this.initLineBuffers();
        this.initTexture();
        
        // Init animations
        this.camAngle = new AnimatedValue(config.camera.angle, 300, EasingFunction.EaseOut);
        this.camYaw = new AnimatedValue(config.camera.yaw || 0, 300, EasingFunction.EaseOut);
        this.camZoom = new AnimatedValue(config.camera.zoom, 300, EasingFunction.EaseOut);
        this.camY = new AnimatedValue(config.camera.yDisplacement, 300, EasingFunction.EaseOut);
        
        // Note: GL state is set in draw() to avoid interference from other visualizers
    }
    
    private initShaderProgram(vs: string, fs: string): WebGLProgram {
        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vs);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fs);
        const program = this.gl.createProgram()!;
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Shader Error: ' + this.gl.getProgramInfoLog(program));
        }
        return program;
    }
    
    private loadShader(type: number, source: string): WebGLShader {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            throw new Error('Compile Error: ' + this.gl.getShaderInfoLog(shader));
        }
        return shader;
    }
    
    private initBuffers() {
        this.cubeVao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.cubeVao);

        // Cube Vertices with normals (position xyz, normal xyz)
        const vertices = new Float32Array([
            // Front face (normal: 0, 0, 1)
            -0.5, -0.5,  0.5,   0, 0, 1,
             0.5, -0.5,  0.5,   0, 0, 1,
             0.5,  0.5,  0.5,   0, 0, 1,
            -0.5,  0.5,  0.5,   0, 0, 1,
            // Back face (normal: 0, 0, -1)
            -0.5, -0.5, -0.5,   0, 0, -1,
            -0.5,  0.5, -0.5,   0, 0, -1,
             0.5,  0.5, -0.5,   0, 0, -1,
             0.5, -0.5, -0.5,   0, 0, -1,
            // Top face (normal: 0, 1, 0)
            -0.5,  0.5, -0.5,   0, 1, 0,
            -0.5,  0.5,  0.5,   0, 1, 0,
             0.5,  0.5,  0.5,   0, 1, 0,
             0.5,  0.5, -0.5,   0, 1, 0,
            // Bottom face (normal: 0, -1, 0)
            -0.5, -0.5, -0.5,   0, -1, 0,
             0.5, -0.5, -0.5,   0, -1, 0,
             0.5, -0.5,  0.5,   0, -1, 0,
            -0.5, -0.5,  0.5,   0, -1, 0,
            // Right face (normal: 1, 0, 0)
             0.5, -0.5, -0.5,   1, 0, 0,
             0.5,  0.5, -0.5,   1, 0, 0,
             0.5,  0.5,  0.5,   1, 0, 0,
             0.5, -0.5,  0.5,   1, 0, 0,
            // Left face (normal: -1, 0, 0)
            -0.5, -0.5, -0.5,  -1, 0, 0,
            -0.5, -0.5,  0.5,  -1, 0, 0,
            -0.5,  0.5,  0.5,  -1, 0, 0,
            -0.5,  0.5, -0.5,  -1, 0, 0,
        ]);

        const positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

        const stride = 6 * 4; // 6 floats per vertex, 4 bytes per float
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, stride, 0);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, stride, 3 * 4);
        this.gl.enableVertexAttribArray(1);

        const indices = new Uint16Array([
            0,  1,  2,      0,  2,  3,    // Front
            4,  5,  6,      4,  6,  7,    // Back
            8,  9,  10,     8,  10, 11,   // Top
            12, 13, 14,     12, 14, 15,   // Bottom
            16, 17, 18,     16, 18, 19,   // Right
            20, 21, 22,     20, 22, 23    // Left
        ]);
        const indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
        this.gl.bindVertexArray(null);
    }
    
    private initLineBuffers() {
        this.lineVao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.lineVao);
        
        // Line Strip vertices: Just X positions from -1 to 1.
        // xAmount points.
        const points = 512; // Static max size
        const vertices = new Float32Array(points * 3);
        for(let i=0; i<points; i++) {
            const t = i / (points - 1);
            vertices[i*3] = t * 2.0 - 1.0; // -1 to 1
            vertices[i*3+1] = 0;
            vertices[i*3+2] = 0;
        }
        
        this.lineBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.lineBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        
        this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(0);
        
        this.gl.bindVertexArray(null);
    }

    private initTexture() {
        this.texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.R32F, this.config.xAmount, this.totalRows, 0, this.gl.RED, this.gl.FLOAT, null);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST); 
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.REPEAT); 
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    }
    
    /**
     * Update visualization with new audio usage.
     * @param magnitudesL Left channel magnitude data
     * @param magnitudesR Right channel magnitude data (optional)
     */
    public update(magnitudesL: Float32Array, magnitudesR?: Float32Array) {
        let data = magnitudesL;
        // Simple blend logic if R exists and Play Mode requires it (omitted for brevity)
        
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        // Ensure xAmount matches data len? Assume yes.
        this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, this.latestRow, this.config.xAmount, 1, this.gl.RED, this.gl.FLOAT, data);
        
        this.latestRow = (this.latestRow + 1) % this.totalRows;
    }
    
    /**
     * Manually set playhead position (0-1).
     */
    public setPlayhead(normalizedTime: number) {
        this.latestRow = Math.floor(normalizedTime * this.totalRows) % this.totalRows;
    }
    
    public setConfig(config: Partial<Viz3DConfig>) {
        if (config.camera) {
            if (config.camera.angle !== undefined) this.camAngle.set(config.camera.angle);
            if (config.camera.yaw !== undefined) this.camYaw.set(config.camera.yaw);
            if (config.camera.zoom !== undefined) this.camZoom.set(config.camera.zoom);
            if (config.camera.yDisplacement !== undefined) this.camY.set(config.camera.yDisplacement);
        }
        this.config = { ...this.config, ...config };
    }
    
    public draw() {
        // Animation updates
        const angle = this.camAngle.get();
        const yaw = this.camYaw.get();
        const zoom = this.camZoom.get();
        const yDisp = this.camY.get();

        // Reset GL state (other visualizers may have changed it)
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.disable(this.gl.BLEND);
        this.gl.disable(this.gl.CULL_FACE);

        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(this.config.colors.background[0], this.config.colors.background[1], this.config.colors.background[2], 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Matrix Setup
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(this.projectionMatrix, 45 * Math.PI / 180, aspect, 0.1, 100.0);

        mat4.identity(this.viewMatrix);
        mat4.translate(this.viewMatrix, this.viewMatrix, [0, yDisp, zoom]);
        mat4.rotateX(this.viewMatrix, this.viewMatrix, angle * Math.PI / 180);

        // Model matrix handles yaw rotation around Y axis
        mat4.identity(this.modelMatrix);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, yaw * Math.PI / 180);
        
        const mode = this.config.visualMode || 'Cubes';
        const prog = (mode === 'Cubes') ? this.cubeProgram : this.lineProgram;
        
        this.gl.useProgram(prog);
        
        // Universal Uniforms
        const vp = mat4.create();
        mat4.multiply(vp, this.projectionMatrix, this.viewMatrix);
        
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(prog, 'uViewProjection'), false, vp);
        this.gl.uniformMatrix4fv(this.gl.getUniformLocation(prog, 'uModel'), false, this.modelMatrix);
        
        this.gl.uniform1i(this.gl.getUniformLocation(prog, 'uXAmount'), this.config.xAmount);
        this.gl.uniform1i(this.gl.getUniformLocation(prog, 'uZAmount'), this.config.zAmount);
        this.gl.uniform1i(this.gl.getUniformLocation(prog, 'uLatestRow'), this.latestRow);
        this.gl.uniform1i(this.gl.getUniformLocation(prog, 'uTotalRows'), this.totalRows);
        
        // Bind Texture
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.gl.getUniformLocation(prog, 'uSpectrogram'), 0);
        
        const instanceCount = this.config.xAmount * this.config.zAmount;
        if (Math.random() < 0.01) {
             console.log("Viz3D Draw. Mode:", mode, "Instances:", instanceCount, "LatestRow:", this.latestRow);
        }
        
        // Pass all 5 colors for the gradient
        const palette = this.config.colors.palette;
        this.gl.uniform3fv(this.gl.getUniformLocation(prog, 'uColor1'), palette[0] || [0.1, 0.1, 0.3]);
        this.gl.uniform3fv(this.gl.getUniformLocation(prog, 'uColor2'), palette[1] || [0.2, 0.4, 0.8]);
        this.gl.uniform3fv(this.gl.getUniformLocation(prog, 'uColor3'), palette[2] || [0.2, 0.8, 0.4]);
        this.gl.uniform3fv(this.gl.getUniformLocation(prog, 'uColor4'), palette[3] || [0.9, 0.7, 0.2]);
        this.gl.uniform3fv(this.gl.getUniformLocation(prog, 'uColor5'), palette[4] || [0.9, 0.2, 0.3]);

        if (mode === 'Cubes') {
            this.gl.uniform1f(this.gl.getUniformLocation(prog, 'uBaseHeight'), this.config.baseHeight);
            this.gl.uniform1f(this.gl.getUniformLocation(prog, 'uHeightScale'), this.config.heightScale);

            this.gl.bindVertexArray(this.cubeVao);
            this.gl.drawElementsInstanced(this.gl.TRIANGLES, 36, this.gl.UNSIGNED_SHORT, 0, this.config.xAmount * this.config.zAmount);
        } else {
            // Lines
            this.gl.uniform1f(this.gl.getUniformLocation(prog, 'uHeightScale'), this.config.heightScale);

            this.gl.bindVertexArray(this.lineVao);
            this.gl.drawArraysInstanced(this.gl.LINE_STRIP, 0, this.config.xAmount, this.config.zAmount);
        }
    }
}
