import { createEffect, on, onCleanup, Show, createSignal, For } from "solid-js";
import * as THREE from "three";
import { loadBsp, bspTexture } from "../api";
import type { BspData } from "../types";
import { FlyControls } from "../three/FlyControls";

type Mode = "flat" | "textured";

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
 * baked (unlit materials). Modes: Flat (normal-shaded geometry) / Textured (WAD +
 * embedded textures). Baked lightmaps + entity models ("Full") come next.
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
  const [mode, setMode] = createSignal<Mode>("textured");
  const [wireframe, setWireframe] = createSignal(false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0f12);
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2; // GoldSrc Z-up → Three Y-up
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(75, 1, 4, 100000);

  const geoms: THREE.BufferGeometry[] = [];
  const texMap = new Map<number, THREE.Texture>();
  const flatMat = new THREE.MeshNormalMaterial({ flatShading: true });
  // per-surface textured materials, parallel to group.children
  let texturedMats: THREE.MeshBasicMaterial[] = [];
  const missing = missingTexture();

  function disposeWorld() {
    [...group.children].forEach((c) => group.remove(c));
    geoms.forEach((g) => g.dispose());
    geoms.length = 0;
    texturedMats.forEach((m) => m.dispose());
    texturedMats = [];
    texMap.forEach((t) => t.dispose());
    texMap.clear();
  }

  function applyMode() {
    const m = mode();
    const wf = wireframe();
    group.children.forEach((c, i) => {
      const mesh = c as THREE.Mesh;
      mesh.material = m === "flat" ? flatMat : texturedMats[i] ?? flatMat;
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

    // decode the textures actually used by surfaces (deduped)
    const used = new Set(data.surfaces.map((s) => s.texture));
    await Promise.all(
      [...used].map(async (idx) => {
        try {
          const r = await bspTexture(path, idx);
          const t = new THREE.DataTexture(new Uint8Array(r.pixels), r.width, r.height, THREE.RGBAFormat);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.generateMipmaps = true;
          t.needsUpdate = true;
          texMap.set(idx, t);
        } catch {
          /* unresolved → checkerboard via fallback below */
        }
      }),
    );

    for (const s of data.surfaces) {
      if (s.positions.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(s.positions, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(s.normals, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(s.uvs, 2));
      const name = data.textures[s.texture]?.name ?? "";
      const masked = name.startsWith("{"); // colour-keyed (index 255 transparent)
      const mat = new THREE.MeshBasicMaterial({
        map: texMap.get(s.texture) ?? missing,
        side: THREE.DoubleSide,
        transparent: masked,
        alphaTest: masked ? 0.5 : 0,
      });
      texturedMats.push(mat);
      group.add(new THREE.Mesh(geo, mat));
      geoms.push(geo);
    }
    applyMode();

    const tris = data.surfaces.reduce((n, s) => n + s.positions.length / 9, 0);
    setInfo(`${tris.toLocaleString()} tris · ${data.surfaces.length} surfaces · ${data.entities.length} entities`);
    frameCamera(data);
  }

  function frameCamera(data: BspData) {
    const min = new THREE.Vector3(...data.bbox_min);
    const max = new THREE.Vector3(...data.bbox_max);
    const center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    const wc = center.clone().applyEuler(group.rotation);
    camera.position.set(wc.x, wc.y + size.z * 0.25, wc.z + Math.max(size.x, size.y) * 0.6);
    camera.lookAt(wc);
    controls?.dispose();
    controls = new FlyControls(camera, canvas!, {
      speed: Math.max(size.x, size.y, size.z) * 0.25,
      onLockChange: setLocked,
    });
  }

  createEffect(() => applyMode()); // re-apply when mode / wireframe change

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
