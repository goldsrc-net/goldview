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

/// A malformed model (doctor.mdl has garbage bone parent indices) must not panic.
#[test]
fn malformed_model_does_not_panic() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/valve/models/doctor.mdl");
    if !p.exists() {
        eprintln!("skip: doctor.mdl not present");
        return;
    }
    let model = Model::parse(std::fs::read(&p).unwrap()).expect("parse doctor.mdl");
    let _ = model.build(0, &[]); // must return, not panic
}

/// Body-part submodel selection must actually change the built geometry.
/// gordon's `body` part has 2 submodels (low/high-res head) with different
/// vertex counts, so build([0]) and build([1]) must differ.
#[test]
fn bodypart_selection_changes_geometry() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/valve/models/player/gordon/gordon.mdl");
    if !p.exists() {
        eprintln!("skip: gordon.mdl not present");
        return;
    }
    let model = Model::parse(std::fs::read(&p).unwrap()).expect("parse gordon.mdl");

    let part0 = &model.build(0, &[0]).parts[0];
    let part1 = &model.build(0, &[1]).parts[0];
    assert!(
        part0.model_names.len() >= 2,
        "gordon body part should expose ≥2 submodels, got {:?}",
        part0.model_names
    );

    let verts = |p: &gv_formats::mdl::PartData| -> usize {
        p.submeshes.iter().map(|s| s.positions.len() / 3).sum()
    };
    eprintln!(
        "submodel0={} verts, submodel1={} verts ({:?})",
        verts(part0),
        verts(part1),
        part0.model_names
    );
    assert_ne!(
        verts(part0),
        verts(part1),
        "selecting submodel 1 must change geometry vs submodel 0"
    );
}

#[test]
fn parse_bsp_geometry() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/valve/maps/boot_camp.bsp");
    if !p.exists() {
        eprintln!("skip: boot_camp.bsp not present");
        return;
    }
    let bsp = gv_formats::bsp::Bsp::parse(std::fs::read(&p).unwrap()).expect("parse bsp");
    let data = bsp.build();
    let tris: usize = data.surfaces.iter().map(|s| s.positions.len() / 9).sum();
    assert!(tris > 1000, "expected map geometry, got {tris} tris");
    assert!(!data.textures.is_empty());
    assert!(data.entities.iter().any(|e| e
        .keys
        .get("classname")
        .map(|c| c == "worldspawn")
        .unwrap_or(false)));
    for s in &data.surfaces {
        assert_eq!(s.positions.len() % 9, 0); // whole triangles
        assert_eq!(s.positions.len() / 3, s.uvs.len() / 2);
    }
}
