import { createEffect, createResource, onCleanup, type Accessor } from "solid-js";
import { rawUrl } from "../api";

/**
 * Fetch a resource through the `goldview://` protocol and expose it as a `blob:`
 * URL. Needed for `<audio>`/`<video>`: webkit2gtk's media backend can't load
 * custom URI schemes directly, but it plays blob URLs fine. Revokes the previous
 * URL when the path changes or the owner unmounts. Single source for both the
 * audio and video players.
 */
export function useObjectUrl(
  path: Accessor<string>,
  toBlob: (resp: Response) => Promise<Blob> = (r) => r.blob(),
): Accessor<string | undefined> {
  const [url] = createResource(path, async (p) => URL.createObjectURL(await toBlob(await fetch(rawUrl(p)))));
  let prev: string | undefined;
  createEffect(() => {
    const u = url();
    if (prev && prev !== u) URL.revokeObjectURL(prev);
    prev = u ?? undefined;
  });
  onCleanup(() => prev && URL.revokeObjectURL(prev));
  return url;
}
