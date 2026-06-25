import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { loadWad, wadTexture } from "../api";
import { WadTexThumb } from "../handlers/lazy";
import ImageView from "./ImageView";

/** Grid of every texture in a WAD3 archive, with a name filter. Click a texture
 *  to open a zoomable single-texture view. */
export default function WadViewer(props: { path: string }) {
  const [list] = createResource(() => props.path, loadWad);
  const [filter, setFilter] = createSignal("");
  const [selected, setSelected] = createSignal<string | null>(null);
  const shown = createMemo(() => {
    const f = filter();
    return (list() ?? []).filter((t) => t.name.toLowerCase().includes(f));
  });

  return (
    <Show
      when={!selected()}
      fallback={
        <ImageView
          key={selected()!}
          load={() => wadTexture(props.path, selected()!)}
          title={selected()!}
          onBack={() => setSelected(null)}
        />
      }
    >
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
      <div class="viewer-body">
        <Show when={!list.error} fallback={<div class="placeholder">Error: {String(list.error)}</div>}>
          <div class="grid">
            <For each={shown()}>
              {(t) => (
                <div
                  class="cell"
                  title={`${t.name}  ${t.width}×${t.height}`}
                  onClick={() => setSelected(t.name)}
                >
                  <WadTexThumb path={props.path} name={t.name} />
                  <div class="cell-label">
                    {t.name}
                    <div class="dim">
                      {t.width}×{t.height}
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}
