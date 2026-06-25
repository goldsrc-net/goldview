import { createResource, createEffect, Show } from "solid-js";
import { loadImage } from "../api";
import { paintRgba } from "../util/canvas";

export default function ImageViewer(props: { path: string; zoom?: number }) {
  const [img] = createResource(() => props.path, loadImage);
  let canvas: HTMLCanvasElement | undefined;

  createEffect(() => {
    const data = img();
    if (data && canvas) paintRgba(canvas, data);
  });

  const sized = () => {
    const d = img();
    const z = props.zoom ?? 1;
    return d ? { width: `${d.width * z}px`, height: `${d.height * z}px` } : undefined;
  };

  return (
    <div class="viewer-body zoomable">
      <Show when={!img.loading} fallback={<div class="placeholder">Decoding…</div>}>
        <Show when={!img.error} fallback={<div class="placeholder">Error: {String(img.error)}</div>}>
          <div class="zoom-wrap">
            <canvas class="img-canvas zoomed" ref={canvas} style={sized()} />
          </div>
        </Show>
      </Show>
    </div>
  );
}
