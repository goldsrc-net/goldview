use gv_formats::spr;

#[test]
fn decode_real_sprite() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/ts/sprites/mazytrunk1.spr");
    if !p.exists() {
        eprintln!("skip: sprite not present");
        return;
    }
    let bytes = std::fs::read(&p).unwrap();
    let s = spr::decode_sprite(&bytes).expect("decode sprite");
    assert!(s.num_frames >= 1, "sprite should have frames");
    assert_eq!(s.frames.len(), s.num_frames as usize);
    let f0 = &s.frames[0];
    assert!(f0.width > 0 && f0.height > 0);
    assert_eq!(f0.pixels.len(), (f0.width * f0.height * 4) as usize);
}
