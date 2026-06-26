import { createEffect, on, onCleanup, Show, createSignal } from "solid-js";
import * as THREE from "three";
import { loadBsp } from "../api";
import { FlyControls } from "../three/FlyControls";

/**
 * BSP map viewer. Renders the world geometry with a pointer-lock fly camera.
 * Milestone 1: untextured geometry (normal-shaded) — WAD textures + baked
 * lightmaps come next. GoldSrc is Z-up, so the world group is rotated to Three's
 * Y-up; GoldSrc lighting is baked (no runtime lights), so materials are unlit.
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0f12);
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2; // GoldSrc Z-up → Three Y-up
  scene.add(group);
  const camera = new THREE.PerspectiveCamera(75, 1, 4, 100000);

  const geoms: THREE.BufferGeometry[] = [];
  const mat = new THREE.MeshNormalMaterial({ flatShading: true }); // temporary (pre-texture)

  function clearWorld() {
    [...group.children].forEach((c) => group.remove(c));
    geoms.forEach((g) => g.dispose());
    geoms.length = 0;
  }

  async function buildWorld(path: string) {
    setError("");
    const data = await loadBsp(path).catch((e) => {
      setError(String(e));
      return null;
    });
    if (!data) return;
    clearWorld();
    for (const s of data.surfaces) {
      if (s.positions.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(s.positions, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(s.normals, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(s.uvs, 2));
      group.add(new THREE.Mesh(geo, mat));
      geoms.push(geo);
    }
    const tris = data.surfaces.reduce((n, s) => n + s.positions.length / 9, 0);
    setInfo(`${tris.toLocaleString()} tris · ${data.surfaces.length} surfaces · ${data.entities.length} entities`);

    // place the camera just inside the map looking at its centre
    const min = new THREE.Vector3(...data.bbox_min);
    const max = new THREE.Vector3(...data.bbox_max);
    const center = min.clone().add(max).multiplyScalar(0.5);
    const size = max.clone().sub(min);
    // world-space center (account for the group's Z-up→Y-up rotation)
    const wc = center.clone().applyEuler(group.rotation);
    camera.position.set(wc.x, wc.y + size.z * 0.25, wc.z + Math.max(size.x, size.y) * 0.6);
    camera.lookAt(wc);
    controls?.dispose();
    controls = new FlyControls(camera, canvas!, { speed: Math.max(size.x, size.y, size.z) * 0.25, onLockChange: setLocked });
  }

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
    clearWorld();
    mat.dispose();
    renderer?.dispose();
  });

  return (
    <div class="viewer-body gl-stage" ref={container}>
      <canvas ref={canvas} class="gl-canvas" />
      <Show when={error()}>
        <div class="placeholder" style={{ position: "absolute", inset: "0" }}>Error: {error()}</div>
      </Show>
      <div class="gl-hint">
        {locked() ? "ESC release · WASD move · Space/Ctrl up·down · Shift fast" : "click to look · WASD fly"} · {info()}
      </div>
    </div>
  );
}
