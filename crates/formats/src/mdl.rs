//! GoldSrc studiomodel (`IDST`) — parser + static (bind-pose) geometry builder.
//!
//! Struct layout follows the documented studiohdr_t / mstudio*_t (blueprint:
//! ~/Projects/mdl-parser/src/const/structs.ts, reference/Lambda/src/mdl,
//! reference/web-hlmv/lib). Phase 3 outputs render-ready geometry posed at the
//! default bone values; animation (per-frame bone transforms) comes in Phase 4.

use crate::Rgba;
use anyhow::{anyhow, Result};

const MAX_CONTROLLERS: usize = 6;

// ---------- low-level readers (little-endian) ----------
fn i32_at(b: &[u8], o: usize) -> i32 {
    i32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}
fn f32_at(b: &[u8], o: usize) -> f32 {
    f32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]])
}
fn i16_at(b: &[u8], o: usize) -> i16 {
    i16::from_le_bytes([b[o], b[o + 1]])
}
fn vec3_at(b: &[u8], o: usize) -> [f32; 3] {
    [f32_at(b, o), f32_at(b, o + 4), f32_at(b, o + 8)]
}
fn cstr_at(b: &[u8], o: usize, n: usize) -> String {
    let s = &b[o..(o + n).min(b.len())];
    let end = s.iter().position(|&c| c == 0).unwrap_or(s.len());
    String::from_utf8_lossy(&s[..end]).into_owned()
}

// ---------- parsed structures (only the fields we use) ----------
#[derive(Clone)]
struct Bone {
    name: String,
    parent: i32,
    value: [f32; MAX_CONTROLLERS], // pos[0..3] + angles[3..6] defaults
    scale: [f32; MAX_CONTROLLERS], // delta scales for animation
}

struct MeshT {
    tris_off: usize,
    skin_ref: usize,
}

struct ModelT {
    name: String,
    verts: Vec<[f32; 3]>,
    vert_bone: Vec<u8>,
    meshes: Vec<MeshT>,
}

struct BodyPartT {
    name: String,
    models: Vec<ModelT>,
}

/// Sequence header fields needed to locate + decode its animation.
struct SeqRaw {
    name: String,
    fps: f32,
    num_frames: usize,
    anim_index: usize,
    group: i32,
}

struct TextureT {
    name: String,
    flags: i32, // mstudiotexture_t.flags (chrome/additive/masked/…)
    width: u32,
    height: u32,
    rgba: Vec<u8>, // decoded
}

// mstudiotexture_t.flags bit used at decode time (others are applied frontend-side)
const NF_MASKED: i32 = 0x0040;

/// Full parsed model (the pieces the viewer needs).
pub struct Model {
    bones: Vec<Bone>,
    body_parts: Vec<BodyPartT>,
    textures: Vec<TextureT>,
    /// skins[family][skinRef] -> texture index
    skins: Vec<Vec<u16>>,
    sequences: Vec<SeqRaw>,
    attachments: Vec<AttachOut>,
    hitboxes: Vec<HitboxOut>,
    tri_buf_base: usize,
    bytes: Vec<u8>,
}

// ---------- public render output (serialised to the frontend) ----------
#[derive(serde::Serialize)]
pub struct ModelTexture {
    pub name: String,
    /// mstudiotexture_t.flags (chrome 0x02, additive 0x20, masked 0x40, …)
    pub flags: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(serde::Serialize)]
pub struct SubMesh {
    /// index into `ModelData.textures`
    pub texture: usize,
    /// flat XYZ triples (posed into bind-pose model space)
    pub positions: Vec<f32>,
    /// flat UV pairs
    pub uvs: Vec<f32>,
    /// one bone index per vertex (for GPU skinning, weight 1.0)
    pub skin_index: Vec<u16>,
}

/// A bone's bind-pose local transform + name/parent (for building a skeleton).
#[derive(serde::Serialize)]
pub struct BoneOut {
    pub name: String,
    pub parent: i32,
    pub pos: [f32; 3],
    pub quat: [f32; 4],
}

#[derive(serde::Serialize)]
pub struct SeqMeta {
    pub name: String,
    pub fps: f32,
    pub num_frames: usize,
}

#[derive(Clone, serde::Serialize)]
pub struct AttachOut {
    pub name: String,
    pub bone: i32,
    /// attachment origin in its bone's local space
    pub pos: [f32; 3],
}

