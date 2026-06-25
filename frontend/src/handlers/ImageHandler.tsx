import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { Detail, ResourceHandler, TileProps, ViewProps } from "./Handler";
import { loadImage } from "../api";
import { ImageThumb } from "./lazy";
import ImageViewer from "../viewers/ImageViewer";

export class ImageHandler extends ResourceHandler {
  readonly id = "image";
  readonly label = "Images";
  readonly icon = "🖼️";
  readonly categories: Category[] = ["image"];
  readonly zoom = "none" as const; // ImageView self-manages zoom/pan
  readonly Tile: Component<TileProps> = (p) => <ImageThumb path={p.node.path} size={128} />;
  readonly View: Component<ViewProps> = (p) => <ImageViewer path={p.node.path} />;

  async details(node: Node): Promise<Detail[]> {
    const r = await loadImage(node.path);
    return [{ label: "dimensions", value: `${r.width}×${r.height}` }];
  }
}
