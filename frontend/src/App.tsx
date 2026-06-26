import { createMemo, createResource, createSignal, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createStore } from "solid-js/store";
import type { Detail, Node, OpenResult } from "./types";
import { pickAndOpenMod, startupMod } from "./api";
import { TreeRow } from "./tree/Tree";
import Viewer from "./viewers/Viewer";
import KV from "./viewers/KV";
import { registry } from "./handlers/registry";
import { fmtSize } from "./util/format";

export default function App() {
  const [mod, setMod] = createSignal<OpenResult | null>(null);
  const [selected, setSelected] = createSignal<Node | null>(null);
  const [filter, setFilter] = createSignal("");
  const [open, setOpen] = createStore<Record<string, boolean>>({});
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>("");

  const openSet = () => new Set(Object.keys(open).filter((k) => open[k]));

  // handler-contributed inspector rows for the current selection
  const [details] = createResource(
    () => selected(),
    async (n) => {
      const h = registry.resolve(n);
      return h.details ? await h.details(n).catch(() => []) : [];
    },
  );

  // full inspector row set: fixed node fields + the handler's async details()
  const inspectorRows = createMemo<Detail[]>(() => {
    const n = selected();
    if (!n) return [];
    const rows: Detail[] = [
      { label: "name", value: n.name },
      { label: "path", value: n.path },
      { label: "type", value: n.category ?? "—" },
    ];
    if (n.size != null) rows.push({ label: "size", value: fmtSize(n.size) });
    if (n.source != null && mod()) rows.push({ label: "source", value: mod()!.names[n.source] ?? String(n.source) });
    rows.push(...(details() ?? []));
    return rows;
  });

  function applyOpen(res: OpenResult) {
    setMod(res);
    const root = res.tree;
    // expand the mod root (path "") plus its top-level dirs, and show its grid
    const init: Record<string, boolean> = { [root.path]: true };
    for (const c of root.children ?? []) if (c.is_dir) init[c.path] = true;
    setOpen(init);
    setSelected(root);
  }

  onMount(async () => {
    try {
      const res = await startupMod();
      if (res) applyOpen(res);
    } catch (e) {
      setError(String(e));
    }
  });

  async function doOpen() {
    setBusy(true);
    setError("");
    try {
      const res = await pickAndOpenMod();
      if (res) applyOpen(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function toggle(path: string) {
    setOpen(path, (v) => !v);
  }

  return (
    <div class="app">
      <div class="toolbar">
        <span class="title">goldview</span>
        <button onClick={doOpen} disabled={busy()}>
          {busy() ? "Opening…" : "Open mod…"}
        </button>
        <Show when={error()}>
          <span style={{ color: "#ff6b6b" }}>{error()}</span>
        </Show>
        <Show when={mod()}>
          {(m) => <span class="roots">{m().roots.join("  →  ")}</span>}
        </Show>
      </div>

      <div class="panes">
        <div class="pane tree-pane">
          <Show when={mod()} fallback={<div class="placeholder">Open a mod to begin.</div>}>
            {(m) => (
              <div class="tree">
                <input
                  class="filter"
                  placeholder="filter…"
                  value={filter()}
                  onInput={(e) => setFilter(e.currentTarget.value.toLowerCase())}
                />
                <TreeRow
                  node={m().tree}
                  depth={0}
                  selected={selected()?.path ?? ""}
                  filter={filter()}
                  open={openSet()}
                  onToggle={toggle}
                  onSelect={setSelected}
                />
              </div>
            )}
          </Show>
        </div>

        <Viewer node={selected()} onSelect={setSelected} />

        <div class="pane inspector">
          <h3>Inspector</h3>
          <Show when={selected()} fallback={<div style={{ color: "var(--fg-dim)" }}>No selection.</div>}>
            <KV rows={inspectorRows()} />
          </Show>
          <Show when={selected()}>
            {(n) => {
              // reactive: re-resolve when the selection changes
              const panel = createMemo(() => registry.resolve(n()).Panel);
              return (
                <Show when={panel()}>
                  <Dynamic component={panel()!} node={n()} onSelect={setSelected} zoom={1} />
                </Show>
              );
            }}
          </Show>
        </div>
      </div>
    </div>
  );
}
