import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
import { FOLDER_ICON } from "../util/icons";
import FolderView from "./FolderView";

/** Claims directories. Its `View` is the folder grid; its `Tile` is a folder
 *  chip (used when a parent folder lists its subfolders). */
export class FolderHandler extends ResourceHandler {
  readonly id = "folder";
  readonly label = "Folders";
  readonly icon = FOLDER_ICON;
  readonly categories: Category[] = [];
  readonly Tile: Component<TileProps> = (_p) => (
    <div class="tile-preview tile-generic">
      <div class="tile-emoji">{FOLDER_ICON}</div>
    </div>
  );
  readonly View: Component<ViewProps> = (p) => <FolderView node={p.node} onSelect={p.onSelect} />;

  canHandle(node: Node): boolean {
    return node.is_dir;
  }
}
