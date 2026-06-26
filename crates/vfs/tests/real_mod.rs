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

/// Find a node whose (root-prefixed) path ends with `suffix` — the tree now keys
/// nodes by `<rootname>/<rel>`, so match by the relative tail.
fn find<'a>(node: &'a gv_vfs::Node, suffix: &str) -> Option<&'a gv_vfs::Node> {
    if !node.path.is_empty() && (node.path == suffix || node.path.ends_with(&format!("/{suffix}"))) {
        return Some(node);
    }
    node.children.iter().find_map(|c| find(c, suffix))
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
fn tree_keeps_roots_separate() {
    let Some(ts) = ts_dir() else { return };
    let m = Mod::open(&ts).unwrap();
    let tree = m.tree();
    // top level is one folder per game dir (ts/, valve/) — never intermixed
    let names: Vec<_> = tree.children.iter().map(|c| c.name.as_str()).collect();
    assert!(names.contains(&"ts"), "expected a top-level ts/ folder, got {names:?}");
    assert!(names.contains(&"valve"), "expected a top-level valve/ folder, got {names:?}");
    // each top-level folder's children are root-prefixed and resolve back to disk
    let ts_node = tree.children.iter().find(|c| c.name == "ts").unwrap();
    let some_file = {
        fn first_file(n: &gv_vfs::Node) -> Option<&gv_vfs::Node> {
            if !n.is_dir { return Some(n); }
            n.children.iter().find_map(first_file)
        }
        first_file(ts_node).expect("ts has a file")
    };
    assert!(some_file.path.starts_with("ts/"), "node path should be root-prefixed: {}", some_file.path);
    assert!(m.resolve(&some_file.path).is_some_and(|p| p.exists()), "root-prefixed path should resolve");
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
