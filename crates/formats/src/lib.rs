//! gv-formats — hand-rolled parsers for GoldSrc / Half-Life resource formats.
//!
//! Pure Rust, no Tauri dependency, so each parser is unit-testable in isolation
//! against the real assets under `xash3d-fwgs/dist/client-x64/{ts,valve}`.
//!
//! Modules are added per phase:
//!   Phase 0: `img` (TGA/BMP/PNG decode, WAV header info)
//!   Phase 1: `wad`, `miptex`
//!   Phase 2: `bsp`, `lightmap`
//!   Phase 3-4: `mdl`
//!   Phase 5: `spr`, `sc`

pub mod img;

/// A decoded, top-down RGBA8 image — the common currency for every texture path.
#[derive(Debug, Clone, serde::Serialize)]
pub struct Rgba {
    pub width: u32,
    pub height: u32,
    /// `width * height * 4` bytes, row-major, top-left origin.
    pub pixels: Vec<u8>,
}

impl Rgba {
    pub fn new(width: u32, height: u32) -> Self {
        Rgba { width, height, pixels: vec![0; (width as usize) * (height as usize) * 4] }
    }
}
