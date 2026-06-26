import { createEffect, createResource, onCleanup, Show } from "solid-js";
import { rawUrl } from "../api";

/** Audio playback pane. The WAV header details live in the inspector (via the
 *  handler's `details()`), so this is just the player itself. */
export default function AudioPlayer(props: { path: string }) {
  // webkit2gtk's media backend can't load custom URI schemes (`goldview://`)
  // directly, so fetch the bytes through the protocol and give the element a
  // blob: URL, which the media backend can play.
  const [src] = createResource(
    () => props.path,
    async (p) => URL.createObjectURL(await (await fetch(rawUrl(p))).blob()),
  );
  // revoke the previous object URL when it's replaced or the viewer closes
  let prev: string | undefined;
  createEffect(() => {
    const u = src();
    if (prev && prev !== u) URL.revokeObjectURL(prev);
    prev = u ?? undefined;
  });
  onCleanup(() => prev && URL.revokeObjectURL(prev));

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