#[derive(Clone, serde::Serialize)]
pub struct HitboxOut {
    pub bone: i32,
    pub group: i32,
    /// box corners in the bone's local space
    pub bbmin: [f32; 3],
    pub bbmax: [f32; 3],
}

#[derive(serde::Serialize)]
pub struct ModelData {
    pub name: String,
    pub num_bones: usize,
    pub bones: Vec<BoneOut>,
    pub textures: Vec<ModelTexture>,
    pub num_skin_families: usize,
    pub sequences: Vec<SeqMeta>,
    pub attachments: Vec<AttachOut>,
    pub hitboxes: Vec<HitboxOut>,
    /// one entry per body part: name, selectable submodel names, and the
    /// submeshes of the currently-selected submodel
    pub parts: Vec<PartData>,
    pub bbox_min: [f32; 3],
    pub bbox_max: [f32; 3],
}

#[derive(serde::Serialize)]
pub struct PartData {
    pub name: String,
    pub model_names: Vec<String>,
    pub submeshes: Vec<SubMesh>,
}

impl Model {
    pub fn parse(bytes: Vec<u8>) -> Result<Model> {
        if bytes.len() < 244 || &bytes[0..4] != b"IDST" {
            return Err(anyhow!("not a studiomodel (IDST)"));
        }
        let name = cstr_at(&bytes, 8, 64);
        let _ = name;

        // header offsets (see studiohdr_t): id(0) version(4) name[64](8) length(72)
        // eyePos(76) bbox max(88) min(100) bbmin(112) bbmax(124) flags(136)
        // then num/index int pairs from 140.
        let num_bones = i32_at(&bytes, 140).max(0) as usize;
        let bone_index = i32_at(&bytes, 144) as usize;
        let num_textures = i32_at(&bytes, 180).max(0) as usize;
        let texture_index = i32_at(&bytes, 184) as usize;
        let _texture_data_index = i32_at(&bytes, 188) as usize;
        let num_skin_ref = i32_at(&bytes, 192).max(0) as usize;
        let num_skin_families = i32_at(&bytes, 196).max(0) as usize;
        let skin_index = i32_at(&bytes, 200) as usize;
        let num_body_parts = i32_at(&bytes, 204).max(0) as usize;
        let body_part_index = i32_at(&bytes, 208) as usize;

        // bones: name[32], parent(32), flags(36), boneController[6](40..64),
        // value[6](64..88), scale[6](88..112) = 112 bytes
        let mut bones = Vec::with_capacity(num_bones);
        for i in 0..num_bones {
            let o = bone_index + i * 112;
            let bname = cstr_at(&bytes, o, 32);
            let parent = i32_at(&bytes, o + 32);
            let mut value = [0f32; MAX_CONTROLLERS];
            let mut scale = [0f32; MAX_CONTROLLERS];
            for k in 0..MAX_CONTROLLERS {
                value[k] = f32_at(&bytes, o + 64 + k * 4);
                scale[k] = f32_at(&bytes, o + 88 + k * 4);
            }
            bones.push(Bone { name: bname, parent, value, scale });
        }

        // textures: mstudiotexture_t = name[64], flags(64), width(68), height(72),
        // index(76) = 80 bytes. `index` is the offset to the pixel data.
        let mut textures = Vec::with_capacity(num_textures);
        for i in 0..num_textures {
            let o = texture_index + i * 80;
            let tname = cstr_at(&bytes, o, 64);
            let flags = i32_at(&bytes, o + 64);
            let width = i32_at(&bytes, o + 68).max(0) as u32;
            let height = i32_at(&bytes, o + 72).max(0) as u32;
            let data_off = i32_at(&bytes, o + 76) as usize;
            let rgba = decode_texture(&bytes, data_off, width, height, flags & NF_MASKED != 0);
            textures.push(TextureT { name: tname, flags, width, height, rgba });
        }

        // skin families: num_skin_families * num_skin_ref shorts
        let mut skins = Vec::with_capacity(num_skin_families);
        for f in 0..num_skin_families {
            let mut fam = Vec::with_capacity(num_skin_ref);
            for s in 0..num_skin_ref {
                let o = skin_index + (f * num_skin_ref + s) * 2;
                fam.push(if o + 1 < bytes.len() { i16_at(&bytes, o) as u16 } else { 0 });
            }
            skins.push(fam);
        }

        // body parts (76 bytes each) -> models (112 bytes each) -> meshes (20 each)
        let mut body_parts = Vec::with_capacity(num_body_parts);
        for i in 0..num_body_parts {
            let o = body_part_index + i * 76;
            let bp_name = cstr_at(&bytes, o, 64);
            let num_models = i32_at(&bytes, o + 64).max(0) as usize;
            let model_index = i32_at(&bytes, o + 72) as usize;

            let mut models = Vec::with_capacity(num_models);
            for m in 0..num_models {
                let mo = model_index + m * 112;
                let mname = cstr_at(&bytes, mo, 64);
                let num_mesh = i32_at(&bytes, mo + 72).max(0) as usize;
                let mesh_index = i32_at(&bytes, mo + 76) as usize;
                let num_verts = i32_at(&bytes, mo + 80).max(0) as usize;
                let vert_info_index = i32_at(&bytes, mo + 84) as usize;
                let vert_index = i32_at(&bytes, mo + 88) as usize;

                let mut verts = Vec::with_capacity(num_verts);
                for v in 0..num_verts {
                    verts.push(vec3_at(&bytes, vert_index + v * 12));
                }
                let vert_bone =
                    bytes.get(vert_info_index..vert_info_index + num_verts).map(|s| s.to_vec()).unwrap_or_default();

                let mut meshes = Vec::with_capacity(num_mesh);
                for me in 0..num_mesh {
                    let meo = mesh_index + me * 20;
                    let tri_index = i32_at(&bytes, meo + 4) as usize;
                    let skin_ref = i32_at(&bytes, meo + 8).max(0) as usize;
                    meshes.push(MeshT { tris_off: tri_index, skin_ref });
                }
                models.push(ModelT { name: mname, verts, vert_bone, meshes });
            }
            body_parts.push(BodyPartT { name: bp_name, models });
        }

        // sequences: mstudioseqdesc_t = label[32], fps(32), ... numFrames(56),
        // ... animindex(124), ... seqgroup(156) = 176 bytes
        let num_seq = i32_at(&bytes, 164).max(0) as usize;
        let seq_index = i32_at(&bytes, 168) as usize;
        let mut sequences = Vec::with_capacity(num_seq);
        for i in 0..num_seq {
            let o = seq_index + i * 176;
            sequences.push(SeqRaw {
                name: cstr_at(&bytes, o, 32),
                fps: f32_at(&bytes, o + 32),
                num_frames: i32_at(&bytes, o + 56).max(0) as usize,
                anim_index: i32_at(&bytes, o + 124).max(0) as usize,
                group: i32_at(&bytes, o + 156),
            });
        }

        // attachments: name[32], type(32), bone(36), org(40 vec3), vectors[3] = 88 bytes
        let num_attach = i32_at(&bytes, 212).max(0) as usize;
        let attach_index = i32_at(&bytes, 216) as usize;
        let mut attachments = Vec::with_capacity(num_attach);
        for i in 0..num_attach {
            let o = attach_index + i * 88;
            attachments.push(AttachOut {
                name: cstr_at(&bytes, o, 32),
                bone: i32_at(&bytes, o + 36),
                pos: vec3_at(&bytes, o + 40),
            });
        }

        // hitboxes: bone(0), group(4), bbmin(8 vec3), bbmax(20 vec3) = 32 bytes
        let num_hb = i32_at(&bytes, 156).max(0) as usize;
        let hb_index = i32_at(&bytes, 160) as usize;
        let mut hitboxes = Vec::with_capacity(num_hb);
        for i in 0..num_hb {
            let o = hb_index + i * 32;
            hitboxes.push(HitboxOut {
                bone: i32_at(&bytes, o),
                group: i32_at(&bytes, o + 4),
                bbmin: vec3_at(&bytes, o + 8),
                bbmax: vec3_at(&bytes, o + 20),
            });
        }

        Ok(Model {
            bones,
            body_parts,
            textures,
            skins,
            sequences,
            attachments,
            hitboxes,
            tri_buf_base: 0,
            bytes,
        })
    }

