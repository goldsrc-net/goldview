import { Show, createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Node } from "../types";
import { registry } from "../handlers/registry";

/** The center pane. Resolves the selected node to a handler and renders its
 *  full-pane `View` (folders → grid, files → their viewer). */
export default function Viewer(props: { node: Node | null; onSelect: (n: Node) => void }) {
  return (
    <div class="pane viewer">
      <Show
        when={props.node}
        fallback={
          <div class="viewer-body center">
            <div class="placeholder">Select a resource or folder from the tree.</div>
          </div>
        }
      >
        {(n) => {
          const handler = createMemo(() => registry.resolve(n()));
          return (
            <>
              <div class="viewer-head">
                <span>{handler().icon}</span>
                <strong>{n().name}</strong>
                <span style={{ color: "var(--fg-dim)" }}>{n().path || "/"}</span>
              </div>
              <Dynamic component={handler().View} node={n()} onSelect={props.onSelect} />
            </>
          );
        }}
      </Show>
    </div>
  );
}
