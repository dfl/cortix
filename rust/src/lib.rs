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
//! use cortix::{Analyser, Scale};
//!
//! // Create analyser with builder pattern
//! let mut analyser = Analyser::builder()
//!     .sample_rate(48000.0)
//!     .bands(40)
//!     .scale(Scale::ERB)
//!     .build();
//!
//! // Process audio and get envelope
//! let audio = vec![0.0f32; 512];
//! let envelope = analyser.process(&audio);
//!
//! // Get dB values
//! let db = analyser.envelope_db();
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
pub use analyser::{AnalysisMode, Analyser, AnalyserBuilder};
pub use gammatone::{FilterbankBuilder, GammatoneFilter, GammatoneFilterbank};
pub use scales::{
    bark_to_hz, critical_bandwidth, erb_bandwidth, erb_to_hz, generate_bands, hz_to_bark,
    hz_to_erb, hz_to_mel, mel_to_hz, BandInfo, Scale,
};
