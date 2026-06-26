import { Show, createMemo, createResource, createSignal } from "solid-js";
import { loadWad, wadTexture } from "../api";
import { WadTexThumb } from "../handlers/lazy";
import Gallery from "./Gallery";

/** Grid of every texture in a WAD3 archive, with a name filter. Click a texture
 *  to open a zoomable single-texture view (shared Gallery → ImageView). */
export default function WadViewer(props: { path: string }) {
  const [list] = createResource(() => props.path, loadWad);
  const [filter, setFilter] = createSignal("");
  const shown = createMemo(() => {
    const f = filter();
    return (list() ?? []).filter((t) => t.name.toLowerCase().includes(f));
  });

  return (
    <Show when={!list.error} fallback={<div class="placeholder">Error: {String(list.error)}</div>}>
      <Gallery
        items={shown()}
        thumb={(i) => <WadTexThumb path={props.path} name={shown()[i].name} />}
        load={(i) => wadTexture(props.path, shown()[i].name)}
        toolbar={
          <div class="folder-toolbar">
            <Show when={!list.loading} fallback={<span class="count">Reading WAD…</span>}>
              <span class="count">
                {shown().length}
                {filter() ? ` / ${list()?.length ?? 0}` : ""} textures
              </span>
            </Show>
            <input
              class="wad-filter"
              placeholder="filter…"
              onInput={(e) => setFilter(e.currentTarget.value.toLowerCase())}
            />
          </div>
        }
      />
    </Show>
  );
}
