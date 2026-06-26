import { createEffect, createMemo, createResource, createSignal, onCleanup, onMount, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createStore } from "solid-js/store";
import type { Detail, Node, OpenResult } from "./types";
import { pickAndOpenMod, startupMod } from "./api";
import { TreeRow, matches, nodeOpen } from "./tree/Tree";
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
    // expand only the mod root, revealing its top-level dirs (collapsed); show its grid
    setOpen({ [root.path]: true });
    setSelected(root);
  }

  // The visible rows, flattened in display order (respects open state + filter) —
  // drives ↑/↓ keyboard navigation. Reuses the tree's own matches/nodeOpen rules.
  const flatVisible = createMemo<Node[]>(() => {
    const root = mod()?.tree;
    if (!root) return [];
    const open = openSet();
    const f = filter();
    const out: Node[] = [];
    const walk = (n: Node) => {
      if (!matches(n, f)) return;
      out.push(n);
      if (n.is_dir && nodeOpen(n, open, f)) for (const c of n.children ?? []) walk(c);
    };
    walk(root);
    return out;
  });

  // path -> Node, over the whole tree (for redirect lookups)
  const nodeIndex = createMemo<Map<string, Node>>(() => {
    const map = new Map<string, Node>();
    const walk = (n: Node) => {
      map.set(n.path, n);
      for (const c of n.children ?? []) walk(c);
    };
    const root = mod()?.tree;
    if (root) walk(root);
    return map;
  });

  // Auxiliary MDL files that aren't standalone: `<name>T.mdl` (external textures)
  // and `<name>NN.mdl` (sequence groups). Map each to its main `<name>.mdl` so we
  // can grey them out and redirect clicks. Keyed off the sibling main existing.
  const auxRedirect = createMemo<Map<string, string>>(() => {
    const idx = nodeIndex();
    const map = new Map<string, string>();
    for (const [path, node] of idx) {
      if (node.is_dir || !path.toLowerCase().endsWith(".mdl")) continue;
      const cut = path.lastIndexOf("/") + 1; // 0 if no slash
      const dir = path.slice(0, cut);
      const base = path.slice(cut, path.length - 4); // name without ".mdl"
      const seq = base.match(/^(.*?)(\d\d)$/); // sequence group <stem>NN
      const tex = base.match(/^(.*)t$/i); // external textures <stem>t
      const stem = seq?.[1] ?? tex?.[1];
      const main = stem && `${dir}${stem}.mdl`;
      if (main && main !== path && idx.has(main)) map.set(path, main);
    }
    return map;
  });

  /** Select a node, redirecting aux models (`*t.mdl`/`*NN.mdl`) to their main. */
  const selectNode = (n: Node) => {
    const target = auxRedirect().get(n.path);
    setSelected((target && nodeIndex().get(target)) || n);
  };

  const parentPath = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

  // Keyboard nav: ↑/↓ move selection through the visible rows; → expand / step in;
  // ← collapse / go up a level; Backspace always goes up to the parent folder.
  function onTreeKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const aux = auxRedirect();
    const list = flatVisible().filter((n) => !aux.has(n.path)); // skip greyed aux rows
    if (!list.length) return;
    const cur = selected();
    const idx = cur ? list.findIndex((n) => n.path === cur.path) : -1;
    const goParent = () => {
      const p = list.find((n) => n.path === parentPath(cur!.path));
      if (p) setSelected(p);
    };
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelected(list[Math.min(idx + 1, list.length - 1)] ?? list[0]);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelected(list[Math.max(idx - 1, 0)] ?? list[0]);
        break;
      case "ArrowRight":
        if (cur?.is_dir) {
          e.preventDefault();
          if (!openSet().has(cur.path)) toggle(cur.path);
          else if (cur.children?.length) setSelected(cur.children[0]);
        }
        break;
      case "ArrowLeft":
        if (!cur) break;
        e.preventDefault();
        if (cur.is_dir && openSet().has(cur.path)) toggle(cur.path);
        else goParent();
        break;
      case "Backspace":
        if (!cur) break;
        e.preventDefault();
        goParent();
        break;
    }
  }
  onMount(() => window.addEventListener("keydown", onTreeKey));
  onCleanup(() => window.removeEventListener("keydown", onTreeKey));

  // keep the selected row scrolled into view during keyboard navigation
  createEffect(() => {
    selected();
    requestAnimationFrame(() => document.querySelector(".tree .row.sel")?.scrollIntoView({ block: "nearest" }));
  });

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
                  aux={new Set(auxRedirect().keys())}
                  onToggle={toggle}
                  onSelect={selectNode}
                />
              </div>
            )}
          </Show>
        </div>

        <Viewer node={selected()} onSelect={selectNode} />

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
                  <Dynamic component={panel()!} node={n()} onSelect={selectNode} zoom={1} />
                </Show>
              );
            }}
          </Show>
        </div>
      </div>
    </div>
  );
}
