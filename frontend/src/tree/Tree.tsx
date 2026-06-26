import { For, Show, createMemo } from "solid-js";
import type { Node } from "../types";
import { registry } from "../handlers/registry";

/** Single icon source: the handler that claims this node. */
const iconFor = (n: Node): string => registry.resolve(n).icon;

/** Does this node (or any descendant) match the filter substring? */
export function matches(n: Node, f: string): boolean {
  if (!f) return true;
  if (n.name.toLowerCase().includes(f)) return true;
  return (n.children ?? []).some((c) => matches(c, f));
}

/** Is a directory node expanded? Open when explicitly toggled, or force-open
 *  while filtering if it has matching descendants. Single source for the tree
 *  render and the keyboard-nav flattening. */
export function nodeOpen(n: Node, open: Set<string>, filter: string): boolean {
  return open.has(n.path) || (filter !== "" && (n.children ?? []).some((c) => matches(c, filter)));
}

interface Props {
  node: Node;
  depth: number;
  selected: string;
  filter: string;
  open: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (n: Node) => void;
}

export function TreeRow(props: Props) {
  const visibleChildren = createMemo(() =>
    (props.node.children ?? []).filter((c) => matches(c, props.filter)),
  );
  const isOpen = () => nodeOpen(props.node, props.open, props.filter);

  return (
    <Show when={matches(props.node, props.filter)}>
      <div
        class="row"
        classList={{ sel: props.selected === props.node.path }}
        style={{ "padding-left": `${4 + props.depth * 14}px` }}
        onClick={() => {
          props.onSelect(props.node);
          if (props.node.is_dir) props.onToggle(props.node.path); // click a folder to expand/collapse
        }}
      >
        <span class="twisty">{props.node.is_dir ? (isOpen() ? "▾" : "▸") : ""}</span>
        <span class="icon">{iconFor(props.node)}</span>
        <span class="label">{props.node.name}</span>
        <Show when={!props.node.is_dir && props.node.category && props.node.category !== "other"}>
          <span class="badge">{props.node.category}</span>
        </Show>
      </div>
      <Show when={props.node.is_dir && isOpen()}>
        <For each={visibleChildren()}>
          {(child) => (
            <TreeRow
              node={child}
              depth={props.depth + 1}
              selected={props.selected}
              filter={props.filter}
              open={props.open}
              onToggle={props.onToggle}
              onSelect={props.onSelect}
            />
          )}
        </For>
      </Show>
    </Show>
  );
}
