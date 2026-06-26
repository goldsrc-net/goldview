import { For, Show, createSignal, type JSX } from "solid-js";
import type { GalleryItem, Rgba } from "../types";
import { fmtDim } from "../util/format";
import ImageView from "./ImageView";

/**
 * The single source of the "texture grid → click → zoomable detail" pattern,
 * shared by the WAD viewer and the model texture browser. Renders a grid of
 * cells (thumbnail + name + WxH); clicking one opens the shared `ImageView`
 * (zoom/pan/back). Kept deliberately small — surrounding concerns (loading,
 * errors, reactive sources) stay in the caller; an optional `toolbar` slot
 * shows above the grid in grid mode only.
 */
export default function Gallery(props: {
  items: GalleryItem[];
  /** thumbnail for cell `i` (e.g. <WadTexThumb/> or <LazyCanvas/>) */
  thumb: (index: number) => JSX.Element;
  /** full-resolution RGBA for the zoom view of item `i` */
  load: (index: number) => Promise<Rgba>;
  /** optional controls shown above the grid (grid mode only) */
  toolbar?: JSX.Element;
}) {
  const [sel, setSel] = createSignal<number | null>(null);
  const cur = () => (sel() == null ? null : props.items[sel()!]);
  return (
    <Show
      when={sel() == null}
      fallback={
        <ImageView
          key={`${cur()?.name}#${sel()}`}
          load={() => props.load(sel()!)}
          title={cur()?.name ?? ""}
          onBack={() => setSel(null)}
        />
      }
    >
      {props.toolbar}
      <div class="viewer-body">
        <div class="grid">
          <For each={props.items}>
            {(t, i) => (
              <div class="cell" title={`${t.name}  ${fmtDim(t.width, t.height)}`} onClick={() => setSel(i())}>
                {props.thumb(i())}
                <div class="cell-label">
                  {t.name}
                  <div class="dim">{fmtDim(t.width, t.height)}</div>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
