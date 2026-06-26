import type { Component } from "solid-js";
import type { Category, Detail, Node } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
import { loadSprite } from "../api";
import { fmtDim } from "../util/format";
import { SpriteThumb } from "./lazy";
import SpriteViewer from "../viewers/SpriteViewer";

export class SpriteHandler extends ResourceHandler {
  readonly id = "sprite";
  readonly label = "Sprites";
  readonly icon = "✨";
  readonly categories: Category[] = ["sprite"];
  readonly zoom = "scale" as const;
  readonly Tile: Component<TileProps> = (p) => <SpriteThumb path={p.node.path} />;
  readonly View: Component<ViewProps> = (p) => <SpriteViewer path={p.node.path} zoom={p.zoom} />;

  async details(node: Node): Promise<Detail[]> {
    const s = await loadSprite(node.path);
    return [
      { label: "frames", value: String(s.num_frames) },
      { label: "dimensions", value: fmtDim(s.width, s.height) },
      { label: "format", value: s.format_name },
      { label: "type", value: s.type_name },
    ];
  }
}
