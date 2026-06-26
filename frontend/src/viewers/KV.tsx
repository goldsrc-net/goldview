import { For, type JSX } from "solid-js";
import type { Detail } from "../types";

/** The shared key/value grid: renders label→value rows as `.kv` (`.k`/`.v`
 *  spans). Single source for the inspector and any other detail grids. */
export default function KV(props: { rows: Detail[]; class?: string; style?: JSX.CSSProperties }) {
  return (
    <div class={props.class ? `kv ${props.class}` : "kv"} style={props.style}>
      <For each={props.rows}>
        {(d) => (
          <>
            <span class="k">{d.label}</span>
            <span class="v">{d.value}</span>
          </>
        )}
      </For>
    </div>
  );
}
