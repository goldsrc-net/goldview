import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { ResourceHandler, ViewProps } from "./Handler";

/** Fallback handler: claims any file, so every resource gets *some* preview.
 *  Inherits the base generic-icon Tile. */
export class DefaultHandler extends ResourceHandler {
  readonly id = "other";
  readonly label = "Other";
  readonly icon = "📦";
  readonly categories: Category[] = ["other"];
  readonly zoom = "none" as const;
  readonly View: Component<ViewProps> = (p) => (
    <div class="viewer-body center">
      <div class="placeholder">
        <div style={{ "font-size": "40px" }}>📦</div>
        No dedicated viewer for “{p.node.name}”.
      </div>
    </div>
  );

  // claim anything that's a file (used as the registry fallback regardless)
  canHandle(node: Node): boolean {
    return !node.is_dir;
  }
}
