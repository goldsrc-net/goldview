//! GoldSrc sprite (`IDSP` v2). A single embedded palette followed by N frames
//! of palettized pixels. `texFormat` decides how the palette index maps to
//! alpha (normal/additive/index-alpha/alpha-test). Frame *groups* are flattened
//! into the frame list.

use crate::Rgba;
use anyhow::{anyhow, Result};
use byteorder::{LittleEndian as LE, ReadBytesExt};
use std::io::{Cursor, Read};

const TYPE_NAMES: [&str; 5] = [
    "vp_parallel_upright",
    "facing_upright",
    "vp_parallel",
    "oriented",
    "vp_parallel_oriented",
];
const FORMAT_NAMES: [&str; 4] = ["normal", "additive", "indexalpha", "alphatest"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct SpriteData {
    pub width: u32,
    pub height: u32,
    pub num_frames: u32,
    pub type_name: String,
    pub format_name: String,
    pub beam_length: f32,
    pub frames: Vec<Rgba>,
}

fn decode_pixels(indices: &[u8], palette: &[u8], w: u32, h: u32, fmt: i32) -> Rgba {
    let mut out = Rgba::new(w, h);
    // index-alpha uses the LAST palette entry as the single colour
    let last = 255 * 3;
    for (i, &idx) in indices.iter().enumerate() {
        let o = i * 4;
        if o + 4 > out.pixels.len() {
            break;
        }
        let p = idx as usize * 3;
        match fmt {
            3 => {
                // alphatest: colour-key on index 255
                if idx == 255 {
                    continue;
                }
                if p + 2 < palette.len() {
                    out.pixels[o..o + 3].copy_from_slice(&palette[p..p + 3]);
                    out.pixels[o + 3] = 255;
                }
            }
            2 => {
                // index-alpha: colour = last palette entry, alpha = index value
                if last + 2 < palette.len() {
                    out.pixels[o..o + 3].copy_from_slice(&palette[last..last + 3]);
                }
                out.pixels[o + 3] = idx;
            }
            _ => {
                // normal / additive
                if p + 2 < palette.len() {
                    out.pixels[o..o + 3].copy_from_slice(&palette[p..p + 3]);
                    out.pixels[o + 3] = 255;
                }
            }
        }
    }
    out
}

/// Decode a sprite into all of its frames (RGBA).
pub fn decode_sprite(bytes: &[u8]) -> Result<SpriteData> {
    let mut c = Cursor::new(bytes);
    let mut ident = [0u8; 4];
    c.read_exact(&mut ident)?;
    if &ident != b"IDSP" {
        return Err(anyhow!("not a sprite (IDSP)"));
    }
    let _version = c.read_i32::<LE>()?;
    let type_ = c.read_i32::<LE>()?;
    let fmt = c.read_i32::<LE>()?;
    let _bound = c.read_f32::<LE>()?;
    let maxwidth = c.read_i32::<LE>()? as u32;
    let maxheight = c.read_i32::<LE>()? as u32;
    let numframes = c.read_i32::<LE>()?.max(0) as u32;
    let beam_length = c.read_f32::<LE>()?;
    let _synctype = c.read_i32::<LE>()?;

    // embedded palette
    let palcount = c.read_i16::<LE>()?.max(0) as usize;
    let mut palette = vec![0u8; palcount * 3];
    c.read_exact(&mut palette)?;

    let read_single = |c: &mut Cursor<&[u8]>| -> Result<Rgba> {
        let _ox = c.read_i32::<LE>()?;
        let _oy = c.read_i32::<LE>()?;
        let w = c.read_i32::<LE>()?.max(0) as u32;
        let h = c.read_i32::<LE>()?.max(0) as u32;
        let n = (w as usize) * (h as usize);
        let mut idx = vec![0u8; n];
        c.read_exact(&mut idx)?;
        Ok(decode_pixels(&idx, &palette, w, h, fmt))
    };

    let mut frames = Vec::with_capacity(numframes as usize);
    for _ in 0..numframes {
        let group = c.read_i32::<LE>()?;
        if group == 0 {
            frames.push(read_single(&mut c)?);
        } else {
            // frame group: count, count intervals (f32), then count subframes
            let count = c.read_i32::<LE>()?.max(0) as usize;
            for _ in 0..count {
                let _interval = c.read_f32::<LE>()?;
            }
            for _ in 0..count {
                frames.push(read_single(&mut c)?);
            }
        }
    }

    Ok(SpriteData {
        width: maxwidth,
        height: maxheight,
        num_frames: frames.len() as u32,
        type_name: TYPE_NAMES.get(type_ as usize).copied().unwrap_or("unknown").into(),
        format_name: FORMAT_NAMES.get(fmt as usize).copied().unwrap_or("unknown").into(),
        beam_length,
        frames,
    })
}
