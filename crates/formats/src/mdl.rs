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
    parent: i32,
    value: [f32; MAX_CONTROLLERS], // pos[0..3] + angles[3..6] defaults
}

struct MeshT {
    tris_off: usize,
    skin_ref: usize,
}

struct ModelT {
    verts: Vec<[f32; 3]>,
    vert_bone: Vec<u8>,
    meshes: Vec<MeshT>,
}

struct BodyPartT {
    name: String,
    models: Vec<ModelT>,
}

struct TextureT {
    name: String,
    width: u32,
    height: u32,
    rgba: Vec<u8>, // decoded
}

/// Full parsed model (the pieces the viewer needs).
pub struct Model {
    bones: Vec<Bone>,
    body_parts: Vec<BodyPartT>,
    textures: Vec<TextureT>,
    /// skins[family][skinRef] -> texture index
    skins: Vec<Vec<u16>>,
    tri_buf_base: usize,
    bytes: Vec<u8>,
}

// ---------- public render output (serialised to the frontend) ----------
#[derive(serde::Serialize)]
pub struct ModelTexture {
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[derive(serde::Serialize)]
pub struct SubMesh {
    /// index into `ModelData.textures`
    pub texture: usize,
    /// flat XYZ triples (already posed into model space)
    pub positions: Vec<f32>,
    /// flat UV pairs
    pub uvs: Vec<f32>,
}

#[derive(serde::Serialize)]
pub struct ModelData {
    pub name: String,
    pub num_bones: usize,
    pub textures: Vec<ModelTexture>,
    pub num_skin_families: usize,
    /// one entry per body part: its name + the submeshes of model 0
    pub parts: Vec<PartData>,
    pub bbox_min: [f32; 3],
    pub bbox_max: [f32; 3],
}

#[derive(serde::Serialize)]
pub struct PartData {
    pub name: String,
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

        // bones (112 bytes each)
        let mut bones = Vec::with_capacity(num_bones);
        for i in 0..num_bones {
            let o = bone_index + i * 112;
            let parent = i32_at(&bytes, o + 32);
            // value[6] floats at o + 32(name done) ... layout: name[32], parent(4),
            // flags(4), boneController[6](24), value[6](24), scale[6](24)
            let voff = o + 32 + 4 + 4 + 24;
            let mut value = [0f32; MAX_CONTROLLERS];
            for k in 0..MAX_CONTROLLERS {
                value[k] = f32_at(&bytes, voff + k * 4);
            }
            bones.push(Bone { parent, value });
        }

        // textures: mstudiotexture_t = name[64], flags(64), width(68), height(72),
        // index(76) = 80 bytes. `index` is the offset to the pixel data.
        let mut textures = Vec::with_capacity(num_textures);
        for i in 0..num_textures {
            let o = texture_index + i * 80;
            let tname = cstr_at(&bytes, o, 64);
            let width = i32_at(&bytes, o + 68).max(0) as u32;
            let height = i32_at(&bytes, o + 72).max(0) as u32;
            let data_off = i32_at(&bytes, o + 76) as usize;
            let rgba = decode_texture(&bytes, data_off, width, height);
            textures.push(TextureT { name: tname, width, height, rgba });
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
                models.push(ModelT { verts, vert_bone, meshes });
            }
            body_parts.push(BodyPartT { name: bp_name, models });
        }

