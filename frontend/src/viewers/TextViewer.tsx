import { createResource, Show } from "solid-js";
import { readText } from "../api";
import Highlighted from "./Highlighted";
import { extOf } from "../util/format";

const BASE_FONT = 12;

export default function TextViewer(props: { path: string; zoom?: number }) {
  const [text] = createResource(() => props.path, readText);
  return (
    <div class="viewer-body">
      <Show when={!text.loading} fallback={<div class="placeholder">Loading…</div>}>
        <Show when={!text.error} fallback={<div class="placeholder">Error: {String(text.error)}</div>}>
          <Highlighted text={text() ?? ""} ext={extOf(props.path)} fontSize={BASE_FONT * (props.zoom ?? 1)} />
        </Show>
      </Show>
    </div>
  );
}
