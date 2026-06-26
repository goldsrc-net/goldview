//! gv-vfs — the mod filesystem.
//!
//! A GoldSrc mod is a game directory (e.g. `ts/`) with a `fallback_dir` (e.g.
//! `valve/`) declared in `liblist.gam`. Files the mod overrides live in `ts/`;
//! everything else falls back to `valve/`. This crate models that chain: it
//! resolves relative resource paths across the chain, walks it into a single
//! merged & typed resource tree, and safely maps a relative path back to an
//! absolute on-disk path for the asset protocol (with traversal guards).

use anyhow::{anyhow, Context, Result};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

/// Coarse resource category, derived from the file extension. Drives which
/// viewer the frontend opens and how the tree is filtered/grouped.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Map,
    Model,
    Sprite,
    Wad,
    Image,
    Sound,
    Video,
    Script,
    Text,
    Other,
}

impl Category {
    pub fn from_ext(ext: &str) -> Category {
        match ext.to_ascii_lowercase().as_str() {
            "bsp" => Category::Map,
            "mdl" => Category::Model,
            "spr" => Category::Sprite,
            "wad" => Category::Wad,
            "tga" | "bmp" | "png" | "ico" | "jpg" | "jpeg" => Category::Image,
            "wav" | "mp3" => Category::Sound,
            "avi" | "webm" | "mp4" | "ogv" => Category::Video,
            "sc" => Category::Script,
            "txt" | "cfg" | "res" | "gam" | "fgd" | "lst" | "wc" | "ini" | "def" | "rc"
            | "mdwn" | "loc" | "nfo" | "inf" | "vdf" | "html" => Category::Text,
            _ => Category::Other,
        }
    }
}

/// One node in the merged resource tree (a directory or a file).
#[derive(Debug, Clone, serde::Serialize)]
pub struct Node {
    pub name: String,
    /// POSIX-style path relative to the mod root (the chain key).
    pub path: String,
    pub is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<Category>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Index into [`Mod::roots`] that actually provides this file (0 = the mod
    /// dir itself, higher = a fallback). `None` for directories.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<usize>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Node>,
}

/// An opened mod: the ordered resolution chain of game directories.
#[derive(Debug, Clone)]
pub struct Mod {
    /// Resolution order: roots[0] is the mod dir, the rest are fallbacks.
    pub roots: Vec<PathBuf>,
    pub names: Vec<String>,
}

impl Mod {
    /// Open the game directory at `dir`, reading its `liblist.gam` (if present)
    /// for a `fallback_dir`. The fallback is resolved as a sibling of `dir`.
    pub fn open(dir: impl AsRef<Path>) -> Result<Mod> {
        let dir = dir.as_ref();
        let dir = dir
            .canonicalize()
            .with_context(|| format!("open mod dir {}", dir.display()))?;
        if !dir.is_dir() {
            return Err(anyhow!("{} is not a directory", dir.display()));
        }

        let mut roots = vec![dir.clone()];
        let mut names = vec![dir.file_name().unwrap_or_default().to_string_lossy().into_owned()];

        // fallback chain is resolved against the parent game directory (siblings)
        if let Some(parent) = dir.parent() {
            // 1) the mod's declared `fallback_dir` (liblist.gam), if any
            if let Some(fallback) = read_fallback_dir(&dir) {
                push_root(&mut roots, &mut names, parent.join(&fallback), fallback);
            }
            // 2) always include the base game `valve` — the GoldSrc engine always
            //    falls back to it, so its shared resources (halflife.wad, base
            //    models, …) are available to every mod even when undeclared.
            push_root(&mut roots, &mut names, parent.join("valve"), "valve".into());
        }

        Ok(Mod { roots, names })
    }

    /// Resolve a relative resource path to the first existing absolute path in
    /// the chain. `sanitize_rel` rejects traversal (`..`, absolute, leading
    /// `/`), so the joined path is always *logically* under a root — but the
    /// mod dirs legitimately contain symlinked subtrees (the dist game roots
    /// are stitched together this way), so we deliberately do NOT require the
    /// symlink-resolved path to stay under the root.
    pub fn resolve(&self, rel: &str) -> Option<PathBuf> {
        let rel = sanitize_rel(rel)?;
        for root in &self.roots {
            let p = root.join(&rel);
            if p.exists() {
                return Some(p);
            }
        }
        // Case-insensitive fallback: GoldSrc assets are conventionally
        // case-insensitive (e.g. `barneyt.mdl` referenced as `barneyT.mdl`).
        for root in &self.roots {
            if let Some(p) = resolve_ci(root, &rel) {
                return Some(p);
            }
        }
        None
    }

