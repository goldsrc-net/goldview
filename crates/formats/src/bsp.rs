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
    b.get(o..o + 4)
        .map(|s| i32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .unwrap_or(0)
}
fn u32_at(b: &[u8], o: usize) -> u32 {
    b.get(o..o + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .unwrap_or(0)
}
fn u16_at(b: &[u8], o: usize) -> u16 {
    b.get(o..o + 2)
        .map(|s| u16::from_le_bytes([s[0], s[1]]))
        .unwrap_or(0)
}
fn f32_at(b: &[u8], o: usize) -> f32 {
    b.get(o..o + 4)
        .map(|s| f32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .unwrap_or(0.0)
}
fn vec3_at(b: &[u8], o: usize) -> [f32; 3] {
    [f32_at(b, o), f32_at(b, o + 4), f32_at(b, o + 8)]
}

const LUMP_ENTITIES: usize = 0;
const LUMP_TEXTURES: usize = 2;
const LUMP_VERTEXES: usize = 3;
const LUMP_TEXINFO: usize = 6;
const LUMP_FACES: usize = 7;
const LUMP_LIGHTING: usize = 8;
const LUMP_EDGES: usize = 12;
const LUMP_SURFEDGES: usize = 13;
const LUMP_MODELS: usize = 14;

const LUXEL: f32 = 16.0; // world units per lightmap sample
const LM_PAD: usize = 1; // atlas padding to stop bilinear bleed
const ATLAS_W: usize = 1024;

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
    styles: [u8; 4], // lightstyles; 255 = unused. Only style 0 is statically baked
    lightofs: i32,   // byte offset into LIGHTING (style-0 luxels), or -1 if unlit
}

/// A BSP brush model. Model 0 is the worldspawn geometry; models 1.. are brush
/// entities (func_water/func_wall/doors/…) referenced by an entity's `*N` model
/// key. Used to tag each surface so the frontend can apply that entity's render
/// mode (transparency/additive) and runtime placement.
struct ModelT {
    first_face: usize,
    num_faces: usize,
}

struct MipTexT {
    name: String,
    width: u32,
    height: u32,
    rgba: Option<Vec<u8>>, // None = external (lives in a WAD)
}

/// A face's lightmap placement within the atlas + its texture-space polygon
/// midpoint (the C++ hlbsp mapping centres the lightmap on the polygon).
struct LightMap {
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    off: usize, // byte offset of style-0 luxels in the LIGHTING lump
    mid_poly_u: f32,
    mid_poly_v: f32,
}

/// Per-face intermediate built in pass 1, consumed in pass 2.
struct FaceBuild {
    poly: Vec<[f32; 3]>,
    normal: [f32; 3],
    model: usize,
    texture: usize,
    tw: f32,
    th: f32,
    s: [f32; 3],
    s_off: f32,
    t: [f32; 3],
    t_off: f32,
    lm: Option<LightMap>,
}

impl FaceBuild {
    /// Atlas uv for a vertex (ported from hlbsp C++): the per-face lightmap pixel
    /// coord is `nWidth/2 + (fU - midPolyU)/16`, placed at the atlas slot. Unlit
    /// faces sample the reserved white luxel.
    fn lightmap_uv(&self, v: &[f32; 3], aw: f32, ah: f32) -> [f32; 2] {
        match &self.lm {
            Some(lm) => {
                let u = lm.w as f32 / 2.0 + (dot(v, &self.s) + self.s_off - lm.mid_poly_u) / LUXEL;
                let vv = lm.h as f32 / 2.0 + (dot(v, &self.t) + self.t_off - lm.mid_poly_v) / LUXEL;
                [(lm.x as f32 + u) / aw, (lm.y as f32 + vv) / ah]
            }
            None => [0.5 / aw, 0.5 / ah], // reserved white luxel → fullbright
        }
    }
}

/// Trivial shelf/row atlas packer for lightmaps (atlas width fixed at `ATLAS_W`).
/// Reserves a 2×2 white block at (0,0) for unlit faces.
struct Packer {
    x: usize,
    y: usize,
    row_h: usize,
    max_h: usize,
}

impl Packer {
    fn new() -> Self {
        Packer {
            x: 2,
            y: 0,
            row_h: 2,
            max_h: 2,
        }
    }
    fn place(&mut self, w: usize, h: usize) -> (usize, usize) {
        let (pw, ph) = (w + LM_PAD, h + LM_PAD);
        if self.x + pw > ATLAS_W {
            self.x = 0;
            self.y += self.row_h;
            self.row_h = 0;
        }
        let pos = (self.x, self.y);
        self.x += pw;
        self.row_h = self.row_h.max(ph);
        self.max_h = self.max_h.max(self.y + self.row_h);
        pos
    }
    fn height(&self) -> usize {
        self.max_h
    }
}

/// A 2×2 solid-white block (so the unlit (0.5,0.5) sample stays white).
fn write_white(atlas: &mut [u8], x: usize, y: usize) {
    for dy in 0..2 {
        for dx in 0..2 {
            let d = ((y + dy) * ATLAS_W + (x + dx)) * 4;
            if let Some(p) = atlas.get_mut(d..d + 4) {
                p.copy_from_slice(&[255, 255, 255, 255]);
            }
        }
    }
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
    /// BSP model this surface belongs to (0 = worldspawn; N = brush entity `*N`)
    pub model: usize,
    pub positions: Vec<f32>, // xyz triples, triangulated
    pub uvs: Vec<f32>,       // base-texture uv pairs
    /// lightmap-atlas uv pairs (maps into `BspData::lightmap`); 0,0 = unlit white
    pub lightmap_uvs: Vec<f32>,
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
    /// packed baked-lightmap atlas (referenced by `Surface::lightmap_uvs`)
    pub lightmap: Rgba,
    pub bbox_min: [f32; 3],
    pub bbox_max: [f32; 3],
}

pub struct Bsp {
    vertices: Vec<[f32; 3]>,
    edges: Vec<(u16, u16)>,
    surfedges: Vec<i32>,
    texinfos: Vec<TexInfo>,
    faces: Vec<FaceT>,
    models: Vec<ModelT>,
    textures: Vec<MipTexT>,
    lighting: Vec<u8>,
    entities_raw: String,
}

impl Bsp {
    pub fn parse(bytes: Vec<u8>) -> Result<Bsp> {
        if i32_at(&bytes, 0) != 30 {
            return Err(anyhow!(
                "not a GoldSrc BSP v30 (got version {})",
                i32_at(&bytes, 0)
            ));
        }
        // lump table: 15 × (i32 ofs, i32 len) starting at offset 4
        let lump = |i: usize| -> (usize, usize) {
            let o = 4 + i * 8;
            (
                i32_at(&bytes, o).max(0) as usize,
                i32_at(&bytes, o + 4).max(0) as usize,
            )
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
        let edges = (0..eb.len() / 4)
            .map(|i| (u16_at(eb, i * 4), u16_at(eb, i * 4 + 2)))
            .collect();

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
                    styles: [
                        *fb.get(o + 12).unwrap_or(&0),
                        *fb.get(o + 13).unwrap_or(&255),
                        *fb.get(o + 14).unwrap_or(&255),
                        *fb.get(o + 15).unwrap_or(&255),
                    ],
                    lightofs: i32_at(fb, o + 16),
                }
            })
            .collect();

        let textures = parse_textures(slice(LUMP_TEXTURES));

        let entities_raw = {
            let e = slice(LUMP_ENTITIES);
            let end = e.iter().position(|&c| c == 0).unwrap_or(e.len());
            String::from_utf8_lossy(&e[..end]).into_owned()
        };

        let lighting = slice(LUMP_LIGHTING).to_vec();

        // MODELS: mins[3] maxs[3] origin[3] headnode[4](i32) visleafs(i32)
        //         firstface(i32) numfaces(i32) = 64 bytes. firstface@56, numfaces@60.
        let mb = slice(LUMP_MODELS);
        let models = (0..mb.len() / 64)
            .map(|i| {
                let o = i * 64;
                ModelT {
                    first_face: i32_at(mb, o + 56).max(0) as usize,
                    num_faces: i32_at(mb, o + 60).max(0) as usize,
                }
            })
            .collect();

        Ok(Bsp {
            vertices,
            edges,
            surfedges,
            texinfos,
            faces,
            models,
            textures,
            lighting,
            entities_raw,
        })
    }

    /// Build render-ready surfaces (grouped by texture) with base UVs + a packed
    /// baked-lightmap atlas (uv into `BspData::lightmap`), decode embedded
    /// textures, parse entities.
    pub fn build(&self) -> BspData {
        // ---- pass 1: per-face polygon + lightmap extents, packed into an atlas
        // atlas (0,0) is a reserved white luxel for unlit faces (→ fullbright).
        let valid = self.valid_lightmap_faces(); // faces whose dims match the byte layout
        let face_model = self.face_models(); // face index → owning brush model
        let mut packer = Packer::new();
        let faces: Vec<FaceBuild> = self
            .faces
            .iter()
            .enumerate()
            .filter_map(|(i, face)| {
                self.face_build(
                    face,
                    *face_model.get(i).unwrap_or(&0),
                    valid.contains(&i),
                    &mut packer,
                )
            })
            .collect();

        // ---- build the lightmap atlas image from the placements
        let atlas_h = packer.height().max(1);
        let mut atlas = vec![0u8; ATLAS_W * atlas_h * 4];
        write_white(&mut atlas, 0, 0); // the reserved unlit luxel
        for fb in &faces {
            if let Some(lm) = &fb.lm {
                self.blit_lightmap(&mut atlas, atlas_h, lm);
            }
        }

        // ---- pass 2: emit triangles grouped by (model, texture) so each brush
        // entity is a separable batch (its render mode / placement applies per-model)
        let ntex = self.textures.len().max(1);
        let mut surfaces: Vec<Surface> = Vec::new();
        let mut key_to_idx: std::collections::HashMap<(usize, usize), usize> =
            std::collections::HashMap::new();
        let mut bbmin = [f32::MAX; 3];
        let mut bbmax = [f32::MIN; 3];
        let aw = ATLAS_W as f32;
        let ah = atlas_h as f32;

        for fb in &faces {
            for v in &fb.poly {
                for c in 0..3 {
                    bbmin[c] = bbmin[c].min(v[c]);
                    bbmax[c] = bbmax[c].max(v[c]);
                }
            }
            let tex = fb.texture.min(ntex - 1);
            let idx = *key_to_idx.entry((fb.model, tex)).or_insert_with(|| {
                surfaces.push(Surface {
                    texture: tex,
                    model: fb.model,
                    positions: Vec::new(),
                    uvs: Vec::new(),
                    lightmap_uvs: Vec::new(),
                    normals: Vec::new(),
                });
                surfaces.len() - 1
            });
            let surf = &mut surfaces[idx];
            let emit = |surf: &mut Surface, v: &[f32; 3]| {
                surf.positions.extend_from_slice(v);
                surf.uvs.extend_from_slice(&[
                    (dot(v, &fb.s) + fb.s_off) / fb.tw,
                    (dot(v, &fb.t) + fb.t_off) / fb.th,
                ]);
                surf.lightmap_uvs
                    .extend_from_slice(&fb.lightmap_uv(v, aw, ah));
                surf.normals.extend_from_slice(&fb.normal);
            };
            for k in 1..fb.poly.len() - 1 {
                emit(surf, &fb.poly[0]);
                emit(surf, &fb.poly[k]);
                emit(surf, &fb.poly[k + 1]);
            }
        }
        surfaces.retain(|s| !s.positions.is_empty());

        let textures = self
            .textures
            .iter()
            .map(|t| BspTexture {
                name: t.name.clone(),
                width: t.width,
                height: t.height,
                embedded: t.rgba.is_some(),
            })
            .collect();
        if bbmin[0] > bbmax[0] {
            bbmin = [0.0; 3];
            bbmax = [0.0; 3];
        }
        BspData {
            surfaces,
            textures,
            entities: parse_entities(&self.entities_raw),
            lightmap: Rgba {
                width: ATLAS_W as u32,
                height: atlas_h as u32,
                pixels: atlas,
            },
            bbox_min: bbmin,
            bbox_max: bbmax,
        }
    }

    /// Build a face's polygon + texture refs + lightmap placement (packing into
    /// `packer`). Returns None for degenerate faces.
    fn face_build(
        &self,
        face: &FaceT,
        model: usize,
        lit_allowed: bool,
        packer: &mut Packer,
    ) -> Option<FaceBuild> {
        let ti = self.texinfos.get(face.texinfo)?;
        let (tw, th) = self
            .textures
            .get(ti.texture)
            .map(|t| (t.width.max(1) as f32, t.height.max(1) as f32))
            .unwrap_or((1.0, 1.0));

        let mut poly: Vec<[f32; 3]> = Vec::with_capacity(face.num_edges);
        for k in 0..face.num_edges {
            let se = *self.surfedges.get(face.first_edge + k).unwrap_or(&0);
            let (a, b) = *self
                .edges
                .get(se.unsigned_abs() as usize)
                .unwrap_or(&(0, 0));
            let vi = if se >= 0 { a } else { b } as usize;
            poly.push(*self.vertices.get(vi).unwrap_or(&[0.0; 3]));
        }
        if poly.len() < 3 {
            return None;
        }
        let normal = face_normal(&poly);

        let (min_s, min_t, max_s, max_t) = face_tex_bounds(&poly, ti);
        let (lm_w, lm_h) = lightmap_dims(min_s, max_s, min_t, max_t);
        // `lit_allowed` was pre-validated against the LIGHTING byte layout, so the
        // w*h*3 read is guaranteed to land on this face's data (no mis-stride).
        let lm = if lit_allowed {
            let (w, h) = (lm_w as usize, lm_h as usize);
            let (x, y) = packer.place(w, h);
            Some(LightMap {
                x,
                y,
                w,
                h,
                off: face.lightofs as usize,
                mid_poly_u: (min_s + max_s) / 2.0,
                mid_poly_v: (min_t + max_t) / 2.0,
            })
        } else {
            None
        };

        Some(FaceBuild {
            poly,
            normal,
            model,
            texture: ti.texture,
            tw,
            th,
            s: ti.s,
            s_off: ti.s_off,
            t: ti.t,
            t_off: ti.t_off,
            lm,
        })
    }

    /// Map each face index → the brush model that owns it (models partition the
    /// FACES lump by `[first_face, first_face + num_faces)`). Defaults to 0.
    fn face_models(&self) -> Vec<usize> {
        let mut fm = vec![0usize; self.faces.len()];
        for (mi, m) in self.models.iter().enumerate() {
            let end = (m.first_face + m.num_faces).min(self.faces.len());
            for f in m.first_face.min(self.faces.len())..end {
                fm[f] = mi;
            }
        }
        fm
    }

    /// Blit one face's style-0 lightmap (RGB luxels) into the RGBA atlas, with
    /// edge-clamped padding to stop bilinear bleed between neighbours.
    fn blit_lightmap(&self, atlas: &mut [u8], _atlas_h: usize, lm: &LightMap) {
        for py in 0..lm.h + LM_PAD {
            for px in 0..lm.w + LM_PAD {
                let sx = px.min(lm.w - 1);
                let sy = py.min(lm.h - 1);
                let src = lm.off + (sy * lm.w + sx) * 3;
                let dst = ((lm.y + py) * ATLAS_W + (lm.x + px)) * 4;
                if let (Some(s), Some(d)) =
                    (self.lighting.get(src..src + 3), atlas.get_mut(dst..dst + 4))
                {
                    d[0] = s[0];
                    d[1] = s[1];
                    d[2] = s[2];
                    d[3] = 255;
                }
            }
        }
    }

    /// Faces whose computed lightmap size exactly fits the LIGHTING byte layout.
    /// The lump is packed contiguously, so a face is only safely lightmappable if
    /// `lightofs + numstyles*w*h*3` equals the next face's offset (or the lump
    /// end). This rejects the rare face whose float-boundary extent is off by one
    /// (which would mis-stride its data → striping) — those render fullbright.
    fn valid_lightmap_faces(&self) -> std::collections::HashSet<usize> {
        // candidate lit faces: (face index, lightofs, total bytes)
        let mut cands: Vec<(usize, i64, i64)> = Vec::new();
        for (i, face) in self.faces.iter().enumerate() {
            if face.styles[0] != 0 || face.lightofs < 0 {
                continue;
            }
            let ti = match self.texinfos.get(face.texinfo) {
                Some(t) => t,
                None => continue,
            };
            let mut poly = Vec::with_capacity(face.num_edges);
            for k in 0..face.num_edges {
                let se = *self.surfedges.get(face.first_edge + k).unwrap_or(&0);
                let (a, b) = *self
                    .edges
                    .get(se.unsigned_abs() as usize)
                    .unwrap_or(&(0, 0));
                poly.push(
                    *self
                        .vertices
                        .get(if se >= 0 { a } else { b } as usize)
                        .unwrap_or(&[0.0; 3]),
                );
            }
            if poly.len() < 3 {
                continue;
            }
            let (min_s, min_t, max_s, max_t) = face_tex_bounds(&poly, ti);
            let (w, h) = lightmap_dims(min_s, max_s, min_t, max_t);
            if !(1..=64).contains(&w) || !(1..=64).contains(&h) {
                continue;
            }
            let nstyles = face.styles.iter().filter(|&&s| s != 255).count().max(1) as i64;
            cands.push((i, face.lightofs as i64, nstyles * w * h * 3));
        }
        cands.sort_by_key(|c| c.1);
        let len = self.lighting.len() as i64;
        let mut valid = std::collections::HashSet::new();
        for (k, &(idx, ofs, bytes)) in cands.iter().enumerate() {
            let next = cands.get(k + 1).map(|c| c.1).unwrap_or(len);
            if ofs + bytes == next || (k + 1 == cands.len() && ofs + bytes <= len) {
                valid.insert(idx);
            }
        }
        valid
    }

    /// A decoded embedded texture by index (for the frontend atlas).
    pub fn texture_rgba(&self, index: usize) -> Option<Rgba> {
        let t = self.textures.get(index)?;
        let rgba = t.rgba.as_ref()?;
        Some(Rgba {
            width: t.width,
            height: t.height,
            pixels: rgba.clone(),
        })
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
            out.push(MipTexT {
                name: String::new(),
                width: 0,
                height: 0,
                rgba: None,
            });
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
        out.push(MipTexT {
            name,
            width,
            height,
            rgba,
        });
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

/// Min/max of a face's texture-space coords (s,t) over its polygon vertices.
fn face_tex_bounds(poly: &[[f32; 3]], ti: &TexInfo) -> (f32, f32, f32, f32) {
    let (mut min_s, mut min_t, mut max_s, mut max_t) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for v in poly {
        let s = dot(v, &ti.s) + ti.s_off;
        let t = dot(v, &ti.t) + ti.t_off;
        min_s = min_s.min(s);
        max_s = max_s.max(s);
        min_t = min_t.min(t);
        max_t = max_t.max(t);
    }
    (min_s, min_t, max_s, max_t)
}

/// Lightmap luxel dimensions (w, h) from texture-space bounds (engine formula).
fn lightmap_dims(min_s: f32, max_s: f32, min_t: f32, max_t: f32) -> (i64, i64) {
    let w = ((max_s / LUXEL).ceil() - (min_s / LUXEL).floor() + 1.0) as i64;
    let h = ((max_t / LUXEL).ceil() - (min_t / LUXEL).floor() + 1.0) as i64;
    (w, h)
}

fn face_normal(poly: &[[f32; 3]]) -> [f32; 3] {
    let (a, b, c) = (poly[0], poly[1], poly[2]);
    let u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
    ];
    let len = (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt();
    if len > 1e-6 {
        [n[0] / len, n[1] / len, n[2] / len]
    } else {
        [0.0, 0.0, 1.0]
    }
}
