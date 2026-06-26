import type { Component } from "solid-js";
import type { Category, Detail, Node } from "../types";
import { ResourceHandler, ViewProps } from "./Handler";
import { audioInfo } from "../api";
import { wavDetails } from "../util/format";
import AudioPlayer from "../viewers/AudioPlayer";

export class SoundHandler extends ResourceHandler {
  readonly id = "sound";
  readonly label = "Sounds";
  readonly icon = "🔊";
  readonly categories: Category[] = ["sound"];
  readonly zoom = "none" as const;
  // Tile inherited from the base (generic 🔊 icon).
  readonly View: Component<ViewProps> = (p) => <AudioPlayer path={p.node.path} />;

  async details(node: Node): Promise<Detail[]> {
    if (!node.path.toLowerCase().endsWith(".wav")) return [];
    return wavDetails(await audioInfo(node.path));
  }
}
