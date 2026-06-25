import type { Component } from "solid-js";
import type { Category } from "../types";
import { ResourceHandler, TileProps, ViewProps } from "./Handler";
import { ImageThumb } from "./lazy";
import ImageViewer from "../viewers/ImageViewer";

export class ImageHandler extends ResourceHandler {
  readonly id = "image";
  readonly label = "Images";
  readonly icon = "🖼️";
  readonly categories: Category[] = ["image"];
  readonly zoom = "scale" as const;
  readonly Tile: Component<TileProps> = (p) => <ImageThumb path={p.node.path} size={128} />;
  readonly View: Component<ViewProps> = (p) => <ImageViewer path={p.node.path} zoom={p.zoom} />;
}
