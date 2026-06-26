import type { Component } from "solid-js";
import type { Category, Detail, Node } from "../types";
import { ResourceHandler, ViewProps } from "./Handler";
import { loadBsp } from "../api";
import BspViewer from "../viewers/BspViewer";

/** GoldSrc BSP map. View = the 3D world with a fly camera. */
export class BspHandler extends ResourceHandler {
  readonly id = "map";
  readonly label = "Maps";
  readonly icon = "🗺️";
  readonly categories: Category[] = ["map"];
  readonly zoom = "none" as const; // owns its own fly controls
  readonly View: Component<ViewProps> = (p) => <BspViewer path={p.node.path} />;

  async details(node: Node): Promise<Detail[]> {
    const m = await loadBsp(node.path);
    const tris = m.surfaces.reduce((n, s) => n + s.positions.length / 9, 0);
    return [
      { label: "surfaces", value: String(m.surfaces.length) },
      { label: "triangles", value: String(tris) },
      { label: "textures", value: String(m.textures.length) },
      { label: "entities", value: String(m.entities.length) },
    ];
  }
}
