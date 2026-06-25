//! WAD3 texture archive (GoldSrc). Layout: a `WAD3` header, raw lumps, then a
//! directory of fixed 32-byte entries. Lump types: 0x42 qpic, 0x43 miptex
//! (most), 0x45 qfont. HL WADs are uncompressed.

use crate::{miptex, Rgba};
use anyhow::{anyhow, Result};

const TYPE_QPIC: u8 = 0x42;
const TYPE_MIPTEX: u8 = 0x43;
const TYPE_QFONT: u8 = 0x45;

#[derive(Debug, Clone, serde::Serialize)]
pub struct WadTexture {
    pub name: String,
    /// lump type byte (0x42 qpic, 0x43 miptex, 0x45 font)
    pub kind: u8,
    pub width: u32,
    pub height: u32,
}

struct DirEntry {
    pos: usize,
    size: usize,
    kind: u8,
    compression: u8,
    name: String,
}

pub struct Wad {
    bytes: Vec<u8>,
    dir: Vec<DirEntry>,
}

fn rd_i32(b: &[u8], o: usize) -> Result<i32> {
    b.get(o..o + 4)
        .map(|s| i32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| anyhow!("truncated i32 @ {o}"))
}

impl Wad {
    pub fn parse(bytes: Vec<u8>) -> Result<Wad> {
        let magic = bytes.get(0..4).ok_or_else(|| anyhow!("not a WAD"))?;
        if magic != b"WAD3" && magic != b"WAD2" {
            return Err(anyhow!("bad WAD magic {:?}", String::from_utf8_lossy(magic)));
        }
        let count = rd_i32(&bytes, 4)?.max(0) as usize;
        let dir_off = rd_i32(&bytes, 8)?.max(0) as usize;

        // dir entry (32 bytes): i32 nFilePos, i32 nDiskSize, i32 nSize,
        //   u8 nType, u8 bCompression, i16 nDummy, char szName[16]
        let mut dir = Vec::with_capacity(count);
        for i in 0..count {
            let e = dir_off + i * 32;
            let pos = rd_i32(&bytes, e)?.max(0) as usize;
            let size = rd_i32(&bytes, e + 8)?.max(0) as usize; // nSize (uncompressed)
            let kind = *bytes.get(e + 12).ok_or_else(|| anyhow!("short dir entry"))?;
            let compression = *bytes.get(e + 13).unwrap_or(&0);
            let name = miptex::cstr(bytes.get(e + 16..e + 32).unwrap_or(&[]));
            dir.push(DirEntry { pos, size, kind, compression, name });
        }
        Ok(Wad { bytes, dir })
    }

    /// Texture directory with dimensions (cheap header peek, no full decode).
    pub fn list(&self) -> Vec<WadTexture> {
        self.dir
            .iter()
            .map(|e| {
                let data = self.bytes.get(e.pos..e.pos + e.size).unwrap_or(&[]);
                let (width, height) = match e.kind {
                    TYPE_MIPTEX => miptex::miptex_dimensions(data).map(|(_, w, h)| (w, h)).unwrap_or((0, 0)),
                    TYPE_QPIC | TYPE_QFONT => (
                        u32::from_le_bytes(data.get(0..4).map(|s| [s[0], s[1], s[2], s[3]]).unwrap_or_default()),
                        u32::from_le_bytes(data.get(4..8).map(|s| [s[0], s[1], s[2], s[3]]).unwrap_or_default()),
                    ),
                    _ => (0, 0),
                };
                WadTexture { name: e.name.clone(), kind: e.kind, width, height }
            })
            .collect()
    }

    /// Decode one named lump to RGBA.
    pub fn decode(&self, name: &str) -> Result<Rgba> {
        let e = self
            .dir
            .iter()
            .find(|e| e.name.eq_ignore_ascii_case(name))
            .ok_or_else(|| anyhow!("no lump named {name}"))?;
        if e.compression != 0 {
            return Err(anyhow!("compressed WAD lumps unsupported"));
        }
        let data = self
            .bytes
            .get(e.pos..e.pos + e.size)
            .ok_or_else(|| anyhow!("lump {name} out of range"))?;
        match e.kind {
            TYPE_MIPTEX => miptex::decode_miptex(data),
            TYPE_QPIC => miptex::decode_qpic(data),
            TYPE_QFONT => miptex::decode_qfont(data),
            k => Err(anyhow!("unsupported lump type {k:#x}")),
        }
    }
}