    /// Sequence group of a sequence (0 = embedded, >0 = external NN.mdl).
    pub fn sequence_group(&self, seq: usize) -> i32 {
        self.sequences.get(seq).map(|s| s.group).unwrap_or(0)
    }

    /// Bind-pose world matrix per bone (column-major 4x4), from default values.
    fn setup_bones(&self) -> Vec<[f32; 16]> {
        let mut out: Vec<[f32; 16]> = Vec::with_capacity(self.bones.len());
        for b in &self.bones {
            let q = angles_to_quat([b.value[3], b.value[4], b.value[5]]);
            let mut local = mat4_from_quat(q);
            local[12] = b.value[0];
            local[13] = b.value[1];
            local[14] = b.value[2];
            let world = if b.parent < 0 {
                local
            } else {
                mat4_mul(&out[b.parent as usize], &local)
            };
            out.push(world);
        }
        out
    }

    /// Build static render data: per body part, the submeshes of model 0,
    /// grouped by resolved texture, posed at bind pose.
    pub fn build(&self, skin_family: usize, bodyparts: &[usize]) -> ModelData {
        let bone_mat = self.setup_bones();
        let fam = self.skins.get(skin_family).or_else(|| self.skins.first());

        let mut parts = Vec::new();
        for (pi, bp) in self.body_parts.iter().enumerate() {
            let sel = bodyparts.get(pi).copied().unwrap_or(0);
            let model = match bp.models.get(sel).or_else(|| bp.models.first()) {
                Some(m) => m,
                None => {
                    parts.push(PartData {
                        name: bp.name.clone(),
                        model_names: Vec::new(),
                        submeshes: Vec::new(),
                    });
                    continue;
                }
            };
            // pre-pose vertices to model space
            let posed: Vec<[f32; 3]> = model
                .verts
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    let bone = *model.vert_bone.get(i).unwrap_or(&0) as usize;
                    let m = bone_mat.get(bone).unwrap_or(&IDENTITY);
                    mat4_xform(m, *v)
                })
                .collect();

