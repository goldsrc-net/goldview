import { createResource, Show } from "solid-js";
import { readText } from "../api";
import Highlighted, { extOf } from "./Highlighted";

export default function TextViewer(props: { path: string }) {
  const [text] = createResource(() => props.path, readText);
  return (
    <div class="viewer-body">
      <Show when={!text.loading} fallback={<div class="placeholder">Loading…</div>}>
        <Show when={!text.error} fallback={<div class="placeholder">Error: {String(text.error)}</div>}>
          <Highlighted text={text() ?? ""} ext={extOf(props.path)} />
        </Show>
      </Show>
    </div>
  );
}
