import { For, Show, createMemo } from "solid-js";
import type { Node } from "../types";
import { registry } from "../handlers/registry";

/** Single icon source: the handler that claims this node. */
const iconFor = (n: Node): string => registry.resolve(n).icon;

/** Does this node (or any descendant) match the filter substring? */
function matches(n: Node, f: string): boolean {
  if (!f) return true;
  if (n.name.toLowerCase().includes(f)) return true;
  return (n.children ?? []).some((c) => matches(c, f));
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
  // when filtering, force-open dirs that have matches
  const isOpen = () => props.open.has(props.node.path) || (props.filter !== "" && visibleChildren().length > 0);

  return (
    <Show when={matches(props.node, props.filter)}>
      <div
        class="row"
        classList={{ sel: props.selected === props.node.path }}
        style={{ "padding-left": `${4 + props.depth * 14}px` }}
        onClick={() => props.onSelect(props.node)}
      >
        <span
          class="twisty"
          onClick={(e) => {
            if (props.node.is_dir) {
              e.stopPropagation();
              props.onToggle(props.node.path);
            }
          }}
        >
          {props.node.is_dir ? (isOpen() ? "▾" : "▸") : ""}
        </span>
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
