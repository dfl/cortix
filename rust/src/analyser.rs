//! Spectrum Analyser
//!
//! Unified interface for multiple analysis methods:
//! - Gammatone filterbank (auditory model)
//!
//! Designed for real-time audio visualization with perceptual accuracy.

use crate::gammatone::GammatoneFilterbank;
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
// Analyser Builder
//=============================================================================

/// Builder for creating an Analyser with custom configuration
#[derive(Debug, Clone)]
pub struct AnalyserBuilder {
    mode: AnalysisMode,
    scale: Scale,
    num_bands: usize,
    min_hz: f32,
    max_hz: f32,
    sample_rate: f32,
    smoothing_ms: f32,
}

impl Default for AnalyserBuilder {
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

impl AnalyserBuilder {
    /// Create a new builder with default settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the analysis mode
    pub fn mode(mut self, mode: AnalysisMode) -> Self {
        self.mode = mode;
        self
    }

    /// Set the frequency scale for band spacing
    pub fn scale(mut self, scale: Scale) -> Self {
        self.scale = scale;
        self
    }

    /// Set the number of frequency bands
    pub fn bands(mut self, num_bands: usize) -> Self {
        self.num_bands = num_bands;
        self
    }

    /// Set the frequency range in Hz
    pub fn range(mut self, min_hz: f32, max_hz: f32) -> Self {
        self.min_hz = min_hz;
        self.max_hz = max_hz;
        self
    }

    /// Set the sample rate in Hz
    pub fn sample_rate(mut self, sample_rate: f32) -> Self {
        self.sample_rate = sample_rate;
        self
    }

    /// Set the envelope smoothing time in milliseconds
    pub fn smoothing(mut self, smoothing_ms: f32) -> Self {
        self.smoothing_ms = smoothing_ms;
        self
    }

    /// Build the analyser
    #[must_use]
    pub fn build(self) -> Analyser {
        let gammatone = GammatoneFilterbank::builder()
            .bands(self.num_bands)
            .range(self.min_hz, self.max_hz)
            .sample_rate(self.sample_rate)
            .scale(self.scale)
            .smoothing(self.smoothing_ms)
            .build();

        Analyser {
            mode: self.mode,
            num_bands: self.num_bands,
            sample_rate: self.sample_rate,
            gammatone,
            mono_buffer: Vec::new(),
        }
    }
}

//=============================================================================
// Spectrum Analyser
//=============================================================================

/// Main spectrum analyser for perceptual audio analysis
///
/// # Example
///
/// ```
/// use cortix::{Analyser, Scale};
///
/// let mut analyser = Analyser::builder()
///     .sample_rate(48000.0)
///     .bands(40)
///     .scale(Scale::ERB)
///     .build();
///
/// // Process audio and get envelope
/// let audio = vec![0.0f32; 512];
/// let envelope = analyser.process(&audio);
/// ```
#[derive(Debug, Clone)]
pub struct Analyser {
    mode: AnalysisMode,
    num_bands: usize,
    sample_rate: f32,
    gammatone: GammatoneFilterbank,
    mono_buffer: Vec<f32>,
}

impl Default for Analyser {
    fn default() -> Self {
        Self::builder().build()
    }
}

impl Analyser {
    /// Create a builder for custom configuration
    pub fn builder() -> AnalyserBuilder {
        AnalyserBuilder::new()
    }

    /// Create a new analyser with default configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Reset analyser state
    pub fn reset(&mut self) {
        self.gammatone.reset();
    }

    /// Process a block of samples and return the envelope
    ///
    /// The returned slice contains the smoothed magnitude for each frequency band.
    #[must_use]
    pub fn process(&mut self, input: &[f32]) -> &[f32] {
        match self.mode {
            AnalysisMode::Gammatone => {
                self.gammatone.process(input);
                self.gammatone.envelope()
            }
        }
    }

    /// Process a stereo block (averages L+R) and return the envelope
    #[must_use]
    pub fn process_stereo(&mut self, left: &[f32], right: &[f32]) -> &[f32] {
        let num_samples = left.len().min(right.len());

        self.mono_buffer.resize(num_samples, 0.0);
        for i in 0..num_samples {
            self.mono_buffer[i] = (left[i] + right[i]) * 0.5;
        }

        // Need to clone to avoid borrow issues
        let mono = self.mono_buffer.clone();
        self.process(&mono)
    }

    /// Get the current envelope (smoothed magnitudes)
    ///
    /// Returns the same data as the last `process()` call.
    #[must_use]
    pub fn envelope(&self) -> &[f32] {
        self.gammatone.envelope()
    }

    /// Get the envelope in decibels
    #[must_use]
    pub fn envelope_db(&self) -> Vec<f32> {
        self.gammatone.envelope_db(-100.0)
    }

    /// Get the number of frequency bands
    #[must_use]
    pub fn num_bands(&self) -> usize {
        self.num_bands
    }

    /// Get the sample rate in Hz
    #[must_use]
    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    /// Get the center frequency for a band in Hz
    #[must_use]
    pub fn center_hz(&self, band: usize) -> f32 {
        self.gammatone.center_hz(band)
    }

    /// Get information about all frequency bands
    #[must_use]
    pub fn bands(&self) -> &[BandInfo] {
        self.gammatone.bands()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_builder_default() {
        let analyser = Analyser::builder().build();
        assert_eq!(analyser.num_bands(), 40);
        assert_eq!(analyser.sample_rate(), 48000.0);
    }

    #[test]
    fn test_builder_custom() {
        let analyser = Analyser::builder()
            .bands(24)
            .sample_rate(44100.0)
            .scale(Scale::Bark)
            .build();

        assert_eq!(analyser.num_bands(), 24);
        assert_eq!(analyser.sample_rate(), 44100.0);
    }

    #[test]
    fn test_process_returns_envelope() {
        let mut analyser = Analyser::new();

        // Generate 100ms of 1kHz sine wave
        let signal: Vec<f32> = (0..4800)
            .map(|i| {
                let t = i as f32 / 48000.0;
                (2.0 * PI * 1000.0 * t).sin()
            })
            .collect();

        let envelope = analyser.process(&signal);
        assert_eq!(envelope.len(), 40);

        // Find peak
        let (peak_band, _) = envelope
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
    fn test_process_stereo() {
        let mut analyser = Analyser::new();

        let signal: Vec<f32> = (0..480)
            .map(|i| {
                let t = i as f32 / 48000.0;
                (2.0 * PI * 440.0 * t).sin()
            })
            .collect();

        let envelope = analyser.process_stereo(&signal, &signal);
        assert_eq!(envelope.len(), 40);
    }

    #[test]
    fn test_envelope_db() {
        let mut analyser = Analyser::new();
        let signal: Vec<f32> = (0..480)
            .map(|i| (2.0 * PI * 1000.0 * i as f32 / 48000.0).sin())
            .collect();

        let _ = analyser.process(&signal);
        let db = analyser.envelope_db();
        assert_eq!(db.len(), 40);
    }
}
