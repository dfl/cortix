// Initial Type definitions for Chiasm

export enum ChannelMode {
    Left = 0,
    Right = 1,
    Mid = 2,
    Side = 3,
    StereoOverlay = 4
}

export interface BaseVizConfig {
    /** Channel to visualize */
    channelMode?: ChannelMode;
}

export interface Viz3DConfig extends BaseVizConfig {
    /** Visualization Mode */
    visualMode?: 'Cubes' | 'Lines';

    /** Number of frequency bins (cubes along X axis) */
    xAmount: number;
    /** Number of history steps (cubes along Z axis) */
    zAmount: number;
    /** Base height of the cubes when magnitude is 0 */
    baseHeight: number;
    /** Height scaling factor */
    heightScale: number;
    /** Spacing between cubes (0-1, where 1 is touching) */
    spacing: number;

    colors: {
        background: [number, number, number];
        palette: [number, number, number][];
    };

    camera: {
        /** Pitch angle (X rotation) in degrees */
        angle: number;
        /** Yaw angle (Y rotation) in degrees */
        yaw?: number;
        /** Zoom (camera distance) */
        zoom: number;
        /** Vertical displacement */
        yDisplacement: number;
    };
}

export interface Viz2DConfig extends BaseVizConfig {
    /** 
     * Color map for the spectrogram (heatmap).
     * Array of [stop, r, g, b, a] where stop is 0.0-1.0
     */
    colorRamp: [number, number, number, number, number][];
    
    /** Scroll speed in pixels per frame */
    scrollSpeed: number;
    
    view: {
        /** Minimum frequency in Hz to display */
        minFrequency: number;
        /** Maximum frequency in Hz to display */
        maxFrequency: number;
        /** Minimum dB value for color mapping */
        minDb: number;
        /** Maximum dB value for color mapping */
        maxDb: number;
    };
}


export interface MeterConfig {
    decayTime: number; // Seconds
    colors: {
        active: string;
        hold: string;
        grid: string;
        background?: string;
    }
}


