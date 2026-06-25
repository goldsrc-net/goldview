import { createResource, createEffect, onCleanup, Show } from "solid-js";
import type { Rgba } from "../types";
import { paintRgba } from "../util/canvas";
import { createZoom, enablePan } from "../util/zoom";
import ZoomControls from "./ZoomControls";

/**
 * The shared image display + controls — used for image *files* and for *textures*
 * (model + WAD). Ctrl+wheel / Ctrl+± / the buttons zoom; plain scroll + click-drag
 * pan (drag moves the scroll position, so it's clamped to the content edges).
 * Pass `onBack` to show a back button (texture grids), `title` for a label.
 */
export default function ImageView(props: {
  load: () => Promise<Rgba>;
  /** stable id for the current image; refetches + resets zoom when it changes */
  key: string;
  title?: string;
  onBack?: () => void;
}) {
  const [img] = createResource(() => props.key, () => props.load());
  const z = createZoom({ min: 0.1, max: 32 });
  let canvas: HTMLCanvasElement | undefined;

  // reset zoom whenever the displayed image changes
  createEffect(() => {
    props.key;
    z.reset();
  });

  createEffect(() => {
    const d = img();
    if (d && canvas) paintRgba(canvas, d);
  });

  const sized = () => {
    const d = img();
    const f = z.zoom();
    return d ? { width: `${d.width * f}px`, height: `${d.height * f}px` } : undefined;
  };

  const bindBody = (el: HTMLDivElement) => {
    enablePan(el); // click-drag pan (plain scroll/drag)
    // Ctrl+wheel zoom, anchored on the cursor (keep the point under the mouse fixed)
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const d = img();
      if (!d || !canvas) {
        z.zoomBy(factor);
        return;
      }
      const rect = el.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      const rx = Math.min(1, Math.max(0, (e.clientX - cRect.left) / cRect.width));
      const ry = Math.min(1, Math.max(0, (e.clientY - cRect.top) / cRect.height));
      const mxV = e.clientX - rect.left;
      const myV = e.clientY - rect.top;
      z.zoomBy(factor);
      requestAnimationFrame(() => {
        el.scrollLeft = rx * d.width * z.zoom() - mxV;
        el.scrollTop = ry * d.height * z.zoom() - myV;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    onCleanup(() => el.removeEventListener("wheel", onWheel));
  };

  return (
    <>
      <div class="folder-toolbar">
        <Show when={props.onBack}>
          <button onClick={props.onBack}>← back</button>
        </Show>
        <span class="count">
          {props.title}
          <Show when={img()}>
            {(d) => (
              <>
                {props.title ? " · " : ""}
                {d().width}×{d().height}
              </>
            )}
          </Show>
        </span>
        <div style={{ "margin-left": "auto" }}>
          <ZoomControls zoom={z.zoom} zoomBy={z.zoomBy} reset={z.reset} />
        </div>
      </div>
      <div class="viewer-body zoomable pannable" ref={bindBody}>
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