            let mut submeshes = Vec::new();
            for mesh in &model.meshes {
                let tex_idx = fam
                    .and_then(|f| f.get(mesh.skin_ref).copied())
                    .map(|t| t as usize)
                    .unwrap_or(mesh.skin_ref);
                let (tw, th) = self
                    .textures
                    .get(tex_idx)
                    .map(|t| (t.width.max(1) as f32, t.height.max(1) as f32))
                    .unwrap_or((1.0, 1.0));
                let (positions, uvs, skin_index) =
                    self.read_faces(mesh.tris_off, &posed, &model.vert_bone, tw, th);
                submeshes.push(SubMesh { texture: tex_idx, positions, uvs, skin_index });
            }
            parts.push(PartData {
                name: bp.name.clone(),
                model_names: bp.models.iter().map(|m| m.name.clone()).collect(),
                submeshes,
            });
        }

        ModelData {
            name: cstr_at(&self.bytes, 8, 64),
            num_bones: self.bones.len(),
            bones: self
                .bones
                .iter()
                .map(|b| BoneOut {
                    name: b.name.clone(),
                    parent: b.parent,
                    pos: [b.value[0], b.value[1], b.value[2]],
                    quat: angles_to_quat([b.value[3], b.value[4], b.value[5]]),
                })
                .collect(),
            textures: self
                .textures
                .iter()
                .map(|t| ModelTexture { name: t.name.clone(), flags: t.flags, width: t.width, height: t.height })
                .collect(),
            num_skin_families: self.skins.len().max(1),
            sequences: self
                .sequences
                .iter()
                .map(|s| SeqMeta { name: s.name.clone(), fps: s.fps, num_frames: s.num_frames })
                .collect(),
            attachments: self.attachments.clone(),
            hitboxes: self.hitboxes.clone(),
            parts,
            bbox_min: vec3_at(&self.bytes, 112),
            bbox_max: vec3_at(&self.bytes, 124),
        }
    }

    /// Decode a sequence into per-frame, per-bone LOCAL transforms (pos + quat).
    /// `ext` supplies the external sequence-group file bytes when the sequence
    /// lives in a `<name>NN.mdl` (group > 0); for group 0 it's read from this
    /// model. Returns `frames[frame][bone] = [px,py,pz, qx,qy,qz,qw]`.
    pub fn decode_animation(&self, seq: usize, ext: Option<&[u8]>) -> Vec<Vec<[f32; 7]>> {
        let s = match self.sequences.get(seq) {
            Some(s) => s,
            None => return Vec::new(),
        };
        // anim block: group 0 → this file at anim_index; else external file at anim_index
        let (data, base) = if s.group == 0 {
            (self.bytes.as_slice(), s.anim_index)
        } else {
            match ext {
                Some(e) => (e, s.anim_index),
                None => return Vec::new(),
            }
        };
        let nb = self.bones.len();
        let mut frames = Vec::with_capacity(s.num_frames.max(1));
        for f in 0..s.num_frames.max(1) {
            let mut bones = Vec::with_capacity(nb);
            for (bi, bone) in self.bones.iter().enumerate() {
                // each bone's mstudioanim_t = 6 u16 offsets (12 bytes)
                let anim_off = base + bi * 12;
                let mut p = [bone.value[0], bone.value[1], bone.value[2]];
                let mut a = [bone.value[3], bone.value[4], bone.value[5]];
                for axis in 0..3 {
                    if let Some(d) = anim_delta(data, anim_off, axis, f) {
                        p[axis] += d * bone.scale[axis];
                    }
                    if let Some(d) = anim_delta(data, anim_off, axis + 3, f) {
                        a[axis] += d * bone.scale[axis + 3];
                    }
                }
                let q = angles_to_quat(a);
                bones.push([p[0], p[1], p[2], q[0], q[1], q[2], q[3]]);
            }
            frames.push(bones);
        }
        frames
    }

    /// Decode a mesh's triangle-command buffer into flat triangle lists.
    /// Each command: i16 count (<0 fan, >0 strip), then |count| verts of 4 i16
    /// (vertIndex, normIndex, s, t). Strips/fans are expanded to triangles.
    fn read_faces(
        &self,
        mut p: usize,
        posed: &[[f32; 3]],
        vert_bone: &[u8],
        tw: f32,
        th: f32,
    ) -> (Vec<f32>, Vec<f32>, Vec<u16>) {
        let b = &self.bytes;
        p += self.tri_buf_base;
        let mut positions: Vec<f32> = Vec::new();
        let mut uvs: Vec<f32> = Vec::new();
        let mut skin_index: Vec<u16> = Vec::new();

        // vertex = (pos, u, v, bone)
        type V = ([f32; 3], f32, f32, u16);

        loop {
            if p + 2 > b.len() {
                break;
            }
            let cmd = i16_at(b, p) as i32;
            p += 2;
            if cmd == 0 {
                break;
            }
            let fan = cmd < 0;
            let n = cmd.unsigned_abs() as usize;

            let mut series: Vec<V> = Vec::with_capacity(n);
            for _ in 0..n {
                if p + 8 > b.len() {
                    break;
                }
                let vi = i16_at(b, p) as usize;
                let s = i16_at(b, p + 4) as f32;
                let t = i16_at(b, p + 6) as f32;
                p += 8;
                let pos = posed.get(vi).copied().unwrap_or([0.0; 3]);
                let bone = *vert_bone.get(vi).unwrap_or(&0) as u16;
                // DataTexture is flipY=false with top-down pixels → v = t/h (no flip).
                series.push((pos, s / tw, t / th, bone));
            }

            let push = |positions: &mut Vec<f32>, uvs: &mut Vec<f32>, si: &mut Vec<u16>, v: &V| {
                positions.extend_from_slice(&v.0);
                uvs.push(v.1);
                uvs.push(v.2);
                si.push(v.3);
            };

            if fan {
                for i in 1..series.len().saturating_sub(1) {
                    push(&mut positions, &mut uvs, &mut skin_index, &series[0]);
                    push(&mut positions, &mut uvs, &mut skin_index, &series[i]);
                    push(&mut positions, &mut uvs, &mut skin_index, &series[i + 1]);
                }
            } else {
                for i in 0..series.len().saturating_sub(2) {
                    let (a, b2, c) = if i % 2 == 0 { (i, i + 1, i + 2) } else { (i + 1, i, i + 2) };
                    push(&mut positions, &mut uvs, &mut skin_index, &series[a]);
                    push(&mut positions, &mut uvs, &mut skin_index, &series[b2]);
                    push(&mut positions, &mut uvs, &mut skin_index, &series[c]);
                }
            }
        }
        (positions, uvs, skin_index)
    }

    /// A decoded texture's RGBA (for the frontend texture atlas).
    pub fn texture_rgba(&self, index: usize) -> Option<Rgba> {
        self.textures.get(index).map(|t| Rgba {
            width: t.width,
            height: t.height,
            pixels: t.rgba.clone(),
        })
    }

    /// True if this model carries its own textures. When false, the textures
    /// (and skin table) live in the sibling `<name>T.mdl` (engine convention for
    /// models whose studiohdr has `numtextures == 0`).
    pub fn has_textures(&self) -> bool {
        !self.textures.is_empty()
    }

    /// Adopt the textures + skin table from an external `<name>T.mdl` model, so
    /// this (geometry-only) model resolves its mesh skin-refs against them.
    /// Textures are decoded at parse time, so they're self-contained.
    pub fn adopt_textures(&mut self, src: Model) {
        self.textures = src.textures;
        self.skins = src.skins;
    }
}

