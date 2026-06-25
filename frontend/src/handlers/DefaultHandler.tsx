import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";

/** Fallback handler: claims any file, so every resource gets *some* preview. */
export class DefaultHandler extends ResourceHandler {
  readonly id = "other";
  readonly label = "Other";
  readonly icon = "📦";
  readonly categories: Category[] = ["other"];
  readonly zoom = "none" as const;
  readonly Tile: Component<TileProps> = (p) => (
    <div class="tile-preview tile-generic">
      <div class="tile-emoji">📦</div>
      <div class="tile-ext">{ext(p.node.name)}</div>
    </div>
  );
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

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase() : "FILE";
}
