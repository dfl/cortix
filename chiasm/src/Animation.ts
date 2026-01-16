/**
 * Animation utilities ported from Visage.
 * Provides generic easing functions for smooth transitions.
 */

export enum EasingFunction {
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
}

export class Animation {
    static readonly SlowTime = 240;
    static readonly RegularTime = 80;
    static readonly FastTime = 50;

    static interpolate(from: number, to: number, t: number): number {
        return from + (to - from) * t;
    }

    /**
     * Approximation of sine easing used in Visage.
     */
    static sin1(phase: number): number {
        // Visage implementation:
        // phase = 0.5f - phase;
        // const float phase2 = phase * phase;
        // ... polynomial approximation ...
        // For JS/Web, standard Math.sin is fast enough usually, but let's stick to the spirit 
        // or just use a standard cubic bezier or sine approximation.
        // Let's use standard Math.sin/cos for simplicity and accuracy unless 
        // the polynomial was for a specific curve shape.
        // Visage's version seems to be a specific curve optimization.
        // We'll map it to standard sine easing for now.
        
        return 0.5 * (1 - Math.cos(Math.PI * phase));
    }

    static ease(from: number, to: number, t: number, easing: EasingFunction): number {
        let t_eased = t;
        switch (easing) {
            case EasingFunction.EaseIn:
                // Visage: interpolate(from, to, 1.0f - sin1(0.25f * (1.0f - t)));
                // Simplified: Quadratic or Cubic Ease In
                t_eased = t * t * t;
                break;
            case EasingFunction.EaseOut:
                // Visage: interpolate(from, to, sin1(0.25f * t));
                // Simplified: Cubic Ease Out
                t_eased = 1 - Math.pow(1 - t, 3);
                break;
            case EasingFunction.EaseInOut:
                // Visage: interpolate(from, to, sin1(0.5f * t - 0.25f) * 0.5f + 0.5f);
                // Simplified:
                t_eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                break;
            case EasingFunction.Linear:
            default:
                t_eased = t;
                break;
        }
        return this.interpolate(from, to, t_eased);
    }
}

/**
 * Animated Value Helper
 * Manages state for a value transitioning from source to target over time.
 */
export class AnimatedValue {
    private source: number;
    private target: number;
    private durationMs: number;
    
    private startTime: number = 0;
    private isAnimating: boolean = false;
    
    private forwardEasing: EasingFunction;
    // Visage supports backward easing, simplifying here to symmetric
    
    constructor(initialValue: number, durationMs: number = Animation.RegularTime, easing: EasingFunction = EasingFunction.EaseOut) {
        this.source = initialValue;
        this.target = initialValue;
        this.durationMs = durationMs;
        this.forwardEasing = easing;
    }

    /**
     * Set a new target value.
     * @param value Target value
     * @param jump If true, skip animation and set immediately.
     */
    public set(value: number, jump: boolean = false) {
        if (jump) {
            this.source = value;
            this.target = value;
            this.isAnimating = false;
            return;
        }

        if (this.target !== value) {
            // Snapshot current value as new source
            this.source = this.get(); 
            this.target = value;
            this.startTime = performance.now();
            this.isAnimating = true;
        }
    }

    public get(): number {
        if (!this.isAnimating) return this.target;

        const now = performance.now();
        const elapsed = now - this.startTime;
        const t = Math.min(1, elapsed / this.durationMs);

        if (t >= 1) {
            this.isAnimating = false;
            this.source = this.target;
            return this.target;
        }

        return Animation.ease(this.source, this.target, t, this.forwardEasing);
    }
}
