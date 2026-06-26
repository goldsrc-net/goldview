//! Tauri commands. Structured/small results travel as JSON here; large binary
//! payloads (audio, eventually geometry) go through the `goldview://` protocol.

use crate::AppState;
use gv_formats::mdl::{Model, ModelData};
use gv_formats::spr::SpriteData;
use gv_formats::wad::{Wad, WadTexture};
use gv_formats::{img, spr, Rgba};
use gv_vfs::{Mod, Node};
use tauri::State;

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// File extension (without the dot); "" if none. The format hint for image
/// decode. Mirrors the frontend's `extOf` (single Rust copy).
fn ext_of(path: &str) -> &str {
    match path.rfind('.') {
        Some(i) => &path[i + 1..],
        None => "",
    }
}

/// The path without its `.mdl`/`.MDL` extension (case-insensitive), or `None` if
/// it isn't a `.mdl`. The base for sibling lookups (`<stem>t.mdl`, `<stem>NN.mdl`).
fn mdl_stem(path: &str) -> Option<&str> {
    let cut = path.len().checked_sub(4)?;
    path[cut..].eq_ignore_ascii_case(".mdl").then(|| &path[..cut])
}

/// Parse a studiomodel, pulling in external textures from the sibling
/// `<name>T.mdl` when the main model has none (numtextures==0). `resolve` is
/// case-insensitive, so the lowercase `t.mdl` matches any-case sibling.
fn parse_model_with_textures(state: &State<AppState>, path: &str) -> CmdResult<Model> {
    let mut model = Model::parse(read_bytes(state, path)?).map_err(err)?;
    if !model.has_textures() {
        if let Some(stem) = mdl_stem(path) {
            if let Ok(bytes) = read_bytes(state, &format!("{stem}t.mdl")) {
                if let Ok(tex) = Model::parse(bytes) {
                    model.adopt_textures(tex);
                }
            }
        }
    }
    Ok(model)
}

/// Open a game directory (reads its `fallback_dir`) and return the merged tree.
#[tauri::command]
pub fn open_mod(state: State<AppState>, path: String) -> CmdResult<OpenResult> {
    let m = Mod::open(&path).map_err(err)?;
    let tree = m.tree();
    let roots: Vec<String> = m.roots.iter().map(|p| p.display().to_string()).collect();
    let names = m.names.clone();
    *state.current.lock().unwrap() = Some(m);
    Ok(OpenResult { roots, names, tree })
}

#[derive(serde::Serialize)]
pub struct OpenResult {
    pub roots: Vec<String>,
    pub names: Vec<String>,
    pub tree: Node,
}

/// Dev/CLI convenience: if `GOLDVIEW_MOD` points at a game dir, open it on
/// startup. Returns `None` when the env var is unset so the UI just waits.
#[tauri::command]
pub fn startup_mod(state: State<AppState>) -> CmdResult<Option<OpenResult>> {
    match std::env::var("GOLDVIEW_MOD") {
        Ok(path) if !path.is_empty() => open_mod(state, path).map(Some),
        _ => Ok(None),
    }
}

/// Re-fetch the tree for the currently open mod.
#[tauri::command]
pub fn list_tree(state: State<AppState>) -> CmdResult<Node> {
    let guard = state.current.lock().unwrap();
    let m = guard.as_ref().ok_or("no mod open")?;
    Ok(m.tree())
}

fn read_bytes(state: &State<AppState>, rel: &str) -> CmdResult<Vec<u8>> {
    let guard = state.current.lock().unwrap();
    let m = guard.as_ref().ok_or("no mod open")?;
    let abs = m.resolve(rel).ok_or_else(|| format!("not found: {rel}"))?;
    std::fs::read(&abs).map_err(err)
}

