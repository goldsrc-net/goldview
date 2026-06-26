import * as THREE from "three";
import type { ModelData } from "../types";
import { modelTexture } from "../api";

/**
 * Build a static (bind-pose) Three.js Group from a parsed studiomodel, textured
 * and unlit. Used to place entity models in the BSP scene — no skeleton or
 * animation (the Rust `build` already poses verts to bind pose). The returned
 * group owns its geometries/materials/textures; call `disposeStaticModel` to free.
 */
export async function buildStaticModel(path: string, data: ModelData): Promise<THREE.Group> {
  const group = new THREE.Group();

  const used = new Set<number>();
  for (const part of data.parts) for (const sm of part.submeshes) used.add(sm.texture);
  const texMap = new Map<number, THREE.Texture>();
  await Promise.all(
    [...used].map(async (idx) => {
      try {
        const r = await modelTexture(path, idx);
        const t = new THREE.DataTexture(new Uint8Array(r.pixels), r.width, r.height, THREE.RGBAFormat);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.minFilter = t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        texMap.set(idx, t);
      } catch {
        /* untextured */
      }
    }),
  );

  for (const part of data.parts) {
    for (const sm of part.submeshes) {
      if (sm.positions.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(sm.positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(sm.uvs, 2));
      const mat = new THREE.MeshBasicMaterial({
        map: texMap.get(sm.texture) ?? null,
        color: texMap.has(sm.texture) ? 0xffffff : 0x9aa0a8,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(geo, mat));
    }
  }
  group.userData.textures = [...texMap.values()];
  return group;
}

/** Free a static model's geometries, materials, and its own textures. */
export function disposeStaticModel(group: THREE.Group) {
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
  });
  (group.userData.textures as THREE.Texture[] | undefined)?.forEach((t) => t.dispose());
}
