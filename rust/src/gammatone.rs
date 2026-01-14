//! Gammatone Filterbank
//!
//! Efficient IIR implementation of gammatone filters for real-time
//! auditory spectrum analysis. Based on the all-pole gammatone
//! approximation by Slaney (1993) and Lyon (1997).
//!
//! The gammatone filter models the impulse response of the basilar membrane:
//!   g(t) = t^(n-1) * exp(-2*pi*b*t) * cos(2*pi*f*t)
//!
//! Where n=4 (filter order), b=bandwidth, f=center frequency.

use std::f32::consts::PI;

use crate::scales::{erb_bandwidth, generate_bands, BandInfo, Scale};

//=============================================================================
// Gammatone Filter (Single Band)
// 4th-order IIR approximation using cascaded complex resonators
//=============================================================================

/// A single gammatone filter for one frequency band
#[derive(Debug, Clone)]
pub struct GammatoneFilter {
    center_hz: f32,
    sample_rate: f32,
    r: f32,         // Pole radius
    cos_omega: f32, // cos(center frequency)
    sin_omega: f32, // sin(center frequency)
    gain: f32,      // Input normalization

    // State for 4 cascaded complex resonators
    state_real: [f32; 4],
    state_imag: [f32; 4],
}

impl Default for GammatoneFilter {
    fn default() -> Self {
        Self {
            center_hz: 1000.0,
            sample_rate: 48000.0,
            r: 0.0,
            cos_omega: 0.0,
            sin_omega: 0.0,
            gain: 1.0,
            state_real: [0.0; 4],
            state_imag: [0.0; 4],
        }
    }
}

impl GammatoneFilter {
    /// Create a new gammatone filter with the given parameters
    pub fn new(center_hz: f32, bandwidth_hz: f32, sample_rate: f32) -> Self {
        let mut filter = Self::default();
        filter.configure(center_hz, bandwidth_hz, sample_rate);
        filter
    }

    /// Configure the filter parameters
    pub fn configure(&mut self, center_hz: f32, bandwidth_hz: f32, sample_rate: f32) {
        self.center_hz = center_hz;
        self.sample_rate = sample_rate;

        // Angular frequency
        let omega = 2.0 * PI * center_hz / sample_rate;

        // Bandwidth coefficient (controls decay rate)
        // ERB-based bandwidth scaled for 4th-order filter
        let bw = 2.0 * PI * bandwidth_hz / sample_rate;

        // Pole radius and angle for complex resonator
        // For 4th order gammatone, we cascade 4 identical 1st-order sections
        self.r = (-bw).exp();
        self.cos_omega = omega.cos();
        self.sin_omega = omega.sin();

        // Input gain normalization (approximate)
        self.gain = (1.0 - self.r).powi(4) * 2.0;

        self.reset();
    }

    /// Reset filter state
    pub fn reset(&mut self) {
        self.state_real = [0.0; 4];
        self.state_imag = [0.0; 4];
    }

    /// Process a single sample, returns instantaneous envelope
    #[inline]
    pub fn process(&mut self, input: f32) -> f32 {
        // Apply input gain
        let mut real = input * self.gain;
        let mut imag = 0.0;

        // Cascade of 4 complex resonators
        for i in 0..4 {
            // output = input + pole * state
            // For complex pole p = r * e^(j*omega):
            let new_real =
                real + self.r * (self.cos_omega * self.state_real[i] - self.sin_omega * self.state_imag[i]);
            let new_imag =
                imag + self.r * (self.sin_omega * self.state_real[i] + self.cos_omega * self.state_imag[i]);

            self.state_real[i] = new_real;
            self.state_imag[i] = new_imag;

            real = new_real;
            imag = new_imag;
        }

        // Envelope = magnitude of complex output
        (real * real + imag * imag).sqrt()
    }

    /// Process a block of samples
    pub fn process_block(&mut self, input: &[f32], output: &mut [f32]) {
        for (i, &sample) in input.iter().enumerate() {
            output[i] = self.process(sample);
        }
    }

    /// Get the center frequency in Hz
    pub fn center_hz(&self) -> f32 {
        self.center_hz
    }
}

//=============================================================================
// Gammatone Filterbank
// Bank of gammatone filters with configurable spacing
//=============================================================================

/// Configuration for the gammatone filterbank
#[derive(Debug, Clone)]
pub struct FilterbankConfig {
    /// Number of frequency bands
    pub num_bands: usize,
    /// Minimum frequency in Hz
    pub min_hz: f32,
    /// Maximum frequency in Hz
    pub max_hz: f32,
    /// Sample rate in Hz
    pub sample_rate: f32,
    /// Frequency scale for band spacing (ERB is standard for gammatone)
    pub spacing: Scale,
    /// Envelope smoothing time constant in milliseconds
    pub smoothing_ms: f32,
}

impl Default for FilterbankConfig {
    fn default() -> Self {
        Self {
            num_bands: 40,
            min_hz: 20.0,
            max_hz: 20000.0,
            sample_rate: 48000.0,
            spacing: Scale::ERB,
            smoothing_ms: 5.0,
        }
    }
}

/// A bank of gammatone filters for spectrum analysis
#[derive(Debug, Clone)]
pub struct GammatoneFilterbank {
    config: FilterbankConfig,
    bands: Vec<BandInfo>,
    filters: Vec<GammatoneFilter>,
    magnitudes: Vec<f32>,
    smoothed_magnitudes: Vec<f32>,
    smooth_coeff: f32,
}

impl Default for GammatoneFilterbank {
    fn default() -> Self {
        let mut fb = Self {
            config: FilterbankConfig::default(),
            bands: Vec::new(),
            filters: Vec::new(),
            magnitudes: Vec::new(),
            smoothed_magnitudes: Vec::new(),
            smooth_coeff: 0.0,
        };
        fb.configure(FilterbankConfig::default());
        fb
    }
}

