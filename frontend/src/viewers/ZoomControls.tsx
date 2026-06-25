import type { Accessor } from "solid-js";

/** Shared −/%/+/reset zoom button group (image + texture + text views). */
export default function ZoomControls(props: {
  zoom: Accessor<number>;
  zoomBy: (f: number) => void;
  reset: () => void;
}) {
  return (
    <div class="chips zoom-controls">
      <button title="zoom out (Ctrl+-)" onClick={() => props.zoomBy(1 / 1.3)}>
        −
      </button>
      <span class="mp-num">{Math.round(props.zoom() * 100)}%</span>
      <button title="zoom in (Ctrl++)" onClick={() => props.zoomBy(1.3)}>
        ＋
      </button>
      <button title="reset (Ctrl+0)" onClick={props.reset}>
        reset
      </button>
    </div>
  );
}
