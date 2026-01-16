/**
 * Bloom Post-Processing Effect
 * Inspired by Visage's PostEffects.
 * Implements a simple Brightness Filter -> Gaussian Blur -> Additive Blend pipeline.
 */

export class BloomEffect {
    private gl: WebGL2RenderingContext;
    private width: number;
    private height: number;
    
    private framebuffer: WebGLFramebuffer | null = null;
    private texture: WebGLTexture | null = null; // Colors
    
    // Ping-pong buffers for blurring
    private blurFbo1: WebGLFramebuffer | null = null;
    private blurTex1: WebGLTexture | null = null;
    private blurFbo2: WebGLFramebuffer | null = null;
    private blurTex2: WebGLTexture | null = null;
    
    // Shaders
    private blurProgram!: WebGLProgram;
    private compositeProgram!: WebGLProgram;
    private highPassProgram!: WebGLProgram;
    
    // Quad VBO
    private quadVao: WebGLVertexArrayObject | null = null;
    
    constructor(gl: WebGL2RenderingContext, width: number, height: number) {
        this.gl = gl;
        this.width = width;
        this.height = height;
        
        this.initShaders();
        this.initFramebuffers(); // Moved after shaders just in case, though order doesn't matter for logic here
        this.initQuad();
    }
    
    private initFramebuffers() {
        // Main Capture FBO (if we render scene to texture first)
        // For simplicity, we assume the Viz3D renders to screen, 
        // but for Bloom we usually need to render to FBO first.
        
        // Let's create texture attachments.
        const createTex = (w: number, h: number) => {
            const t = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, t);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA16F, w, h, 0, this.gl.RGBA, this.gl.HALF_FLOAT, null);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
            return t;
        };
        
        // Blur Buffers (Downsampled /2)
        const w2 = Math.floor(this.width / 2);
        const h2 = Math.floor(this.height / 2);
        
        this.blurTex1 = createTex(w2, h2);
        this.blurFbo1 = this.gl.createFramebuffer();
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.blurFbo1);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.blurTex1, 0);
        
        this.blurTex2 = createTex(w2, h2);
        this.blurFbo2 = this.gl.createFramebuffer();
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.blurFbo2);
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.blurTex2, 0);

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
    
    private initShaders() {
        const vs = `#version 300 es
        layout(location = 0) in vec2 aPosition;
        out vec2 vUv;
        void main() {
            vUv = aPosition * 0.5 + 0.5;
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }`;
        
        const fsBlur = `#version 300 es
        precision mediump float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        uniform bool uHorizontal;
        
        // Simple 5-tap Gaussian
        float weight[5] = float[] (0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
        
        void main() {
            vec2 tex_offset = 1.0 / vec2(textureSize(uTexture, 0)); 
            vec3 result = texture(uTexture, vUv).rgb * weight[0]; 
            if(uHorizontal) {
                for(int i = 1; i < 5; ++i) {
                    result += texture(uTexture, vUv + vec2(tex_offset.x * float(i), 0.0)).rgb * weight[i];
                    result += texture(uTexture, vUv - vec2(tex_offset.x * float(i), 0.0)).rgb * weight[i];
                }
            } else {
                for(int i = 1; i < 5; ++i) {
                    result += texture(uTexture, vUv + vec2(0.0, tex_offset.y * float(i))).rgb * weight[i];
                    result += texture(uTexture, vUv - vec2(0.0, tex_offset.y * float(i))).rgb * weight[i];
                }
            }
            fragColor = vec4(result, 1.0);
        }`;
        
        const fsHighPass = `#version 300 es
        precision mediump float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        uniform float uThreshold;
        
        void main() {
            vec4 color = texture(uTexture, vUv);
            float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
            if(brightness > uThreshold)
                fragColor = vec4(color.rgb, 1.0);
            else
                fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }`;
        
        const fsComposite = `#version 300 es
        precision mediump float;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uScene;
        uniform sampler2D uBloom;
        uniform float uIntensity;
        
        void main() {
            vec3 sceneColor = texture(uScene, vUv).rgb;
            vec3 bloomColor = texture(uBloom, vUv).rgb;
            
            // Additive blending
            sceneColor += bloomColor * uIntensity; 
            
            // Tone mapping (Reinhard or exposure) if needed, simplified here
            fragColor = vec4(sceneColor, 1.0); 
        }`;

        // Helpers to compile (omitted: using same logic as Viz3D ideally shared)
        this.blurProgram = this.createProgram(vs, fsBlur);
        this.highPassProgram = this.createProgram(vs, fsHighPass);
        this.compositeProgram = this.createProgram(vs, fsComposite);
    }
    
    private createProgram(vs: string, fs: string): WebGLProgram {
        // ... Standard GL boilerplate ...
        // For now trusting it works, assume helper exists or inline it.
        const gl = this.gl;
        const vShader = gl.createShader(gl.VERTEX_SHADER)!;
        gl.shaderSource(vShader, vs);
        gl.compileShader(vShader);
        const fShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(fShader, fs);
        gl.compileShader(fShader);
        const p = gl.createProgram()!;
        gl.attachShader(p, vShader);
        gl.attachShader(p, fShader);
        gl.linkProgram(p);
        return p;
    }

    private initQuad() {
        this.quadVao = this.gl.createVertexArray();
        this.gl.bindVertexArray(this.quadVao);
        const vertices = new Float32Array([
            -1, -1, 1, -1, -1, 1,
            -1, 1, 1, -1, 1, 1
        ]);
        const buf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(0);
        this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.bindVertexArray(null);
    }
    
    public render(sceneTexture: WebGLTexture) {
        // 1. High Pass (Extract bright parts) -> blurFbo1
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.blurFbo1);
        this.gl.viewport(0, 0, this.width / 2, this.height / 2);
        this.gl.useProgram(this.highPassProgram);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, sceneTexture);
        this.gl.uniform1f(this.gl.getUniformLocation(this.highPassProgram, "uThreshold"), 0.8);
        this.drawQuad();
        
        // 2. Blur Horizontal -> blurFbo2
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.blurFbo2);
        this.gl.useProgram(this.blurProgram);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurTex1); // Result of highpass
        this.gl.uniform1i(this.gl.getUniformLocation(this.blurProgram, "uHorizontal"), 1); // True
        this.drawQuad();

        // 3. Blur Vertical -> blurFbo1
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.blurFbo1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurTex2);
        this.gl.uniform1i(this.gl.getUniformLocation(this.blurProgram, "uHorizontal"), 0); // False
        this.drawQuad();
        
        // 4. Composite to Screen
        // We assume we want to draw to the default framebuffer (null) or a target supplied.
        // For this effect to work as a "Post Process", we typically expect 'render' to return
        // the composited result in a texture OR draw it to the currently bound FBO.
        // Let's assume we draw to default/backbuffer for now.
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        this.gl.viewport(0, 0, this.width, this.height);
        this.gl.useProgram(this.compositeProgram);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, sceneTexture);
        this.gl.uniform1i(this.gl.getUniformLocation(this.compositeProgram, "uScene"), 0);
        
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.blurTex1); // Final blur
        this.gl.uniform1i(this.gl.getUniformLocation(this.compositeProgram, "uBloom"), 1);
        
        this.gl.uniform1f(this.gl.getUniformLocation(this.compositeProgram, "uIntensity"), 1.2); // Param
        this.drawQuad();
    }
    
    private drawQuad() {
        this.gl.bindVertexArray(this.quadVao);
        this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
    }
}
