//! Frequency Scale Conversions
//!
//! Provides conversions between Hz and perceptual scales:
//! - Bark (critical bands)
//! - ERB (equivalent rectangular bandwidth)
//! - Mel (pitch perception)

//=============================================================================
// Bark Scale (Critical Bands)
// Based on Traunmüller (1990) formula
//=============================================================================

/// Convert frequency in Hz to Bark scale
#[inline]
pub fn hz_to_bark(hz: f32) -> f32 {
    26.81 * hz / (1960.0 + hz) - 0.53
}

/// Convert Bark scale to frequency in Hz
#[inline]
pub fn bark_to_hz(bark: f32) -> f32 {
    // Inverse of Traunmüller formula
    1960.0 * (bark + 0.53) / (26.28 - bark)
}

/// Critical bandwidth at given frequency (Hz)
/// Zwicker & Terhardt (1980)
#[inline]
pub fn critical_bandwidth(hz: f32) -> f32 {
    25.0 + 75.0 * (1.0 + 1.4 * (hz / 1000.0) * (hz / 1000.0)).powf(0.69)
}

//=============================================================================
// ERB Scale (Equivalent Rectangular Bandwidth)
// Based on Glasberg & Moore (1990)
//=============================================================================

/// ERB bandwidth at given frequency (Hz)
#[inline]
pub fn erb_bandwidth(hz: f32) -> f32 {
    24.7 * (4.37 * hz / 1000.0 + 1.0)
}

/// Convert frequency in Hz to ERB-rate scale
#[inline]
pub fn hz_to_erb(hz: f32) -> f32 {
    21.4 * (4.37 * hz / 1000.0 + 1.0).log10()
}

/// Convert ERB-rate scale to frequency in Hz
#[inline]
pub fn erb_to_hz(erb: f32) -> f32 {
    (10.0_f32.powf(erb / 21.4) - 1.0) * 1000.0 / 4.37
}

//=============================================================================
// Mel Scale (Pitch Perception)
// Based on O'Shaughnessy (1987)
//=============================================================================

/// Convert frequency in Hz to Mel scale
#[inline]
pub fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

/// Convert Mel scale to frequency in Hz
#[inline]
pub fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

//=============================================================================
// Scale Types
//=============================================================================

/// Frequency scale types for band spacing
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Scale {
    /// Linear frequency (Hz)
    Linear,
    /// Logarithmic (octaves)
    Log,
    /// Critical bands
    Bark,
    /// Equivalent rectangular bandwidth
    #[default]
    ERB,
    /// Pitch perception
    Mel,
}

//=============================================================================
// Band Information
//=============================================================================

/// Information about a frequency band
#[derive(Debug, Clone, Copy)]
pub struct BandInfo {
    /// Center frequency in Hz
    pub center_hz: f32,
    /// Bandwidth in Hz
    pub bandwidth_hz: f32,
    /// Lower edge frequency
    pub low_hz: f32,
    /// Upper edge frequency
    pub high_hz: f32,
}

