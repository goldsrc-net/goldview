import { createResource, createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import * as THREE from "three";
import { loadModel, modelTexture } from "../api";
import type { ModelData } from "../types";
import { OrbitControls } from "../three/OrbitControls";

/** Static (bind-pose) studiomodel viewer. Builds a Three.js scene from the
 *  Rust-posed geometry + decoded textures. Turntable navigation: drag to orbit,
 *  A/D orbit, W/S + mouse-wheel zoom. Animation lands in Phase 4. */
export default function ModelViewer(props: { path: string }) {
  const [skin, setSkin] = createSignal(0);
  const [data] = createResource(
    () => [props.path, skin()] as const,
    ([path, sk]) => loadModel(path, sk),
  );
  const [wireframe, setWireframe] = createSignal(false);

  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let scene: Scene | null = null;

  function teardown() {
    scene?.dispose();
    scene = null;
  }
  onCleanup(teardown);

  // rebuild only when the model/skin changes (NOT on wireframe toggle)
  createEffect(() => {
    const model = data();
    if (!model || !canvas || !container) return;
    teardown();
    build(canvas, container, props.path, model).then((s) => {
      scene = s;
      s.setWireframe(wireframe());
    });
  });

  // wireframe is a live material tweak — never rebuilds the scene/camera
  createEffect(() => {
    const wf = wireframe();
    scene?.setWireframe(wf);
  });

  return (
    <>
      <div class="folder-toolbar">
        <Show when={data()} fallback={<span class="count">Building model…</span>}>
          {(m) => (
            <span class="count">
              {m().num_bones} bones · {m().textures.length} textures · {m().parts.length} parts
            </span>
          )}
        </Show>
        <div class="chips" style={{ "margin-left": "12px" }}>
          <button classList={{ active: wireframe() }} onClick={() => setWireframe((w) => !w)}>
            wireframe
          </button>
        </div>
        <Show when={(data()?.num_skin_families ?? 1) > 1}>
          <label class="sort">
            skin&nbsp;
            <select value={skin()} onChange={(e) => setSkin(+e.currentTarget.value)}>
              <For each={Array.from({ length: data()!.num_skin_families }, (_, i) => i)}>
                {(i) => <option value={i}>{i}</option>}
              </For>
            </select>
          </label>
        </Show>
      </div>
      <div class="viewer-body gl-stage" ref={container}>
        <canvas ref={canvas} class="gl-canvas" />
        <div class="gl-hint">drag to rotate · scroll or W/S zoom · A/D rotate</div>
      </div>
    </>
  );
}

interface Scene {
  dispose: () => void;
  setWireframe: (b: boolean) => void;
}

async function build(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
  path: string,
  model: ModelData,
): Promise<Scene> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x131417);
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 100000);

  // GoldSrc is Z-up, X-forward → rotate into Three's Y-up world.
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;
  scene.add(group);

  // decode the textures actually referenced
  const used = new Set<number>();
  for (const part of model.parts) for (const sm of part.submeshes) used.add(sm.texture);
  const texMap = new Map<number, THREE.Texture>();
  await Promise.all(
    [...used].map(async (idx) => {
      try {
        const rgba = await modelTexture(path, idx);
        const tex = new THREE.DataTexture(new Uint8Array(rgba.pixels), rgba.width, rgba.height, THREE.RGBAFormat);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        texMap.set(idx, tex);
      } catch {
        /* leave untextured */
      }
    }),
  );

  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  for (const part of model.parts) {
    for (const sm of part.submeshes) {
      if (sm.positions.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(sm.positions, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(sm.uvs, 2));
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({
        map: texMap.get(sm.texture) ?? null,
        color: texMap.has(sm.texture) ? 0xffffff : 0x9aa0a8,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(geo, mat));
      geoms.push(geo);
      mats.push(mat);
    }
  }

  // frame the camera on the model's bounds
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const dist = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 1.4;

  const controls = new OrbitControls(camera, canvas, { target: center, radius: dist });

  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    controls.update(clock.getDelta());
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    dispose: () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      texMap.forEach((t) => t.dispose());
      renderer.dispose();
    },
    setWireframe: (b: boolean) => mats.forEach((m) => ((m as THREE.MeshBasicMaterial).wireframe = b)),
  };
}
