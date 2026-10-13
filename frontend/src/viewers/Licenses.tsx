import { createResource, Show } from "solid-js";
import { licenses } from "../api";

/** Center pane shown by the toolbar's Licenses button: the license notice and
 *  the third-party notices the binary has to carry. */
export default function Licenses() {
  const [text] = createResource(licenses);
  return (
    <div class="pane viewer">
      <div class="viewer-head">
        <span>⚖️</span>
        <strong>Licenses</strong>
      </div>
      <div class="viewer-body">
        <Show when={!text.loading} fallback={<div class="placeholder">Loading…</div>}>
          <pre class="text">{text.error ? String(text.error) : text()}</pre>
        </Show>
      </div>
    </div>
  );
}