/// Generate frequency bands spaced according to the given scale
pub fn generate_bands(scale: Scale, num_bands: usize, min_hz: f32, max_hz: f32) -> Vec<BandInfo> {
    let mut bands = Vec::with_capacity(num_bands);

    match scale {
        Scale::Linear => {
            let step = (max_hz - min_hz) / num_bands as f32;
            for i in 0..num_bands {
                let low_hz = min_hz + i as f32 * step;
                let high_hz = low_hz + step;
                bands.push(BandInfo {
                    low_hz,
                    high_hz,
                    center_hz: (low_hz + high_hz) / 2.0,
                    bandwidth_hz: step,
                });
            }
        }

        Scale::Log => {
            let log_min = min_hz.log2();
            let log_max = max_hz.log2();
            let step = (log_max - log_min) / num_bands as f32;
            for i in 0..num_bands {
                let low_hz = 2.0_f32.powf(log_min + i as f32 * step);
                let high_hz = 2.0_f32.powf(log_min + (i + 1) as f32 * step);
                bands.push(BandInfo {
                    low_hz,
                    high_hz,
                    center_hz: (low_hz * high_hz).sqrt(), // Geometric mean
                    bandwidth_hz: high_hz - low_hz,
                });
            }
        }

        Scale::Bark => {
            let bark_min = hz_to_bark(min_hz);
            let bark_max = hz_to_bark(max_hz);
            let step = (bark_max - bark_min) / num_bands as f32;
            for i in 0..num_bands {
                let bark_low = bark_min + i as f32 * step;
                let bark_high = bark_min + (i + 1) as f32 * step;
                let low_hz = bark_to_hz(bark_low);
                let high_hz = bark_to_hz(bark_high);
                bands.push(BandInfo {
                    low_hz,
                    high_hz,
                    center_hz: bark_to_hz((bark_low + bark_high) / 2.0),
                    bandwidth_hz: high_hz - low_hz,
                });
            }
        }

        Scale::ERB => {
            let erb_min = hz_to_erb(min_hz);
            let erb_max = hz_to_erb(max_hz);
            let step = (erb_max - erb_min) / num_bands as f32;
            for i in 0..num_bands {
                let erb_low = erb_min + i as f32 * step;
                let erb_high = erb_min + (i + 1) as f32 * step;
                let low_hz = erb_to_hz(erb_low);
                let high_hz = erb_to_hz(erb_high);
                bands.push(BandInfo {
                    low_hz,
                    high_hz,
                    center_hz: erb_to_hz((erb_low + erb_high) / 2.0),
                    bandwidth_hz: high_hz - low_hz,
                });
            }
        }

        Scale::Mel => {
            let mel_min = hz_to_mel(min_hz);
            let mel_max = hz_to_mel(max_hz);
            let step = (mel_max - mel_min) / num_bands as f32;
            for i in 0..num_bands {
                let mel_low = mel_min + i as f32 * step;
                let mel_high = mel_min + (i + 1) as f32 * step;
                let low_hz = mel_to_hz(mel_low);
                let high_hz = mel_to_hz(mel_high);
                bands.push(BandInfo {
                    low_hz,
                    high_hz,
                    center_hz: mel_to_hz((mel_low + mel_high) / 2.0),
                    bandwidth_hz: high_hz - low_hz,
                });
            }
        }
    }

    bands
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_equal(a: f32, b: f32, tolerance: f32) -> bool {
        (a - b).abs() < tolerance
    }

    #[test]
    fn test_bark_roundtrip() {
        let test_freqs = [100.0, 500.0, 1000.0, 4000.0, 10000.0];
        for hz in test_freqs {
            let bark = hz_to_bark(hz);
            let back_hz = bark_to_hz(bark);
            assert!(approx_equal(hz, back_hz, hz * 0.01));
        }
    }

    #[test]
    fn test_bark_known_values() {
        // Using Traunmüller formula: hz_to_bark(100) ≈ 0.77
        assert!(approx_equal(hz_to_bark(100.0), 0.77, 0.1));
        assert!(approx_equal(hz_to_bark(1000.0), 8.5, 0.2));
    }

    #[test]
    fn test_erb_roundtrip() {
        let test_freqs = [100.0, 500.0, 1000.0, 4000.0, 10000.0];
        for hz in test_freqs {
            let erb = hz_to_erb(hz);
            let back_hz = erb_to_hz(erb);
            assert!(approx_equal(hz, back_hz, hz * 0.01));
        }
    }

    #[test]
    fn test_erb_bandwidth() {
        // At 1kHz, ERB should be about 133 Hz
        assert!(approx_equal(erb_bandwidth(1000.0), 133.0, 5.0));
    }

    #[test]
    fn test_mel_roundtrip() {
        let test_freqs = [100.0, 500.0, 1000.0, 4000.0, 10000.0];
        for hz in test_freqs {
            let mel = hz_to_mel(hz);
            let back_hz = mel_to_hz(mel);
            assert!(approx_equal(hz, back_hz, hz * 0.01));
        }
    }

    #[test]
    fn test_mel_known_value() {
        // 1000 Hz ≈ 1000 Mel
        assert!(approx_equal(hz_to_mel(1000.0), 1000.0, 50.0));
    }

    #[test]
    fn test_band_generation() {
        let bands = generate_bands(Scale::ERB, 40, 20.0, 20000.0);
        assert_eq!(bands.len(), 40);

        // Check ascending order
        for i in 1..bands.len() {
            assert!(bands[i].center_hz > bands[i - 1].center_hz);
        }

        // Check range bounds (allow small floating point error)
        assert!(bands[0].low_hz >= 19.99);
        assert!(bands[0].low_hz < 50.0);
        assert!(bands.last().unwrap().high_hz <= 20001.0);
        assert!(bands.last().unwrap().high_hz > 15000.0);
    }
}
