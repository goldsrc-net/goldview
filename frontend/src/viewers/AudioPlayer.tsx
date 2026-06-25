import { createResource, Show } from "solid-js";
import { audioInfo, rawUrl } from "../api";

export default function AudioPlayer(props: { path: string }) {
  const isWav = () => props.path.toLowerCase().endsWith(".wav");
  const [info] = createResource(() => (isWav() ? props.path : null), audioInfo);
  return (
    <div class="viewer-body center">
      <div style={{ "text-align": "center" }}>
        <audio controls src={rawUrl(props.path)} style={{ width: "420px" }} />
        <Show when={isWav() && info()}>
          {(i) => (
            <div class="kv" style={{ "margin-top": "16px", "text-align": "left", display: "inline-grid" }}>
              <span class="k">sample rate</span>
              <span class="v">{i().sample_rate} Hz</span>
              <span class="k">channels</span>
              <span class="v">{i().channels}</span>
              <span class="k">bits</span>
              <span class="v">{i().bits_per_sample}</span>
              <span class="k">duration</span>
              <span class="v">{i().duration_secs.toFixed(2)} s</span>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}
