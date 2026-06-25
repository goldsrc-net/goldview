//! Integration test against the real dist mod tree, if present. Skips quietly
//! when the assets aren't on this machine so CI elsewhere stays green.

use gv_vfs::{Category, Mod};

const TS: &str = "../../../xash3d-fwgs/dist/client-x64/ts";

fn ts_dir() -> Option<std::path::PathBuf> {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(TS);
    if p.is_dir() {
        Some(p)
    } else {
        None
    }
}

fn find<'a>(node: &'a gv_vfs::Node, path: &str) -> Option<&'a gv_vfs::Node> {
    if node.path == path {
        return Some(node);
    }
    node.children.iter().find_map(|c| find(c, path))
}

#[test]
fn opens_with_valve_fallback() {
    let Some(ts) = ts_dir() else {
        eprintln!("skip: dist ts/ not present");
        return;
    };
    let m = Mod::open(&ts).expect("open ts");
    // ts + its fallback_dir (valve)
    assert!(m.roots.len() >= 2, "expected a fallback root, got {:?}", m.names);
    assert_eq!(m.names[0], "ts");
    assert!(m.names.iter().any(|n| n == "valve"), "valve fallback missing: {:?}", m.names);
}

#[test]
fn tree_has_typed_resources() {
    let Some(ts) = ts_dir() else { return };
    let m = Mod::open(&ts).unwrap();
    let tree = m.tree();

    // a known TS event script
    let sc = find(&tree, "events/knife.sc").expect("events/knife.sc in tree");
    assert_eq!(sc.category, Some(Category::Script));

    // categories are assigned by extension across the whole tree
    let mut has_map = false;
    let mut has_model = false;
    fn walk(n: &gv_vfs::Node, map: &mut bool, model: &mut bool) {
        match n.category {
            Some(Category::Map) => *map = true,
            Some(Category::Model) => *model = true,
            _ => {}
        }
        for c in &n.children {
            walk(c, map, model);
        }
    }
    walk(&tree, &mut has_map, &mut has_model);
    assert!(has_map, "expected at least one .bsp map");
    assert!(has_model, "expected at least one .mdl model");
}

#[test]
fn resolves_through_symlinked_fallback() {
    let Some(ts) = ts_dir() else { return };
    let m = Mod::open(&ts).unwrap();
    // a valve-only file reached via the fallback (and possibly a symlinked dir)
    let p = m.resolve("events/knife.sc").expect("resolve knife.sc");
    assert!(p.exists(), "resolved path should exist: {}", p.display());

    // traversal is rejected
    assert!(m.resolve("../../../etc/passwd").is_none());
    assert!(m.resolve("/etc/passwd").is_none());
}