        Ok(Model {
            bones,
            body_parts,
            textures,
            skins,
            tri_buf_base: 0,
            bytes,
        })
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
    pub fn build(&self, skin_family: usize) -> ModelData {
        let bone_mat = self.setup_bones();
        let fam = self.skins.get(skin_family).or_else(|| self.skins.first());

        let mut parts = Vec::new();
        for bp in &self.body_parts {
            let model = match bp.models.first() {
                Some(m) => m,
                None => {
                    parts.push(PartData { name: bp.name.clone(), submeshes: Vec::new() });
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
                let (positions, uvs) = self.read_faces(mesh.tris_off, &posed, tw, th);
                submeshes.push(SubMesh { texture: tex_idx, positions, uvs });
            }
            parts.push(PartData { name: bp.name.clone(), submeshes });
        }

        ModelData {
            name: cstr_at(&self.bytes, 8, 64),
            num_bones: self.bones.len(),
            textures: self
                .textures
                .iter()
                .map(|t| ModelTexture { name: t.name.clone(), width: t.width, height: t.height })
                .collect(),
            num_skin_families: self.skins.len().max(1),
            parts,
            bbox_min: vec3_at(&self.bytes, 112),
            bbox_max: vec3_at(&self.bytes, 124),
        }
    }

    /// Decode a mesh's triangle-command buffer into flat triangle lists.
    /// Each command: i16 count (<0 fan, >0 strip), then |count| verts of 4 i16
    /// (vertIndex, normIndex, s, t). Strips/fans are expanded to triangles.
    fn read_faces(&self, mut p: usize, posed: &[[f32; 3]], tw: f32, th: f32) -> (Vec<f32>, Vec<f32>) {
        let b = &self.bytes;
        p += self.tri_buf_base;
        let mut positions: Vec<f32> = Vec::new();
        let mut uvs: Vec<f32> = Vec::new();

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

            // gather this series' verts
            let mut series: Vec<([f32; 3], f32, f32)> = Vec::with_capacity(n);
            for _ in 0..n {
                if p + 8 > b.len() {
                    break;
                }
                let vi = i16_at(b, p) as usize;
                let s = i16_at(b, p + 4) as f32;
                let t = i16_at(b, p + 6) as f32;
                p += 8;
                let pos = posed.get(vi).copied().unwrap_or([0.0; 3]);
                // DataTexture is flipY=false with top-down pixels → v = t/h (no flip).
                series.push((pos, s / tw, t / th));
            }

            let push = |positions: &mut Vec<f32>, uvs: &mut Vec<f32>, v: &([f32; 3], f32, f32)| {
                positions.extend_from_slice(&v.0);
                uvs.push(v.1);
                uvs.push(v.2);
            };

            if fan {
                for i in 1..series.len().saturating_sub(1) {
                    push(&mut positions, &mut uvs, &series[0]);
                    push(&mut positions, &mut uvs, &series[i]);
                    push(&mut positions, &mut uvs, &series[i + 1]);
                }
            } else {
                for i in 0..series.len().saturating_sub(2) {
                    if i % 2 == 0 {
                        push(&mut positions, &mut uvs, &series[i]);
                        push(&mut positions, &mut uvs, &series[i + 1]);
                        push(&mut positions, &mut uvs, &series[i + 2]);
                    } else {
                        push(&mut positions, &mut uvs, &series[i + 1]);
                        push(&mut positions, &mut uvs, &series[i]);
                        push(&mut positions, &mut uvs, &series[i + 2]);
                    }
                }
            }
        }
        (positions, uvs)
    }

    /// A decoded texture's RGBA (for the frontend texture atlas).
    pub fn texture_rgba(&self, index: usize) -> Option<Rgba> {
        self.textures.get(index).map(|t| Rgba {
            width: t.width,
            height: t.height,
            pixels: t.rgba.clone(),
        })
    }
}

/// MDL texture: w*h palette indices then 256*3 RGB palette, at `off`.
fn decode_texture(b: &[u8], off: usize, w: u32, h: u32) -> Vec<u8> {
    let n = (w as usize) * (h as usize);
    let mut out = vec![0u8; n * 4];
    let pal_off = off + n;
    if pal_off + 768 > b.len() || off + n > b.len() {
        return out;
    }
    let pal = &b[pal_off..pal_off + 768];
    for i in 0..n {
        let idx = b[off + i] as usize * 3;
        out[i * 4] = pal[idx];
        out[i * 4 + 1] = pal[idx + 1];
        out[i * 4 + 2] = pal[idx + 2];
        out[i * 4 + 3] = 255;
    }
    out
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