/// MDL texture: w*h palette indices then 256*3 RGB palette, at `off`. `masked`
/// (STUDIO_NF_MASKED) makes palette index 255 transparent (alpha-test).
fn decode_texture(b: &[u8], off: usize, w: u32, h: u32, masked: bool) -> Vec<u8> {
    use crate::palette::{palettize, PaletteMode};
    let n = (w as usize) * (h as usize);
    let pal_off = off + n;
    if pal_off + 768 > b.len() || off + n > b.len() {
        return vec![0u8; n * 4];
    }
    let indices = &b[off..off + n];
    let pal = &b[pal_off..pal_off + 768];
    let mode = if masked { PaletteMode::ColorKey } else { PaletteMode::Opaque };
    palettize(indices, pal, w, h, mode).pixels
}

/// Decode one animation channel (0-2 pos, 3-5 rot) for a bone at `frame`.
/// `anim_off` is the byte offset of the bone's mstudioanim_t (6 u16 offsets).
/// Returns the raw delta value (caller scales it), or None if not animated.
/// RLE: a run of `[valid:u8, total:u8]` then `valid` i16 values; `total` frames
/// are covered, repeating the last value for frames beyond `valid`.
fn anim_delta(data: &[u8], anim_off: usize, channel: usize, frame: usize) -> Option<f32> {
    let off = {
        let o = anim_off + channel * 2;
        u16::from_le_bytes([*data.get(o)?, *data.get(o + 1)?]) as usize
    };
    if off == 0 {
        return None;
    }
    let base = anim_off + off;
    let mut i = 0usize;
    let mut k = frame as i32;
    let mut guard = 0;
    loop {
        let valid = *data.get(base + i * 2)? as i32;
        let total = *data.get(base + i * 2 + 1)? as i32;
        if total <= k {
            k -= total;
            i += valid as usize + 1;
        } else {
            break;
        }
        guard += 1;
        if guard > 1 << 16 {
            return None;
        }
    }
    let valid = *data.get(base + i * 2)? as i32;
    let vi = if valid > k { i + 1 + k as usize } else { i + valid as usize };
    let lo = *data.get(base + vi * 2)?;
    let hi = *data.get(base + vi * 2 + 1)?;
    Some(i16::from_le_bytes([lo, hi]) as f32)
}

