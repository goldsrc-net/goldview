import { createSignal, createResource, createEffect, onCleanup, Show } from "solid-js";
import { loadThumbnail, textPreview, wadTexture } from "../api";
import { paintRgba } from "../util/canvas";
import Highlighted, { extOf } from "../viewers/Highlighted";

/** Returns a ref-setter + a `visible` signal that flips true once the element
 *  scrolls within ~250px of the viewport — so a folder of 600 images only
 *  decodes the tiles you actually look at. */
export function useVisible() {
  const [visible, setVisible] = createSignal(false);
  const ref = (el: HTMLElement) => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "250px" },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  };
  return { visible, ref };
}

/** Lazy, downscaled image thumbnail painted to a canvas. */
export function ImageThumb(props: { path: string; size: number }) {
  const { visible, ref } = useVisible();
  const [img] = createResource(
    () => (visible() ? props.path : null),
    (p) => loadThumbnail(p, props.size),
  );
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    const d = img();
    if (d && canvas) paintRgba(canvas, d);
  });
  return (
    <div class="tile-preview" ref={ref}>
      <Show when={img()} fallback={<div class="tile-loading" />}>
        <Show when={!img.error} fallback={<div class="tile-emoji">⚠️</div>}>
          <canvas class="tile-canvas" ref={canvas} />
        </Show>
      </Show>
    </div>
  );
}

/** Lazy WAD-texture thumbnail (decoded palettized texture painted to canvas). */
export function WadTexThumb(props: { path: string; name: string }) {
  const { visible, ref } = useVisible();
  const [img] = createResource(
    () => (visible() ? props.name : null),
    (n) => wadTexture(props.path, n),
  );
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    const d = img();
    if (d && canvas) paintRgba(canvas, d);
  });
  return (
    <div class="tile-preview" ref={ref}>
      <Show when={img()} fallback={<div class="tile-loading" />}>
        <Show when={!img.error} fallback={<div class="tile-emoji">⚠️</div>}>
          <canvas class="tile-canvas" ref={canvas} />
        </Show>
      </Show>
    </div>
  );
}

/** Lazy text snippet preview (first ~800 bytes, shrunk to fit). */
export function TextThumb(props: { path: string }) {
  const { visible, ref } = useVisible();
  const [text] = createResource(
    () => (visible() ? props.path : null),
    (p) => textPreview(p, 800),
  );
  return (
    <div class="tile-preview" ref={ref}>
      <Show when={text()} fallback={<div class="tile-loading" />}>
        <Highlighted text={text() ?? ""} ext={extOf(props.path)} class="tile-text" />
      </Show>
    </div>
  );
}
