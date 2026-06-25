import { createResource, createEffect, Show } from "solid-js";
import { loadImage } from "../api";
import { paintRgba } from "../util/canvas";

export default function ImageViewer(props: { path: string }) {
  const [img] = createResource(() => props.path, loadImage);
  let canvas: HTMLCanvasElement | undefined;

  createEffect(() => {
    const data = img();
    if (data && canvas) paintRgba(canvas, data);
  });

  return (
    <div class="viewer-body center">
      <Show when={!img.loading} fallback={<div class="placeholder">Decoding…</div>}>
        <Show when={!img.error} fallback={<div class="placeholder">Error: {String(img.error)}</div>}>
          <canvas class="img-canvas" ref={canvas} />
        </Show>
      </Show>
    </div>
  );
}
