use gv_formats::img;

/// A synthetic 16-bit stereo 44.1kHz WAV with 44100 frames = exactly 1 second.
fn synth_wav() -> Vec<u8> {
    let channels: u16 = 2;
    let rate: u32 = 44100;
    let bits: u16 = 16;
    let frames: u32 = 44100;
    let block_align = channels * bits / 8;
    let data_len = frames * block_align as u32;

    let mut v = Vec::new();
    v.extend_from_slice(b"RIFF");
    v.extend_from_slice(&(36 + data_len).to_le_bytes());
    v.extend_from_slice(b"WAVE");
    v.extend_from_slice(b"fmt ");
    v.extend_from_slice(&16u32.to_le_bytes());
    v.extend_from_slice(&1u16.to_le_bytes()); // PCM
    v.extend_from_slice(&channels.to_le_bytes());
    v.extend_from_slice(&rate.to_le_bytes());
    v.extend_from_slice(&(rate * block_align as u32).to_le_bytes());
    v.extend_from_slice(&block_align.to_le_bytes());
    v.extend_from_slice(&bits.to_le_bytes());
    v.extend_from_slice(b"data");
    v.extend_from_slice(&data_len.to_le_bytes());
    v.resize(v.len() + data_len as usize, 0);
    v
}

#[test]
fn wav_header() {
    let info = img::wav_info(&synth_wav()).expect("parse wav");
    assert_eq!(info.channels, 2);
    assert_eq!(info.sample_rate, 44100);
    assert_eq!(info.bits_per_sample, 16);
    assert!((info.duration_secs - 1.0).abs() < 0.01, "duration={}", info.duration_secs);
}

#[test]
fn decode_real_bmp() {
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/valve/gfx/lambda.bmp");
    if !p.exists() {
        eprintln!("skip: lambda.bmp not present");
        return;
    }
    let bytes = std::fs::read(&p).unwrap();
    let rgba = img::decode_image(&bytes, "bmp").expect("decode lambda.bmp");
    assert!(rgba.width > 0 && rgba.height > 0);
    assert_eq!(rgba.pixels.len(), (rgba.width * rgba.height * 4) as usize);
}

#[test]
fn decode_real_tga() {
    // TGA has no magic bytes — this verifies the extension-hint path.
    let p = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../xash3d-fwgs/dist/client-x64/ts/gfx/env/3dm_bikiniRt.tga");
    if !p.exists() {
        eprintln!("skip: env tga not present");
        return;
    }
    let bytes = std::fs::read(&p).unwrap();
    let rgba = img::decode_image(&bytes, "tga").expect("decode env tga");
    assert_eq!((rgba.width, rgba.height), (256, 256));
}
