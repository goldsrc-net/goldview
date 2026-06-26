//! GoldSrc BSP v30 parser → render-ready geometry.
//!
//! Adapted from r4v3n6101/hlbsp-viewer (GPL-3.0). The map is built from the
//! FACES lump: each face is a polygon whose vertices come from SURFEDGES → EDGES
//! → VERTEXES, textured via TEXINFO (planar s/t projection) and a TEXTURES miptex.
//! Faces are triangulated (fan) and grouped by texture into `Surface`s.
//!
//! Milestone 1: geometry + embedded textures + entities + brush models.
//! TODO: baked lightmaps (LIGHTING lump) and external-WAD texture resolution.

use crate::{miptex, Rgba};
use anyhow::{anyhow, Result};

// little-endian, bounds-safe readers (a malformed map must never panic)
fn i32_at(b: &[u8], o: usize) -> i32 {
    b.get(o..o + 4).map(|s| i32::from_le_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(0)
}
fn u32_at(b: &[u8], o: usize) -> u32 {
    b.get(o..o + 4).map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(0)
}
fn u16_at(b: &[u8], o: usize) -> u16 {
    b.get(o..o + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).unwrap_or(0)
}
fn f32_at(b: &[u8], o: usize) -> f32 {
    b.get(o..o + 4).map(|s| f32::from_le_bytes([s[0], s[1], s[2], s[3]])).unwrap_or(0.0)
}
fn vec3_at(b: &[u8], o: usize) -> [f32; 3] {
    [f32_at(b, o), f32_at(b, o + 4), f32_at(b, o + 8)]
}

const LUMP_ENTITIES: usize = 0;
const LUMP_TEXTURES: usize = 2;
const LUMP_VERTEXES: usize = 3;
const LUMP_TEXINFO: usize = 6;
const LUMP_FACES: usize = 7;
const LUMP_EDGES: usize = 12;
const LUMP_SURFEDGES: usize = 13;
const LUMP_MODELS: usize = 14;

struct TexInfo {
    s: [f32; 3],
    s_off: f32,
    t: [f32; 3],
    t_off: f32,
    texture: usize,
}

struct FaceT {
    first_edge: usize,
    num_edges: usize,
    texinfo: usize,
}

struct MipTexT {
    name: String,
    width: u32,
    height: u32,
    rgba: Option<Vec<u8>>, // None = external (lives in a WAD)
}

// ---------- serialised output ----------
#[derive(serde::Serialize)]
pub struct BspTexture {
    pub name: String,
    pub width: u32,
    pub height: u32,
    /// false when the texture is external (resolved from a WAD later)
    pub embedded: bool,
}

#[derive(serde::Serialize)]
pub struct Surface {
    /// index into `BspData::textures`
    pub texture: usize,
    pub positions: Vec<f32>, // xyz triples, triangulated
    pub uvs: Vec<f32>,       // base-texture uv pairs
    pub normals: Vec<f32>,
}

#[derive(serde::Serialize)]
pub struct Entity {
    pub keys: std::collections::BTreeMap<String, String>,
}

#[derive(serde::Serialize)]
pub struct BspData {
    pub surfaces: Vec<Surface>,
    pub textures: Vec<BspTexture>,
    pub entities: Vec<Entity>,
    pub bbox_min: [f32; 3],
    pub bbox_max: [f32; 3],
}

pub struct Bsp {
    vertices: Vec<[f32; 3]>,
    edges: Vec<(u16, u16)>,
    surfedges: Vec<i32>,
    texinfos: Vec<TexInfo>,
    faces: Vec<FaceT>,
    textures: Vec<MipTexT>,
    entities_raw: String,
}

impl Bsp {
    pub fn parse(bytes: Vec<u8>) -> Result<Bsp> {
        if i32_at(&bytes, 0) != 30 {
            return Err(anyhow!("not a GoldSrc BSP v30 (got version {})", i32_at(&bytes, 0)));
        }
        // lump table: 15 × (i32 ofs, i32 len) starting at offset 4
        let lump = |i: usize| -> (usize, usize) {
            let o = 4 + i * 8;
            (i32_at(&bytes, o).max(0) as usize, i32_at(&bytes, o + 4).max(0) as usize)
        };
        let slice = |i: usize| -> &[u8] {
            let (o, l) = lump(i);
            bytes.get(o..o + l).unwrap_or(&[])
        };

        // VERTEXES: vec3 each
        let vb = slice(LUMP_VERTEXES);
        let vertices = (0..vb.len() / 12).map(|i| vec3_at(vb, i * 12)).collect();

        // EDGES: (u16, u16)
        let eb = slice(LUMP_EDGES);
        let edges = (0..eb.len() / 4).map(|i| (u16_at(eb, i * 4), u16_at(eb, i * 4 + 2))).collect();

        // SURFEDGES: i32
        let sb = slice(LUMP_SURFEDGES);
        let surfedges = (0..sb.len() / 4).map(|i| i32_at(sb, i * 4)).collect();

        // TEXINFO: s(vec3) s_off(f32) t(vec3) t_off(f32) texture(u32) flags(u32) = 40 bytes
        let tb = slice(LUMP_TEXINFO);
        let texinfos = (0..tb.len() / 40)
            .map(|i| {
                let o = i * 40;
                TexInfo {
                    s: vec3_at(tb, o),
                    s_off: f32_at(tb, o + 12),
                    t: vec3_at(tb, o + 16),
                    t_off: f32_at(tb, o + 28),
                    texture: u32_at(tb, o + 32) as usize,
                }
            })
            .collect();

        // FACES: plane(u16) side(u16) firstedge(u32) numedges(u16) texinfo(u16)
        //        styles[4](u8) lightofs(i32) = 20 bytes
        let fb = slice(LUMP_FACES);
        let faces = (0..fb.len() / 20)
            .map(|i| {
                let o = i * 20;
                FaceT {
                    first_edge: u32_at(fb, o + 4) as usize,
                    num_edges: u16_at(fb, o + 8) as usize,
                    texinfo: u16_at(fb, o + 10) as usize,
                }
            })
            .collect();

        let textures = parse_textures(slice(LUMP_TEXTURES));

        let entities_raw = {
            let e = slice(LUMP_ENTITIES);
            let end = e.iter().position(|&c| c == 0).unwrap_or(e.len());
            String::from_utf8_lossy(&e[..end]).into_owned()
        };

        // MODELS lump exists for brush-model face ranges; not needed for the
        // worldspawn render pass yet (TODO).
        let _ = LUMP_MODELS;

        Ok(Bsp { vertices, edges, surfedges, texinfos, faces, textures, entities_raw })
    }

    /// Build render-ready surfaces (grouped by texture), decode embedded
    /// textures, parse entities.
    pub fn build(&self) -> BspData {
        let ntex = self.textures.len().max(1);
        let mut surfaces: Vec<Surface> = (0..ntex)
            .map(|t| Surface { texture: t, positions: Vec::new(), uvs: Vec::new(), normals: Vec::new() })
            .collect();
        let mut bbmin = [f32::MAX; 3];
        let mut bbmax = [f32::MIN; 3];

        for face in &self.faces {
            let ti = match self.texinfos.get(face.texinfo) {
                Some(t) => t,
                None => continue,
            };
            let (tw, th) = self
                .textures
                .get(ti.texture)
                .map(|t| (t.width.max(1) as f32, t.height.max(1) as f32))
                .unwrap_or((1.0, 1.0));

            // collect the face's polygon vertices (in winding order)
            let mut poly: Vec<[f32; 3]> = Vec::with_capacity(face.num_edges);
            for k in 0..face.num_edges {
                let se = *self.surfedges.get(face.first_edge + k).unwrap_or(&0);
                let (a, b) = *self.edges.get(se.unsigned_abs() as usize).unwrap_or(&(0, 0));
                let vi = if se >= 0 { a } else { b } as usize;
                poly.push(*self.vertices.get(vi).unwrap_or(&[0.0; 3]));
            }
            if poly.len() < 3 {
                continue;
            }
            for v in &poly {
                for c in 0..3 {
                    bbmin[c] = bbmin[c].min(v[c]);
                    bbmax[c] = bbmax[c].max(v[c]);
                }
            }
            let normal = face_normal(&poly);
            let uv = |v: &[f32; 3]| [(dot(v, &ti.s) + ti.s_off) / tw, (dot(v, &ti.t) + ti.t_off) / th];

            let surf = &mut surfaces[ti.texture.min(ntex - 1)];
            // triangle fan around vertex 0
            for k in 1..poly.len() - 1 {
                for &v in &[&poly[0], &poly[k], &poly[k + 1]] {
                    surf.positions.extend_from_slice(v);
                    let t = uv(v);
                    surf.uvs.extend_from_slice(&t);
                    surf.normals.extend_from_slice(&normal);
                }
            }
        }

        surfaces.retain(|s| !s.positions.is_empty());

        let textures = self
            .textures
            .iter()
            .map(|t| BspTexture { name: t.name.clone(), width: t.width, height: t.height, embedded: t.rgba.is_some() })
            .collect();

        if bbmin[0] > bbmax[0] {
            bbmin = [0.0; 3];
            bbmax = [0.0; 3];
        }
        BspData { surfaces, textures, entities: parse_entities(&self.entities_raw), bbox_min: bbmin, bbox_max: bbmax }
    }

    /// A decoded embedded texture by index (for the frontend atlas).
    pub fn texture_rgba(&self, index: usize) -> Option<Rgba> {
        let t = self.textures.get(index)?;
        let rgba = t.rgba.as_ref()?;
        Some(Rgba { width: t.width, height: t.height, pixels: rgba.clone() })
    }
}

/// TEXTURES lump: i32 nummiptex, i32 offsets[nummiptex], then miptex_t blobs.
/// An offset of -1 or a miptex whose mip0 offset is 0 is external (WAD-resident).
fn parse_textures(lump: &[u8]) -> Vec<MipTexT> {
    let n = i32_at(lump, 0).max(0) as usize;
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let off = i32_at(lump, 4 + i * 4);
        if off < 0 {
            out.push(MipTexT { name: String::new(), width: 0, height: 0, rgba: None });
            continue;
        }
        let mt = lump.get(off as usize..).unwrap_or(&[]);
        let name = miptex::cstr(mt.get(0..16).unwrap_or(&[]));
        let width = u32_at(mt, 16);
        let height = u32_at(mt, 20);
        let mip0 = u32_at(mt, 24);
        let rgba = if mip0 != 0 {
            // embedded: miptex with appended palette → decode to RGBA
            miptex::decode_miptex(mt).ok().map(|r| r.pixels)
        } else {
            None // external; resolved from a WAD later
        };
        out.push(MipTexT { name, width, height, rgba });
    }
    out
}

