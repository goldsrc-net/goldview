import { createSignal, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { Node, OpenResult } from "./types";
import { pickAndOpenMod, startupMod } from "./api";
import { TreeRow } from "./tree/Tree";
import Viewer from "./viewers/Viewer";

export default function App() {
  const [mod, setMod] = createSignal<OpenResult | null>(null);
  const [selected, setSelected] = createSignal<Node | null>(null);
  const [filter, setFilter] = createSignal("");
  const [open, setOpen] = createStore<Record<string, boolean>>({});
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>("");

  const openSet = () => new Set(Object.keys(open).filter((k) => open[k]));

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
            {(n) => (
              <div class="kv">
                <span class="k">name</span>
                <span class="v">{n().name}</span>
                <span class="k">path</span>
                <span class="v">{n().path}</span>
                <span class="k">type</span>
                <span class="v">{n().category ?? "—"}</span>
                <Show when={n().size != null}>
                  <span class="k">size</span>
                  <span class="v">{fmtSize(n().size!)}</span>
                </Show>
                <Show when={n().source != null && mod()}>
                  <span class="k">source</span>
                  <span class="v">{mod()!.names[n().source!] ?? n().source}</span>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
