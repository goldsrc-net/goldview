import { For, createMemo } from "solid-js";
import { highlight } from "../util/highlight";

/** Renders `text` as syntax-highlighted spans chosen by `ext`. `fontSize` (px)
 *  overrides the stylesheet size — used for Ctrl-zoom. */
export default function Highlighted(props: {
  text: string;
  ext: string;
  class?: string;
  fontSize?: number;
}) {
  const toks = createMemo(() => highlight(props.text, props.ext));
  return (
    <pre
      class={props.class ?? "text"}
      style={props.fontSize ? { "font-size": `${props.fontSize}px` } : undefined}
    >
      <For each={toks()}>{(tok) => <span class={`tok-${tok.t}`}>{tok.v}</span>}</For>
    </pre>
  );
}

/** Derive an extension from a resource path. */
export function extOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1) : "";
}
