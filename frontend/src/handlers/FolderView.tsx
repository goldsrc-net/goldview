import { For, Show, createMemo, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { Category, Node } from "../types";
import { registry } from "./registry";

type SortKey = "name" | "type" | "size";

/** Grid of preview tiles for a folder's direct children (no recursion).
 *  Subfolders appear as clickable tiles to drill in; files render their
 *  handler's `Tile`. Supports filter-by-type and sort. */
export default function FolderView(props: { node: Node; onSelect: (n: Node) => void }) {
  const children = () => props.node.children ?? [];
  const dirs = createMemo(() => children().filter((c) => c.is_dir));
  const files = createMemo(() => children().filter((c) => !c.is_dir));

  const cats = createMemo(() => {
    const s = new Set<Category>();
    for (const f of files()) if (f.category) s.add(f.category);
    return [...s].sort();
  });

  const [filter, setFilter] = createSignal<Category | "all">("all");
  const [sort, setSort] = createSignal<SortKey>("name");

  const shownFiles = createMemo(() => {
    const f = filter();
    let xs = f === "all" ? files() : files().filter((c) => c.category === f);
    const key = sort();
    return [...xs].sort((a, b) => {
      if (key === "size") return (b.size ?? 0) - (a.size ?? 0);
      if (key === "type")
        return (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  });

  return (
    <>
      <div class="folder-toolbar">
        <span class="count">
          {dirs().length} folders · {files().length} files
        </span>
        <div class="chips">
          <button classList={{ active: filter() === "all" }} onClick={() => setFilter("all")}>
            All
          </button>
          <For each={cats()}>
            {(c) => (
              <button classList={{ active: filter() === c }} onClick={() => setFilter(c)}>
                {registry.forCategory(c)?.icon} {c}
              </button>
            )}
          </For>
        </div>
        <label class="sort">
          sort&nbsp;
          <select value={sort()} onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
            <option value="name">name</option>
            <option value="type">type</option>
            <option value="size">size</option>
          </select>
        </label>
      </div>

      <div class="viewer-body">
        <div class="grid">
          <Show when={filter() === "all"}>
            <For each={dirs()}>
              {(d) => (
                <div class="cell" onClick={() => props.onSelect(d)} title={d.name}>
                  <Dynamic component={registry.resolve(d).Tile} node={d} />
                  <div class="cell-label">{d.name}</div>
                </div>
              )}
            </For>
          </Show>
          <For each={shownFiles()}>
            {(f) => (
              <div class="cell" onClick={() => props.onSelect(f)} title={f.path}>
                <Dynamic component={registry.resolve(f).Tile} node={f} />
                <div class="cell-label">{f.name}</div>
              </div>
            )}
          </For>
          <Show when={dirs().length === 0 && shownFiles().length === 0}>
            <div class="placeholder">Empty folder.</div>
          </Show>
        </div>
      </div>
    </>
  );
}
