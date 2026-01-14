//! Spectrum Analyser
//!
//! Unified interface for multiple analysis methods:
//! - Gammatone filterbank (auditory model)
//!
//! Designed for real-time audio visualization with perceptual accuracy.

use crate::gammatone::{FilterbankConfig, GammatoneFilterbank};
use crate::scales::{BandInfo, Scale};

//=============================================================================
// Analysis Mode
//=============================================================================

/// Analysis method to use
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AnalysisMode {
    /// Gammatone filterbank (auditory model, lowest latency)
    #[default]
    Gammatone,
    // Future modes:
    // BarkCQT,     // Bark-spaced constant-Q transform
    // MultiResFFT, // Multi-resolution STFT
    // Reassigned   // Reassigned spectrogram
}

//=============================================================================
// Analyser Configuration
//=============================================================================

/// Configuration for the spectrum analyser
#[derive(Debug, Clone)]
pub struct AnalyserConfig {
    /// Analysis method
    pub mode: AnalysisMode,
    /// Frequency scale for band spacing
    pub scale: Scale,
    /// Number of frequency bands
    pub num_bands: usize,
    /// Minimum frequency in Hz
    pub min_hz: f32,
    /// Maximum frequency in Hz
    pub max_hz: f32,
    /// Sample rate in Hz
    pub sample_rate: f32,
    /// Envelope smoothing time constant in milliseconds
    pub smoothing_ms: f32,
}

impl Default for AnalyserConfig {
    fn default() -> Self {
        Self {
            mode: AnalysisMode::Gammatone,
            scale: Scale::ERB,
            num_bands: 40,
            min_hz: 20.0,
            max_hz: 20000.0,
            sample_rate: 48000.0,
            smoothing_ms: 5.0,
        }
    }
}

//=============================================================================
// Spectrum Analyser
// Main interface for perceptual spectrum analysis
//=============================================================================

/// Main spectrum analyser for perceptual audio analysis
#[derive(Debug, Clone)]
pub struct Analyser {
    config: AnalyserConfig,
    gammatone: GammatoneFilterbank,
    mono_buffer: Vec<f32>,
}

impl Default for Analyser {
    fn default() -> Self {
        Self::new()
    }
}

impl Analyser {
    /// Create a new analyser with default configuration
    pub fn new() -> Self {
        let config = AnalyserConfig::default();
        let mut analyser = Self {
            config: config.clone(),
            gammatone: GammatoneFilterbank::new(),
            mono_buffer: Vec::new(),
        };
        analyser.configure(config);
        analyser
    }

    /// Create an analyser with the given configuration
    pub fn with_config(config: AnalyserConfig) -> Self {
        let mut analyser = Self {
            config: config.clone(),
            gammatone: GammatoneFilterbank::new(),
            mono_buffer: Vec::new(),
        };
        analyser.configure(config);
        analyser
    }

    /// Configure the analyser
    pub fn configure(&mut self, config: AnalyserConfig) {
        self.config = config.clone();

        match config.mode {
            AnalysisMode::Gammatone => {
                let gt_config = FilterbankConfig {
                    num_bands: config.num_bands,
                    min_hz: config.min_hz,
                    max_hz: config.max_hz,
                    sample_rate: config.sample_rate,
                    spacing: config.scale,
                    smoothing_ms: config.smoothing_ms,
                };
                self.gammatone.configure(gt_config);
            }
        }
    }

    /// Reset analyser state
    pub fn reset(&mut self) {
        self.gammatone.reset();
    }

    /// Process a single sample
    #[inline]
    pub fn process(&mut self, input: f32) {
        match self.config.mode {
            AnalysisMode::Gammatone => {
                self.gammatone.process(input);
            }
        }
    }

    /// Process a block of samples (mono)
    pub fn process_block(&mut self, input: &[f32]) {
        match self.config.mode {
            AnalysisMode::Gammatone => {
                self.gammatone.process_block(input);
            }
        }
    }

