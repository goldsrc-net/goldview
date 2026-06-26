import * as THREE from "three";
import { loadImage } from "../api";
import { paintRgba } from "../util/canvas";

/**
 * Load a GoldSrc skybox — the six `gfx/env/<name>{rt,lf,up,dn,ft,bk}` images
 * (`.tga`, falling back to `.bmp`) — as a Three CubeTexture for `scene.background`.
 * Returns null if any face is missing.
 *
 * Face order is Three's [+x,-x,+y,-y,+z,-z]. GoldSrc is Z-up and the world group
 * is rotated to Y-up, so up/dn → +y/-y; the horizontal suffix→axis mapping below
 * matches that transform.
 */
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

  const canvases = imgs.map((r) => {
    const c = document.createElement("canvas");
    paintRgba(c, r!);
    return c;
  });
  const cube = new THREE.CubeTexture(canvases);
  cube.colorSpace = THREE.SRGBColorSpace;
  cube.needsUpdate = true;
  return cube;
}
