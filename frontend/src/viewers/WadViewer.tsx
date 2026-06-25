import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { loadWad } from "../api";
import { WadTexThumb } from "../handlers/lazy";

/** Grid of every texture in a WAD3 archive, with a name filter. Each tile lazily
 *  decodes its texture (palettized → RGBA) when scrolled into view. */
export default function WadViewer(props: { path: string }) {
  const [list] = createResource(() => props.path, loadWad);
  const [filter, setFilter] = createSignal("");
  const shown = createMemo(() => {
    const f = filter();
    return (list() ?? []).filter((t) => t.name.toLowerCase().includes(f));
  });

  return (
    <>
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
                <div class="cell" title={`${t.name}  ${t.width}×${t.height}`}>
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
    </>
  );
}
