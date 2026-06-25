import { createEffect, createSignal, onCleanup, Show, For } from "solid-js";
import * as THREE from "three";
import { ModelController, currentModel, setCurrentModel } from "./ModelController";
import { LazyCanvas } from "../handlers/lazy";
import { modelTexture } from "../api";
import ImageView from "./ImageView";

/** Center pane for a model: a Three.js viewport (skinned + animated) with a
 *  swap-in texture grid. State lives in a shared ModelController (the sidebar
 *  ModelPanel drives the same instance). */
export default function ModelViewer(props: { path: string }) {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let renderer: THREE.WebGLRenderer | undefined;
  let ctrl: ModelController | null = null;
  const [selTex, setSelTex] = createSignal<{ index: number; name: string } | null>(null);

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
                wire
              </button>
              <button classList={{ active: ctrl().display().bones }} onClick={() => ctrl().setDisplay("bones", !ctrl().display().bones)}>
                bones
              </button>
              <button classList={{ active: ctrl().display().attachments }} onClick={() => ctrl().setDisplay("attachments", !ctrl().display().attachments)}>
                attach
              </button>
              <button classList={{ active: ctrl().display().hitboxes }} onClick={() => ctrl().setDisplay("hitboxes", !ctrl().display().hitboxes)}>
                hitbox
              </button>
              <button classList={{ active: ctrl().display().bbox }} onClick={() => ctrl().setDisplay("bbox", !ctrl().display().bbox)}>
                bbox
              </button>
              <button classList={{ active: ctrl().display().ground }} onClick={() => ctrl().setDisplay("ground", !ctrl().display().ground)}>
                ground
              </button>
              <input
                type="color"
                class="bg-pick"
                value={ctrl().bg()}
                onInput={(e) => ctrl().setBg(e.currentTarget.value)}
                title="background color"
              />
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
                <ImageView
                  key={`${props.path}#${selTex()!.index}`}
                  load={() => modelTexture(props.path, selTex()!.index)}
                  title={selTex()!.name}
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
                      onClick={() => setSelTex({ index: i(), name: t.name })}
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
