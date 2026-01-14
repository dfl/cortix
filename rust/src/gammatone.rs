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
        let mut filter = Self {
            center_hz: 1000.0,
            r: 0.0,
            cos_omega: 0.0,
            sin_omega: 0.0,
            gain: 1.0,
            state_real: [0.0; 4],
            state_imag: [0.0; 4],
        };
        filter.setup(1000.0, erb_bandwidth(1000.0), 48000.0);
        filter
    }
}

impl GammatoneFilter {
    /// Create a new gammatone filter
    pub fn new(center_hz: f32, bandwidth_hz: f32, sample_rate: f32) -> Self {
        let mut filter = Self {
            center_hz,
            r: 0.0,
            cos_omega: 0.0,
            sin_omega: 0.0,
            gain: 1.0,
            state_real: [0.0; 4],
            state_imag: [0.0; 4],
        };
        filter.setup(center_hz, bandwidth_hz, sample_rate);
        filter
    }

    fn setup(&mut self, center_hz: f32, bandwidth_hz: f32, sample_rate: f32) {
        self.center_hz = center_hz;

        let omega = 2.0 * PI * center_hz / sample_rate;
        let bw = 2.0 * PI * bandwidth_hz / sample_rate;

        self.r = (-bw).exp();
        self.cos_omega = omega.cos();
        self.sin_omega = omega.sin();
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
    pub fn tick(&mut self, input: f32) -> f32 {
        let mut real = input * self.gain;
        let mut imag = 0.0;

        for i in 0..4 {
            let new_real =
                real + self.r * (self.cos_omega * self.state_real[i] - self.sin_omega * self.state_imag[i]);
            let new_imag =
                imag + self.r * (self.sin_omega * self.state_real[i] + self.cos_omega * self.state_imag[i]);

            self.state_real[i] = new_real;
            self.state_imag[i] = new_imag;

            real = new_real;
            imag = new_imag;
        }

        (real * real + imag * imag).sqrt()
    }

    /// Get the center frequency in Hz
    #[must_use]
    pub fn center_hz(&self) -> f32 {
        self.center_hz
    }
}

//=============================================================================
// Filterbank Builder
//=============================================================================

/// Builder for creating a GammatoneFilterbank
#[derive(Debug, Clone)]
pub struct FilterbankBuilder {
    num_bands: usize,
    min_hz: f32,
    max_hz: f32,
    sample_rate: f32,
    scale: Scale,
    smoothing_ms: f32,
}

impl Default for FilterbankBuilder {
    fn default() -> Self {
        Self {
            num_bands: 40,
            min_hz: 20.0,
            max_hz: 20000.0,
            sample_rate: 48000.0,
            scale: Scale::ERB,
            smoothing_ms: 5.0,
        }
    }
}

impl FilterbankBuilder {
    /// Create a new builder with default settings
    pub fn new() -> Self {
        Self::default()
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

    /// Set the frequency scale for band spacing
    pub fn scale(mut self, scale: Scale) -> Self {
        self.scale = scale;
        self
    }

    /// Set the envelope smoothing time in milliseconds
    pub fn smoothing(mut self, smoothing_ms: f32) -> Self {
        self.smoothing_ms = smoothing_ms;
        self
    }

    /// Build the filterbank
    #[must_use]
    pub fn build(self) -> GammatoneFilterbank {
        let band_info = generate_bands(self.scale, self.num_bands, self.min_hz, self.max_hz);

        let filters: Vec<GammatoneFilter> = band_info
            .iter()
            .map(|band| {
                let bw = erb_bandwidth(band.center_hz);
                GammatoneFilter::new(band.center_hz, bw, self.sample_rate)
            })
            .collect();

        let smooth_coeff = if self.smoothing_ms > 0.0 {
            let tau = self.smoothing_ms / 1000.0;
            (-1.0 / (tau * self.sample_rate)).exp()
        } else {
            0.0
        };

        GammatoneFilterbank {
            num_bands: self.num_bands,
            band_info,
            filters,
            magnitudes: vec![0.0; self.num_bands],
            envelope: vec![0.0; self.num_bands],
            smooth_coeff,
        }
    }
}

//=============================================================================
// Gammatone Filterbank
//=============================================================================

/// A bank of gammatone filters for spectrum analysis
///
/// # Example
///
/// ```
/// use cortix::{GammatoneFilterbank, Scale};
///
/// let mut fb = GammatoneFilterbank::builder()
///     .bands(40)
///     .sample_rate(48000.0)
///     .scale(Scale::ERB)
///     .build();
///
/// let audio = vec![0.0f32; 512];
/// fb.process(&audio);
/// let envelope = fb.envelope();
/// ```
#[derive(Debug, Clone)]
pub struct GammatoneFilterbank {
    num_bands: usize,
    band_info: Vec<BandInfo>,
    filters: Vec<GammatoneFilter>,
    magnitudes: Vec<f32>,
    envelope: Vec<f32>,
    smooth_coeff: f32,
}

impl Default for GammatoneFilterbank {
    fn default() -> Self {
        Self::builder().build()
    }
}

impl GammatoneFilterbank {
    /// Create a builder for custom configuration
    pub fn builder() -> FilterbankBuilder {
        FilterbankBuilder::new()
    }

