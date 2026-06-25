import type { Component } from "solid-js";
import type { Category, Node } from "../types";
import { Detail, ResourceHandler, ViewProps } from "./Handler";
import { audioInfo } from "../api";
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
    const i = await audioInfo(node.path);
    return [
      { label: "sample rate", value: `${i.sample_rate} Hz` },
      { label: "channels", value: String(i.channels) },
      { label: "duration", value: `${i.duration_secs.toFixed(2)} s` },
    ];
  }
}
