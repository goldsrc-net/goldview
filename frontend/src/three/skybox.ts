import * as THREE from "three";
import { loadImage } from "../api";
import { paintRgba } from "../util/canvas";

/**
 * Load a GoldSrc skybox — the six `gfx/env/<name>{rt,lf,up,dn,ft,bk}` images
 * (`.tga`, falling back to `.bmp`) — as a Three CubeTexture for `scene.background`.
 * Returns null if any face is missing.
 *
 * Faces fill Three's cube slots [+x,-x,+y,-y,+z,-z] in suffix order
 * [rt,lf,up,dn,ft,bk]. The four side faces tile seamlessly as-is (verified by
 * edge-matching the images: ring order rt→ft→lf→bk), but GoldSrc authors the
 * up/dn faces a quarter-turn off from how Three orients the +Y/-Y slots, so they
 * are pre-rotated (up CW, dn CCW) below. Verified in-engine by looking down all
 * six axes on boot_camp's `desert` sky.
 */

/** Return a new canvas rotated by `quarters` × 90° clockwise. */
function rotateCanvas(src: HTMLCanvasElement, quarters: number): HTMLCanvasElement {
  const q = ((quarters % 4) + 4) % 4;
  const swap = q === 1 || q === 3;
  const out = document.createElement("canvas");
  out.width = swap ? src.height : src.width;
  out.height = swap ? src.width : src.height;
  const g = out.getContext("2d")!;
  g.translate(out.width / 2, out.height / 2);
  g.rotate((q * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

export async function loadSkybox(skyname: string): Promise<THREE.CubeTexture | null> {
  const suffixes = ["rt", "lf", "up", "dn", "ft", "bk"]; // → +x,-x,+y,-y,+z,-z
  const tryLoad = async (s: string) => {
    for (const ext of ["tga", "bmp"]) {
      try {
        return await loadImage(`gfx/env/${skyname}${s}.${ext}`);
      } catch {
        /* try next ext */
      }
    }
    return null;
  };
  const imgs = await Promise.all(suffixes.map(tryLoad));
  if (imgs.some((i) => !i)) return null;

  // GoldSrc up/dn faces are authored 90° off from Three's +Y/-Y slot; pre-rotate.
  const ROT = [0, 0, 1, 3, 0, 0]; // quarter-turns CW per slot [+x,-x,+y,-y,+z,-z]
  const canvases = imgs.map((r, i) => {
    const c = document.createElement("canvas");
    paintRgba(c, r!);
    return ROT[i] ? rotateCanvas(c, ROT[i]) : c;
  });
  const cube = new THREE.CubeTexture(canvases);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}
