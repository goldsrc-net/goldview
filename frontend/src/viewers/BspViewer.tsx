import { createEffect, on, onCleanup, Show, createSignal, For } from "solid-js";
import * as THREE from "three";
import { loadBsp, bspTexture, loadModel } from "../api";
import type { BspData, BspEntity } from "../types";
import { FlyControls } from "../three/FlyControls";
import { buildStaticModel, disposeStaticModel } from "../three/staticModel";
import { loadSkybox } from "../three/skybox";
import { entityModelPath, entityOrigin, entityYaw } from "./bspEntityModels";

const VOID_COLOR = new THREE.Color(0x0e0f12);

type Mode = "flat" | "textured" | "lit";

const LIGHTMAP_INTENSITY = 2; // GoldSrc bakes overbright lighting; compensate

/** How a brush surface blends, from its owning entity's GoldSrc render mode
 *  (rendermode/renderamt) plus texture-name conventions (`{`=masked, `!`=water). */
type RenderStyle = {
  transparent: boolean;
  opacity: number;
  alphaTest: number;
  blending: THREE.Blending;
  depthWrite: boolean;
};

const OPAQUE: RenderStyle = { transparent: false, opacity: 1, alphaTest: 0, blending: THREE.NormalBlending, depthWrite: true };

function renderStyle(texName: string, ent: BspEntity | undefined): RenderStyle {
  const masked = texName.startsWith("{"); // colour-keyed (palette index 255 transparent)
  const isWater = texName.startsWith("!") || texName.toLowerCase().startsWith("water");
  let mode = ent ? parseInt(ent.keys.rendermode ?? "", 10) : 0;
  let amt = ent ? parseInt(ent.keys.renderamt ?? "", 10) : 255;
  if (!Number.isFinite(mode)) mode = 0;
  if (!Number.isFinite(amt)) amt = 255;
  // water brushes are translucent even when the mapper left rendermode at normal
  if (isWater && (mode === 0 || amt >= 255)) { mode = 2; amt = 150; }
  switch (mode) {
    case 5: // additive (TransAdd) — renderamt = brightness
      return { transparent: true, opacity: amt / 255, alphaTest: 0, blending: THREE.AdditiveBlending, depthWrite: false };
    case 1: // color (TransColor)
    case 2: // texture alpha-blend (TransTexture) — renderamt = opacity
      return { transparent: amt < 255 || masked, opacity: amt / 255, alphaTest: masked ? 0.5 : 0, blending: THREE.NormalBlending, depthWrite: amt >= 255 };
    case 4: // alpha-test (TransAlpha) — masked, otherwise solid
      return { transparent: masked, opacity: amt / 255, alphaTest: masked ? 0.5 : 0, blending: THREE.NormalBlending, depthWrite: true };
    default: // normal: only `{` masking applies
      return { ...OPAQUE, transparent: masked, alphaTest: masked ? 0.5 : 0 };
  }
}

