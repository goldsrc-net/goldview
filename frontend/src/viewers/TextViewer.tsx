import { createResource, Show } from "solid-js";
import { readText } from "../api";

export default function TextViewer(props: { path: string }) {
  const [text] = createResource(() => props.path, readText);
  return (
    <div class="viewer-body">
      <Show when={!text.loading} fallback={<div class="placeholder">Loading…</div>}>
        <Show when={!text.error} fallback={<div class="placeholder">Error: {String(text.error)}</div>}>
          <pre class="text">{text()}</pre>
        </Show>
      </Show>
    </div>
  );
}