    /// Create a new filterbank with default configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Reset all filter states
    pub fn reset(&mut self) {
        for filter in &mut self.filters {
            filter.reset();
        }
        self.magnitudes.fill(0.0);
        self.envelope.fill(0.0);
    }

    /// Process a block of samples
    pub fn process(&mut self, input: &[f32]) {
        for &sample in input {
            self.tick(sample);
        }
    }

    /// Process a single sample through all filters
    #[inline]
    fn tick(&mut self, input: f32) {
        for (i, filter) in self.filters.iter_mut().enumerate() {
            let mag = filter.tick(input);
            self.magnitudes[i] = mag;

            if self.smooth_coeff > 0.0 {
                self.envelope[i] =
                    self.smooth_coeff * self.envelope[i] + (1.0 - self.smooth_coeff) * mag;
            } else {
                self.envelope[i] = mag;
            }
        }
    }

    /// Get the number of bands
    #[must_use]
    pub fn num_bands(&self) -> usize {
        self.num_bands
    }

    /// Get the smoothed envelope (magnitude per band)
    #[must_use]
    pub fn envelope(&self) -> &[f32] {
        &self.envelope
    }

    /// Get raw (unsmoothed) magnitudes
    #[must_use]
    pub fn magnitudes(&self) -> &[f32] {
        &self.magnitudes
    }

    /// Get band information
    #[must_use]
    pub fn bands(&self) -> &[BandInfo] {
        &self.band_info
    }

    /// Get center frequency for a band in Hz
    #[must_use]
    pub fn center_hz(&self, band: usize) -> f32 {
        self.band_info[band].center_hz
    }

    /// Get the envelope in decibels
    #[must_use]
    pub fn envelope_db(&self, min_db: f32) -> Vec<f32> {
        self.envelope
            .iter()
            .map(|&mag| {
                if mag > 0.0 {
                    20.0 * mag.log10()
                } else {
                    min_db
                }
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder_default() {
        let fb = GammatoneFilterbank::builder().build();
        assert_eq!(fb.num_bands(), 40);
    }

    #[test]
    fn test_builder_custom() {
        let fb = GammatoneFilterbank::builder()
            .bands(24)
            .sample_rate(44100.0)
            .build();
        assert_eq!(fb.num_bands(), 24);
    }

    #[test]
    fn test_1khz_sine() {
        let mut fb = GammatoneFilterbank::builder()
            .bands(40)
            .sample_rate(48000.0)
            .scale(Scale::ERB)
            .build();

        // Generate 100ms of 1kHz sine wave
        let signal: Vec<f32> = (0..4800)
            .map(|i| {
                let t = i as f32 / 48000.0;
                (2.0 * PI * 1000.0 * t).sin()
            })
            .collect();

        fb.process(&signal);

        // Find peak band
        let (peak_band, _) = fb
            .envelope()
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap())
            .unwrap();

        let peak_freq = fb.center_hz(peak_band);
        assert!(
            peak_freq > 800.0 && peak_freq < 1200.0,
            "Peak at {} Hz, expected near 1000 Hz",
            peak_freq
        );
    }
}