/** Valve-style purple/black checkerboard for unresolved (missing-WAD) textures. */
function missingTexture(): THREE.DataTexture {
  const n = 16;
  const px = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const c = (((x >> 1) + (y >> 1)) & 1) === 0;
      px[i] = c ? 255 : 0;
      px[i + 1] = 0;
      px[i + 2] = c ? 255 : 0;
      px[i + 3] = 255;
    }
  const t = new THREE.DataTexture(px, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/**
 * BSP map viewer. Pointer-lock fly camera; GoldSrc Z-up → Three Y-up; lighting is
 * baked (unlit materials). Modes: Flat (normal-shaded) / Textured (fullbright) /
 * Lit (texture × baked lightmap). Entity models ("full" scene) come next.
 */
export default function BspViewer(props: { path: string }) {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let raf = 0;
  let controls: FlyControls | undefined;
  let ro: ResizeObserver | undefined;
  const [locked, setLocked] = createSignal(false);
  const [info, setInfo] = createSignal("");
  const [error, setError] = createSignal("");
  const [mode, setMode] = createSignal<Mode>("lit");
  const [wireframe, setWireframe] = createSignal(false);
  const [showEntities, setShowEntities] = createSignal(true);

  const scene = new THREE.Scene();
  scene.background = VOID_COLOR;
  let skybox: THREE.CubeTexture | undefined;
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2; // GoldSrc Z-up → Three Y-up
  scene.add(group);
  const entityGroup = new THREE.Group(); // entity models (Z-up, in `group` space)
  group.add(entityGroup);
  const entityTemplates: THREE.Group[] = []; // own the geo/mats/textures (clones share)
  const camera = new THREE.PerspectiveCamera(75, 1, 4, 100000);

  const geoms: THREE.BufferGeometry[] = [];
  const texMap = new Map<number, THREE.Texture>();
  const flatMat = new THREE.MeshNormalMaterial({ flatShading: true });
  let surfaceMeshes: THREE.Mesh[] = []; // world surfaces (not entityGroup)
  let texturedMats: THREE.MeshBasicMaterial[] = []; // parallel to surfaceMeshes
  let lightmap: THREE.DataTexture | undefined;
  const missing = missingTexture();

  function disposeWorld() {
    [...group.children].forEach((c) => c !== entityGroup && group.remove(c));
    [...entityGroup.children].forEach((c) => entityGroup.remove(c));
    entityTemplates.forEach(disposeStaticModel);
    entityTemplates.length = 0;
    surfaceMeshes = [];
    geoms.forEach((g) => g.dispose());
    geoms.length = 0;
    texturedMats.forEach((m) => m.dispose());
    texturedMats = [];
    texMap.forEach((t) => t.dispose());
    texMap.clear();
    lightmap?.dispose();
    lightmap = undefined;
    skybox?.dispose();
    skybox = undefined;
    scene.background = VOID_COLOR;
  }

  function applyMode() {
    const m = mode();
    const wf = wireframe();
    surfaceMeshes.forEach((mesh, i) => {
      if (m === "flat") {
        mesh.material = flatMat;
      } else {
        const mat = texturedMats[i];
        if (!mat) return;
        const lm = m === "lit" ? lightmap ?? null : null;
        if (mat.lightMap !== lm) {
          mat.lightMap = lm;
          mat.needsUpdate = true; // toggling lightMap changes the shader
        }
        mesh.material = mat;
      }
      const mat = mesh.material as THREE.Material & { wireframe?: boolean };
      if ("wireframe" in mat) mat.wireframe = wf;
    });
    flatMat.wireframe = wf;
  }

  async function buildWorld(path: string) {
    setError("");
    const data = await loadBsp(path).catch((e) => {
      setError(String(e));
      return null;
    });
    if (!data) return;
    disposeWorld();

    // skybox (worldspawn `skyname` → gfx/env/<name>*). Shown as the scene
    // background; sky faces are skipped below so it shows through.
    const skyname = data.entities.find((e) => e.keys.classname === "worldspawn")?.keys.skyname;
    skybox = (skyname && (await loadSkybox(skyname))) || undefined;
    scene.background = skybox ?? VOID_COLOR;

    // baked-lightmap atlas
    const lm = data.lightmap;
    lightmap = new THREE.DataTexture(new Uint8Array(lm.pixels), lm.width, lm.height, THREE.RGBAFormat);
    lightmap.wrapS = lightmap.wrapT = THREE.ClampToEdgeWrapping;
    lightmap.minFilter = lightmap.magFilter = THREE.LinearFilter;
    lightmap.channel = 1; // sample via the geometry's uv1 (lightmap) attribute
    lightmap.needsUpdate = true;

    // textures actually used by surfaces (deduped)
    const maxAniso = renderer?.capabilities.getMaxAnisotropy() ?? 1;
    const used = new Set(data.surfaces.map((s) => s.texture));
    await Promise.all(
      [...used].map(async (idx) => {
        try {
          const r = await bspTexture(path, idx);
          const t = new THREE.DataTexture(new Uint8Array(r.pixels), r.width, r.height, THREE.RGBAFormat);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.anisotropy = maxAniso; // kill grazing-angle streaking on tiled floors/walls
          t.generateMipmaps = true;
          t.needsUpdate = true;
          texMap.set(idx, t);
        } catch {
          /* unresolved → checkerboard fallback below */
        }
      }),
    );

    // brush entities by model index (`model` key `*N`) → render mode / placement
    const modelEntity = new Map<number, BspEntity>();
    for (const e of data.entities) {
      const m = /^\*(\d+)$/.exec(e.keys.model ?? "");
      if (m) modelEntity.set(parseInt(m[1], 10), e);
    }

    for (const s of data.surfaces) {
      if (s.positions.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(s.positions, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(s.normals, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(s.uvs, 2));
      geo.setAttribute("uv1", new THREE.Float32BufferAttribute(s.lightmap_uvs, 2)); // lightMap channel
      const name = data.textures[s.texture]?.name ?? "";
      const isSky = name.toLowerCase() === "sky";
      if (isSky && skybox) continue; // skybox shows through; don't draw the sky brush
      const style = renderStyle(name, s.model > 0 ? modelEntity.get(s.model) : undefined);
      // sky brushes (no skybox) get a flat sky colour rather than the placeholder miptex
      const mat = isSky
        ? new THREE.MeshBasicMaterial({ color: 0x8fb3d9, side: THREE.DoubleSide })
        : new THREE.MeshBasicMaterial({
            map: texMap.get(s.texture) ?? missing,
            side: THREE.DoubleSide,
            lightMapIntensity: LIGHTMAP_INTENSITY,
            transparent: style.transparent,
            opacity: style.opacity,
            alphaTest: style.alphaTest,
            blending: style.blending,
            depthWrite: style.depthWrite,
          });
      texturedMats.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      group.add(mesh);
      surfaceMeshes.push(mesh);
      geoms.push(geo);
    }
    applyMode();

    const tris = data.surfaces.reduce((n, s) => n + s.positions.length / 9, 0);
    setInfo(`${tris.toLocaleString()} tris · ${data.surfaces.length} surfaces · ${data.entities.length} entities`);
    frameCamera(data);
    loadEntityModels(data); // async, fills entityGroup as models arrive
  }

  /** Load each distinct referenced model once and clone it at every entity that
   *  uses it (origin + yaw). Brush models (`*N`) are part of the world geometry. */
  async function loadEntityModels(data: BspData) {
    // group placements by model path
    const byModel = new Map<string, { origin: [number, number, number]; yaw: number }[]>();
    for (const e of data.entities) {
      const path = entityModelPath(e);
      if (!path) continue;
      (byModel.get(path) ?? byModel.set(path, []).get(path)!).push({ origin: entityOrigin(e), yaw: entityYaw(e) });
    }
    let placed = 0;
    await Promise.all(
      [...byModel].map(async ([path, spots]) => {
        const md = await loadModel(path).catch(() => null);
        if (!md || md.parts.every((p) => p.submeshes.length === 0)) return;
        const template = await buildStaticModel(path, md);
        entityTemplates.push(template);
        for (const spot of spots) {
          const inst = template.clone();
          inst.position.set(...spot.origin);
          inst.rotation.z = spot.yaw;
          entityGroup.add(inst);
          placed++;
        }
      }),
    );
    entityGroup.visible = showEntities();
    if (placed) setInfo((s) => `${s} · ${placed} models`);
  }

  function frameCamera(data: BspData) {
    const max = new THREE.Vector3(...data.bbox_max);
    const min = new THREE.Vector3(...data.bbox_min);
    const size = max.clone().sub(min);
    // prefer a player spawn (a sensible in-map POV) over an outside-the-map view
    const spawn = data.entities.find((e) => (e.keys.classname ?? "").startsWith("info_player"));
    if (spawn) {
      const o = entityOrigin(spawn);
      const yaw = entityYaw(spawn);
      const eye = new THREE.Vector3(o[0], o[1], o[2] + 40).applyEuler(group.rotation);
      camera.position.copy(eye);
      const fwd = new THREE.Vector3(Math.cos(yaw), Math.sin(yaw), 0).applyEuler(group.rotation);
      camera.lookAt(eye.clone().add(fwd.multiplyScalar(200)));
    } else {
      const wc = min.clone().add(max).multiplyScalar(0.5).applyEuler(group.rotation);
      camera.position.set(wc.x, wc.y + size.z * 0.25, wc.z + Math.max(size.x, size.y) * 0.6);
      camera.lookAt(wc);
    }
    controls?.dispose();
    controls = new FlyControls(camera, canvas!, { speed: Math.max(size.x, size.y, size.z) * 0.12, onLockChange: setLocked });
  }

  createEffect(() => applyMode()); // re-apply on mode / wireframe change
  createEffect(() => (entityGroup.visible = showEntities()));

  createEffect(
    on(
      () => props.path,
      (path) => {
        if (!canvas || !container) return;
        if (!renderer) {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
          renderer.setPixelRatio(window.devicePixelRatio);
          const resize = () => {
            const w = container!.clientWidth;
            const h = container!.clientHeight;
            if (!w || !h) return;
            renderer!.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
          };
          resize();
          ro = new ResizeObserver(resize);
          ro.observe(container);
          const clock = new THREE.Clock();
          const loop = () => {
            controls?.update(clock.getDelta());
            renderer!.render(scene, camera);
            raf = requestAnimationFrame(loop);
          };
          raf = requestAnimationFrame(loop);
        }
        buildWorld(path);
      },
    ),
  );

  onCleanup(() => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    controls?.dispose();
    disposeWorld();
    flatMat.dispose();
    missing.dispose();
    renderer?.dispose();
  });

  const MODES: { id: Mode; label: string }[] = [
    { id: "flat", label: "Flat" },
    { id: "textured", label: "Textured" },
    { id: "lit", label: "Lit" },
  ];

  return (
    <>
      <div class="folder-toolbar">
        <div class="chips">
          <For each={MODES}>
            {(m) => (
              <button classList={{ active: mode() === m.id }} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            )}
          </For>
        </div>
        <div class="chips" style={{ "margin-left": "auto" }}>
          <button classList={{ active: showEntities() }} onClick={() => setShowEntities(!showEntities())}>
            entities
          </button>
          <button classList={{ active: wireframe() }} onClick={() => setWireframe(!wireframe())}>
            wire
          </button>
        </div>
      </div>
      <div class="viewer-body gl-stage" ref={container}>
        <canvas ref={canvas} class="gl-canvas" />
        <Show when={error()}>
          <div class="placeholder" style={{ position: "absolute", inset: "0" }}>Error: {error()}</div>
        </Show>
        <div class="gl-hint">
          {locked() ? "ESC release · WASD move · Space/Ctrl up·down · Shift fast" : "click to look · WASD fly"} · {info()}
        </div>
      </div>
    </>
  );
}
