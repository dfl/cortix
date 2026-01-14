//! # Cortix - Perceptual Audio Spectrum Analyser
//!
//! A high-performance, perceptually-accurate spectrum analysis library
//! featuring Gammatone filterbanks, multiple frequency scales (Bark, ERB, Mel),
//! and real-time processing capabilities.
//!
//! Named after the Organ of Corti - the biological spectrum analyser in the cochlea
//! where sound is converted to neural signals.
//!
//! ## Quick Start
//!
//! ```rust
//! use cortix::{Analyser, AnalyserConfig, Scale};
//!
//! // Create analyser: 48kHz, 40 ERB-spaced bands
//! let config = AnalyserConfig {
//!     sample_rate: 48000.0,
//!     num_bands: 40,
//!     scale: Scale::ERB,
//!     ..Default::default()
//! };
//!
//! let mut analyser = Analyser::with_config(config);
//!
//! // Process audio
//! let audio_buffer: Vec<f32> = vec![0.0; 512]; // Your audio data
//! analyser.process_block(&audio_buffer);
//!
//! // Get results
//! let mut magnitudes_db = vec![0.0; analyser.num_bands()];
//! analyser.get_magnitudes_db(&mut magnitudes_db);
//! ```
//!
//! ## Features
//!
//! - **Gammatone Filterbank** - Auditory model with true frequency resolution
//! - **Multiple Scales** - Bark, ERB, Mel, Log, and Linear frequency spacing
//! - **Real-time Performance** - Sub-millisecond latency, efficient per-sample processing
//! - **Perceptually Accurate** - Based on auditory neuroscience research
//!
//! ## Frequency Scales
//!
//! | Scale | Description | Use Case |
//! |-------|-------------|----------|
//! | Linear | Uniform Hz spacing | Scientific analysis |
//! | Log | Logarithmic (octaves) | Music, harmonics |
//! | Bark | Critical bands | Masking, loudness |
//! | ERB | Equivalent rectangular bandwidth | Auditory models |
//! | Mel | Pitch perception | Speech recognition |

pub mod analyser;
pub mod gammatone;
pub mod scales;

// Re-export main types at crate root
pub use analyser::{AnalysisMode, Analyser, AnalyserConfig};
pub use gammatone::{FilterbankConfig, GammatoneFilter, GammatoneFilterbank};
pub use scales::{
    bark_to_hz, critical_bandwidth, erb_bandwidth, erb_to_hz, generate_bands, hz_to_bark,
    hz_to_erb, hz_to_mel, mel_to_hz, BandInfo, Scale,
};

/// Library version
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Major version number
pub const VERSION_MAJOR: u32 = 0;

/// Minor version number
pub const VERSION_MINOR: u32 = 1;

/// Patch version number
pub const VERSION_PATCH: u32 = 0;
