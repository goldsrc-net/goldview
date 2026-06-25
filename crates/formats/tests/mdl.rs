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
    let data = model.build(0, &[]);

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

    // every submesh: positions are XYZ triples, uvs pairs, one skin index per vert
    for part in &data.parts {
        for sm in &part.submeshes {
            assert_eq!(sm.positions.len() % 3, 0);
            assert_eq!(sm.uvs.len() % 2, 0);
            assert_eq!(sm.positions.len() / 3, sm.uvs.len() / 2);
            assert_eq!(sm.positions.len() / 3, sm.skin_index.len());
            assert!(sm.texture < data.textures.len() || data.textures.is_empty());
        }
    }

    // bones + sequences exposed for skeleton/animation
    assert_eq!(data.bones.len(), data.num_bones);
    assert!(!data.sequences.is_empty(), "model should have sequences");

    // decode an embedded (group 0) sequence if any → frames×bones of [pos3,quat4]
    let model2 = Model::parse(std::fs::read(&p).unwrap()).unwrap();
    for (i, s) in data.sequences.iter().enumerate() {
        if model2.sequence_group(i) == 0 && s.num_frames > 0 {
            let frames = model2.decode_animation(i, None);
            assert_eq!(frames.len(), s.num_frames);
            assert_eq!(frames[0].len(), data.num_bones);
            break;
        }
    }
}
