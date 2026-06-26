//! GoldSrc palettized texture decode: `miptex` (the BSP/WAD3 texture lump),
//! `qpic` (menu pictures), and a best-effort `qfont`. All share an 8-bit
//! palette appended after the pixel data. Names beginning with `{` use palette
//! index 255 as a transparent colour-key.

use crate::Rgba;
use anyhow::{anyhow, Result};

fn rd_u32(b: &[u8], o: usize) -> Result<u32> {
    b.get(o..o + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| anyhow!("truncated u32 @ {o}"))
}

fn rd_u16(b: &[u8], o: usize) -> Result<u16> {
    b.get(o..o + 2)
        .map(|s| u16::from_le_bytes([s[0], s[1]]))
        .ok_or_else(|| anyhow!("truncated u16 @ {o}"))
}

pub fn cstr(b: &[u8]) -> String {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    String::from_utf8_lossy(&b[..end]).into_owned()
}

/// Read the palette that follows the pixel data: `[u16 count][count*3 RGB]` at
/// `count_off`. Returns the RGB slice (clamped to the buffer). Single source of
/// the "palette appended after pixels" parse for miptex / qpic / qfont.
fn read_palette(data: &[u8], count_off: usize) -> Result<&[u8]> {
    let count = rd_u16(data, count_off).unwrap_or(256) as usize;
    let pal_off = count_off + 2;
    let pal_end = (pal_off + count * 3).min(data.len());
    data.get(pal_off..pal_end).ok_or_else(|| anyhow!("palette out of range"))
}

/// Map palette indices → RGBA. `transparent` makes index 255 fully transparent.
fn palettize(indices: &[u8], palette: &[u8], w: u32, h: u32, transparent: bool) -> Rgba {
    let mut out = Rgba::new(w, h);
    for (i, &idx) in indices.iter().enumerate() {
        let o = i * 4;
        if o + 4 > out.pixels.len() {
            break;
        }
        if transparent && idx == 255 {
            // colour-key: leave fully transparent (already zeroed)
            continue;
        }
        let p = idx as usize * 3;
        if p + 2 < palette.len() {
            out.pixels[o] = palette[p];
            out.pixels[o + 1] = palette[p + 1];
            out.pixels[o + 2] = palette[p + 2];
            out.pixels[o + 3] = 255;
        }
    }
    out
}

/// Read just the `(name, width, height)` of a miptex header without decoding.
pub fn miptex_dimensions(data: &[u8]) -> Result<(String, u32, u32)> {
    let name = cstr(data.get(0..16).ok_or_else(|| anyhow!("short miptex"))?);
    Ok((name, rd_u32(data, 16)?, rd_u32(data, 20)?))
}

/// Decode a miptex lump (mip level 0) to RGBA. `data` starts at the miptex
/// header. Works for both embedded-BSP and WAD3 miptex (palette appended after
/// the 4th mip when offsets are present).
pub fn decode_miptex(data: &[u8]) -> Result<Rgba> {
    let name = cstr(data.get(0..16).ok_or_else(|| anyhow!("short miptex"))?);
    let width = rd_u32(data, 16)?;
    let height = rd_u32(data, 20)?;
    if width == 0 || height == 0 || width > 8192 || height > 8192 {
        return Err(anyhow!("bad miptex size {width}x{height}"));
    }
    let off0 = rd_u32(data, 24)? as usize;
    let off3 = rd_u32(data, 36)? as usize;
    let npix = (width as usize) * (height as usize);

    let indices = data
        .get(off0..off0 + npix)
        .ok_or_else(|| anyhow!("miptex mip0 out of range"))?;

    // palette sits after mip3: [mip3 pixels][u16 count][count*3 RGB]
    let mip3_len = ((width / 8).max(1) as usize) * ((height / 8).max(1) as usize);
    let palette = read_palette(data, off3 + mip3_len)?;

    Ok(palettize(indices, palette, width, height, name.starts_with('{')))
}

/// Decode a qpic lump: `u32 width, u32 height, [w*h indices], u16 count, palette`.
pub fn decode_qpic(data: &[u8]) -> Result<Rgba> {
    let width = rd_u32(data, 0)?;
    let height = rd_u32(data, 4)?;
    if width == 0 || height == 0 || width > 8192 || height > 8192 {
        return Err(anyhow!("bad qpic size {width}x{height}"));
    }
    let npix = (width as usize) * (height as usize);
    let indices = data.get(8..8 + npix).ok_or_else(|| anyhow!("qpic pixels out of range"))?;
    let palette = read_palette(data, 8 + npix)?;
    Ok(palettize(indices, palette, width, height, false))
}

/// Best-effort qfont decode: `qpic` header + a 256-entry charinfo table before
/// the pixels. Layout: `u32 width, u32 height, u32 rowcount, u32 rowheight,
/// 256*(u16,u16) charinfo, [w*h indices], u16 count, palette`.
pub fn decode_qfont(data: &[u8]) -> Result<Rgba> {
    let width = rd_u32(data, 0)?;
    let height = rd_u32(data, 4)?;
    if width == 0 || height == 0 || width > 8192 || height > 8192 {
        return Err(anyhow!("bad qfont size {width}x{height}"));
    }
    let pix_off = 16 + 256 * 4;
    let npix = (width as usize) * (height as usize);
    let indices = data
        .get(pix_off..pix_off + npix)
        .ok_or_else(|| anyhow!("qfont pixels out of range"))?;
    let palette = read_palette(data, pix_off + npix)?;
    Ok(palettize(indices, palette, width, height, true))
}
