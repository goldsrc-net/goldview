import { createResource, createSignal, createEffect, onCleanup, Show } from "solid-js";
import type { Rgba } from "../types";
import { paintRgba } from "../util/canvas";

/** Single-texture zoom view (shared by the WAD grid and the model texture grid).
 *  Plain mouse-wheel zooms; scroll to pan when bigger than the pane; a back
 *  button returns to the grid. */
export default function TextureZoom(props: {
  load: () => Promise<Rgba>;
  name: string;
  info?: string;
  onBack: () => void;
}) {
  const [img] = createResource(props.load);
  const [zoom, setZoom] = createSignal(1);
  let canvas: HTMLCanvasElement | undefined;

  createEffect(() => {
    const d = img();
    if (d && canvas) paintRgba(canvas, d);
  });

  const sized = () => {
    const d = img();
    const z = zoom();
    return d ? { width: `${d.width * z}px`, height: `${d.height * z}px` } : undefined;
  };
  const bump = (f: number) => setZoom((z) => Math.max(0.1, Math.min(32, z * f)));

  const attach = (el: HTMLDivElement) => {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      bump(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    onCleanup(() => el.removeEventListener("wheel", onWheel));
  };

  return (
    <>
      <div class="folder-toolbar">
        <button onClick={props.onBack}>← back</button>
        <span class="count">
          {props.name}
          {props.info ? ` · ${props.info}` : ""}
        </span>
        <div class="chips" style={{ "margin-left": "auto" }}>
          <button onClick={() => bump(1 / 1.3)}>−</button>
          <span class="mp-num">{Math.round(zoom() * 100)}%</span>
          <button onClick={() => bump(1.3)}>＋</button>
          <button onClick={() => setZoom(1)}>reset</button>
        </div>
      </div>
      <div class="viewer-body zoomable" ref={attach}>
        <Show when={img()} fallback={<div class="placeholder">Decoding…</div>}>
          <Show when={!img.error} fallback={<div class="placeholder">Error: {String(img.error)}</div>}>
            <div class="zoom-wrap">
              <canvas class="img-canvas zoomed" ref={canvas} style={sized()} />
            </div>
          </Show>
        </Show>
      </div>
    </>
  );
}