/// Parse the entity lump's `{ "key" "value" ... }` blocks into key/value maps.
fn parse_entities(s: &str) -> Vec<Entity> {
    let mut out = Vec::new();
    let mut cur: Option<std::collections::BTreeMap<String, String>> = None;
    // pull successive quoted tokens; pair them up inside each { } block
    let mut chars = s.char_indices().peekable();
    let mut tokens: Vec<String> = Vec::new();
    while let Some((_, c)) = chars.next() {
        match c {
            '{' => {
                cur = Some(std::collections::BTreeMap::new());
                tokens.clear();
            }
            '}' => {
                if let Some(map) = cur.take() {
                    out.push(Entity { keys: map });
                }
            }
            '"' => {
                let mut tok = String::new();
                for (_, d) in chars.by_ref() {
                    if d == '"' {
                        break;
                    }
                    tok.push(d);
                }
                tokens.push(tok);
                if tokens.len() == 2 {
                    if let Some(map) = cur.as_mut() {
                        map.insert(tokens[0].clone(), tokens[1].clone());
                    }
                    tokens.clear();
                }
            }
            _ => {}
        }
    }
    out
}

fn dot(a: &[f32; 3], b: &[f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn face_normal(poly: &[[f32; 3]]) -> [f32; 3] {
    let (a, b, c) = (poly[0], poly[1], poly[2]);
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
    if len > 1e-6 {
        [n[0] / len, n[1] / len, n[2] / len]
    } else {
        [0.0, 0.0, 1.0]
    }
}
