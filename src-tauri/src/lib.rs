//! goldview — Tauri shell. Wires the `gv-vfs` mod filesystem and `gv-formats`
//! parsers to the SolidJS frontend via commands + the `goldview://` asset
//! protocol (raw bytes for <audio>/<img>, big geometry buffers later).

mod commands;
mod protocol;

use gv_vfs::Mod;
use std::sync::Mutex;

/// Shared app state: the currently-open mod (resolution chain), if any.
#[derive(Default)]
pub struct AppState {
    pub current: Mutex<Option<Mod>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .register_asynchronous_uri_scheme_protocol("goldview", protocol::handle)
        .invoke_handler(tauri::generate_handler![
            commands::open_mod,
            commands::startup_mod,
            commands::list_tree,
            commands::read_text,
            commands::text_preview,
            commands::load_image,
            commands::load_thumbnail,
            commands::audio_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running goldview");
}
