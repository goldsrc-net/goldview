use gv_formats::mdl::Model;

#[test]
fn parse_and_build_real_model() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/ts/models/player/seraph/seraph.mdl");
    if !p.exists() {
        eprintln!("skip: seraph.mdl not present");
        return;
    }
    let bytes = std::fs::read(&p).unwrap();
    let model = Model::parse(bytes).expect("parse seraph.mdl");
    let data = model.build(0);

    assert!(data.num_bones > 0, "model should have bones");
    assert!(!data.textures.is_empty(), "model should have textures");
    assert!(!data.parts.is_empty(), "model should have body parts");

    // at least one submesh with real geometry (multiple of 3 positions/9 floats)
    let tris: usize = data
        .parts
        .iter()
        .flat_map(|p| &p.submeshes)
        .map(|s| s.positions.len() / 9)
        .sum();
    assert!(tris > 0, "expected triangles");

    // every submesh: positions are XYZ triples, uvs are pairs, counts match
    for part in &data.parts {
        for sm in &part.submeshes {
            assert_eq!(sm.positions.len() % 3, 0);
            assert_eq!(sm.uvs.len() % 2, 0);
            assert_eq!(sm.positions.len() / 3, sm.uvs.len() / 2);
            assert!(sm.texture < data.textures.len() || data.textures.is_empty());
        }
    }
}