// ---------- minimal column-major mat4 / quat math ----------
const IDENTITY: [f32; 16] = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];

/// studiomodel Euler→quat (matches reference/web-hlmv anglesToQuaternion).
fn angles_to_quat(a: [f32; 3]) -> [f32; 4] {
    let (pitch, roll, yaw) = (a[0], a[1], a[2]);
    let (cy, sy) = ((yaw * 0.5).cos(), (yaw * 0.5).sin());
    let (cp, sp) = ((roll * 0.5).cos(), (roll * 0.5).sin());
    let (cr, sr) = ((pitch * 0.5).cos(), (pitch * 0.5).sin());
    [
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy,
        cr * cp * cy + sr * sp * sy,
    ]
}

/// Column-major mat4 from quaternion (gl-matrix mat4.fromQuat).
fn mat4_from_quat(q: [f32; 4]) -> [f32; 16] {
    let (x, y, z, w) = (q[0], q[1], q[2], q[3]);
    let (x2, y2, z2) = (x + x, y + y, z + z);
    let (xx, xy, xz) = (x * x2, x * y2, x * z2);
    let (yy, yz, zz) = (y * y2, y * z2, z * z2);
    let (wx, wy, wz) = (w * x2, w * y2, w * z2);
    [
        1.0 - (yy + zz), xy + wz, xz - wy, 0.0,
        xy - wz, 1.0 - (xx + zz), yz + wx, 0.0,
        xz + wy, yz - wx, 1.0 - (xx + yy), 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]
}

/// out = a * b (column-major, gl-matrix order).
fn mat4_mul(a: &[f32; 16], b: &[f32; 16]) -> [f32; 16] {
    let mut o = [0f32; 16];
    for c in 0..4 {
        for r in 0..4 {
            o[c * 4 + r] = a[r] * b[c * 4]
                + a[4 + r] * b[c * 4 + 1]
                + a[8 + r] * b[c * 4 + 2]
                + a[12 + r] * b[c * 4 + 3];
        }
    }
    o
}

/// Transform a point by a column-major mat4.
fn mat4_xform(m: &[f32; 16], p: [f32; 3]) -> [f32; 3] {
    [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]
}
