import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { loadSprite } from "../api";
import type { Rgba } from "../types";
import { paintRgba } from "../util/canvas";

/** Paints one decoded RGBA frame to a canvas. */
function FrameCanvas(props: { frame: Rgba; class?: string }) {
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    if (canvas) paintRgba(canvas, props.frame);
  });
  return <canvas class={props.class ?? "img-canvas"} ref={canvas} />;
}

/** Sprite viewer with two modes:
 *   - Play: one frame at a time, play/pause, speed, and a scrub slider that
 *     tracks the active frame while playing (and scrubs when dragged).
 *   - Frames: every frame laid out side by side. */
export default function SpriteViewer(props: { path: string }) {
  const [data] = createResource(() => props.path, loadSprite);
  const [mode, setMode] = createSignal<"play" | "frames">("play");
  const [frame, setFrame] = createSignal(0);
  const [playing, setPlaying] = createSignal(true);
  const [fps, setFps] = createSignal(10);

  const count = () => data()?.frames.length ?? 0;

  // reset to the first frame when the sprite changes
  createEffect(() => {
    props.path;
    setFrame(0);
    setPlaying(true);
  });

  // playback loop: advances the frame; re-runs (clearing the old timer) when
  // playing/fps/mode/count change.
  createEffect(() => {
    if (!playing() || mode() !== "play" || count() <= 1) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % count()), 1000 / fps());
    onCleanup(() => clearInterval(id));
  });

  return (
    <>
      <div class="folder-toolbar">
        <Show when={data()} fallback={<span class="count">Decoding…</span>}>
          {(d) => (
            <span class="count">
              {d().num_frames} frames · {d().width}×{d().height} · {d().format_name} · {d().type_name}
            </span>
          )}
        </Show>
        <div class="chips" style={{ "margin-left": "12px" }}>
          <button classList={{ active: mode() === "play" }} onClick={() => setMode("play")}>
            ▶ Play
          </button>
          <button classList={{ active: mode() === "frames" }} onClick={() => setMode("frames")}>
            ▦ Frames
          </button>
        </div>
      </div>

      <div class="viewer-body" classList={{ center: mode() === "play" }}>
        <Show when={data()} fallback={<div class="placeholder">Loading…</div>}>
          {(d) => (
            <Show when={count() > 0} fallback={<div class="placeholder">No frames.</div>}>
              <Show
                when={mode() === "play"}
                fallback={
                  <div class="grid sprite-frames">
                    <For each={d().frames}>
                      {(f, i) => (
                        <div class="cell" title={`frame ${i() + 1}`}>
                          <div class="tile-preview">
                            <FrameCanvas frame={f} class="tile-canvas" />
                          </div>
                          <div class="cell-label">{i() + 1}</div>
                        </div>
                      )}
                    </For>
                  </div>
                }
              >
                <div class="sprite-play">
                  <div class="sprite-stage">
                    <FrameCanvas frame={d().frames[Math.min(frame(), count() - 1)]!} />
                  </div>
                  <div class="sprite-controls">
                    <button onClick={() => setPlaying((p) => !p)} disabled={count() <= 1}>
                      {playing() ? "⏸" : "▶"}
                    </button>
                    <input
                      class="frame-slider"
                      type="range"
                      min={0}
                      max={Math.max(0, count() - 1)}
                      value={frame()}
                      onInput={(e) => {
                        setPlaying(false);
                        setFrame(+e.currentTarget.value);
                      }}
                    />
                    <span class="frame-num">
                      {Math.min(frame(), count() - 1) + 1} / {count()}
                    </span>
                    <label class="sort">
                      {fps()} fps
                      <input
                        type="range"
                        min={1}
                        max={60}
                        value={fps()}
                        onInput={(e) => setFps(+e.currentTarget.value)}
                        style={{ width: "90px" }}
                      />
                    </label>
                  </div>
                </div>
              </Show>
            </Show>
          )}
        </Show>
      </div>
    </>
  );
}
