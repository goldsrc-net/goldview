//! The `goldview://` asset protocol. Serves raw resource bytes straight from the
//! open mod's resolution chain, so the frontend can `fetch()` / point `<audio>`
//! and `<img>` at them without base64-in-JSON. URL shape:
//!
//!   goldview://localhost/<url-encoded relative path>

use crate::AppState;
use tauri::{
    http::{Request, Response},
    Manager, UriSchemeResponder,
};

pub fn handle(ctx: tauri::UriSchemeContext<tauri::Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = ctx.app_handle().clone();
    let rel = decode_path(request.uri().path());

    let body: Result<(Vec<u8>, &'static str), String> = (|| {
        let state = app.state::<AppState>();
        let guard = state.current.lock().unwrap();
        let m = guard.as_ref().ok_or("no mod open")?;
        let abs = m.resolve(&rel).ok_or_else(|| format!("not found: {rel}"))?;
        let bytes = std::fs::read(&abs).map_err(|e| e.to_string())?;
        let ct = content_type(&rel);
        Ok((bytes, ct))
    })();

    let response = match body {
        Ok((bytes, ct)) => Response::builder()
            .status(200)
            .header("Content-Type", ct)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-cache")
            .body(bytes)
            .unwrap(),
        Err(msg) => Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .body(msg.into_bytes())
            .unwrap(),
    };
    responder.respond(response);
}

/// Percent-decode the URI path and strip the leading slash.
fn decode_path(path: &str) -> String {
    let path = path.trim_start_matches('/');
    let bytes = path.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let h = hex(bytes[i + 1]);
            let l = hex(bytes[i + 2]);
            if let (Some(h), Some(l)) = (h, l) {
                out.push(h << 4 | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn content_type(rel: &str) -> &'static str {
    let ext = rel.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "png" => "image/png",
        "bmp" => "image/bmp",
        "tga" => "image/x-tga",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}
