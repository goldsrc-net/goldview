import { For, createSignal, createResource, createEffect, onCleanup, Show } from "solid-js";
import { loadThumbnail, loadWad, spriteThumbnail, textPreview, wadTexture } from "../api";
import type { Rgba } from "../types";
import { paintRgba } from "../util/canvas";
import { extOf } from "../util/format";
import Highlighted from "../viewers/Highlighted";

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

/**
 * The one lazy "decode an RGBA buffer and paint it to a canvas" tile. Defers the
 * `load()` until the tile scrolls into view, shows a pulse while loading and a
 * glyph on error. Every image/sprite/wad thumbnail is just this with a loader.
 */
export function LazyCanvas(props: {
  load: () => Promise<Rgba>;
  glyph?: string;
  wrap?: string;
  canvasClass?: string;
}) {
  const { visible, ref } = useVisible();
  const [img] = createResource(visible, () => props.load());
  let canvas: HTMLCanvasElement | undefined;
  createEffect(() => {
    const d = img();
    if (d && canvas) paintRgba(canvas, d);
  });
  return (
    <div class={props.wrap ?? "tile-preview"} ref={ref}>
      <Show when={img()} fallback={<div class="tile-loading" />}>
        <Show when={!img.error} fallback={<div class="tile-emoji">{props.glyph ?? "⚠️"}</div>}>
          <canvas class={props.canvasClass ?? "tile-canvas"} ref={canvas} />
        </Show>
      </Show>
    </div>
  );
}

export const ImageThumb = (props: { path: string; size: number }) => (
  <LazyCanvas load={() => loadThumbnail(props.path, props.size)} glyph="🖼️" />
);

export const SpriteThumb = (props: { path: string }) => (
  <LazyCanvas load={() => spriteThumbnail(props.path, 128)} glyph="✨" />
);

export const WadTexThumb = (props: { path: string; name: string }) => (
  <LazyCanvas load={() => wadTexture(props.path, props.name)} />
);

/** Lazy WAD folder tile: a 2×2 mini-grid of the archive's first 4 textures. */
export function WadTilePreview(props: { path: string }) {
  const { visible, ref } = useVisible();
  const [list] = createResource(visible, () => loadWad(props.path));
  const first4 = () => (list() ?? []).slice(0, 4);
  return (
    <div class="tile-preview" ref={ref}>
      <Show when={list()} fallback={<div class="tile-loading" />}>
        <div class="wad-2x2">
          <For each={first4()}>
            {(t) => (
              <LazyCanvas
                load={() => wadTexture(props.path, t.name)}
                wrap="wad-mini-cell"
                canvasClass="wad-mini"
                glyph="·"
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/** Lazy text snippet preview (first ~800 bytes, shrunk to fit). */
export function TextThumb(props: { path: string }) {
  const { visible, ref } = useVisible();
  const [text] = createResource(visible, () => textPreview(props.path, 800));
  return (
    <div class="tile-preview" ref={ref}>
      <Show when={text()} fallback={<div class="tile-loading" />}>
        <Highlighted text={text() ?? ""} ext={extOf(props.path)} class="tile-text" />
      </Show>
    </div>
  );
}
