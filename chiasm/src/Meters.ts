import { MeterConfig } from './types';

export class Goniometer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: MeterConfig;
    
    constructor(canvas: HTMLCanvasElement, config: MeterConfig) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.config = config;
    }
    
    public draw(left: Float32Array, right: Float32Array) {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const halfW = w / 2;
        const halfH = h / 2;
        
        // Fade effect
        this.ctx.fillStyle = this.config.colors.background || 'rgba(0,0,0,0.2)';
        this.ctx.fillRect(0, 0, w, h);
        
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = this.config.colors.active;
        this.ctx.beginPath();
        
        // Step to improve performance
        const step = 2;
        
        // Rotation by 45 degrees:
        // M = L+R, S = L-R
        // We map S to X, M to Y.
        
        for(let i=0; i < left.length; i+=step) {
            const l = left[i];
            const r = right[i];
            
            const m = (l + r) * 0.707; // 1/sqrt(2)
            const s = (l - r) * 0.707;
            
            // X and Y
            const x = halfW + s * halfW * 0.8; 
            const y = halfH - m * halfH * 0.8;
            
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }
}

export class CorrelationMeter {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: MeterConfig;
    private buffer: number[] = new Array(30).fill(0); // For smoothing
    
    constructor(canvas: HTMLCanvasElement, config: MeterConfig) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.config = config;
    }
    
    public draw(left: Float32Array, right: Float32Array) {
        // Pearson correlation coeff or simple dot?
        // simple: sum(L*R) / (sum(L^2)*sum(R^2))^0.5
        
        let sumLR = 0;
        let sumL2 = 0;
        let sumR2 = 0;
        
        for(let i=0; i<left.length; i++) {
            const l = left[i];
            const r = right[i];
            sumLR += l * r;
            sumL2 += l * l;
            sumR2 += r * r;
        }
        
        const denom = Math.sqrt(sumL2 * sumR2) + 0.000001;
        const correlation = sumLR / denom; // -1 to 1
        
        // Smooth
        this.buffer.shift();
        this.buffer.push(correlation);
        const avg = this.buffer.reduce((a,b)=>a+b,0) / this.buffer.length;
        
        // Draw Bar
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0,0,w,h);
        
        // Center line
        this.ctx.strokeStyle = this.config.colors.grid;
        this.ctx.beginPath();
        this.ctx.moveTo(w/2, 0); this.ctx.lineTo(w/2, h);
        this.ctx.stroke();
        
        // Bar
        const x = (avg + 1) * 0.5 * w;
        
        this.ctx.fillStyle = this.config.colors.active;
        // If < 0 red?
        if (avg < 0) this.ctx.fillStyle = this.config.colors.hold || 'red';
        
        // Draw from center to x
        if (x > w/2) {
             this.ctx.fillRect(w/2, 2, x - w/2, h-4);
        } else {
             this.ctx.fillRect(x, 2, w/2 - x, h-4);
        }
    }
}
