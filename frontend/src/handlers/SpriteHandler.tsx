import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
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
}
