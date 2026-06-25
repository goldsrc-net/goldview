import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { Detail, ResourceHandler, TileProps, ViewProps } from "./Handler";
import { loadWad } from "../api";
import { WadTilePreview } from "./lazy";
import WadViewer from "../viewers/WadViewer";

/** WAD3 texture archive. Folder-grid tile shows the first 4 textures in a 2×2
 *  mini-grid; the full view is a grid of all the archive's decoded textures. */
export class WadHandler extends ResourceHandler {
  readonly id = "wad";
  readonly label = "WAD archives";
  readonly icon = "🧱";
  readonly categories: Category[] = ["wad"];
  readonly zoom = "none" as const;
  readonly Tile: Component<TileProps> = (p) => <WadTilePreview path={p.node.path} />;
  readonly View: Component<ViewProps> = (p) => <WadViewer path={p.node.path} />;

  async details(node: Node): Promise<Detail[]> {
    const list = await loadWad(node.path);
    return [{ label: "textures", value: String(list.length) }];
  }
}
