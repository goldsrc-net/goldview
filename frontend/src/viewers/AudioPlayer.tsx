import { createResource, Show } from "solid-js";
import { audioInfo, rawUrl } from "../api";
import { wavDetails } from "../util/format";
import KV from "./KV";

export default function AudioPlayer(props: { path: string }) {
  const isWav = () => props.path.toLowerCase().endsWith(".wav");
  const [info] = createResource(() => (isWav() ? props.path : null), audioInfo);
  return (
    <div class="viewer-body center">
      <div style={{ "text-align": "center" }}>
        <audio controls src={rawUrl(props.path)} style={{ width: "420px" }} />
        <Show when={isWav() && info()}>
          {(i) => (
            <KV
              rows={wavDetails(i())}
              style={{ "margin-top": "16px", "text-align": "left", display: "inline-grid" }}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
