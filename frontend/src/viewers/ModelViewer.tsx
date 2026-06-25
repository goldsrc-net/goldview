import { createEffect, createSignal, onCleanup, Show, For } from "solid-js";
import * as THREE from "three";
import { ModelController, currentModel, setCurrentModel } from "./ModelController";
import { LazyCanvas } from "../handlers/lazy";
import { modelTexture } from "../api";
import TextureZoom from "./TextureZoom";

/** Center pane for a model: a Three.js viewport (skinned + animated) with a
 *  swap-in texture grid. State lives in a shared ModelController (the sidebar
 *  ModelPanel drives the same instance). */
export default function ModelViewer(props: { path: string }) {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let ctrl: ModelController | null = null;
  const [selTex, setSelTex] = createSignal<{ index: number; name: string; info: string } | null>(null);

  function teardown() {
    ctrl?.dispose();
    ctrl = null;
    setCurrentModel(null);
  }
  onCleanup(() => {
    teardown();
    renderer?.dispose();
    renderer = undefined;
  });

  createEffect(() => {
    const path = props.path;
    if (!canvas || !container) return;
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
    }
    teardown();
    ctrl = new ModelController(path);
    setCurrentModel(ctrl);
    ctrl.attach(renderer, container);
  });

  const showTextures = () => currentModel()?.viewMode() === "textures";

  return (
    <>
      <Show when={currentModel()}>
        {(ctrl) => (
          <div class="folder-toolbar">
            <div class="chips">
              <button classList={{ active: ctrl().viewMode() === "model" }} onClick={() => ctrl().setViewMode("model")}>
                3D
              </button>
              <button
                classList={{ active: ctrl().viewMode() === "textures" }}
                onClick={() => ctrl().setViewMode("textures")}
              >
                Textures ({ctrl().data()?.textures.length ?? 0})
              </button>
            </div>
            <div class="chips" style={{ "margin-left": "auto" }}>
              <button classList={{ active: ctrl().wireframe() }} onClick={() => ctrl().setWireframe(!ctrl().wireframe())}>
                wireframe
              </button>
            </div>
          </div>
        )}
      </Show>
      <div class="viewer-body gl-stage" ref={container}>
      <canvas ref={canvas} class="gl-canvas" style={{ display: showTextures() ? "none" : "block" }} />
      <Show when={showTextures() && currentModel()?.data()}>
        {(model) => (
          <div class="tex-overlay">
            <Show
              when={!selTex()}
              fallback={
                <TextureZoom
                  load={() => modelTexture(props.path, selTex()!.index)}
                  name={selTex()!.name}
                  info={selTex()!.info}
                  onBack={() => setSelTex(null)}
                />
              }
            >
              <div class="grid">
                <For each={model().textures}>
                  {(t, i) => (
                    <div
                      class="cell"
                      title={`${t.name}  ${t.width}×${t.height}`}
                      onClick={() => setSelTex({ index: i(), name: t.name, info: `${t.width}×${t.height}` })}
                    >
                      <LazyCanvas load={() => modelTexture(props.path, i())} />
                      <div class="cell-label">
                        {t.name}
                        <div class="dim">
                          {t.width}×{t.height}
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}
      </Show>
      <Show when={!showTextures()}>
        <div class="gl-hint">drag to rotate · scroll or W/S zoom · A/D rotate</div>
      </Show>
      </div>
    </>
  );
}
