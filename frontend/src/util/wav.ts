/**
 * Many GoldSrc WAVs have an odd-sized `data` chunk (and an 18-byte `fmt `).
 * webkit2gtk's media backend (GStreamer `wavparse`) refuses to play those, even
 * though they're otherwise valid. Rebuild a canonical `RIFF/WAVE` with a 16-byte
 * PCM `fmt ` and an even `data` size (pad one silence sample) so it plays.
 * Non-WAV / unparseable input is returned unchanged (e.g. mp3 passes through).
 */
export function fixWav(buf: ArrayBuffer): ArrayBuffer {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const tag = (o: number) => (o + 4 <= u8.length ? String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]) : "");
  if (buf.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return buf;

  let fmt: Uint8Array | null = null;
  let data: Uint8Array | null = null;
  let bits = 8;
  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const sz = dv.getUint32(o + 4, true);
    const body = u8.subarray(o + 8, Math.min(o + 8 + sz, buf.byteLength));
    if (id === "fmt ") {
      fmt = body;
      bits = dv.getUint16(o + 8 + 14, true) || 8;
    } else if (id === "data") {
      data = body;
    }
    o += 8 + sz + (sz & 1); // chunks are word-aligned
  }
  if (!fmt || !data || fmt.length < 16) return buf;
  if (data.length % 2 === 0 && fmt.length === 16) return buf; // already canonical

  const pad = data.length & 1;
  const dataLen = data.length + pad;
  const total = 4 + (8 + 16) + (8 + dataLen); // "WAVE" + fmt + data
  const out = new Uint8Array(8 + total);
  const ov = new DataView(out.buffer);
  const wr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[off + i] = s.charCodeAt(i);
  };
  wr(0, "RIFF");
  ov.setUint32(4, total, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  ov.setUint32(16, 16, true);
  out.set(fmt.subarray(0, 16), 20);
  wr(36, "data");
  ov.setUint32(40, dataLen, true);
  out.set(data, 44);
  if (pad) out[44 + data.length] = bits === 8 ? 0x80 : 0x00; // silence sample
  return out.buffer;
}
