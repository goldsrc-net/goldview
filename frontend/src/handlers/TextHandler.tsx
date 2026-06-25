import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
import { TextThumb } from "./lazy";
import TextViewer from "../viewers/TextViewer";

export class TextHandler extends ResourceHandler {
  readonly id = "text";
  readonly label = "Text & scripts";
  readonly icon = "📄";
  readonly categories: Category[] = ["text", "script"];
  readonly Tile: Component<TileProps> = (p) => <TextThumb path={p.node.path} />;
  readonly View: Component<ViewProps> = (p) => <TextViewer path={p.node.path} />;
}