    /// Build the merged, typed resource tree across the whole chain. A path that
    /// exists in multiple roots is listed once, attributed to the earliest root.
    pub fn tree(&self) -> Node {
        // Collect a union of relative paths -> (size, source root index).
        let mut files: BTreeMap<String, (u64, usize)> = BTreeMap::new();
        let mut dirs: BTreeMap<String, ()> = BTreeMap::new();
        for (idx, root) in self.roots.iter().enumerate() {
            walk(root, root, idx, &mut files, &mut dirs);
        }

        let mut root_node = Node {
            name: self.names.first().cloned().unwrap_or_else(|| "mod".into()),
            path: String::new(),
            is_dir: true,
            category: None,
            size: None,
            source: None,
            children: Vec::new(),
        };

        // Insert directories first so empty-ish dirs still appear, then files.
        for d in dirs.keys() {
            insert(&mut root_node, d, None);
        }
        for (path, (size, src)) in &files {
            let ext = Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("");
            insert(&mut root_node, path, Some((*size, *src, Category::from_ext(ext))));
        }

        sort_tree(&mut root_node);
        root_node
    }
}

/// Read `fallback_dir "valve"` from a game dir's `liblist.gam`, if any.
fn read_fallback_dir(dir: &Path) -> Option<String> {
    let text = std::fs::read_to_string(dir.join("liblist.gam")).ok()?;
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("fallback_dir") {
            let v = rest.trim().trim_matches('"').trim();
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Normalize a relative path: forward slashes, no `..`, no absolute, no `.`.
/// Append a fallback game root (canonicalised) if it's a real dir and not already
/// in the chain — preserves order and de-dups (e.g. when `fallback_dir` is valve).
fn push_root(roots: &mut Vec<PathBuf>, names: &mut Vec<String>, path: PathBuf, name: String) {
    if let Ok(c) = path.canonicalize() {
        if c.is_dir() && !roots.contains(&c) {
            roots.push(c);
            names.push(name);
        }
    }
}

/// Walk `rel` under `root` matching each component case-insensitively. Used as a
/// fallback when an exact-case path doesn't exist. Stays within `root` (walks
/// real directory entries), so it inherits the same traversal guard as `resolve`.
fn resolve_ci(root: &Path, rel: &Path) -> Option<PathBuf> {
    let mut cur = root.to_path_buf();
    for comp in rel.components() {
        let want = comp.as_os_str().to_str()?;
        let hit = std::fs::read_dir(&cur)
            .ok()?
            .flatten()
            .find(|e| e.file_name().to_str().map(|n| n.eq_ignore_ascii_case(want)).unwrap_or(false))?;
        cur = hit.path();
    }
    Some(cur)
}

fn sanitize_rel(rel: &str) -> Option<PathBuf> {
    let rel = rel.trim_start_matches('/');
    let mut out = PathBuf::new();
    for comp in rel.split('/') {
        if comp.is_empty() || comp == "." {
            continue;
        }
        if comp == ".." {
            return None;
        }
        out.push(comp);
    }
    if out.as_os_str().is_empty() {
        None
    } else {
        Some(out)
    }
}

fn walk(
    root: &Path,
    cur: &Path,
    src: usize,
    files: &mut BTreeMap<String, (u64, usize)>,
    dirs: &mut BTreeMap<String, ()>,
) {
    let entries = match std::fs::read_dir(cur) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let ft = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        // Follow symlinks (the dist dir uses symlinked subtrees).
        let meta = std::fs::metadata(&path);
        let is_dir = ft.is_dir() || meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let rel = match path.strip_prefix(root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        if rel.starts_with('.') {
            continue; // skip dotfiles/.git/.fontcache
        }
        if is_dir {
            dirs.entry(rel.clone()).or_default();
            walk(root, &path, src, files, dirs);
        } else {
            let size = meta.map(|m| m.len()).unwrap_or(0);
            files.entry(rel).or_insert((size, src)); // earliest root wins
        }
    }
}

/// Insert a path into the tree, creating intermediate directory nodes.
fn insert(root: &mut Node, path: &str, file: Option<(u64, usize, Category)>) {
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() {
        return;
    }
    let mut node = root;
    let mut acc = String::new();
    for (i, part) in parts.iter().enumerate() {
        if !acc.is_empty() {
            acc.push('/');
        }
        acc.push_str(part);
        let is_last = i == parts.len() - 1;
        let want_file = is_last && file.is_some();

        let pos = node.children.iter().position(|c| c.name == *part);
        let idx = match pos {
            Some(idx) => idx,
            None => {
                node.children.push(Node {
                    name: (*part).to_string(),
                    path: acc.clone(),
                    is_dir: !want_file,
                    category: None,
                    size: None,
                    source: None,
                    children: Vec::new(),
                });
                node.children.len() - 1
            }
        };
        node = &mut node.children[idx];
        if want_file {
            if let Some((size, src, cat)) = file {
                node.is_dir = false;
                node.size = Some(size);
                node.source = Some(src);
                node.category = Some(cat);
            }
        }
    }
}

fn sort_tree(node: &mut Node) {
    node.children.sort_by(|a, b| {
        // directories first, then by name (case-insensitive)
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()))
    });
    for c in &mut node.children {
        sort_tree(c);
    }
}
