import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { ResourceHandler, ViewProps } from "./Handler";
import FolderView from "./FolderView";

/** Claims directories. Its `View` is the folder grid; the `Tile` is the base
 *  generic 📁 chip (used when a parent folder lists its subfolders). */
export class FolderHandler extends ResourceHandler {
  readonly id = "folder";
  readonly label = "Folders";
  readonly icon = "📁";
  readonly categories: Category[] = [];
  readonly zoom = "none" as const;
  readonly View: Component<ViewProps> = (p) => <FolderView node={p.node} onSelect={p.onSelect} />;

  canHandle(node: Node): boolean {
    return node.is_dir;
  }
}
