import { Show, createEffect, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Node } from "../types";
import { registry } from "../handlers/registry";
import { createZoom } from "../util/zoom";

/** The center pane. Resolves the selected node to a handler and renders its
 *  full-pane `View`. Owns the Ctrl-zoom state + input (wheel/keys on the whole
 *  pane) and passes the factor into the view; the handler's `zoom` mode decides
 *  whether zoom is active at all. */
export default function Viewer(props: { node: Node | null; onSelect: (n: Node) => void }) {
  const handler = createMemo(() => (props.node ? registry.resolve(props.node) : null));
  const zoomable = () => handler()?.zoom !== "none" && handler()?.zoom != null;

  const { zoom, setZoom, attach } = createZoom({ min: 0.2, max: 12, enabled: zoomable });
  // reset zoom whenever the selection changes
  createEffect(() => {
    props.node?.path;
    setZoom(1);
  });

  return (
    <div class="pane viewer" ref={attach}>
      <Show
        when={props.node}
        fallback={
          <div class="viewer-body center">
            <div class="placeholder">Select a resource or folder from the tree.</div>
          </div>
        }
      >
        {(n) => (
          <>
            <div class="viewer-head">
              <span>{handler()!.icon}</span>
              <strong>{n().name}</strong>
              <span style={{ color: "var(--fg-dim)" }}>{n().path || "/"}</span>
              <Show when={zoomable()}>
                <span class="zoom-badge" title="Ctrl+scroll / Ctrl+± to zoom, Ctrl+0 reset" onClick={() => setZoom(1)}>
                  {Math.round(zoom() * 100)}%
                </span>
              </Show>
            </div>
            <Dynamic
              component={handler()!.View}
              node={n()}
              onSelect={props.onSelect}
              zoom={zoomable() ? zoom() : 1}
            />
          </>
        )}
      </Show>
    </div>
  );
}
