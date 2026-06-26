//! Shared 8-bit palette → RGBA8 conversion. GoldSrc miptex / qpic / qfont /
//! sprite / mdl textures are all palette indices plus an RGB palette; they
//! differ only in how transparency is derived. This is the single source of
//! that index→RGBA lookup.

use crate::Rgba;

/// How a palette index maps to alpha (and, for `IndexAlpha`, to colour).
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PaletteMode {
    /// Fully opaque (alpha 255 everywhere).
    Opaque,
    /// Colour-key: index 255 is fully transparent, every other index opaque.
    ColorKey,
    /// Colour-key on index 0 transparent (HL fonts use index 0 as background).
    ColorKey0,
    /// Index-alpha: colour = the last palette entry, alpha = the index value.
    IndexAlpha,
}

/// Map `indices` (one byte per pixel) through `palette` (RGB triples) into a
/// top-down RGBA8 image of `w`×`h`, applying the transparency `mode`. Indices or
/// palette entries that fall out of range are left transparent (zeroed).
pub fn palettize(indices: &[u8], palette: &[u8], w: u32, h: u32, mode: PaletteMode) -> Rgba {
    let mut out = Rgba::new(w, h);
    let last = 255 * 3; // last palette entry, used by IndexAlpha
    for (i, &idx) in indices.iter().enumerate() {
        let o = i * 4;
        if o + 4 > out.pixels.len() {
            break;
        }
        match mode {
            PaletteMode::ColorKey if idx == 255 => continue, // colour-key: leave transparent
            PaletteMode::ColorKey0 if idx == 0 => continue, // font background: leave transparent
            PaletteMode::IndexAlpha => {
                if last + 2 < palette.len() {
                    out.pixels[o..o + 3].copy_from_slice(&palette[last..last + 3]);
                }
                out.pixels[o + 3] = idx;
            }
            _ => {
                let p = idx as usize * 3;
                if p + 2 < palette.len() {
                    out.pixels[o..o + 3].copy_from_slice(&palette[p..p + 3]);
                    out.pixels[o + 3] = 255;
                }
            }
        }
    }
    out
}
