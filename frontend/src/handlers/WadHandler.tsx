import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
import WadViewer from "../viewers/WadViewer";

/** WAD3 texture archive. Folder-grid tile is a brick chip; the full view is a
 *  grid of the archive's decoded textures. */
export class WadHandler extends ResourceHandler {
  readonly id = "wad";
  readonly label = "WAD archives";
  readonly icon = "🧱";
  readonly categories: Category[] = ["wad"];
  readonly Tile: Component<TileProps> = (_p) => (
    <div class="tile-preview tile-generic">
      <div class="tile-emoji">🧱</div>
      <div class="tile-ext">WAD</div>
    </div>
  );
  readonly View: Component<ViewProps> = (p) => <WadViewer path={p.node.path} />;
}
