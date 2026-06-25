import { createSignal, onCleanup, onMount } from "solid-js";

interface ZoomOpts {
  initial?: number;
  min?: number;
  max?: number;
  /** multiplicative step per wheel notch / keypress */
  step?: number;
  /** when present, zoom input is ignored unless this returns true */
  enabled?: () => boolean;
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
  const step = opts.step ?? 1.15;
  const [zoom, setZoom] = createSignal(opts.initial ?? 1);
  const clamp = (z: number) => Math.min(max, Math.max(min, z));
  const inn = () => setZoom((z) => clamp(z * step));
  const out = () => setZoom((z) => clamp(z / step));

  const on = () => !opts.enabled || opts.enabled();

  const attach = (el: HTMLElement) => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !on()) return;
      e.preventDefault();
      setZoom((z) => clamp(e.deltaY < 0 ? z * step : z / step));
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

  return { zoom, setZoom, attach };
}
