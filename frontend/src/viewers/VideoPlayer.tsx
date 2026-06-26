import { Show } from "solid-js";
import { useObjectUrl } from "../util/blobUrl";

/** Video playback pane (webm/mp4/ogv/avi). Same blob-URL approach as audio —
 *  webkit2gtk's media backend can't load custom URI schemes directly. Codec
 *  support depends on the system GStreamer plugins (webm/mp4 generally play;
 *  legacy avi may not). */
export default function VideoPlayer(props: { path: string }) {
  const src = useObjectUrl(() => props.path);
  return (
    <div class="viewer-body center">
      <Show when={src()} keyed fallback={<div class="placeholder">Loading video…</div>}>
        {(u) => <video controls autoplay src={u} style={{ "max-width": "100%", "max-height": "100%" }} />}
      </Show>
    </div>
  );
}
