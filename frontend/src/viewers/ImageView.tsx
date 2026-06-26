import { createResource, createEffect, Show } from "solid-js";
import type { Rgba } from "../types";
import { fmtDim } from "../util/format";
import { createZoom, enablePan } from "../util/zoom";
import ZoomControls from "./ZoomControls";
import RgbaCanvas from "./RgbaCanvas";

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
  let canvas: HTMLCanvasElement | undefined;
  let bodyEl: HTMLDivElement | undefined;

  // Ctrl+wheel zoom shared with createZoom; the hook keeps the point under the
  // cursor fixed (measure before, apply, then adjust scroll after layout).
  const z = createZoom({
    min: 0.1,
    max: 32,
    onWheelZoom: (e, apply) => {
      const el = bodyEl;
      const d = img();
      if (!el || !d || !canvas) {
        apply();
        return;
      }
      const rect = el.getBoundingClientRect();
      const cRect = canvas.getBoundingClientRect();
      const rx = Math.min(1, Math.max(0, (e.clientX - cRect.left) / cRect.width));
      const ry = Math.min(1, Math.max(0, (e.clientY - cRect.top) / cRect.height));
      const mxV = e.clientX - rect.left;
      const myV = e.clientY - rect.top;
      apply();
      requestAnimationFrame(() => {
        el.scrollLeft = rx * d.width * z.zoom() - mxV;
        el.scrollTop = ry * d.height * z.zoom() - myV;
      });
    },
  });

  // reset zoom whenever the displayed image changes
  createEffect(() => {
    props.key;
    z.reset();
  });

  const sized = () => {
    const d = img();
    const f = z.zoom();
    return d ? { width: `${d.width * f}px`, height: `${d.height * f}px` } : undefined;
  };

  const bindBody = (el: HTMLDivElement) => {
    bodyEl = el;
    enablePan(el); // click-drag pan (plain scroll/drag)
    z.attach(el); // ctrl+wheel zoom (anchored via onWheelZoom above)
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
                {fmtDim(d().width, d().height)}
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
              <RgbaCanvas data={img()!} class="img-canvas zoomed" style={sized()} ref={(el) => (canvas = el)} />
            </div>
          </Show>
        </Show>
      </div>
    </>
  );
}
