import { Show } from "solid-js";
import { useObjectUrl } from "../util/blobUrl";
import { fixWav } from "../util/wav";

/** Audio playback pane. The WAV header details live in the inspector (via the
 *  handler's `details()`), so this is just the player itself. */
export default function AudioPlayer(props: { path: string }) {
  // normalise odd-sized WAVs that webkit's media backend won't play (mp3 passes through)
  const src = useObjectUrl(
    () => props.path,
    async (r) => new Blob([fixWav(await r.arrayBuffer())], { type: r.headers.get("content-type") ?? "" }),
  );
  return (
    <div class="viewer-body center">
      {/* keyed on the blob URL so each track gets a fresh <audio> element (resets
          play state) and autoplays the new selection */}
      <Show when={src()} keyed fallback={<div class="placeholder">Loading audio…</div>}>
        {(u) => <audio controls autoplay src={u} style={{ width: "420px" }} />}
      </Show>
    </div>
  );
}