/// Read a UTF-8 (lossy) text resource (.sc/.txt/.cfg/...).
#[tauri::command]
pub fn read_text(state: State<AppState>, path: String) -> CmdResult<String> {
    let bytes = read_bytes(&state, &path)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// Decode an image resource (TGA/BMP/PNG) to RGBA8 for the canvas.
#[tauri::command]
pub fn load_image(state: State<AppState>, path: String) -> CmdResult<Rgba> {
    let bytes = read_bytes(&state, &path)?;
    let ext = ext_of(&path);
    img::decode_image(&bytes, ext).map_err(err)
}

/// Decode + downscale an image for a grid thumbnail (aspect-preserving, fits
/// `max`×`max`).
#[tauri::command]
pub fn load_thumbnail(state: State<AppState>, path: String, max: u32) -> CmdResult<Rgba> {
    let bytes = read_bytes(&state, &path)?;
    let ext = ext_of(&path);
    img::decode_thumbnail(&bytes, ext, max).map_err(err)
}

/// First `max_bytes` of a text resource, for a grid snippet preview.
#[tauri::command]
pub fn text_preview(state: State<AppState>, path: String, max_bytes: usize) -> CmdResult<String> {
    let bytes = read_bytes(&state, &path)?;
    let end = bytes.len().min(max_bytes);
    Ok(String::from_utf8_lossy(&bytes[..end]).into_owned())
}

/// List the textures in a WAD3 archive (name/type/dimensions, no full decode).
#[tauri::command]
pub fn load_wad(state: State<AppState>, path: String) -> CmdResult<Vec<WadTexture>> {
    let bytes = read_bytes(&state, &path)?;
    let wad = Wad::parse(bytes).map_err(err)?;
    Ok(wad.list())
}

/// Decode one named texture from a WAD3 archive to RGBA.
#[tauri::command]
pub fn wad_texture(state: State<AppState>, path: String, name: String) -> CmdResult<Rgba> {
    let bytes = read_bytes(&state, &path)?;
    let wad = Wad::parse(bytes).map_err(err)?;
    wad.decode(&name).map_err(err)
}

/// Decode a sprite into all of its frames + metadata.
#[tauri::command]
pub fn load_sprite(state: State<AppState>, path: String) -> CmdResult<SpriteData> {
    let bytes = read_bytes(&state, &path)?;
    spr::decode_sprite(&bytes).map_err(err)
}

/// Decode just a sprite's first frame, downscaled — for grid tiles.
#[tauri::command]
pub fn sprite_thumbnail(state: State<AppState>, path: String, max: u32) -> CmdResult<Rgba> {
    let bytes = read_bytes(&state, &path)?;
    let s = spr::decode_sprite(&bytes).map_err(err)?;
    let first = s.frames.into_iter().next().ok_or("sprite has no frames")?;
    Ok(img::downscale(&first, max))
}

/// Parse a studiomodel + build static (bind-pose) geometry for a skin family.
#[tauri::command]
pub fn load_model(
    state: State<AppState>,
    path: String,
    skin: Option<usize>,
    bodyparts: Option<Vec<usize>>,
) -> CmdResult<ModelData> {
    let model = parse_model_with_textures(&state, &path)?;
    Ok(model.build(skin.unwrap_or(0), &bodyparts.unwrap_or_default()))
}

/// Decode one of a model's textures to RGBA (for the GL texture atlas).
#[tauri::command]
pub fn model_texture(state: State<AppState>, path: String, index: usize) -> CmdResult<Rgba> {
    let model = parse_model_with_textures(&state, &path)?;
    model.texture_rgba(index).ok_or_else(|| format!("no texture {index}"))
}

/// Decode a sequence's animation → per-frame, per-bone [pos3, quat4] local
/// transforms. Loads the external `<name>NN.mdl` group file when needed.
#[tauri::command]
pub fn load_animation(state: State<AppState>, path: String, seq: usize) -> CmdResult<Vec<Vec<[f32; 7]>>> {
    let bytes = read_bytes(&state, &path)?;
    let model = Model::parse(bytes).map_err(err)?;
    let group = model.sequence_group(seq);
    let ext = if group > 0 {
        let stem = mdl_stem(&path).unwrap_or(&path);
        Some(read_bytes(&state, &format!("{stem}{group:02}.mdl"))?)
    } else {
        None
    };
    Ok(model.decode_animation(seq, ext.as_deref()))
}

/// Open the OS file manager at this resource's location — the folder itself, or
/// the containing folder for a file. Empty path opens the mod root.
#[tauri::command]
pub fn reveal_path(state: State<AppState>, path: String) -> CmdResult<()> {
    let guard = state.current.lock().unwrap();
    let m = guard.as_ref().ok_or("no mod open")?;
    let abs = if path.is_empty() {
        m.roots.first().cloned().ok_or("no root")?
    } else {
        m.resolve(&path).ok_or_else(|| format!("not found: {path}"))?
    };
    let target = if abs.is_dir() { abs.as_path() } else { abs.parent().unwrap_or(&abs) };
    std::process::Command::new("xdg-open").arg(target).spawn().map_err(err)?;
    Ok(())
}

/// WAV header info for the audio inspector.
#[tauri::command]
pub fn audio_info(state: State<AppState>, path: String) -> CmdResult<img::WavInfo> {
    let bytes = read_bytes(&state, &path)?;
    img::wav_info(&bytes).map_err(err)
}
