import { createSignal, onCleanup, onMount } from "solid-js";

/** Default multiplicative zoom step per wheel notch / keypress. */
export const ZOOM_STEP = 1.15;

interface ZoomOpts {
  initial?: number;
  min?: number;
  max?: number;
  /** multiplicative step per wheel notch / keypress */
  step?: number;
  /** when present, zoom input is ignored unless this returns true */
  enabled?: () => boolean;
  /** ctrl+wheel hook: receives the event and an `apply` fn that performs the
   *  zoom. Lets a consumer measure before and adjust after (e.g. cursor-anchored
   *  scroll). If omitted, the zoom is applied directly. */
  onWheelZoom?: (e: WheelEvent, apply: () => void) => void;
}

/**
 * Ctrl+wheel and Ctrl+'='/'-'/'0' zoom. Returns a `zoom` signal plus an `attach`
 * ref that wires a non-passive wheel listener (so we can preventDefault the
 * webview's own page-zoom) on the scroll container. Ctrl+'='/'-'/'0' are bound
 * on window while the owning viewer is mounted (only one viewer mounts at a time).
 */
export function createZoom(opts: ZoomOpts = {}) {
  const min = opts.min ?? 0.1;
  const max = opts.max ?? 16;
  const step = opts.step ?? ZOOM_STEP;
  const [zoom, setZoom] = createSignal(opts.initial ?? 1);
  const clamp = (z: number) => Math.min(max, Math.max(min, z));
  const inn = () => setZoom((z) => clamp(z * step));
  const out = () => setZoom((z) => clamp(z / step));

  const on = () => !opts.enabled || opts.enabled();

  const attach = (el: HTMLElement) => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !on()) return;
      e.preventDefault();
      const apply = () => setZoom((z) => clamp(e.deltaY < 0 ? z * step : z / step));
      if (opts.onWheelZoom) opts.onWheelZoom(e, apply);
      else apply();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    onCleanup(() => el.removeEventListener("wheel", onWheel));
  };

  const onKey = (e: KeyboardEvent) => {
    if (!e.ctrlKey || !on()) return;
    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      inn();
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      out();
    } else if (e.key === "0") {
      e.preventDefault();
      setZoom(opts.initial ?? 1);
    }
  };
  onMount(() => window.addEventListener("keydown", onKey));
  onCleanup(() => window.removeEventListener("keydown", onKey));

  const zoomBy = (f: number) => setZoom((z) => clamp(z * f));
  const reset = () => setZoom(opts.initial ?? 1);

  return { zoom, setZoom, zoomBy, reset, attach };
}

/**
 * Click-drag to pan a scroll container by adjusting its scroll position (the
 * browser clamps it, so it never pans past the edges and does nothing when the
 * content fits). Ref helper for the zoomable image body.
 */
export function enablePan(el: HTMLElement) {
  let dragging = false;
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;
  const down = (e: MouseEvent) => {
    if (e.button !== 0) return;
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    sl = el.scrollLeft;
    st = el.scrollTop;
    el.classList.add("grabbing");
  };
  const move = (e: MouseEvent) => {
    if (!dragging) return;
    el.scrollLeft = sl - (e.clientX - sx);
    el.scrollTop = st - (e.clientY - sy);
  };
  const up = () => {
    dragging = false;
    el.classList.remove("grabbing");
  };
  el.addEventListener("mousedown", down);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  onCleanup(() => {
    el.removeEventListener("mousedown", down);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  });
}