    /// Process a stereo block (averages L+R)
    pub fn process_block_stereo(&mut self, input_l: &[f32], input_r: &[f32]) {
        let num_samples = input_l.len().min(input_r.len());

        // Mix to mono for analysis
        self.mono_buffer.resize(num_samples, 0.0);
        for i in 0..num_samples {
            self.mono_buffer[i] = (input_l[i] + input_r[i]) * 0.5;
        }
        self.process_block(&self.mono_buffer.clone());
    }

    /// Get the number of bands
    pub fn num_bands(&self) -> usize {
        self.config.num_bands
    }

    /// Get the sample rate
    pub fn sample_rate(&self) -> f32 {
        self.config.sample_rate
    }

    /// Get raw magnitudes (linear scale)
    pub fn magnitudes(&self) -> &[f32] {
        match self.config.mode {
            AnalysisMode::Gammatone => self.gammatone.smoothed_magnitudes(),
        }
    }

    /// Get magnitude for a specific band
    pub fn magnitude(&self, band: usize) -> f32 {
        self.gammatone.smoothed_magnitude(band)
    }

    /// Get center frequency for a band (Hz)
    pub fn center_hz(&self, band: usize) -> f32 {
        self.gammatone.center_hz(band)
    }

    /// Get all band info
    pub fn band_info(&self) -> &[BandInfo] {
        self.gammatone.band_info()
    }

    /// Copy magnitudes to output buffer
    pub fn get_magnitudes(&self, output: &mut [f32]) {
        let mags = self.gammatone.smoothed_magnitudes();
        let len = output.len().min(mags.len());
        output[..len].copy_from_slice(&mags[..len]);
    }

    /// Get magnitudes in dB
    pub fn get_magnitudes_db(&self, output: &mut [f32]) {
        self.gammatone.magnitudes_db(output, -100.0);
    }

    /// Get magnitude for a band in dB
    pub fn magnitude_db(&self, band: usize) -> f32 {
        self.gammatone.magnitude_db(band, -100.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_analyser_default() {
        let analyser = Analyser::new();
        assert_eq!(analyser.num_bands(), 40);
        assert_eq!(analyser.sample_rate(), 48000.0);
    }

    #[test]
    fn test_analyser_custom_config() {
        let config = AnalyserConfig {
            num_bands: 24,
            sample_rate: 44100.0,
            scale: Scale::Bark,
            ..Default::default()
        };
        let analyser = Analyser::with_config(config);
        assert_eq!(analyser.num_bands(), 24);
        assert_eq!(analyser.sample_rate(), 44100.0);
    }

    #[test]
    fn test_analyser_process_block() {
        let mut analyser = Analyser::new();

        // Generate 100ms of 1kHz sine wave
        let num_samples = 4800;
        let signal: Vec<f32> = (0..num_samples)
            .map(|i| {
                let t = i as f32 / 48000.0;
                (2.0 * PI * 1000.0 * t).sin()
            })
            .collect();

        analyser.process_block(&signal);

        // Check we get valid magnitudes
        let mags = analyser.magnitudes();
        assert_eq!(mags.len(), 40);

        // Find peak
        let (peak_band, _) = mags
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap();

        let peak_freq = analyser.center_hz(peak_band);
        assert!(
            peak_freq > 800.0 && peak_freq < 1200.0,
            "Peak at {} Hz",
            peak_freq
        );
    }

    #[test]
    fn test_analyser_stereo() {
        let mut analyser = Analyser::new();

        let num_samples = 480;
        let left: Vec<f32> = (0..num_samples)
            .map(|i| {
                let t = i as f32 / 48000.0;
                (2.0 * PI * 440.0 * t).sin()
            })
            .collect();
        let right = left.clone();

        analyser.process_block_stereo(&left, &right);

        // Should have processed without panicking
        assert_eq!(analyser.magnitudes().len(), 40);
    }
}
