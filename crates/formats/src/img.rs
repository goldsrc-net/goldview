//! Standard image decode (TGA/BMP/PNG) via the `image` crate, plus a tiny WAV
//! header reader for the audio inspector.

use crate::Rgba;
use anyhow::{anyhow, Context, Result};
use std::io::{Cursor, Read};

/// Decode TGA / BMP / PNG bytes into top-down RGBA8. `ext` is the file
/// extension used as a format hint — **required for TGA**, which (unlike BMP/PNG)
/// has no magic bytes, so the `image` crate's content-sniffing can't detect it.
pub fn decode_image(bytes: &[u8], ext: &str) -> Result<Rgba> {
    use image::ImageFormat;
    let fmt = match ext.to_ascii_lowercase().as_str() {
        "tga" => Some(ImageFormat::Tga),
        "bmp" => Some(ImageFormat::Bmp),
        "png" => Some(ImageFormat::Png),
        _ => None,
    };
    let img = match fmt {
        Some(f) => image::load_from_memory_with_format(bytes, f).context("decode image")?,
        None => image::load_from_memory(bytes).context("decode image (sniffed)")?,
    };
    let rgba = img.to_rgba8();
    Ok(Rgba { width: rgba.width(), height: rgba.height(), pixels: rgba.into_raw() })
}

/// Decode then downscale to fit within `max`×`max` (aspect-preserving) for grid
/// thumbnails. Cheaper to ship than full images and keeps big folders smooth.
pub fn decode_thumbnail(bytes: &[u8], ext: &str, max: u32) -> Result<Rgba> {
    use image::ImageFormat;
    let fmt = match ext.to_ascii_lowercase().as_str() {
        "tga" => Some(ImageFormat::Tga),
        "bmp" => Some(ImageFormat::Bmp),
        "png" => Some(ImageFormat::Png),
        _ => None,
    };
    let img = match fmt {
        Some(f) => image::load_from_memory_with_format(bytes, f).context("decode thumb")?,
        None => image::load_from_memory(bytes).context("decode thumb (sniffed)")?,
    };
    let max = max.max(1);
    let thumb = img.thumbnail(max, max); // fast box filter, preserves aspect
    let rgba = thumb.to_rgba8();
    Ok(Rgba { width: rgba.width(), height: rgba.height(), pixels: rgba.into_raw() })
}

/// Downscale an already-decoded RGBA buffer to fit within `max`×`max`
/// (aspect-preserving). Used for sprite/wad tile thumbnails.
pub fn downscale(src: &Rgba, max: u32) -> Rgba {
    use image::{DynamicImage, RgbaImage};
    if src.width <= max && src.height <= max {
        return src.clone();
    }
    let img = match RgbaImage::from_raw(src.width, src.height, src.pixels.clone()) {
        Some(i) => i,
        None => return src.clone(),
    };
    let t = DynamicImage::ImageRgba8(img).thumbnail(max.max(1), max.max(1)).to_rgba8();
    Rgba { width: t.width(), height: t.height(), pixels: t.into_raw() }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct WavInfo {
    pub channels: u16,
    pub sample_rate: u32,
    pub bits_per_sample: u16,
    /// Duration in seconds, best-effort from the `data` chunk size.
    pub duration_secs: f32,
    pub bytes: usize,
}

/// Parse a RIFF/WAVE header for the inspector. Best-effort: returns the `fmt `
/// fields and a duration derived from the `data` chunk. Non-PCM files still
/// return whatever the `fmt ` chunk states.
pub fn wav_info(bytes: &[u8]) -> Result<WavInfo> {
    let mut c = Cursor::new(bytes);
    let mut riff = [0u8; 4];
    c.read_exact(&mut riff).context("read RIFF")?;
    if &riff != b"RIFF" {
        return Err(anyhow!("not a RIFF file"));
    }
    let mut skip4 = [0u8; 4];
    c.read_exact(&mut skip4)?; // chunk size
    let mut wave = [0u8; 4];
    c.read_exact(&mut wave)?;
    if &wave != b"WAVE" {
        return Err(anyhow!("not a WAVE file"));
    }

    let mut channels = 0u16;
    let mut sample_rate = 0u32;
    let mut bits = 0u16;
    let mut block_align = 0u16;
    let mut data_len = 0u32;

    let mut id = [0u8; 4];
    while c.read_exact(&mut id).is_ok() {
        let mut sz = [0u8; 4];
        if c.read_exact(&mut sz).is_err() {
            break;
        }
        let size = u32::from_le_bytes(sz);
        let pos = c.position() as usize;
        let end = (pos + size as usize).min(bytes.len());
        let chunk = &bytes[pos..end];
        match &id {
            b"fmt " if chunk.len() >= 16 => {
                channels = u16::from_le_bytes([chunk[2], chunk[3]]);
                sample_rate = u32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]);
                block_align = u16::from_le_bytes([chunk[12], chunk[13]]);
                bits = u16::from_le_bytes([chunk[14], chunk[15]]);
            }
            b"data" => data_len = size,
            _ => {}
        }
        // chunks are word-aligned
        let advance = size as u64 + (size as u64 & 1);
        c.set_position(c.position() + advance);
    }

    let bytes_per_sec = if block_align > 0 {
        sample_rate as u64 * block_align as u64
    } else {
        sample_rate as u64 * channels as u64 * (bits as u64 / 8)
    };
    let duration_secs = if bytes_per_sec > 0 {
        data_len as f32 / bytes_per_sec as f32
    } else {
        0.0
    };

    Ok(WavInfo { channels, sample_rate, bits_per_sample: bits, duration_secs, bytes: bytes.len() })
}