impl GammatoneFilterbank {
    /// Create a new filterbank with default configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a filterbank with the given configuration
    pub fn with_config(config: FilterbankConfig) -> Self {
        let mut fb = Self {
            config: FilterbankConfig::default(),
            bands: Vec::new(),
            filters: Vec::new(),
            magnitudes: Vec::new(),
            smoothed_magnitudes: Vec::new(),
            smooth_coeff: 0.0,
        };
        fb.configure(config);
        fb
    }

    /// Configure the filterbank
    pub fn configure(&mut self, config: FilterbankConfig) {
        self.config = config.clone();

        // Generate band frequencies according to scale
        self.bands = generate_bands(config.spacing, config.num_bands, config.min_hz, config.max_hz);

        // Create filters
        self.filters = Vec::with_capacity(config.num_bands);
        for band in &self.bands {
            // Use ERB bandwidth for each filter (standard for gammatone)
            let bw = erb_bandwidth(band.center_hz);
            self.filters
                .push(GammatoneFilter::new(band.center_hz, bw, config.sample_rate));
        }

        // Envelope smoothing coefficient
        if config.smoothing_ms > 0.0 {
            let tau = config.smoothing_ms / 1000.0;
            self.smooth_coeff = (-1.0 / (tau * config.sample_rate)).exp();
        } else {
            self.smooth_coeff = 0.0;
        }

        // Allocate output buffers
        self.magnitudes = vec![0.0; config.num_bands];
        self.smoothed_magnitudes = vec![0.0; config.num_bands];
    }

    /// Reset all filter states
    pub fn reset(&mut self) {
        for filter in &mut self.filters {
            filter.reset();
        }
        self.magnitudes.fill(0.0);
        self.smoothed_magnitudes.fill(0.0);
    }

    /// Process a single sample through all filters
    #[inline]
    pub fn process(&mut self, input: f32) {
        for (i, filter) in self.filters.iter_mut().enumerate() {
            let mag = filter.process(input);
            self.magnitudes[i] = mag;

            // Exponential smoothing
            if self.smooth_coeff > 0.0 {
                self.smoothed_magnitudes[i] =
                    self.smooth_coeff * self.smoothed_magnitudes[i] + (1.0 - self.smooth_coeff) * mag;
            } else {
                self.smoothed_magnitudes[i] = mag;
            }
        }
    }

    /// Process a block of samples
    pub fn process_block(&mut self, input: &[f32]) {
        for &sample in input {
            self.process(sample);
        }
    }

    /// Get the number of bands
    pub fn num_bands(&self) -> usize {
        self.config.num_bands
    }

    /// Get raw magnitudes (not smoothed)
    pub fn magnitudes(&self) -> &[f32] {
        &self.magnitudes
    }

    /// Get smoothed magnitudes
    pub fn smoothed_magnitudes(&self) -> &[f32] {
        &self.smoothed_magnitudes
    }

    /// Get band information
    pub fn band_info(&self) -> &[BandInfo] {
        &self.bands
    }

    /// Get magnitude for a specific band
    pub fn magnitude(&self, band: usize) -> f32 {
        self.magnitudes[band]
    }

    /// Get smoothed magnitude for a specific band
    pub fn smoothed_magnitude(&self, band: usize) -> f32 {
        self.smoothed_magnitudes[band]
    }

    /// Get center frequency for a band in Hz
    pub fn center_hz(&self, band: usize) -> f32 {
        self.bands[band].center_hz
    }

    /// Get magnitudes as dB values
    pub fn magnitudes_db(&self, output: &mut [f32], min_db: f32) {
        for (i, &mag) in self.smoothed_magnitudes.iter().enumerate() {
            output[i] = if mag > 0.0 {
                20.0 * mag.log10()
            } else {
                min_db
            };
        }
    }

    /// Get magnitude for a band as dB
    pub fn magnitude_db(&self, band: usize, min_db: f32) -> f32 {
        let mag = self.smoothed_magnitudes[band];
        if mag > 0.0 {
            20.0 * mag.log10()
        } else {
            min_db
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    #[test]
    fn test_filterbank_creation() {
        let fb = GammatoneFilterbank::new();
        assert_eq!(fb.num_bands(), 40);
    }

    #[test]
    fn test_filterbank_custom_config() {
        let config = FilterbankConfig {
            num_bands: 24,
            sample_rate: 44100.0,
            ..Default::default()
        };
        let fb = GammatoneFilterbank::with_config(config);
        assert_eq!(fb.num_bands(), 24);
    }

    #[test]
    fn test_filterbank_1khz_sine() {
        let config = FilterbankConfig {
            num_bands: 40,
            sample_rate: 48000.0,
            spacing: Scale::ERB,
            ..Default::default()
        };
        let mut fb = GammatoneFilterbank::with_config(config);

        // Generate 100ms of 1kHz sine wave
        let num_samples = 4800;
        let signal: Vec<f32> = (0..num_samples)
            .map(|i| {
                let t = i as f32 / 48000.0;
                (2.0 * PI * 1000.0 * t).sin()
            })
            .collect();

        fb.process_block(&signal);

        // Find peak band
        let (peak_band, _peak_mag) = fb
            .smoothed_magnitudes()
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap();

        // Peak should be near 1kHz
        let peak_freq = fb.center_hz(peak_band);
        assert!(
            peak_freq > 800.0 && peak_freq < 1200.0,
            "Peak at {} Hz, expected near 1000 Hz",
            peak_freq
        );
    }
}
