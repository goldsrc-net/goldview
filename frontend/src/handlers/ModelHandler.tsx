import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { Detail, ResourceHandler, ViewProps } from "./Handler";
import { loadModel } from "../api";
import ModelViewer from "../viewers/ModelViewer";
import ModelPanel from "../viewers/ModelPanel";

/** Studiomodel (.mdl). Tile = base 🧍 icon (3D preview is heavy); View = the
 *  Three.js model viewer. zoom "none" — it owns pointer-lock fly controls. */
export class ModelHandler extends ResourceHandler {
  readonly id = "model";
  readonly label = "Models";
  readonly icon = "🧍";
  readonly categories: Category[] = ["model"];
  readonly zoom = "none" as const;
  readonly View: Component<ViewProps> = (p) => <ModelViewer path={p.node.path} />;
  readonly Panel: Component<ViewProps> = () => <ModelPanel />;

  async details(node: Node): Promise<Detail[]> {
    const m = await loadModel(node.path, 0);
    const tris = m.parts.reduce(
      (n, p) => n + p.submeshes.reduce((s, sm) => s + sm.positions.length / 9, 0),
      0,
    );
    return [
      { label: "bones", value: String(m.num_bones) },
      { label: "body parts", value: String(m.parts.length) },
      { label: "textures", value: String(m.textures.length) },
      { label: "triangles", value: String(tris) },
    ];
  }
}
