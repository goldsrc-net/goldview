use gv_formats::wad::Wad;

fn dist(rel: &str) -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../xash3d-fwgs/dist/client-x64").join(rel)
}

#[test]
fn parse_and_decode_decals_wad() {
    let p = dist("valve/decals.wad");
    if !p.exists() {
        eprintln!("skip: decals.wad not present");
        return;
    }
    let bytes = std::fs::read(&p).unwrap();
    let wad = Wad::parse(bytes).expect("parse decals.wad");
    let list = wad.list();
    assert!(!list.is_empty(), "decals.wad should have textures");

    // decode the first miptex with sane dimensions
    let tex = list
        .iter()
        .find(|t| t.kind == 0x43 && t.width > 0 && t.height > 0)
        .expect("a miptex with dimensions");
    let rgba = wad.decode(&tex.name).expect("decode a decal texture");
    assert_eq!((rgba.width, rgba.height), (tex.width, tex.height));
    assert_eq!(rgba.pixels.len(), (tex.width * tex.height * 4) as usize);
}

#[test]
fn parse_gfx_wad() {
    // gfx.wad mixes qpic + qfont; just ensure listing doesn't panic.
    let p = dist("valve/gfx.wad");
    if !p.exists() {
        return;
    }
    let wad = Wad::parse(std::fs::read(&p).unwrap()).expect("parse gfx.wad");
    assert!(!wad.list().is_empty());
}
